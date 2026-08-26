import SnakeDraftClient from "./SnakeDraftClient";

export const metadata = { title: "Snake Draft" };

/**
 * Public — no sign-in, no database. The board is a static module
 * (lib/data/athletic-vorp.ts) and the whole draft runs in the browser.
 */
export default function SnakeDraftPage() {
  return <SnakeDraftClient />;
}
