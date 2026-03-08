import { getAuthenticatedUser } from "@/lib/auth";
import Navigation from "./Navigation";

export default async function NavigationWrapper() {
  const user = await getAuthenticatedUser();
  return (
    <Navigation
      isAuthenticated={user !== null}
      isAdmin={user?.isAdmin ?? false}
    />
  );
}
