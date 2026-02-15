/**
 * Reusable summary card component for displaying metrics.
 *
 * Used across analysis pages to show key statistics like total salary,
 * cap space, surplus value, etc. with consistent styling.
 */

interface SummaryCardProps {
  label: string;
  value: string | number;
  valueClassName?: string;
  variant?: 'default' | 'positive' | 'negative';
}

export default function SummaryCard({
  label,
  value,
  valueClassName,
  variant = 'default'
}: SummaryCardProps) {
  const baseClasses = "rounded-lg p-5 border";

  const variantClasses = {
    default: "bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800",
    positive: "bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800",
    negative: "bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800",
  };

  const defaultValueClasses = {
    default: "text-slate-900 dark:text-white",
    positive: "text-green-700 dark:text-green-300",
    negative: "text-red-700 dark:text-red-300",
  };

  return (
    <div className={`${baseClasses} ${variantClasses[variant]}`}>
      <p className="text-sm text-slate-500 dark:text-slate-400">{label}</p>
      <p className={`text-2xl font-bold ${valueClassName ?? defaultValueClasses[variant]}`}>
        {typeof value === 'number' ? `$${value}` : value}
      </p>
    </div>
  );
}
