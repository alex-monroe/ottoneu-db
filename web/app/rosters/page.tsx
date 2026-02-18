import { fetchRosterData } from "@/lib/roster-reconstruction";
import RostersClient from "./RostersClient";

export const revalidate = 3600;

export default async function RostersPage() {
  const data = await fetchRosterData();
  return <RostersClient {...data} />;
}
