"use client";

import { startTransition, useEffect, useRef, useState } from "react";
import { AppLink } from "./app-link";
import type { MyntDuplicateCandidate, MyntIndex } from "../lib/mynt";

type IdentityAdminViewProps = {
  index: MyntIndex;
};

type ActionResponse = { ok: true; summary: string; payload?: unknown } | { ok: false; error: string };
type AdminIdentity = MyntIndex["identities"][number];

function isIdentityPayload(value: unknown): value is { identity: AdminIdentity } {
  return Boolean(value && typeof value === "object" && "identity" in value);
}

function IdentityEmailCell({
  identity,
  onUpdate,
}: {
  identity: AdminIdentity;
  onUpdate: (identityId: string, identityDisplayName: string, email: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(identity.email);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) {
      setDraft(identity.email);
    }
  }, [editing, identity.email]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  function cancel() {
    setDraft(identity.email);
    setEditing(false);
    setMessage(null);
  }

  async function commit() {
    if (pending) {
      return;
    }
    const nextEmail = draft.trim().toLowerCase();
    if (nextEmail === identity.email) {
      setEditing(false);
      setMessage(null);
      return;
    }
    setPending(true);
    setMessage(null);
    try {
      await onUpdate(identity.id, identity.displayName, nextEmail);
      setEditing(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setPending(false);
    }
  }

  if (editing) {
    return (
      <div className="identity-email-editor">
        <input
          ref={inputRef}
          className="identity-email-input"
          value={draft}
          placeholder="none"
          disabled={pending}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => {
            if (!pending) {
              cancel();
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void commit();
            }
            if (event.key === "Escape") {
              event.preventDefault();
              cancel();
            }
          }}
          aria-label={`Email for ${identity.displayName}`}
        />
        {message || pending ? <p className="action-message mynt-row-message">{pending ? "Saving..." : message}</p> : null}
      </div>
    );
  }

  return (
    <div className="identity-email-editor">
      <button
        type="button"
        className="identity-email-value"
        onClick={() => {
          setDraft(identity.email);
          setEditing(true);
          setMessage(null);
        }}
        title="Edit email"
      >
        {identity.email || "none"}
      </button>
      {message ? <p className="action-message mynt-row-message">{message}</p> : null}
    </div>
  );
}

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
  const [identities, setIdentities] = useState(index.identities);
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

  async function updateIdentityEmail(identityId: string, identityDisplayName: string, email: string) {
    const response = await fetch("/api/mynt/identity/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identityId, identityDisplayName, email }),
    });
    const payload = (await response.json()) as ActionResponse;
    if (!response.ok || !payload.ok) {
      throw new Error(payload.ok ? `HTTP ${response.status}` : payload.error);
    }
    if (isIdentityPayload(payload.payload)) {
      const updatedIdentity = payload.payload.identity;
      setIdentities((current) =>
        current.map((identity) =>
          identity.id === identityId
            ? {
                ...identity,
                email: updatedIdentity.email,
                aliases: updatedIdentity.aliases,
                inferred: updatedIdentity.inferred,
              }
            : identity,
        ),
      );
    } else {
      setIdentities((current) => current.map((identity) => (identity.id === identityId ? { ...identity, email } : identity)));
    }
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
              {identities.map((identity) => (
                <tr key={identity.id}>
                  <td>
                    {identity.displayName}
                    {identity.inferred ? <div className="task-badge task-badge-neutral">Inferred full name</div> : null}
                  </td>
                  <td>
                    <IdentityEmailCell identity={identity} onUpdate={updateIdentityEmail} />
                  </td>
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
                  identities={identities}
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
