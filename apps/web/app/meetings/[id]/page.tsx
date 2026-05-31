import { MissionControlPage } from "../../page";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function MeetingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <MissionControlPage activeWorkspace="meetings" selectedMeetingId={decodeURIComponent(id)} />;
}

