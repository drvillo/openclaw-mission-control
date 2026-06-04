import { MissionControlPage } from "../page";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function MyAccountabilityPage() {
  return <MissionControlPage activeWorkspace="my-accountability" />;
}
