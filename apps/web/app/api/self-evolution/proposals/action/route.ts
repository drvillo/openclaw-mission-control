import { NextResponse } from "next/server";
import { recordSelfEvolutionProposalAnswer, runManualDualEntityLoop, triggerSelfEvolutionProposalImplementation } from "../../../../lib/self-evolution-manual-actions";

type Body = {
  action?: string;
  proposalKey?: string;
  improvementKey?: string;
  packetKey?: string;
  agentId?: string;
  answer?: string;
  durableRule?: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Body;
    if (body.action === "run-manual") {
      const result = await runManualDualEntityLoop();
      return NextResponse.json({ ok: true, ...result });
    }

    const proposalKey = String(body.proposalKey ?? body.improvementKey ?? body.packetKey ?? "").trim();
    if (!proposalKey) {
      return NextResponse.json({ ok: false, error: "proposalKey is required" }, { status: 400 });
    }

    if (body.action === "answer") {
      const answer = String(body.answer ?? "").trim();
      if (!answer) {
        return NextResponse.json({ ok: false, error: "answer is required" }, { status: 400 });
      }
      const result = await recordSelfEvolutionProposalAnswer(proposalKey, answer, typeof body.durableRule === "string" ? body.durableRule : undefined);
      return NextResponse.json({ ok: true, ...result });
    }

    if (body.action === "implement") {
      const result = await triggerSelfEvolutionProposalImplementation(proposalKey, typeof body.agentId === "string" ? body.agentId : undefined);
      return NextResponse.json({ ok: true, ...result });
    }

    return NextResponse.json({ ok: false, error: "Unsupported action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
