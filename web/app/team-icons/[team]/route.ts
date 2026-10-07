import { NextRequest, NextResponse } from "next/server";
import { fetchTeamIcon } from "@/lib/team-icons-data";

/**
 * Serve one team's icon.
 *
 * Deliberately outside `/api`: middleware gates every API route on a session,
 * and icons appear on public pages (standings, the scoreboard). The URL carries
 * the icon's version (`?v=`), so a versioned request is cached forever and a
 * new upload is simply a new URL.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ team: string }> },
) {
  const { team } = await params;
  const icon = await fetchTeamIcon(decodeURIComponent(team));
  if (!icon) return new NextResponse(null, { status: 404 });

  const versioned = req.nextUrl.searchParams.has("v");
  return new NextResponse(Buffer.from(icon.bytes), {
    headers: {
      "Content-Type": icon.contentType,
      "Cache-Control": versioned
        ? "public, max-age=31536000, immutable"
        : "public, max-age=300",
      // The bytes were checked against the type on upload; never let a
      // browser second-guess it into something executable.
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
