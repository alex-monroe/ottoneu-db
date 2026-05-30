# Ottoneu Strategy — Worked Examples

**Purpose.** Few-shot exemplars of *format-correct reasoning* for League 309. The strategy primer
([ottoneu-strategy.md](ottoneu-strategy.md)) gives the principles; this file shows them applied
end-to-end on real rosters. An AI answering a roster question should imitate the **structure** here:
state posture → reason in surplus, not points → apply the raise treadmill and arbitration tax →
respect the Superflex QB premium → name the trade-off.

**Data note.** Salaries and projected PPG below are real (`just roster-context --season 2026`, as of
2026-05). Exact `dollar_value`/`surplus` come from the live surplus page (`web/lib/surplus.ts`):
`dollar_per_VORP = $4,200 / total_positive_VORP`. These examples reason qualitatively from
salary-vs-PPG where a precise dollar figure isn't needed, and say so when it is. Numbers will drift
as projections update — the *reasoning pattern* is the durable part.

---

## Example 1 — Keep or cut? (a TE roster-spot squeeze on The Witchcraft)

**Question:** "On The Witchcraft I'm rostering Kyle Pitts ($15, 8.1 PPG TE), Kenyon Sadiq ($2, 9.1),
Oronde Gadsden ($10, 7.6), and Kenyon's behind Sadiq. With 20 spots I'm tight. Who do I cut?"

**Reasoning:**
1. **Posture.** The Witchcraft is rebuilding — $202 of cap space, a cluster of cheap ascending
   pieces (Jeremiyah Love $4, young QBs). That means: prioritize cheap surplus and upside, don't
   pay up for fairly-priced veterans, and treat roster spots as the binding constraint, not cap.
2. **Surplus, not points.** At TE, Sadiq ($2 @ 9.1) projects *higher* than Pitts ($15 @ 8.1) for
   $13 less salary. Sadiq is large positive surplus; Pitts at $15 for sub-Sadiq production is
   roughly fair-to-underwater. Gadsden ($10 @ 7.6) is a fringe-surplus hold.
3. **Treadmill.** Next year Pitts → $19 for the same tier of production: surplus erodes further. A
   rebuild should not carry a veteran whose value is *falling toward* a rising salary (primer §4).
4. **Cut penalty isn't free.** Cutting Pitts costs ⌈$15/2⌉ = **$8** cap penalty. With $202 of space
   that's painless here — the penalty matters more for contenders near the cap.
5. **Roster spot is the real scarcity.** The question is what *better* use the spot has. For a
   rebuild, a $2 upside dart (rookie, post-hype) beats a fairly-priced 8-PPG vet.

**Answer:** Cut **Pitts** — keep Sadiq (cheap surplus) and Gadsden (cheap, younger). You eat an $8
penalty (trivial with $202 free) and reclaim a roster spot for an upside swing. You don't need three
mid-tier TEs on a rebuild; you need one cheap startable TE (Sadiq) and lottery tickets in the open
spots. Don't keep Pitts on name value — that's the standard-dynasty reflex the format punishes.

---

## Example 2 — What's the right auction bid on a QB? (Superflex pricing)

**Question:** "A startable QB hits the auction block. How high do I go? In my old 1-QB leagues I'd
never pay big for a QB."

**Reasoning:**
1. **Kill the 1-QB instinct first** (primer §10). League 309 starts 1 QB + 1 Superflex, and a QB is
   almost always the optimal Superflex play → the league wants ~24 starting QBs from ~20–22 startable
   NFL ones. **Demand exceeds supply.** QB is the scarcest resource, not the cheapest.
2. **Read the market from the snapshot.** QB salaries are already bid up accordingly: Mahomes $70,
   Mahomes-tier arms $44–63, mid starters (Kyler $29, Sam Darnold $31, Caleb $33) in the $30s. Teams
   with one QB are structurally exposed — **The Roseman Empire has exactly 1 QB** (Jacoby Brissett
   $8) behind an elite RB core; they *must* pay up for QB or stay capped out of the Superflex slot.
3. **Anchor to dollar_value, then add a scarcity premium.** Fair price ≈ the player's `dollar_value`
   (pull it from the surplus page). For QB specifically, bid *to* fair value and be willing to nudge
   past it, because the replacement behind a startable QB is a true streamer — the VORP cliff is
   steep (primer §3). For WR/RB, by contrast, discipline below fair value is easier; the replacement
   tier is deep.
4. **Vickrey mechanics.** It's a blind second-price auction (you pay 2nd-highest + $1), so your bid
   should be your honest max — shading down only risks losing the scarce asset to a $1 difference.

**Answer:** For a genuinely startable QB, bid to your computed `dollar_value` and accept paying a
small premium over it — QB scarcity in Superflex justifies what would be an overpay in a 1-QB league.
Set your max at honest fair-value-plus (blind Vickrey rewards truthful bids), and weight the bid up
if you're a one-QB team like Roseman. Never apply 1-QB price discipline here.

---

## Example 3 — Where do I aim my $60 of arbitration? (and what's my own exposure?)

**Question:** "Arbitration's open. I've got $60 to spread across the other 11 teams ($1–8 each, max
$4 per player). Where does it do the most damage — and who on my own roster is the league going to
hammer?"

**Reasoning:**
1. **Arbitration taxes legible surplus** (primer §5). You want to add salary to **contenders' cheap,
   non-replaceable bargains** — raises that pinch a real roster's cap flexibility, not a rebuilder's.
2. **Scan the snapshot for the most legible cheap value on good teams:**
   - **Ball So Hard University** (capped out at -$59, clearly contending) is full of magnets:
     Tyreek Hill **$14 @ 13.0**, Aaron Rodgers **$7 @ 12.9**, Rashee Rice **$30 @ 16.3**. Hill and
     Rodgers are glaring — tiny salary, starter production. Max $4 each from you; coordinate-by-
     equilibrium with the league and they jump several dollars, squeezing an already-capped roster.
   - **The Roseman Empire**: Brandon Aiyuk **$2 @ 11.7** is the definition of a target — but note
     their structural 1-QB hole (Ex. 2) may be the bigger lever; arbitration can't fix that for them.
   - Skill-position bargains on contenders > a rebuilder's cheap fliers, which raise nobody's stress.
3. **Spread for efficiency, not spite.** You must give every team $1–8 and can't exceed $4/player, so
   concentrate your $4-max hits on the 3–4 most painful bargains and meet the $1 minimums elsewhere.
4. **Now your own exposure.** The Witchcraft's **Jeremiyah Love ($4 @ 14.4)** is very likely the
   single biggest arbitration magnet in the entire league — a $4 RB projecting like a high-end
   starter is exactly the legible surplus everyone targets (up to $44 leaguewide). Expect him to be
   raised hard. Discount his future surplus accordingly (primer §5) — don't plan as if he stays $4.

**Answer:** Spend your $4-max allocations on **Ball So Hard's Tyreek Hill and Aaron Rodgers** (and
Aiyuk on Roseman), then satisfy the $1–8 minimums across the rest. Expect the league to pour
arbitration onto **your Jeremiyah Love** — bank his cheap year now (he's a strong keep *this*
offseason) but model him at a materially higher salary next year, not $4 in perpetuity.

---

## Example 4 — Read a roster's posture and find its structural flaw

**Question:** "Quick reads — what are The Roseman Empire and The Witchcraft, strategically, and
what's each one's biggest problem?"

**Reasoning (Roseman Empire):**
1. **Snapshot shape:** 11 players, $387 committed, and an absurd RB core — McCaffrey $92 (16.3),
   Bijan $109 (16.2), Jonathan Taylor $84 (15.7). All-in *contender*.
2. **The flaw is positional, and the format makes it fatal:** **exactly one QB** (Jacoby Brissett
   $8 @ 13.7). In a Superflex league that needs ~2 startable QBs, they're conceding the scarcest
   slot every week (primer §3). Three elite RBs can't be started in QB/Superflex.
3. **Compounding:** only 11 rostered — they've sold/cut depth for stars, so they can't trade from
   surplus easily, and ~$330 is tied up in three RBs whose value erodes on the +$4 treadmill.

**Reasoning (The Witchcraft):**
1. **Snapshot shape:** $198 committed, **$202 free**, no salary above $41, headlined by cheap
   ascending talent — Jeremiyah Love $4 (14.4), Luther Burden $12, plus four young QBs (Stroud $41,
   Mendoza $20, Simpson $5, Dante Moore $4). Textbook *rebuild / ascending*.
2. **Strength:** enormous cheap surplus and cap flexibility — can absorb arbitration, win auctions,
   or convert space into a contention push later.
3. **The flaw / watch-item:** thin on present-tier ceiling at WR/RB, and its surplus is *legible*
   (see Ex. 3 — Love is an arbitration magnet). The risk is drifting into the **muddled middle**
   (primer §8) if that $202 gets spent on fairly-priced veterans instead of either banking it or
   making one decisive contention move.

**Answer:** Roseman is an all-in RB contender with a **disqualifying Superflex QB hole** — their
offseason priority must be acquiring a second startable QB even at a premium, or the elite RBs are
wasted. The Witchcraft is a cap-rich rebuild whose job is to **stay disciplined**: deploy the $202
on cheap upside or one real contention lever, not on filler veterans, and plan around Love being
arbitrated up.

---

## See also
- [ottoneu-strategy.md](ottoneu-strategy.md) — the principles these examples apply (§ references above).
- [ottoneu-rules.md](ottoneu-rules.md) — exact mechanics and constants.
- `.claude/commands/ottoneu-roster-question.md` — the skill that runs this reasoning on demand.
