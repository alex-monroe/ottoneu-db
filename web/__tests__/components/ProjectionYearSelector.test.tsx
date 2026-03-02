import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import ProjectionYearSelector from "@/components/ProjectionYearSelector";

// Mock next/navigation
jest.mock("next/navigation", () => ({
  useRouter: jest.fn(),
  useSearchParams: jest.fn(() => ({
    toString: () => "",
  })),
}));

import { useRouter, useSearchParams } from "next/navigation";

describe("ProjectionYearSelector", () => {
  const mockRouterPush = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue({
      push: mockRouterPush,
    });
  });

  it("renders years and highlights the current year", () => {
    const years = [2023, 2024, 2025];
    render(<ProjectionYearSelector currentYear={2024} years={years} />);

    expect(screen.getByText("Year:")).toBeInTheDocument();

    const year2023 = screen.getByText("2023");
    const year2024 = screen.getByText("2024");
    const year2025 = screen.getByText("2025");

    expect(year2023).toBeInTheDocument();
    expect(year2024).toBeInTheDocument();
    expect(year2025).toBeInTheDocument();

    expect(year2024).toHaveClass("bg-slate-700");
    expect(year2023).not.toHaveClass("bg-slate-700");
    expect(year2023).toHaveClass("bg-transparent");
  });

  it("calls router.push with the correct URL when a different year is clicked", () => {
    const years = [2023, 2024, 2025];
    render(<ProjectionYearSelector currentYear={2024} years={years} />);

    const year2025 = screen.getByText("2025");
    fireEvent.click(year2025);

    expect(mockRouterPush).toHaveBeenCalledTimes(1);
    expect(mockRouterPush).toHaveBeenCalledWith("?year=2025");
  });

  it("preserves other search parameters when changing the year", () => {
    (useSearchParams as jest.Mock).mockReturnValue({
      toString: () => "mode=projected&position=QB",
    });

    const years = [2023, 2024, 2025];
    render(<ProjectionYearSelector currentYear={2024} years={years} />);

    const year2025 = screen.getByText("2025");
    fireEvent.click(year2025);

    expect(mockRouterPush).toHaveBeenCalledTimes(1);
    expect(mockRouterPush).toHaveBeenCalledWith("?mode=projected&position=QB&year=2025");
  });

  it("replaces existing year parameter when changing the year", () => {
    (useSearchParams as jest.Mock).mockReturnValue({
      toString: () => "year=2023&mode=projected",
    });

    const years = [2023, 2024, 2025];
    render(<ProjectionYearSelector currentYear={2023} years={years} />);

    const year2025 = screen.getByText("2025");
    fireEvent.click(year2025);

    expect(mockRouterPush).toHaveBeenCalledTimes(1);
    expect(mockRouterPush).toHaveBeenCalledWith("?year=2025&mode=projected");
  });
});
