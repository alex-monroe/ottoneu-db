import { fetchActiveProjectionModel } from "@/lib/data";

interface Props {
  /** Optional intro sentence rendered above the model summary. */
  children?: React.ReactNode;
  /** Optional additional notes rendered after the feature list. */
  footer?: React.ReactNode;
  /** Visual variant — slate matches /projections, blue matches /arbitration projected mode. */
  variant?: "slate" | "blue";
}

/**
 * Server component that renders methodology metadata for whichever projection
 * model is currently flagged is_active=TRUE in projection_models.
 *
 * This is the single source of truth for "which model is the site serving"
 * across /projections, /arbitration projected mode, and /projection-accuracy.
 * Promote a different model via scripts/feature_projections/promote.py and
 * every consumer updates on the next render.
 */
export default async function ActiveModelCard({ children, footer, variant = "slate" }: Props) {
  const model = await fetchActiveProjectionModel();

  const wrapperClass =
    variant === "blue"
      ? "bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-5 space-y-2"
      : "bg-slate-50 dark:bg-slate-900 rounded-lg p-5 border border-slate-200 dark:border-slate-800 space-y-3 text-sm text-slate-700 dark:text-slate-300";

  const headingClass =
    variant === "blue"
      ? "text-sm font-semibold text-blue-900 dark:text-blue-200"
      : "text-lg font-semibold text-slate-900 dark:text-white";

  const bodyClass =
    variant === "blue"
      ? "text-sm text-blue-800 dark:text-blue-300"
      : "text-sm text-slate-700 dark:text-slate-300";

  const codeClass =
    variant === "blue"
      ? "text-xs bg-blue-100 dark:bg-blue-900 px-1 rounded"
      : "text-xs bg-slate-200 dark:bg-slate-800 px-1.5 py-0.5 rounded";

  if (!model) {
    return (
      <section className={wrapperClass}>
        <h2 className={headingClass}>Projection model</h2>
        <p className={bodyClass}>
          No active projection model is configured. Promote one with{" "}
          <code className={codeClass}>
            venv/bin/python scripts/feature_projections/promote.py &lt;model_name&gt;
          </code>
          .
        </p>
      </section>
    );
  }

  return (
    <section className={wrapperClass}>
      <h2 className={headingClass}>
        Projection model: <code className={codeClass}>{model.name}</code> (v{model.version})
      </h2>
      {children}
      {model.description && <p className={bodyClass}>{model.description}</p>}
      {model.features.length > 0 && (
        <p className={bodyClass}>
          <strong>Features:</strong>{" "}
          {model.features.map((f, i) => (
            <span key={f}>
              <code className={codeClass}>{f}</code>
              {i < model.features.length - 1 ? " · " : ""}
            </span>
          ))}
        </p>
      )}
      {footer}
    </section>
  );
}
