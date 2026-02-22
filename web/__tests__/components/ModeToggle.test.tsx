/**
 * Unit tests for ModeToggle component — renders buttons and builds correct URLs.
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import ModeToggle from "@/components/ModeToggle";

describe("ModeToggle", () => {
    it("renders all three mode buttons", () => {
        render(
            <ModeToggle currentMode="raw" basePath="/arbitration" hasAdjustments={false} />
        );
        expect(screen.getByText("Raw")).toBeInTheDocument();
        expect(screen.getByText("Adjusted")).toBeInTheDocument();
        expect(screen.getByText("Projected")).toBeInTheDocument();
    });

    it("highlights the current mode", () => {
        render(
            <ModeToggle currentMode="adjusted" basePath="/arbitration" hasAdjustments={false} />
        );
        const adjustedLink = screen.getByText("Adjusted").closest("a")!;
        expect(adjustedLink.className).toContain("bg-blue-600");
    });

    it("builds correct URLs for modes", () => {
        render(
            <ModeToggle currentMode="raw" basePath="/arbitration" hasAdjustments={false} />
        );
        const rawLink = screen.getByText("Raw").closest("a")!;
        const adjustedLink = screen.getByText("Adjusted").closest("a")!;
        const projectedLink = screen.getByText("Projected").closest("a")!;

        expect(rawLink.getAttribute("href")).toBe("/arbitration");
        expect(adjustedLink.getAttribute("href")).toBe("/arbitration?mode=adjusted");
        expect(projectedLink.getAttribute("href")).toBe("/arbitration?mode=projected");
    });

    it("preserves extra params in URLs", () => {
        render(
            <ModeToggle
                currentMode="raw"
                basePath="/arbitration"
                hasAdjustments={false}
                extraParams={{ year: "2026" }}
            />
        );
        const projectedLink = screen.getByText("Projected").closest("a")!;
        const href = projectedLink.getAttribute("href")!;
        expect(href).toContain("year=2026");
        expect(href).toContain("mode=projected");
    });

    it("shows adjustment indicator dot when hasAdjustments=true and not in adjusted mode", () => {
        render(
            <ModeToggle currentMode="raw" basePath="/arbitration" hasAdjustments={true} />
        );
        // The dot is a span with bg-blue-500 class
        const adjustedContainer = screen.getByText("Adjusted").closest("a")!;
        const dot = adjustedContainer.querySelector(".bg-blue-500");
        expect(dot).toBeInTheDocument();
    });

    it("hides adjustment indicator dot when in adjusted mode", () => {
        render(
            <ModeToggle currentMode="adjusted" basePath="/arbitration" hasAdjustments={true} />
        );
        const adjustedContainer = screen.getByText("Adjusted").closest("a")!;
        const dot = adjustedContainer.querySelector(".bg-blue-500");
        expect(dot).not.toBeInTheDocument();
    });
});
