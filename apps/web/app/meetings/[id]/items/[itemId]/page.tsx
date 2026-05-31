import { MissionControlPage } from "../../../../page";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function MeetingItemPage({ params }: { params: Promise<{ id: string; itemId: string }> }) {
  const { id, itemId } = await params;
  return (
    <MissionControlPage
      activeWorkspace="meetings"
      selectedMeetingId={decodeURIComponent(id)}
      focusedItemId={decodeURIComponent(itemId)}
    />
  );
}

