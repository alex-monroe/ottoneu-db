"""Monte-Carlo auction simulator for the Ottoneu keeper auction.

Simulates the league's annual blind-auction draft many times over so you can
pressure-test an auction strategy *before* draft day: what will elite players
clear at, will your plan actually fill your starting lineup, how much cap will
you have left, and what will your opponents do.

Each of the 12 teams is a simple heuristic AI. It fills its STARTER slots
(bidding near a player's market value) then BENCH depth (a discount), never
exceeding a global cap, always reserving $1 per still-needed slot. Per-team
`aggression` + taste randomness make every run different, so running many times
gives a DISTRIBUTION of outcomes rather than one lucky/unlucky draw. One team
(`TEAM_OVERRIDES`) is configured with *your* strategy so you can see how it fares.

Prices are anchored to Draft Sharks superflex `market_auction_value`
(`draft_sharks_values`), and current rosters/cap come from `league_prices`
(the same source as `just roster-context`). Data is pulled once and cached to
`.cache/auction_sim_cache.json`; pass `--refresh` after a re-scrape.

Usage (or `just auction-sim [--flags]` once the recipe is added):
    venv/bin/python scripts/auction_simulator.py            # 400-sim aggregate stats
    venv/bin/python scripts/auction_simulator.py --full     # one full-league roster dump
    venv/bin/python scripts/auction_simulator.py --steals   # 6 sample drafts, your steals flagged
    venv/bin/python scripts/auction_simulator.py --sample   # one quick sample of your buys
    venv/bin/python scripts/auction_simulator.py --refresh   # re-pull data from Supabase first

Everything tunable lives in the CONFIG block below. See
docs/references/auction-simulator.md for the model, the knobs, and how to adapt
`TEAM_OVERRIDES` to a different team or season.
"""
import json
import random
import statistics as stats
import sys
from collections import defaultdict
from pathlib import Path

SEASON = 2026
CACHE = Path(__file__).resolve().parent.parent / ".cache" / "auction_sim_cache.json"

# ═════════════════════════════ CONFIG — tune me ═════════════════════════════
N_SIMS      = 400
MAX_BID     = 110          # nobody in the league pays more than this for one player
RESERVE     = 10           # default: every team keeps >= this for in-season waivers
FILL_TO     = 18           # teams roster this many (leaving ~2 spots open for the season)
SF_PREMIUM  = 1.5          # Superflex: teams pay up for a 2nd viable QB before anything else
TASTE_SIGMA = 0.16         # per-team, per-player valuation noise (lognormal)
DEPTH_DISC  = 0.50         # a team pays this fraction of market for bench depth

# "Bid up the whale" enforcement: rivals may bid UP a cash-rich team that's about
# to STEAL an elite cheap — taxing it, or getting stuck with the overpay themselves.
# Moderate/realistic defaults below. RUTHLESS stress-test values (tested 2026-08-16):
#   ENFORCE_BARGAIN 0.85, ENFORCE_TARGET 0.95, ENFORCE_PROB 0.9  →  barely dents steals
#   (the whale's late-draft steals are undefendable once rivals are tapped out).
ENFORCE         = True     # master switch
ENFORCE_MIN     = 40       # only defend elites at/above this market value
ENFORCE_BARGAIN = 0.75     # "steal" = whale would clear below this fraction of market
ENFORCE_TARGET  = 0.85     # the enforcer pushes the price up to this fraction of market
ENFORCE_PROB    = 0.6      # chance a rival actually bothers to defend a given steal
WHALE_RATIO     = 1.5      # a team is a "whale" if its cap >= this x the median cap

# min market $ for a rostered/bought player to count as a genuine STARTER at his position
STARTABLE = {"QB": 15, "RB": 14, "WR": 18, "TE": 9, "K": 0}

# Target roster shape every team builds toward (a team keeps buying starters at a
# position until it has `START`, then bench depth up to `START + BENCH`).
START = {"QB": 2, "RB": 2, "WR": 2, "TE": 1, "K": 1}
BENCH = {"QB": 1, "RB": 2, "WR": 3, "TE": 1, "K": 0}

# Per-team overrides — the tuning surface. Each team may set:
#   aggression   scales every bid
#   reserve      cap it keeps for the season (else global RESERVE)
#   start/bench  its own {pos: n} targets (else the globals above)
#   force_start  rostered players to treat as owned starters (won't buy over them)
#   startable    per-team {pos: $} starter thresholds (else the global STARTABLE)
#   pos_cap      {pos: $} hard max it will bid for any one player at that position
#   max_buy      {pos: n} hard cap on how many it will BUY at a position
#   pounce       {frac, min_market, max, skip:[pos]} — reach for below-market elites,
#                bidding up to frac×market (capped at `max`), ignoring pos_cap, on any
#                position not in `skip`.
#
# The block below encodes "The Witchcraft"'s 2026 strategy (see the docs): spend
# into the STARTING lineup (WR1 upgrade first, never an elite QB), keep Love a
# starter with one RB2 + a backup, functional cheap QB2, ~$30 waiver reserve.
# For a different team/season, replace this with that team's plan (or delete it
# to have every team use the generic heuristic).
TEAM_OVERRIDES = {
    "The Witchcraft": {
        "aggression": 1.05,
        "reserve": 30,                                          # deploy the cap; don't hoard
        "start": {"QB": 2, "RB": 2, "WR": 5, "TE": 1, "K": 1},  # WR5 = 3 upgrades (2 slots + FLEX)
        "bench": {"QB": 0, "RB": 1, "WR": 0, "TE": 0, "K": 0},  # 1 RB backup; WR/QB depth already rostered
        "max_buy": {"QB": 1, "RB": 2, "WR": 3},                 # 1 QB2 · RB2+backup · 3 WR
        "pos_cap": {"QB": 33, "RB": 70, "WR": 72, "K": 3},      # WR is the pay-up spot; QB stays cheap
        "pounce": {"frac": 0.95, "min_market": 45, "max": 72, "skip": ["QB", "RB"]},
        "force_start": {"QB": ["Trevor Lawrence"], "RB": ["Jeremiyah Love"],
                        "WR": ["Luther Burden", "DJ Moore"]},
    },
}
# ═════════════════════════════════════════════════════════════════════════════


def load_data(refresh=False):
    if not refresh and CACHE.exists():
        with open(CACHE) as f:
            return json.load(f)
    from scripts.config import fetch_all_rows, get_supabase_client
    c = get_supabase_client()
    players = {p["id"]: p for p in fetch_all_rows(c, "players", "id,name,position")}
    prices = fetch_all_rows(c, "league_prices", "player_id,price,team_name")
    dsv = {r["player_id"]: r["market_auction_value"]
           for r in fetch_all_rows(c, "draft_sharks_values",
                                   "player_id,season,market_auction_value",
                                   filters=[("eq", "season", SEASON)])
           if r["market_auction_value"]}
    rosters, fa = defaultdict(list), []
    for pr in prices:
        pl = players.get(pr["player_id"])
        if not pl or pl["position"] not in START:
            continue
        mv = float(dsv.get(pr["player_id"], 0) or 0)
        if pr["team_name"] == "FA":
            if mv > 0:
                fa.append([pl["name"], pl["position"], mv])
        elif pr["team_name"]:
            rosters[pr["team_name"]].append([pl["name"], pl["position"], pr["price"] or 0, mv])
    data = {"rosters": rosters, "fa": fa}
    CACHE.parent.mkdir(parents=True, exist_ok=True)
    with open(CACHE, "w") as f:
        json.dump(data, f)
    return data


class Team:
    def __init__(self, name, roster):
        cfg = TEAM_OVERRIDES.get(name, {})
        self.name = name
        self.aggr = cfg.get("aggression", 1.0)
        self.start = cfg.get("start", START)
        self.bench = cfg.get("bench", BENCH)
        self.pos_cap = cfg.get("pos_cap", {})
        self.pounce = cfg.get("pounce")
        self.reserve = cfg.get("reserve", RESERVE)
        self.max_buy = cfg.get("max_buy", {})
        self.bought_at = defaultdict(int)
        self.smv = {**STARTABLE, **cfg.get("startable", {})}   # per-team startable thresholds
        forced = cfg.get("force_start", {})
        self.cap = 400 - sum(r[2] for r in roster)
        self.count = defaultdict(int)
        self.startable = defaultdict(int)
        self.roster = list(roster)
        self.buys = []
        for nm, pos, sal, mv in roster:
            self.count[pos] += 1
            if nm in forced.get(pos, []) or mv >= self.smv[pos]:
                self.startable[pos] += 1

    def size(self):
        return sum(self.count.values())

    def bid(self, pos, mv, rng):
        """Private max bid for a player, or 0 if not interested."""
        if self.bought_at[pos] >= self.max_buy.get(pos, 99):
            return 0                        # per-position purchase cap reached
        good_enough = mv >= self.smv[pos]   # only a starter-quality player fills a starter slot
        if self.startable[pos] < self.start[pos] and good_enough:
            base = mv                       # fills a needed starter -> full market
            if pos == "QB":
                base *= SF_PREMIUM          # Superflex: lock down 2 QBs first
        elif self.count[pos] < self.start[pos] + self.bench[pos]:
            base = mv * DEPTH_DISC          # bench depth -> discount
        else:
            base = 0
        taste = rng.lognormvariate(0, TASTE_SIGMA)
        # keep our reserve AND $1 for every remaining roster spot we intend to fill
        spots_to_fill = max(0, FILL_TO - self.size())
        afford = self.cap - self.reserve - max(0, spots_to_fill - 1)
        want = min(base * self.aggr * taste, self.pos_cap.get(pos, MAX_BID)) if base > 0 else 0
        # slush-fund pounce: reach for a below-market elite, ignoring position caps.
        # Firm ceiling at frac×market (no taste inflation) so we only WIN genuine
        # craters — if a rival pays above frac×market, we pass.
        if (self.pounce and mv >= self.pounce["min_market"] and self.size() < FILL_TO
                and pos not in self.pounce.get("skip", [])):
            want = max(want, min(self.pounce["frac"] * mv, self.pounce.get("max", MAX_BID)))
        return max(0, min(want, afford, MAX_BID))

    def win(self, nm, pos, mv, price):
        self.cap -= price
        self.count[pos] += 1
        self.bought_at[pos] += 1
        if mv >= self.smv[pos]:
            self.startable[pos] += 1
        self.roster.append([nm, pos, price, mv])
        self.buys.append([nm, pos, price, mv])


def is_whale(team, teams):
    caps = sorted(t.cap for t in teams.values() if t.size() < FILL_TO)
    if not caps:
        return False
    med = caps[len(caps) // 2]
    return team.cap >= max(60, WHALE_RATIO * med)


def run_once(data, seed):
    """Simulate one draft. Returns (teams, sold, unsold, enforce_log)."""
    rng = random.Random(seed)
    teams = {n: Team(n, r) for n, r in data["rosters"].items()}
    # nomination order: roughly by value, with noise so it varies per run
    pool = sorted(([nm, pos, mv] for nm, pos, mv in data["fa"]),
                  key=lambda x: -x[2] * rng.lognormvariate(0, 0.25))
    sold, unsold, enforce_log = [], [], []
    for nm, pos, mv in pool:
        bids = [(w, t) for w, t in
                ((t.bid(pos, mv, rng), t) for t in teams.values()) if w >= 1]
        bids.sort(key=lambda x: -x[0])
        if not bids:
            unsold.append([nm, pos, mv])
            continue
        # ENFORCEMENT: if a cash-rich whale is about to STEAL an elite cheap (clears
        # well below market), the richest rival with a spot may bid it up toward market
        # to deny the bargain — risking getting stuck with the overpay itself.
        proj = bids[1][0] if len(bids) > 1 else 0
        enf = whale_name = None
        if (ENFORCE and mv >= ENFORCE_MIN and is_whale(bids[0][1], teams)
                and proj < ENFORCE_BARGAIN * mv and rng.random() < ENFORCE_PROB):
            cands = [t for t in teams.values()
                     if not is_whale(t, teams) and t.size() < FILL_TO
                     and t.cap - RESERVE > mv * 0.4]
            if cands:
                whale_name = bids[0][1].name
                enf = max(cands, key=lambda t: t.cap)
                afford = enf.cap - RESERVE - max(0, FILL_TO - enf.size() - 1)
                push = min(mv * ENFORCE_TARGET, afford, MAX_BID)
                bids = [(w, t) for w, t in bids if t is not enf]
                bids.append((push, enf))
                bids.sort(key=lambda x: -x[0])
        win_w, win = bids[0]
        second = bids[1][0] if len(bids) > 1 else 0
        price = int(max(1, min(round(win_w), round(second) + 1, MAX_BID)))
        win.win(nm, pos, mv, price)
        sold.append([nm, pos, price, mv, win.name])
        if enf is not None:
            if win.name == enf.name:
                enforce_log.append(("STUCK", nm, mv, enf.name, price))    # overpaid to deny whale
            elif win.name == whale_name:
                enforce_log.append(("TAXED", nm, mv, whale_name, price))  # whale still won, paid more
    fill_rosters(teams, unsold)
    return teams, sold, unsold, enforce_log


def fill_rosters(teams, unsold):
    """Post-auction: every team grabs a $1 kicker if missing, then $1 filler up to
    FILL_TO, never dropping below its reserve. Uses leftover FA names for flavor."""
    pool = defaultdict(list)
    for nm, pos, mv in unsold:
        pool[pos].append(nm)
    for t in teams.values():
        if t.count["K"] == 0 and t.cap - 1 >= t.reserve:
            t.roster.append(["(streaming K)", "K", 1, 0]); t.count["K"] += 1; t.cap -= 1
        while t.size() < FILL_TO and t.cap - 1 >= t.reserve:
            need = sorted("QB RB WR TE".split(),
                          key=lambda p: t.count[p] - (t.start[p] + t.bench[p]))
            placed = False
            for p in need:
                if pool[p]:
                    nm = pool[p].pop()
                    t.roster.append([nm, p, 1, 0]); t.count[p] += 1; t.cap -= 1
                    placed = True
                    break
            if not placed:
                t.roster.append(["(replacement)", "RB", 1, 0]); t.count["RB"] += 1; t.cap -= 1


# ─────────────────────────────── reporting ───────────────────────────────
# NOTE: the report helpers below name "The Witchcraft" as the team of interest.
# Change TEAM in these to inspect a different team's outcomes.
TEAM = "The Witchcraft"
POS_ORDER = {"QB": 0, "RB": 1, "WR": 2, "TE": 3, "K": 4}


def starting_lineup(t):
    """Best QB + SF + 2RB + 2WR + TE + K by market value/salary; also whether the
    team has 2 startable QBs. (Does not model the separate FLEX explicitly.)"""
    by = defaultdict(list)
    for nm, pos, sal, mv in t.roster:
        by[pos].append((max(mv, sal), nm))
    for p in by:
        by[p].sort(reverse=True)
    qbs = [n for _, n in by["QB"]]
    lineup = {"QB": qbs[:1], "SF": qbs[1:2], "RB": [n for _, n in by["RB"][:2]],
              "WR": [n for _, n in by["WR"][:2]], "TE": [n for _, n in by["TE"][:1]],
              "K": [n for _, n in by["K"][:1]]}
    return lineup, len(qbs) >= 2 and t.startable["QB"] >= 2


def sample_run(data):
    teams, _, unsold, _ = run_once(data, random.randrange(10**6))
    w = teams[TEAM]
    print(f"── SAMPLE RUN · {TEAM} buys ──")
    for nm, pos, price, mv in sorted(w.buys, key=lambda b: (b[1], -b[2])):
        print(f"  {pos:<3} {nm:<20} ${price}  (mkt ${int(mv)})")
    print(f"  spent ${sum(b[2] for b in w.buys)} | cap left ${w.cap}")
    print("  top 8 leftover FAs:", ", ".join(f"{n}(${int(m)})" for n, _, m in unsold[:8]))


def full_run(data, seed=None):
    seed = seed if seed is not None else random.randrange(10**6)
    teams, _, unsold, elog = run_once(data, seed)
    print(f"══════ FULL LEAGUE — one simulation (seed {seed}) ══════")
    warn = []
    for tname in sorted(teams):
        t = teams[tname]
        bought = {b[0] for b in t.buys}
        spent = sum(b[2] for b in t.buys)
        spots = 20 - t.size()
        line = "/".join(f"{t.count[p]}" for p in ["QB", "RB", "WR", "TE", "K"])
        star = "  ← YOU" if tname == TEAM else ""
        lineup, sf_ok = starting_lineup(t)
        print(f"\n### {tname}  [{line}]  {spots} open · ${t.cap} left · spent ${spent}{star}")
        for nm, pos, sal, mv in sorted(t.roster, key=lambda r: (POS_ORDER[r[1]], -r[2])):
            print(f"   {pos:<3} {nm:<22} ${sal}{' *' if nm in bought else ''}")
        sfq = f"QB {lineup['QB'][0] if lineup['QB'] else '—'} + SF {lineup['SF'][0] if lineup['SF'] else '—'}"
        print(f"   START: {sfq} | RB {'/'.join(lineup['RB'])} | WR {'/'.join(lineup['WR'])} | "
              f"TE {'/'.join(lineup['TE']) or '—'} | K {'/'.join(lineup['K']) or '—'}")
        if not sf_ok:
            warn.append(f"{tname}: only {t.startable['QB']} startable QB")
        if t.cap < RESERVE:
            warn.append(f"{tname}: cap ${t.cap} < ${RESERVE} reserve")
    print("\n  (* = bought this auction · header = QB/RB/WR/TE/K counts)")
    print(f"\n  CONSISTENCY: min cap left ${min(t.cap for t in teams.values())}, "
          f"max spots open {max(20 - t.size() for t in teams.values())}")
    print("  WARNINGS:", "; ".join(warn) if warn else "none — every team ≥ reserve & 2 startable QBs")
    print("\n  ENFORCEMENT this draft (rivals bidding up cash-rich teams on elites):")
    if elog:
        for kind, nm, mv, who, price in elog:
            if kind == "STUCK":
                print(f"   STUCK: {who} bid up {nm} (mkt ${int(mv)}) and got stuck with him at ${price}")
            else:
                print(f"   TAXED: {who} still won {nm} but paid ${price} (mkt ${int(mv)}) after being pushed")
    else:
        print("   none fired this run")
    print("\n  Top 8 leftover free agents:")
    for nm, pos, mv in unsold[:8]:
        print(f"   {pos:<3} {nm:<22} mkt ${int(mv)}")


def samples(data, n=6):
    for s in range(n):
        seed = random.randrange(10**6)
        teams, _, _, _ = run_once(data, seed)
        w = teams[TEAM]
        steals = [b for b in w.buys if b[3] >= 45 and b[2] <= 0.8 * b[3]]  # elite, ≥20% under market
        spent = sum(b[2] for b in w.buys)
        lineup, _ = starting_lineup(w)
        print(f"\n═══════════ SAMPLE DRAFT {s + 1} (seed {seed}) ═══════════")
        print(f"  STARTERS: QB {lineup['QB'][0]} + SF {lineup['SF'][0] if lineup['SF'] else '—'} | "
              f"RB {'/'.join(lineup['RB'])} | WR {'/'.join(lineup['WR'])} | TE {'/'.join(lineup['TE']) or '—'}")
        print(f"  spent ${spent} · slush left ${w.cap}")
        if steals:
            print("  BELOW-MARKET STEALS:")
            for nm, pos, price, mv in sorted(steals, key=lambda b: b[2] - b[3]):
                print(f"      {pos} {nm:<20} ${price}  (mkt ${int(mv)}, −{round((1 - price / mv) * 100)}%)")
        else:
            print("  (no elite cratered under 20% this run — slush banked)")
        other = [b for b in w.buys if b not in steals]
        if other:
            print("  other buys:", ", ".join(f"{b[0]} ${b[2]}" for b in sorted(other, key=lambda b: -b[2])))


def many(data, n):
    key_players = ["Josh Allen", "Lamar Jackson", "Joe Burrow", "Jalen Hurts",
                   "Bijan Robinson", "Ashton Jeanty", "Chase Brown", "Kyren Williams",
                   "Josh Jacobs", "Nico Collins", "CeeDee Lamb", "Justin Jefferson"]
    clears = defaultdict(list)
    w_spend, w_cap, w_pounce, w_rbcount, w_pos = [], [], [], [], defaultdict(list)
    w_wins = defaultdict(int)
    top_fa, stuck, taxed = [], [], []
    for i in range(n):
        teams, sold, unsold, elog = run_once(data, i)
        stuck.append(sum(1 for e in elog if e[0] == "STUCK"))
        taxed.append(sum(1 for e in elog if e[0] == "TAXED"))
        for nm, pos, price, mv, who in sold:
            if nm in key_players:
                clears[nm].append(price)
        w = teams[TEAM]
        w_spend.append(sum(b[2] for b in w.buys))
        w_cap.append(w.cap)
        w_pounce.append(len([b for b in w.buys if b[3] >= 45]))   # elite buys ≈ pounces
        w_rbcount.append(len([b for b in w.buys if b[1] == "RB"]))
        for b in w.buys:
            w_wins[b[0]] += 1
        for p in START:
            w_pos[p].append(w.count[p])
        if unsold:
            top_fa.append(unsold[0][2])

    print(f"\n═══ {n} SIMS · MAX_BID=${MAX_BID} ═══")
    print("\nClearing prices (mean [p10–p90]):")
    for p in key_players:
        v = clears[p]
        if v:
            print(f"  {p:<18} ${round(stats.mean(v)):>3}  "
                  f"[{sorted(v)[len(v)//10]}–{sorted(v)[len(v)*9//10]}]  (won {len(v)*100//n}% of sims)")
    print(f"\n{TEAM}, across sims:")
    print(f"  spend         ${round(stats.mean(w_spend))} avg  [{min(w_spend)}–{max(w_spend)}]")
    print(f"  cap left      ${round(stats.mean(w_cap))} avg  (kept for waivers / unspent)")
    print(f"  elite buys    {stats.mean(w_pounce):.2f} avg/sim  ({sum(1 for x in w_pounce if x)*100//n}% of sims land ≥1 elite $45+)")
    print(f"  RBs bought    {stats.mean(w_rbcount):.1f} avg")
    print(f"  final roster  QB {stats.mean(w_pos['QB']):.1f} · RB {stats.mean(w_pos['RB']):.1f} · "
          f"WR {stats.mean(w_pos['WR']):.1f} · TE {stats.mean(w_pos['TE']):.1f} · K {stats.mean(w_pos['K']):.1f}")
    print(f"\n  {TEAM} most-won players:")
    for nm, ct in sorted(w_wins.items(), key=lambda x: -x[1])[:10]:
        print(f"    {nm:<20} {ct*100//n}% of sims")
    print(f"\n  Best leftover FA (realism): avg market ${round(stats.mean(top_fa))}, max ${round(max(top_fa))}")
    print(f"\n  Enforcement/sim: {stats.mean(taxed):.1f} whales taxed, "
          f"{stats.mean(stuck):.1f} rivals STUCK with an overpay")


def main():
    data = load_data(refresh="--refresh" in sys.argv)
    if "--full" in sys.argv:
        full_run(data)
    elif "--steals" in sys.argv:
        samples(data)
    elif "--sample" in sys.argv:
        sample_run(data)
    else:
        many(data, N_SIMS)


if __name__ == "__main__":
    main()
