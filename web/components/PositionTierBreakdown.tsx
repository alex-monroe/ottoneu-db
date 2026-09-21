import { PositionTierData, FlexTierData, TierStat, POSITION_COLORS, Position } from '@/lib/types';
import type { StatWindow } from '@/lib/stat-window';

interface Props {
  positionTiers: PositionTierData[];
  flexTier: FlexTierData;
  /**
   * Which slice of season the tiers are built from.
   *
   * These benchmarks are the page's most quotable numbers — "the #12 WR averages
   * 13 PPG" is the kind of line that gets repeated — and in week 2 the #12 WR is
   * whoever had the best Sunday, not the twelfth-best receiver in football. The
   * heading has to carry the window or the number travels without it.
   */
  window?: StatWindow;
}

function TierTable({ tiers }: { tiers: TierStat[] }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-ink-subtle border-b border-line">
          <th className="py-2 text-left font-medium">Tier</th>
          <th className="py-2 text-right font-medium">PPG</th>
          <th className="py-2 text-right font-medium">Salary</th>
        </tr>
      </thead>
      <tbody>
        {tiers.map((tier) => (
          <tr
            key={tier.label}
            className="border-b border-line last:border-0"
          >
            <td className="py-1.5 text-ink-muted">{tier.label}</td>
            <td className="py-1.5 text-right font-mono text-ink-muted">
              {tier.n >= tier.tierSize ? tier.ppg.toFixed(2) : '—'}
            </td>
            <td className="py-1.5 text-right font-mono text-ink-muted">
              {tier.n >= tier.tierSize ? `$${tier.price}` : '—'}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function PositionTierBreakdown({ positionTiers, flexTier, window: w }: Props) {
  return (
    <section>
      <h2 className="text-xl font-semibold text-ink">
        Position Tier Benchmarks
        {w ? ` — ${w.label}` : ''}
      </h2>
      <p className="mb-4 mt-1 text-sm text-ink-subtle">
        {w && !w.complete ? (
          <>
            PPG and salary at each rank over {w.games} game
            {w.games === 1 ? '' : 's'} of football. A rank this early reflects one
            or two good afternoons as much as it reflects a tier, so read these as
            where the season has started, not where it will finish.
          </>
        ) : (
          <>
            The PPG and the salary at each rank, computed independently: #12 PPG is
            the twelfth-best scorer&apos;s rate, #12 salary the twelfth-highest
            price at that position.
          </>
        )}
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {positionTiers.map(({ position, tiers }) => (
          <div
            key={position}
            className="bg-sunken rounded-lg border border-line overflow-hidden"
          >
            <div
              className="px-4 py-2.5 border-b border-line"
              style={{ borderLeft: `4px solid ${POSITION_COLORS[position as Position]}` }}
            >
              <span
                className="text-xs font-bold px-2 py-0.5 rounded text-white"
                style={{ backgroundColor: POSITION_COLORS[position as Position] }}
              >
                {position}
              </span>
            </div>
            <div className="px-4 pb-3 pt-1">
              <TierTable tiers={tiers} />
            </div>
          </div>
        ))}

        {/* Flex composite card */}
        <div className="bg-sunken rounded-lg border border-line overflow-hidden">
          <div
            className="px-4 py-2.5 border-b border-line"
            style={{ borderLeft: '4px solid #64748b' }}
          >
            <span className="text-xs font-bold px-2 py-0.5 rounded text-white bg-slate-500">
              FLEX
            </span>
            <span className="ml-2 text-xs text-ink-subtle">RB / WR / TE</span>
          </div>
          <div className="px-4 pb-3 pt-1">
            <TierTable tiers={[flexTier.top36]} />
          </div>
        </div>
      </div>
    </section>
  );
}
