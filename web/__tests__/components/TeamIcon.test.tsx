/**
 * The team icon beside team names. It comes from the root layout's
 * `TeamIconsProvider`, so every `TeamName` — and every DataTable column with
 * `format: "team"` — gets it without being passed anything.
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import TeamName from "@/components/TeamName";
import TeamIconsProvider from "@/components/TeamIconsProvider";
import DataTable from "@/components/DataTable";

const versions = { "the witchcraft": 42 };

function inProvider(ui: React.ReactNode) {
  return render(<TeamIconsProvider versions={versions}>{ui}</TeamIconsProvider>);
}

test("a team with an icon shows it inside its link", () => {
  const { container } = inProvider(<TeamName name="The Witchcraft" />);
  const link = screen.getByRole("link", { name: "The Witchcraft" });
  const img = container.querySelector("img");
  expect(img).toHaveAttribute("src", "/team-icons/The%20Witchcraft?v=42");
  expect(link).toContainElement(img);
});

test("a team without one renders exactly as before", () => {
  const { container } = inProvider(<TeamName name="Other Team" />);
  expect(screen.getByRole("link", { name: "Other Team" })).toBeInTheDocument();
  expect(container.querySelector("img")).toBeNull();
});

test("plain names and free agents", () => {
  const { container } = inProvider(
    <>
      <TeamName name="The Witchcraft" plain />
      <TeamName name="FA" />
    </>,
  );
  expect(screen.queryByRole("link")).toBeNull();
  expect(container.querySelectorAll("img")).toHaveLength(1);
  expect(screen.getByText("FA")).toBeInTheDocument();
});

test("noIcon leaves it off", () => {
  const { container } = inProvider(<TeamName name="The Witchcraft" noIcon />);
  expect(container.querySelector("img")).toBeNull();
});

test("no provider means no icons, not a crash", () => {
  const { container } = render(<TeamName name="The Witchcraft" />);
  expect(container.querySelector("img")).toBeNull();
});

test('DataTable renders a format: "team" column through TeamName', () => {
  const { container } = inProvider(
    <DataTable
      columns={[{ key: "team_name", label: "Team", format: "team" }]}
      data={[{ team_name: "The Witchcraft" }, { team_name: null }]}
    />,
  );
  expect(screen.getByRole("link", { name: "The Witchcraft" })).toBeInTheDocument();
  expect(container.querySelector("img")).not.toBeNull();
  expect(screen.getByText("—")).toBeInTheDocument();
});
