/**
 * The in-product glossary affordance, and its wiring into DataTable headers.
 *
 * The site printed VORP, PPS and "Adjusted" as bare headers. This checks the
 * definition actually reaches the reader, and — the bit most likely to break —
 * that asking what a column means does not also sort the table, since the
 * header itself is a sort button.
 *
 * The panel is queried as `dialog`, not `tooltip`. It carries a link, and ARIA
 * forbids interactive content inside `role="tooltip"`; it is also click-toggled
 * rather than hover-revealed. It renders through a portal so that DataTable's
 * `overflow-x-auto` cannot clip it, which is why these queries go through
 * `screen` (document-wide) rather than the render container.
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import Explain from "@/components/Explain";
import DataTable from "@/components/DataTable";
import type { Column, TableRow } from "@/lib/types";

describe("Explain", () => {
  it("stays closed until asked", () => {
    render(<Explain term="vorp" />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows the definition on click", () => {
    render(<Explain term="vorp" />);
    fireEvent.click(screen.getByRole("button", { name: /what is vorp/i }));
    expect(screen.getByRole("dialog")).toHaveTextContent(/Value Over Replacement Player/);
  });

  it("distinguishes the two projection kinds", () => {
    const { unmount } = render(<Explain term="projected_ppg" />);
    fireEvent.click(screen.getByRole("button", { name: /what is projected ppg/i }));
    expect(screen.getByRole("dialog")).toHaveTextContent(/season-long/i);
    unmount();

    render(<Explain term="projected_points" />);
    fireEvent.click(screen.getByRole("button", { name: /what is projected points/i }));
    expect(screen.getByRole("dialog")).toHaveTextContent(/ONE specific game/);
  });

  it("closes on Escape", () => {
    render(<Explain term="surplus" />);
    fireEvent.click(screen.getByRole("button", { name: /what is surplus/i }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("DataTable header wiring", () => {
  const columns: Column[] = [
    { key: "name", label: "Player" },
    { key: "surplus", label: "Surplus", format: "currency", explain: "surplus" },
  ];
  const data: TableRow[] = [
    { name: "Alpha", surplus: 10 },
    { name: "Beta", surplus: -5 },
  ];

  it("renders the affordance only on tagged columns", () => {
    render(<DataTable columns={columns} data={data} />);
    expect(screen.getAllByRole("button", { name: /what is/i })).toHaveLength(1);
  });

  it("asking what a column means does not sort the table", () => {
    render(<DataTable columns={columns} data={data} />);
    const firstCellBefore = screen.getAllByRole("row")[1].textContent;

    fireEvent.click(screen.getByRole("button", { name: /what is surplus/i }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    // Header clicks sort; the "?" inside the header must not.
    expect(screen.getAllByRole("row")[1].textContent).toBe(firstCellBefore);
  });

  it("asking from the keyboard does not sort the table either", () => {
    render(<DataTable columns={columns} data={data} />);
    const firstCellBefore = screen.getAllByRole("row")[1].textContent;
    const trigger = screen.getByRole("button", { name: /what is surplus/i });

    // The header's own onKeyDown used to fire for Enter bubbling up from this
    // button, so a keyboard user reading a definition also re-sorted the table.
    fireEvent.keyDown(trigger, { key: "Enter" });
    fireEvent.click(trigger);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getAllByRole("row")[1].textContent).toBe(firstCellBefore);
  });
});
