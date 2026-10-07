"use client";

/**
 * A team's icon at list, heading or banner size. Renders nothing for a team
 * without one, so a list of mixed teams never shows a gap or a placeholder.
 *
 * Decorative (`alt=""`): it always sits beside the team's name, which is what
 * a screen reader should announce.
 *
 * Every icon sits on a small light tile. Logos are usually uploaded as
 * transparent PNGs drawn for a white page — a black mark on transparency
 * vanishes against the dark theme. The tile gives every logo the background it
 * was designed on, in both themes; an opaque icon simply covers it.
 */
import { useTeamIconSrc } from "./TeamIconsProvider";

const SIZES = { xs: 16, sm: 18, md: 24, lg: 40, xl: 72 } as const;

/** Tile inset, so a mark drawn to the edge does not touch the tile's border. */
const PADDING = { xs: "p-px", sm: "p-px", md: "p-0.5", lg: "p-1", xl: "p-1.5" } as const;

export default function TeamIcon({
  name,
  size = "sm",
  className = "",
}: {
  name: string | null | undefined;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const src = useTeamIconSrc(name);
  if (!src) return null;
  const px = SIZES[size];
  return (
    // Icons are 128px images the site serves itself with an immutable cache;
    // next/image's optimizer would only add a second copy of each.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      width={px}
      height={px}
      loading="lazy"
      decoding="async"
      className={`inline-block shrink-0 rounded-md bg-white object-contain align-middle ring-1 ring-black/10 dark:ring-white/20 ${PADDING[size]} ${className}`}
      style={{ width: px, height: px }}
    />
  );
}
