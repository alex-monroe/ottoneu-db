import { PositionTierData, FlexTierData, TierStat, POSITION_COLORS, Position } from '@/lib/types';

interface Props {
  positionTiers: PositionTierData[];
  flexTier: FlexTierData;
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

export default function PositionTierBreakdown({ positionTiers, flexTier }: Props) {
  return (
    <section>
      <h2 className="text-xl font-semibold mb-4 text-ink">
        Position Tier Benchmarks
      </h2>
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
