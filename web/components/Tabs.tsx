import { Suspense, type ReactNode } from "react";
import TabBar from "./TabBar";

export interface TabDef {
  /** Stable id used in the `?tab=` query param. */
  id: string;
  /** Human-readable tab label. */
  label: string;
  /** Panel content. Only the active tab's content is rendered. */
  content: ReactNode;
}

interface TabsProps {
  tabs: TabDef[];
  /** Active tab id (resolve from the page's `searchParams.tab`). */
  activeId?: string;
  /** Query-string key used to persist the active tab (default "tab"). */
  paramKey?: string;
}

/**
 * Server-rendered tab container. The active tab is selected from the URL
 * (`?tab=`, resolved by the parent page and passed in as `activeId`) so only
 * the active panel is rendered — important because panels may be server
 * components that fetch their own data, and because passing client components
 * with non-serializable props (e.g. DataTable column render fns) *through* a
 * client component is disallowed. The lightweight client `TabBar` only receives
 * serializable `{ id, label }` and updates the URL on click.
 */
export default function Tabs({ tabs, activeId, paramKey = "tab" }: TabsProps) {
  const active = tabs.find((t) => t.id === activeId) ?? tabs[0];

  return (
    <div>
      <Suspense>
        <TabBar
          tabs={tabs.map(({ id, label }) => ({ id, label }))}
          activeId={active.id}
          paramKey={paramKey}
        />
      </Suspense>
      <div role="tabpanel">{active.content}</div>
    </div>
  );
}
