import { isAuthenticated } from "@/lib/auth";
import Navigation from "./Navigation";

export default async function NavigationWrapper() {
  const authenticated = await isAuthenticated();
  return <Navigation isAuthenticated={authenticated} />;
}
