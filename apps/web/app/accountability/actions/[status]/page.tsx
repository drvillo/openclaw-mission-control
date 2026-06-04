import { notFound } from "next/navigation";
import { MissionControlPage } from "../../../page";
import type { AssertionStatusFilter } from "../../../components/assertion-register";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function parseStatus(status: string): AssertionStatusFilter {
  if (status !== "all" && status !== "accepted" && status !== "pending") {
    notFound();
  }
  return status;
}

export default async function AccountabilityActionsPage({ params }: { params: Promise<{ status: string }> }) {
  const { status } = await params;
  return <MissionControlPage activeWorkspace="accountability" assertionKind="action" assertionStatusFilter={parseStatus(status)} />;
}
