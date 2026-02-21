"use client";

import { useState, useMemo, useCallback } from "react";
import { SurplusPlayer, MY_TEAM } from "@/lib/arb-logic";

interface AdjustmentEntry {
  adjustment: number;
  notes: string;
}

interface AdjustmentsTableProps {
  players: SurplusPlayer[];
  existingAdjustments: Record<string, AdjustmentEntry>;
}

const POSITIONS = ["ALL", "QB", "RB", "WR", "TE"];

type SortKey =
  | "name"
  | "position"
  | "age"
  | "team_name"
  | "price"
  | "dollar_value"
  | "surplus"
  | "adjustment"
  | "adj_value"
  | "adj_surplus";

type SortDir = "asc" | "desc";

function calculateAge(birthDate: string | null | undefined): number | null {
  if (!birthDate) return null;
  const today = new Date();
  const dob = new Date(birthDate + "T00:00:00");
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
  return age;
}

export default function AdjustmentsTable({
  players,
  existingAdjustments,
}: AdjustmentsTableProps) {
  const [adjustments, setAdjustments] = useState<Record<string, AdjustmentEntry>>(() => {
    const init: Record<string, AdjustmentEntry> = {};
    for (const p of players) {
      init[p.player_id] = existingAdjustments[p.player_id] ?? {
        adjustment: 0,
        notes: "",
      };
    }
    return init;
  });

  const [filterPos, setFilterPos] = useState("ALL");
  const [filterTeam, setFilterTeam] = useState("ALL");
  const [filterModified, setFilterModified] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | "error">("idle");
  const [sortKey, setSortKey] = useState<SortKey>("surplus");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const toggleSort = useCallback(
    (key: SortKey) => {
      if (sortKey === key) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortKey(key);
        setSortDir(key === "name" || key === "position" || key === "team_name" ? "asc" : "desc");
      }
    },
    [sortKey]
  );

  const hasChanges = useMemo(() => {
    for (const p of players) {
      const cur = adjustments[p.player_id] ?? { adjustment: 0, notes: "" };
      const orig = existingAdjustments[p.player_id] ?? { adjustment: 0, notes: "" };
      if (cur.adjustment !== orig.adjustment || cur.notes !== orig.notes) return true;
    }
    return false;
  }, [adjustments, players, existingAdjustments]);

  const allTeams = useMemo(() => {
    const teams = new Set<string>();
    for (const p of players) {
      if (p.team_name && p.team_name !== "FA" && p.team_name !== "")
        teams.add(p.team_name);
    }
    return Array.from(teams).sort();
  }, [players]);

  const filteredPlayers = useMemo(() => {
    const filtered = players
      .filter((p) => filterPos === "ALL" || p.position === filterPos)
      .filter((p) => filterTeam === "ALL" || p.team_name === filterTeam)
      .filter((p) => {
        if (!filterModified) return true;
        return (adjustments[p.player_id]?.adjustment ?? 0) !== 0;
      });

    // Sort
    return filtered.sort((a, b) => {
      const adj_a = adjustments[a.player_id] ?? { adjustment: 0, notes: "" };
      const adj_b = adjustments[b.player_id] ?? { adjustment: 0, notes: "" };
      let va: number | string;
      let vb: number | string;

      switch (sortKey) {
        case "name":
          va = a.name;
          vb = b.name;
          break;
        case "position":
          va = a.position;
          vb = b.position;
          break;
        case "age":
          va = calculateAge(a.birth_date) ?? 999;
          vb = calculateAge(b.birth_date) ?? 999;
          break;
        case "team_name":
          va = a.team_name ?? "ZZZ";
          vb = b.team_name ?? "ZZZ";
          break;
        case "price":
          va = a.price;
          vb = b.price;
          break;
        case "dollar_value":
          va = a.dollar_value;
          vb = b.dollar_value;
          break;
        case "surplus":
          va = a.surplus;
          vb = b.surplus;
          break;
        case "adjustment":
          va = adj_a.adjustment;
          vb = adj_b.adjustment;
          break;
        case "adj_value":
          va = Math.max(1, a.dollar_value + adj_a.adjustment);
          vb = Math.max(1, b.dollar_value + adj_b.adjustment);
          break;
        case "adj_surplus":
          va = Math.max(1, a.dollar_value + adj_a.adjustment) - a.price;
          vb = Math.max(1, b.dollar_value + adj_b.adjustment) - b.price;
          break;
        default:
          va = 0;
          vb = 0;
      }

      if (typeof va === "string" && typeof vb === "string") {
        const cmp = va.localeCompare(vb);
        return sortDir === "asc" ? cmp : -cmp;
      }
      const diff = (va as number) - (vb as number);
      return sortDir === "asc" ? diff : -diff;
    });
  }, [players, filterPos, filterTeam, filterModified, adjustments, sortKey, sortDir]);

  const updateAdjustment = (playerId: string, value: number) => {
    setAdjustments((prev) => ({
      ...prev,
      [playerId]: { ...(prev[playerId] ?? { adjustment: 0, notes: "" }), adjustment: value },
    }));
    setSaveStatus("idle");
  };

  const updateNotes = (playerId: string, notes: string) => {
    setAdjustments((prev) => ({
      ...prev,
      [playerId]: { ...(prev[playerId] ?? { adjustment: 0, notes: "" }), notes },
    }));
    setSaveStatus("idle");
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveStatus("idle");
    try {
      // Send all non-zero adjustments, plus any that were previously non-zero (to update them to 0)
      const rows = Object.entries(adjustments)
        .filter(([player_id, v]) => {
          const orig = existingAdjustments[player_id];
          return v.adjustment !== 0 || v.notes !== "" || (orig && (orig.adjustment !== 0 || orig.notes !== ""));
        })
        .map(([player_id, v]) => ({
          player_id,
          adjustment: v.adjustment,
          notes: v.notes,
        }));

      const res = await fetch("/api/surplus-adjustments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rows),
      });

      if (!res.ok) throw new Error("Save failed");
      setSaveStatus("saved");
    } catch {
      setSaveStatus("error");
    } finally {
      setSaving(false);
    }
  };

  const totalModified = useMemo(
    () => players.filter((p) => (adjustments[p.player_id]?.adjustment ?? 0) !== 0).length,
    [players, adjustments]
  );

  const sortIndicator = (key: SortKey) => {
    if (sortKey !== key) return <span className="text-slate-300 dark:text-slate-600 ml-0.5">↕</span>;
    return <span className="text-blue-500 ml-0.5">{sortDir === "asc" ? "↑" : "↓"}</span>;
  };

  const thClass =
    "px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap cursor-pointer select-none hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors";

  return (
    <div className="space-y-4">
      {/* Controls bar */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Position filter */}
        <div className="flex gap-1">
          {POSITIONS.map((pos) => (
            <button
              key={pos}
              onClick={() => setFilterPos(pos)}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${filterPos === pos
                  ? "bg-blue-600 text-white"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
                }`}
            >
              {pos}
            </button>
          ))}
        </div>

        {/* Team filter */}
        <select
          value={filterTeam}
          onChange={(e) => setFilterTeam(e.target.value)}
          className="px-2 py-1.5 text-xs rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300"
        >
          <option value="ALL">All Teams</option>
          {allTeams.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>

        {/* Modified filter */}
        <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={filterModified}
            onChange={(e) => setFilterModified(e.target.checked)}
            className="rounded"
          />
          Modified only ({totalModified})
        </label>

        {/* Save button */}
        <div className="ml-auto flex items-center gap-3">
          {saveStatus === "saved" && (
            <span className="text-xs text-green-600 dark:text-green-400">Saved!</span>
          )}
          {saveStatus === "error" && (
            <span className="text-xs text-red-600 dark:text-red-400">Save failed</span>
          )}
          <button
            onClick={handleSave}
            disabled={saving || !hasChanges}
            className="px-4 py-1.5 rounded bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="bg-slate-100 dark:bg-slate-800">
              <th className={thClass} onClick={() => toggleSort("name")}>
                Player{sortIndicator("name")}
              </th>
              <th className={thClass} onClick={() => toggleSort("position")}>
                Pos{sortIndicator("position")}
              </th>
              <th className={thClass} onClick={() => toggleSort("age")}>
                Age{sortIndicator("age")}
              </th>
              <th className={thClass} onClick={() => toggleSort("team_name")}>
                Owner{sortIndicator("team_name")}
              </th>
              <th className={thClass} onClick={() => toggleSort("price")}>
                Salary{sortIndicator("price")}
              </th>
              <th className={thClass} onClick={() => toggleSort("dollar_value")}>
                VORP Value{sortIndicator("dollar_value")}
              </th>
              <th className={thClass} onClick={() => toggleSort("surplus")}>
                Raw Surplus{sortIndicator("surplus")}
              </th>
              <th className={thClass} onClick={() => toggleSort("adjustment")}>
                Adjustment ($){sortIndicator("adjustment")}
              </th>
              <th className={thClass} onClick={() => toggleSort("adj_value")}>
                Adj. Value{sortIndicator("adj_value")}
              </th>
              <th className={thClass} onClick={() => toggleSort("adj_surplus")}>
                Adj. Surplus{sortIndicator("adj_surplus")}
              </th>
              <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap">Notes</th>
            </tr>
          </thead>
          <tbody>
            {filteredPlayers.map((player, i) => {
              const adj = adjustments[player.player_id] ?? { adjustment: 0, notes: "" };
              const adjValue = Math.max(1, player.dollar_value + adj.adjustment);
              const adjSurplus = adjValue - player.price;
              const origAdj = existingAdjustments[player.player_id] ?? { adjustment: 0, notes: "" };
              const isUnsaved =
                adj.adjustment !== origAdj.adjustment || adj.notes !== origAdj.notes;
              const isSavedNonZero = !isUnsaved && adj.adjustment !== 0;
              const age = calculateAge(player.birth_date);

              const rowClass = isUnsaved
                ? "bg-yellow-50 dark:bg-yellow-950/20"
                : isSavedNonZero
                  ? "bg-blue-50 dark:bg-blue-950/20"
                  : i % 2 === 0
                    ? "bg-white dark:bg-slate-950"
                    : "bg-slate-50 dark:bg-slate-900";

              return (
                <tr
                  key={player.player_id}
                  className={`border-t border-slate-100 dark:border-slate-800 ${rowClass}`}
                >
                  <td className="px-3 py-2 text-slate-800 dark:text-slate-200 whitespace-nowrap font-medium">
                    {player.name}
                    {player.team_name === MY_TEAM && (
                      <span className="ml-1 text-xs text-blue-600 dark:text-blue-400">★</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-slate-800 dark:text-slate-200 whitespace-nowrap">
                    {player.position}
                  </td>
                  <td className="px-3 py-2 text-slate-600 dark:text-slate-400 whitespace-nowrap text-xs">
                    {age ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-slate-500 dark:text-slate-400 whitespace-nowrap text-xs">
                    {player.team_name ?? "FA"}
                  </td>
                  <td className="px-3 py-2 text-slate-800 dark:text-slate-200 whitespace-nowrap">
                    ${player.price}
                  </td>
                  <td className="px-3 py-2 text-slate-800 dark:text-slate-200 whitespace-nowrap">
                    ${player.dollar_value}
                  </td>
                  <td
                    className={`px-3 py-2 whitespace-nowrap font-medium ${player.surplus >= 0
                        ? "text-green-700 dark:text-green-400"
                        : "text-red-700 dark:text-red-400"
                      }`}
                  >
                    {player.surplus >= 0 ? "+" : ""}
                    {player.surplus}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <input
                      type="number"
                      value={adj.adjustment}
                      onChange={(e) =>
                        updateAdjustment(
                          player.player_id,
                          parseInt(e.target.value) || 0
                        )
                      }
                      className="w-20 px-2 py-1 text-sm border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-1 focus:ring-blue-500 text-right"
                      step="1"
                    />
                  </td>
                  <td className="px-3 py-2 text-slate-800 dark:text-slate-200 whitespace-nowrap">
                    ${adjValue}
                  </td>
                  <td
                    className={`px-3 py-2 whitespace-nowrap font-medium ${adjSurplus >= 0
                        ? "text-green-700 dark:text-green-400"
                        : "text-red-700 dark:text-red-400"
                      }`}
                  >
                    {adjSurplus >= 0 ? "+" : ""}
                    {adjSurplus}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <input
                      type="text"
                      value={adj.notes}
                      onChange={(e) => updateNotes(player.player_id, e.target.value)}
                      placeholder="e.g. injury recovery"
                      className="w-44 px-2 py-1 text-xs border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-1 focus:ring-blue-500"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-500 dark:text-slate-400">
        {filteredPlayers.length} players shown.{" "}
        <span className="inline-block w-2 h-2 rounded-sm bg-yellow-200 dark:bg-yellow-900 border border-yellow-400 mr-0.5" />
        {" "}unsaved changes.{" "}
        <span className="inline-block w-2 h-2 rounded-sm bg-blue-100 dark:bg-blue-950 border border-blue-300 mr-0.5" />
        {" "}saved non-zero adjustment.{" "}
        ★ = your team.
      </p>
    </div>
  );
}
