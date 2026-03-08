"use client";

import { useState } from "react";
import { ArbitrationPlan } from "@/lib/types";

interface PlanManagerProps {
  plans: ArbitrationPlan[];
  activePlanId: string | null;
  hasUnsavedChanges: boolean;
  onSelectPlan: (id: string) => void;
  onCreatePlan: (name: string) => void;
  onSavePlan: () => void;
  onSaveAsPlan: (name: string) => void;
  onDeletePlan: (id: string) => void;
  onDuplicatePlan: (id: string, name: string) => void;
  onCreateFromSuggested: () => void;
  hideCreateFromSuggested?: boolean;
}

export default function PlanManager({
  plans,
  activePlanId,
  hasUnsavedChanges,
  onSelectPlan,
  onCreatePlan,
  onSavePlan,
  onSaveAsPlan,
  onDeletePlan,
  onDuplicatePlan,
  onCreateFromSuggested,
  hideCreateFromSuggested = false,
}: PlanManagerProps) {
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [action, setAction] = useState<"new" | "saveAs" | "duplicate" | null>(null);

  const activePlan = plans.find((p) => p.id === activePlanId);

  const handleSubmit = () => {
    const name = newName.trim();
    if (!name) return;

    if (action === "new") {
      onCreatePlan(name);
    } else if (action === "saveAs") {
      onSaveAsPlan(name);
    } else if (action === "duplicate" && activePlanId) {
      onDuplicatePlan(activePlanId, name);
    }

    setNewName("");
    setAction(null);
    setShowNew(false);
  };

  const startAction = (a: "new" | "saveAs" | "duplicate") => {
    setAction(a);
    setShowNew(true);
    if (a === "duplicate" && activePlan) {
      setNewName(`${activePlan.name} (copy)`);
    } else {
      setNewName("");
    }
  };

  return (
    <div className="bg-slate-50 dark:bg-slate-900 rounded-lg p-4 border border-slate-200 dark:border-slate-800 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {/* Plan selector */}
        <select
          value={activePlanId ?? ""}
          onChange={(e) => e.target.value && onSelectPlan(e.target.value)}
          className="rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white px-3 py-1.5 text-sm min-w-[200px]"
        >
          <option value="">Select a plan...</option>
          {plans.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>

        {/* Action buttons */}
        <button
          onClick={() => startAction("new")}
          className="px-3 py-1.5 text-sm font-medium rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors"
        >
          New
        </button>

        {activePlanId && (
          <>
            <button
              onClick={onSavePlan}
              disabled={!hasUnsavedChanges}
              className="px-3 py-1.5 text-sm font-medium rounded bg-green-600 text-white hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Save
            </button>
            <button
              onClick={() => startAction("saveAs")}
              className="px-3 py-1.5 text-sm font-medium rounded border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              Save As
            </button>
            <button
              onClick={() => startAction("duplicate")}
              className="px-3 py-1.5 text-sm font-medium rounded border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              Duplicate
            </button>
            <button
              onClick={() => {
                if (confirm(`Delete plan "${activePlan?.name}"?`)) {
                  onDeletePlan(activePlanId);
                }
              }}
              className="px-3 py-1.5 text-sm font-medium rounded border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
            >
              Delete
            </button>
          </>
        )}

        {!hideCreateFromSuggested && (
          <button
            onClick={onCreateFromSuggested}
            className="px-3 py-1.5 text-sm font-medium rounded border border-blue-300 dark:border-blue-700 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors"
          >
            Create from Suggested
          </button>
        )}

        {/* Save status */}
        {activePlanId && (
          <span
            className={`text-xs ml-auto ${hasUnsavedChanges
                ? "text-yellow-600 dark:text-yellow-400"
                : "text-green-600 dark:text-green-400"
              }`}
          >
            {hasUnsavedChanges ? "Unsaved changes" : "Saved"}
          </span>
        )}
      </div>

      {/* New/SaveAs/Duplicate name input */}
      {showNew && (
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            placeholder={
              action === "new"
                ? "Plan name..."
                : action === "saveAs"
                  ? "New name..."
                  : "Copy name..."
            }
            className="rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white px-3 py-1.5 text-sm flex-1"
            autoFocus
          />
          <button
            onClick={handleSubmit}
            disabled={!newName.trim()}
            className="px-3 py-1.5 text-sm font-medium rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {action === "new" ? "Create" : action === "saveAs" ? "Save" : "Duplicate"}
          </button>
          <button
            onClick={() => {
              setShowNew(false);
              setAction(null);
            }}
            className="px-3 py-1.5 text-sm font-medium rounded border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
