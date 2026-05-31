import { MissionControlPage } from "../../../page";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AccountabilityPersonPage({ params }: { params: Promise<{ personId: string }> }) {
  const { personId } = await params;
  return <MissionControlPage activeWorkspace="accountability" expandedPersonId={decodeURIComponent(personId)} />;
}

