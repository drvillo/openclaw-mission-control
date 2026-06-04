import { MissionControlPage } from "../page";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function MeetingsPage({ searchParams }: { searchParams: Promise<{ review?: string }> }) {
  const params = await searchParams;
  return <MissionControlPage activeWorkspace="meetings" pendingReviewOnly={params.review === "pending"} />;
}
