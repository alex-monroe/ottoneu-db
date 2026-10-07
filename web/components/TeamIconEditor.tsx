"use client";

/**
 * Upload, replace or remove a team's icon — shown on the team page to its
 * manager (and to admins).
 *
 * The browser does the image work: the chosen file is center-cropped to a
 * square and redrawn at TEAM_ICON_SIZE px on a canvas, so whatever the manager
 * picks (a 4MB phone photo, an animated GIF) arrives as a few-KB still image
 * the server only has to validate.
 */
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Trash2 } from "lucide-react";
import { TEAM_ICON_SIZE } from "@/lib/team-icons";
import { useTeamIconSrc } from "./TeamIconsProvider";

/** Center-crop `file` to a square and re-encode it at TEAM_ICON_SIZE px. */
async function toIconDataUrl(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("That file could not be read as an image."));
      el.src = url;
    });
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = TEAM_ICON_SIZE;
    canvas.height = TEAM_ICON_SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Your browser could not process the image.");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(
      img,
      (img.naturalWidth - side) / 2,
      (img.naturalHeight - side) / 2,
      side,
      side,
      0,
      0,
      TEAM_ICON_SIZE,
      TEAM_ICON_SIZE,
    );
    // Browsers that cannot encode WebP (older Safari) fall back to PNG.
    return canvas.toDataURL("image/webp", 0.9);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function TeamIconEditor({ teamName }: { teamName: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const hasIcon = useTeamIconSrc(teamName) != null;
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(method: "PUT" | "DELETE", body: object) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/team-icon", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, teamName }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Something went wrong.");
      setPreview(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // picking the same file again should still fire
    if (!file) return;
    setError(null);
    try {
      setPreview(await toIconDataUrl(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : "That file could not be used.");
    }
  }

  const button =
    "inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1 text-xs font-medium text-ink-muted hover:bg-sunken disabled:opacity-50";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {preview ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={preview}
              alt="New icon preview"
              width={40}
              height={40}
              className="h-10 w-10 rounded-md object-cover ring-1 ring-line"
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => send("PUT", { dataUrl: preview })}
              className="rounded-md bg-blue-600 px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
            >
              {busy ? "Saving…" : "Save icon"}
            </button>
            <button type="button" disabled={busy} onClick={() => setPreview(null)} className={button}>
              Cancel
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
              className={button}
            >
              <ImagePlus size={14} aria-hidden="true" />
              {hasIcon ? "Change icon" : "Add team icon"}
            </button>
            {hasIcon && (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  if (confirm(`Remove the icon for ${teamName}?`)) send("DELETE", {});
                }}
                className={button}
              >
                <Trash2 size={14} aria-hidden="true" />
                {busy ? "Removing…" : "Remove"}
              </button>
            )}
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          onChange={onPick}
          className="hidden"
          aria-label="Choose a team icon image"
        />
      </div>
      {error && (
        <p role="alert" className="text-xs text-negative">
          {error}
        </p>
      )}
    </div>
  );
}
