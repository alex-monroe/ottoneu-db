import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/auth";
import LoginForm from "./LoginForm";
import { isValidRedirect } from "@/lib/utils";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>;
}) {
  // Check if already authenticated
  const authenticated = await isAuthenticated();
  if (authenticated) {
    const params = await searchParams;
    const rawRedirect = params.redirect;
    const redirectTo = isValidRedirect(rawRedirect) ? rawRedirect : "/";
    redirect(redirectTo!);
  }

  return <LoginForm />;
}
