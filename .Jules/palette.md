## 2025-02-19 - [Navigation Accessibility]
**Learning:** Custom `NavDropdown` components lacked `aria-expanded` and `aria-haspopup` state, making the menu invisible to screen readers despite visual cues like rotating chevrons.
**Action:** When implementing custom disclosure widgets, always verify `aria-expanded` and `aria-controls` attributes, and ensure decorative icons have `aria-hidden="true"`.
