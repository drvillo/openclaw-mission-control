import { notFound, redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AccountabilityReviewPage({ params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  if (kind !== "actions" && kind !== "decisions") {
    notFound();
  }

  redirect(`/accountability/${kind}/pending`);
}
