/**
 * Reusable summary card component for displaying metrics.
 *
 * Used across analysis pages to show key statistics like total salary,
 * cap space, surplus value, etc. with consistent styling.
 */

import Explain from "./Explain";
import type { GlossaryTerm } from "@/lib/glossary";

interface SummaryCardProps {
  label: string;
  /** Glossary term to hang a "?" off, same contract as `Column.explain`. */
  explain?: GlossaryTerm;
  value: string | number;
  valueClassName?: string;
  variant?: 'default' | 'positive' | 'negative';
}

export default function SummaryCard({
  label,
  explain,
  value,
  valueClassName,
  variant = 'default'
}: SummaryCardProps) {
  const baseClasses = "rounded-lg p-5 border";

  const variantClasses = {
    default: "bg-sunken border-line",
    positive: "bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800",
    negative: "bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800",
  };

  const defaultValueClasses = {
    default: "text-ink",
    positive: "text-positive",
    negative: "text-negative",
  };

  return (
    <div className={`${baseClasses} ${variantClasses[variant]}`}>
      <p className="flex items-center text-sm text-ink-subtle">
        {label}
        {explain && <Explain term={explain} />}
      </p>
      <p className={`mt-0.5 text-2xl font-bold tabular-nums ${valueClassName ?? defaultValueClasses[variant]}`}>
        {typeof value === 'number' ? `$${value}` : value}
      </p>
    </div>
  );
}
