import { MissionControlPage } from "../../../../page";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function MeetingTranscriptTimePage({ params }: { params: Promise<{ id: string; time: string }> }) {
  const { id, time } = await params;
  return (
    <MissionControlPage
      activeWorkspace="meetings"
      selectedMeetingId={decodeURIComponent(id)}
      focusedTime={decodeURIComponent(time)}
    />
  );
}

