"use client";

/**
 * A team's icon at list, heading or banner size. Renders nothing for a team
 * without one, so a list of mixed teams never shows a gap or a placeholder.
 *
 * Decorative (`alt=""`): it always sits beside the team's name, which is what
 * a screen reader should announce.
 */
import { useTeamIconSrc } from "./TeamIconsProvider";

const SIZES = { xs: 14, sm: 18, md: 24, lg: 40, xl: 72 } as const;

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
      className={`inline-block shrink-0 rounded-md object-cover align-middle ${className}`}
      style={{ width: px, height: px }}
    />
  );
}
