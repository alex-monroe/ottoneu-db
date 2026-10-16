import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { isAuthorizedRevalidation, parseRevalidationPaths } from "@/lib/revalidate";

/**
 * Drop cached renders after a data workflow writes to Supabase. Authenticated
 * with `Authorization: Bearer $REVALIDATE_SECRET` (exempt from cookie auth via
 * `PUBLIC_API_ROUTES`). Body is optional: `{ "paths": ["/scoreboard"] }` scopes
 * it; omitted, the whole site is revalidated. Revalidation is lazy — each page
 * re-renders on its next request, so this call itself is cheap.
 */
export async function POST(req: NextRequest) {
  if (!isAuthorizedRevalidation(req.headers.get("authorization"), process.env.REVALIDATE_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const text = await req.text();
  let body: unknown = null;
  if (text.trim()) {
    try {
      body = JSON.parse(text);
    } catch {
      return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
    }
  }

  const paths = parseRevalidationPaths(body);
  if (paths === null) {
    return NextResponse.json({ error: "paths must be a short list of absolute paths" }, { status: 400 });
  }

  if (paths === "all") {
    revalidatePath("/", "layout");
  } else {
    for (const path of paths) revalidatePath(path);
  }
  return NextResponse.json({ revalidated: paths });
}
