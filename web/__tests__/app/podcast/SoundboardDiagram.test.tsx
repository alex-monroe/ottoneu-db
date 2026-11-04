/**
 * The soundboard thumbnail on the reveal screen. A wrong cell sends the host
 * to the wrong clip on air, so the layout is pinned button by button.
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import SoundboardDiagram, {
  SOUNDBOARD_ORDER,
  soundboardCell,
} from "@/app/podcast/power-rankings/reveal/SoundboardDiagram";

describe("soundboardCell", () => {
  // Rows counted from the top of the board (0 = the non-team top row).
  it.each([
    ["Ball So Hard University", 3, 0],
    ["Marin County Mountain Runners", 3, 1],
    ["The Golden Gouda", 3, 2],
    ["Irish Invasion", 3, 3],
    ["The Hard Eight", 2, 0],
    ["The Roseman Empire", 2, 1],
    ["Pacific Punt Masters", 2, 2],
    ["The Royal Dynasty", 2, 3],
    ["The Trigeminal Thunderclaps", 1, 0],
    ["The Triple Helix", 1, 1],
    ["Tinseltown Little Gold Men", 1, 2],
    ["The Witchcraft", 1, 3],
  ])("%s is row %i, column %i", (name, row, col) => {
    expect(soundboardCell(name)).toEqual({ row, col });
  });

  it("covers all twelve teams once and leaves the top row free", () => {
    expect(new Set(SOUNDBOARD_ORDER).size).toBe(12);
    for (const name of SOUNDBOARD_ORDER) {
      expect(soundboardCell(name)!.row).toBeGreaterThan(0);
    }
  });

  it("tolerates spacing, case and a missing or extra 'The'", () => {
    expect(soundboardCell("  the hard  eight ")).toEqual({ row: 2, col: 0 });
    expect(soundboardCell("Witchcraft")).toEqual({ row: 1, col: 3 });
    expect(soundboardCell("The Irish Invasion")).toEqual({ row: 3, col: 3 });
  });

  it("returns null for a team not on the board", () => {
    expect(soundboardCell("Alpha")).toBeNull();
  });
});

describe("SoundboardDiagram", () => {
  it("lights exactly one of sixteen buttons and labels it", () => {
    render(<SoundboardDiagram teamName="The Golden Gouda" />);
    const board = screen.getByRole("img", {
      name: /row 1 from the bottom, button 3 from the left/,
    });
    const cells = board.querySelectorAll(":scope > span");
    expect(cells).toHaveLength(16);
    // Third row in DOM order = index 4*3 + 2.
    expect(cells[14].className).toContain("bg-blue-600");
    expect(board.querySelectorAll(".bg-blue-600")).toHaveLength(1);
  });

  it("renders nothing for an unknown team", () => {
    const { container } = render(<SoundboardDiagram teamName="Alpha" />);
    expect(container).toBeEmptyDOMElement();
  });
});
