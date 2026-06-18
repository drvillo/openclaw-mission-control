import { MissionControlPage } from "../../../page";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function OpsDayPage({
  params,
  searchParams,
}: {
  params: Promise<{ date: string }>;
  searchParams: Promise<{ packet?: string | string[] }>;
}) {
  const { date } = await params;
  const resolvedSearchParams = await searchParams;
  const packet = Array.isArray(resolvedSearchParams.packet) ? resolvedSearchParams.packet[0] : resolvedSearchParams.packet;

  return (
    <MissionControlPage
      activeWorkspace="self-evolution"
      selfEvolutionDate={decodeURIComponent(date)}
      selfEvolutionPacketId={packet ? decodeURIComponent(packet) : undefined}
    />
  );
}
