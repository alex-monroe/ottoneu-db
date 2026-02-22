/**
 * Unit tests for DataTable component — rendering, sorting, formatting, highlights.
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import DataTable, { Column, TableRow } from "@/components/DataTable";

const columns: Column[] = [
    { key: "name", label: "Name" },
    { key: "price", label: "Price", format: "currency" },
    { key: "ppg", label: "PPG", format: "decimal" },
    { key: "pct", label: "PCT", format: "percent" },
];

const data: TableRow[] = [
    { name: "Josh Allen", price: 50, ppg: 22.5, pct: 0.85 },
    { name: "Saquon Barkley", price: 30, ppg: 18.0, pct: 0.72 },
    { name: "CeeDee Lamb", price: 40, ppg: 16.33, pct: null },
];

describe("DataTable", () => {
    it("renders column headers", () => {
        render(<DataTable columns={columns} data={data} />);
        expect(screen.getByText("Name")).toBeInTheDocument();
        expect(screen.getByText("Price")).toBeInTheDocument();
        expect(screen.getByText("PPG")).toBeInTheDocument();
    });

    it("renders all rows", () => {
        render(<DataTable columns={columns} data={data} />);
        expect(screen.getByText("Josh Allen")).toBeInTheDocument();
        expect(screen.getByText("Saquon Barkley")).toBeInTheDocument();
        expect(screen.getByText("CeeDee Lamb")).toBeInTheDocument();
    });

    it("formats currency values with $", () => {
        render(<DataTable columns={columns} data={data} />);
        expect(screen.getByText("$50")).toBeInTheDocument();
        expect(screen.getByText("$30")).toBeInTheDocument();
    });

    it("formats decimal values to 2 places", () => {
        render(<DataTable columns={columns} data={data} />);
        expect(screen.getByText("22.50")).toBeInTheDocument();
        expect(screen.getByText("16.33")).toBeInTheDocument();
    });

    it("formats percent values", () => {
        render(<DataTable columns={columns} data={data} />);
        expect(screen.getByText("85%")).toBeInTheDocument();
        expect(screen.getByText("72%")).toBeInTheDocument();
    });

    it("renders null values as em dash", () => {
        render(<DataTable columns={columns} data={data} />);
        expect(screen.getByText("—")).toBeInTheDocument();
    });

    it("shows 'No data' when data is empty", () => {
        render(<DataTable columns={columns} data={[]} />);
        expect(screen.getByText("No data")).toBeInTheDocument();
    });

    it("sorts ascending on column click", () => {
        render(<DataTable columns={columns} data={data} />);
        fireEvent.click(screen.getByText("Price"));
        const cells = screen.getAllByText(/\$/);
        // After ascending sort: $30, $40, $50
        expect(cells[0].textContent).toBe("$30");
        expect(cells[1].textContent).toBe("$40");
        expect(cells[2].textContent).toBe("$50");
    });

    it("toggles to descending on second click", () => {
        render(<DataTable columns={columns} data={data} />);
        fireEvent.click(screen.getByText("Price"));
        fireEvent.click(screen.getByText("Price"));
        const cells = screen.getAllByText(/\$/);
        // After descending sort: $50, $40, $30
        expect(cells[0].textContent).toBe("$50");
        expect(cells[1].textContent).toBe("$40");
        expect(cells[2].textContent).toBe("$30");
    });

    it("shows sort indicator arrow", () => {
        render(<DataTable columns={columns} data={data} />);
        fireEvent.click(screen.getByText("Name"));
        expect(screen.getByText("▲")).toBeInTheDocument();
        fireEvent.click(screen.getByText("Name"));
        expect(screen.getByText("▼")).toBeInTheDocument();
    });
});
