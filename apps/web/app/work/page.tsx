import { MissionControlPage } from "../page";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function WorkPage() {
  return <MissionControlPage activeWorkspace="work" />;
}

