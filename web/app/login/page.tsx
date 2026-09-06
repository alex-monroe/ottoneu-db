import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/auth";
import LoginForm from "./LoginForm";
import { isValidRedirect } from "@/lib/utils";
import { ACCESS_PATH, requiresProjectionsAccess } from "@/lib/access";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>;
}) {
  const user = await getAuthenticatedUser();

  if (user) {
    const params = await searchParams;
    const rawRedirect = params.redirect;
    const target = isValidRedirect(rawRedirect) ? rawRedirect! : "/";

    // Sending an authenticated user back to a page they still can't view is
    // what produced the register -> /projections -> /login -> /projections
    // redirect loop. Middleware no longer routes them here, but this page is
    // linked directly too, so it has to refuse the bounce on its own.
    if (requiresProjectionsAccess(target) && !user.hasProjectionsAccess) {
      redirect(`${ACCESS_PATH}?from=${encodeURIComponent(target)}`);
    }
    redirect(target);
  }

  return <LoginForm />;
}
