import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/auth";
import LoginForm from "./LoginForm";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>;
}) {
  // Check if already authenticated
  const authenticated = await isAuthenticated();
  if (authenticated) {
    const params = await searchParams;
    const redirectTo = params.redirect || "/";
    redirect(redirectTo);
  }

  return <LoginForm />;
}
