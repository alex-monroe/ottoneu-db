/**
 * Export the inputs of the trade exchange-rate fit as JSON.
 *
 *   npx tsx scripts/export-trade-exchange.ts [--out PATH]
 *
 * One row per trade side (`ExchangeSide`, web/lib/trade-exchange.ts): the
 * /trades valuation (prorated this-season net, cap net, the players with their
 * salaries) and each team's playoff odds on the trade day. Keeper option
 * values are attached on the Python side (scripts/trade_exchange/), from the
 * keeper outlook as of the trade's week. Read-only: writes nothing to the DB.
 *
 * Env: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY.
 * Default output: ../.cache/trade_exchange/sides.json (`just trade-exchange`).
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import { fetchMatchups } from "../lib/matchups";
import type { Matchup } from "../lib/standings";
import { exchangeSides } from "../lib/trade-exchange";
import { fetchTradesPageData } from "../lib/trades-data";

async function main(): Promise<number> {
  const { values } = parseArgs({ options: { out: { type: "string" } } });
  const out = resolve(values.out ?? "../.cache/trade_exchange/sides.json");

  const data = await fetchTradesPageData();
  const processed = data.valuations.filter((v) => v.trade.status === "processed");
  const seasons = [...new Set(processed.flatMap((v) => [v.trade.season - 1, v.trade.season]))];
  const matchupsBySeason = new Map<number, Matchup[]>(
    await Promise.all(seasons.map(async (s) => [s, await fetchMatchups(s)] as const)),
  );
  const sides = exchangeSides(processed, matchupsBySeason);

  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify({ generated_at: new Date().toISOString(), sides }, null, 1));
  const withOdds = sides.filter((s) => s.odds != null).length;
  console.log(`Wrote ${sides.length} trade sides (${processed.length} trades, ${withOdds} with odds) to ${out}`);
  return 0;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
