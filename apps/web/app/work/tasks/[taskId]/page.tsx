import { MissionControlPage } from "../../../page";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function WorkTaskPage({ params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params;
  return <MissionControlPage activeWorkspace="work" selectedTaskId={decodeURIComponent(taskId)} />;
}
