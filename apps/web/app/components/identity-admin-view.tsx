"use client";

import { startTransition, useState } from "react";
import { AppLink } from "./app-link";
import type { MyntDuplicateCandidate, MyntIndex } from "../lib/mynt";

type IdentityAdminViewProps = {
  index: MyntIndex;
};

type ActionResponse = { ok: true; summary: string; payload?: unknown } | { ok: false; error: string };

function DuplicateRow({
  candidate,
  identities,
  onApprove,
}: {
  candidate: MyntDuplicateCandidate;
  identities: MyntIndex["identities"];
  onApprove: (identityId: string, identityDisplayName: string, raw: string) => Promise<string>;
}) {
  const [identityId, setIdentityId] = useState(candidate.matchingIdentityIds[0] ?? identities[0]?.id ?? "");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const selectedIdentity = identities.find((identity) => identity.id === identityId);

  function approve() {
    setPending(true);
    setMessage(null);
    startTransition(async () => {
      try {
        const summary = await onApprove(identityId, selectedIdentity?.displayName ?? "", candidate.raw);
        setMessage(summary);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : String(error));
      } finally {
        setPending(false);
      }
    });
  }

  return (
    <tr>
      <td>{candidate.displayName}</td>
      <td>{candidate.email ?? "none"}</td>
      <td>{candidate.source}</td>
      <td>
        <AppLink href={`/meetings/${encodeURIComponent(candidate.meetingId)}`}>{candidate.meetingTitle}</AppLink>
      </td>
      <td>{candidate.matchingIdentityIds.join(", ") || "unmatched"}</td>
      <td>
        <select className="mynt-identity-select" value={identityId} onChange={(event) => setIdentityId(event.target.value)}>
          {identities.map((identity) => (
            <option key={identity.id} value={identity.id}>
              {identity.displayName}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="action-trigger"
          onClick={approve}
          disabled={!identityId || pending}
        >
          {pending ? "Approving..." : "Approve alias"}
        </button>
        {message ? <p className="action-message mynt-row-message">{message}</p> : null}
      </td>
    </tr>
  );
}

export function IdentityAdminView({ index }: IdentityAdminViewProps) {
  const [duplicates, setDuplicates] = useState(index.duplicates);

  async function approveAlias(identityId: string, identityDisplayName: string, raw: string) {
    const response = await fetch("/api/mynt/identity/approve-alias", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identityId, identityDisplayName, raw }),
    });
    const payload = (await response.json()) as ActionResponse;
    if (!response.ok || !payload.ok) {
      throw new Error(payload.ok ? `HTTP ${response.status}` : payload.error);
    }
    setDuplicates((current) => current.filter((candidate) => candidate.raw !== raw));
    return payload.summary;
  }

  return (
    <div className="mynt-shell">
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Canonical Identities</h2>
            <p className="panel-copy">Stored aliases plus full-name identities inferred from Fathom meeting notes.</p>
          </div>
        </div>
        <div className="table-shell">
          <table>
            <thead>
              <tr>
                <th>Identity</th>
                <th>Email</th>
                <th>Aliases</th>
                <th>Counts</th>
              </tr>
            </thead>
            <tbody>
              {index.identities.map((identity) => (
                <tr key={identity.id}>
                  <td>
                    {identity.displayName}
                    {identity.inferred ? <div className="task-badge task-badge-neutral">Inferred full name</div> : null}
                  </td>
                  <td>{identity.email || "none"}</td>
                  <td>{identity.aliases.join(", ")}</td>
                  <td>
                    {identity.actionCount} A / {identity.decisionCount} D
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Potential Duplicates</h2>
            <p className="panel-copy">Approve participant, action, and decision strings as aliases of a canonical identity.</p>
          </div>
        </div>
        <div className="table-shell">
          <table>
            <thead>
              <tr>
                <th>Potential Duplicate</th>
                <th>Email</th>
                <th>Source</th>
                <th>Meeting</th>
                <th>Matches</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {duplicates.slice(0, 160).map((candidate) => (
                <DuplicateRow
                  key={`${candidate.source}-${candidate.meetingId}-${candidate.raw}`}
                  candidate={candidate}
                  identities={index.identities}
                  onApprove={approveAlias}
                />
              ))}
              {duplicates.length === 0 ? (
                <tr>
                  <td colSpan={6}>No duplicate candidates detected.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
