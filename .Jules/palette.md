## 2025-02-19 - [Navigation Accessibility]
**Learning:** Custom `NavDropdown` components lacked `aria-expanded` and `aria-haspopup` state, making the menu invisible to screen readers despite visual cues like rotating chevrons.
**Action:** When implementing custom disclosure widgets, always verify `aria-expanded` and `aria-controls` attributes, and ensure decorative icons have `aria-hidden="true"`.
## 2026-02-28 - Added Accessibility to ScatterChart
**Learning:** Interactive components like Recharts often wrap basic inputs and buttons. It's critical to ensure toggle groups have `role='group'` with `aria-label`, toggle buttons use `aria-pressed`, and inputs use semantic `<label htmlFor='...'>` instead of `<span>` wrappers.
**Action:** When evaluating custom charts or dashboards, proactively check filtering controls and axis toggles for standard ARIA labeling.

## 2026-03-01 - [Navigation Modes Accessibility]
**Learning:** Mode toggles that update the URL via `Link` components act as navigation tabs. Wrapping them in a `role="group"` with an `aria-label` and utilizing `aria-current="page"` on the active `Link` provides vital context to screen reader users about which data mode they are currently viewing.
**Action:** When creating grouped navigation buttons or mode switchers, ensure the active state is communicated via `aria-current="page"` or `aria-current="true"` instead of relying solely on visual styling.

## 2026-03-03 - Added aria-sort and aria-pressed
**Learning:** Table components with sortable headers need `aria-sort` on the `<th>` elements to indicate sort direction to screen readers. Groups of toggle buttons acting like tabs or filters (like Year Selectors) should be wrapped in `role="group"` with an `aria-label`, and the buttons themselves should use `aria-pressed`.
**Action:** When working on sortable tables, ensure `aria-sort="ascending" | "descending"` is conditionally applied. When working on toggle button groups, use `role="group"` and `aria-pressed`.

## 2026-03-08 - Keyboard accessibility on sortable custom headers
**Learning:** Custom interactive elements like `<th>` cells used for table sorting with an `onClick` handler are ignored by screen readers and keyboard users by default. Simply adding an `aria-sort` attribute is insufficient for full accessibility.
**Action:** When creating sortable custom table headers, ensure they receive focus via `tabIndex={0}`, have an `onKeyDown` handler to trigger sorting on 'Enter' and 'Space', and feature visual focus styles.
