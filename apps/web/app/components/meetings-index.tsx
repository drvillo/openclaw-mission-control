"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ActionReassignControl, type ActionAssigneeIdentity } from "./action-reassign-control";
import { AssertionActionControls } from "./assertion-action-controls";
import { AssertionAssociations } from "./assertion-associations";
import { CompactSelect, type CompactSelectOption } from "./compact-select";
import { MeetingReviewItemShell, MeetingReviewListSection, MeetingReviewMetaItem } from "./meeting-review-list";
import { SearchControl } from "./search-control";
import {
  applyActionDoneToItems,
  applyReviewToItems,
  assertionActionKey,
  assertionPayloadItems,
  useAssertionActions,
} from "./use-assertion-actions";
import { useUrlSearchQuery } from "./use-url-search-query";
import { formatDisplayDate, formatDisplayDateTime } from "../lib/date-format";
import type { MeetingDetail, MeetingIndex, MeetingRecording, MeetingReviewItem } from "../lib/meetings";
import { itemMatchesSearch, meetingMatchesSearch } from "../lib/search";

type MeetingsIndexProps = {
  index: MeetingIndex;
  selectedMeetingId?: string;
  focusedItemId?: string;
  focusedTime?: string;
  openOnLoad?: boolean;
  pendingReviewOnly?: boolean;
  assigneeIdentities: ActionAssigneeIdentity[];
};

type MeetingDetailResponse =
  | { ok: true; meeting?: MeetingDetail; transcript?: MeetingDetail }
  | { ok: false; error: string };

type ReassignPayload = { reassigned?: number; assertionId?: string; assignee?: string };
type ReviewOperation = "accept" | "reject";
type ReviewPayloadItem = { kind: "action" | "decision"; assertionId: string };

function formatDate(value: string) {
  return formatDisplayDate(value);
}

function formatDateTime(value: string | null) {
  return formatDisplayDateTime(value);
}

function toOptions(values: string[], allLabel: string): CompactSelectOption[] {
  return [{ value: "all", label: allLabel }, ...values.map((value) => ({ value, label: value }))];
}

function CountBadges({ actions, decisions }: { actions: number; decisions: number }) {
  return (
    <span className="meeting-count-badges" aria-label={`${actions} actions and ${decisions} decisions`}>
      <span className="meeting-count-badge">A {actions}</span>
      <span className="meeting-count-badge">D {decisions}</span>
    </span>
  );
}

function pendingReviewItems(items: MeetingReviewItem[]) {
  return items.filter((item) => item.reviewStatus === "needs_review");
}

function hasAcceptablePendingReview(items: MeetingReviewItem[]) {
  return assertionPayloadItems(pendingReviewItems(items)).length > 0;
}

function reviewStatusLabel(status: MeetingReviewItem["reviewStatus"]) {
  return status === "accepted" ? "Accepted" : "Needs Review";
}

function ReviewStatusBadge({ status }: { status: MeetingReviewItem["reviewStatus"] }) {
  return (
    <span className={`meeting-review-status meeting-review-status-${status}`}>
      {reviewStatusLabel(status)}
    </span>
  );
}

function displayRawItemStatus(status: string | null) {
  const normalized = status?.trim().toLowerCase().replace(/\s+/gu, "_") ?? "";
  return normalized === "needs_review" || normalized === "accepted" ? null : status;
}

function ReviewItemCard({
  item,
  onEvidenceClick,
  onReview,
  onReassign,
  onMarkDone,
  actionState,
  pending,
  focused,
  meetingParticipants,
  assigneeIdentities,
}: {
  item: MeetingReviewItem;
  onEvidenceClick: (time: string) => void;
  onReview: (operation: ReviewOperation, item: MeetingReviewItem) => void;
  onReassign: (assertionId: string, assignee: string) => boolean | Promise<boolean>;
  onMarkDone: (item: MeetingReviewItem) => void;
  actionState: { pending: boolean; error: string | null };
  pending: boolean;
  focused?: boolean;
  meetingParticipants: string[];
  assigneeIdentities: ActionAssigneeIdentity[];
}) {
  const evidenceTargetTime = item.evidenceTargetTime;
  const [reassigning, setReassigning] = useState(false);

  return (
    <MeetingReviewItemShell focused={focused}>
      <div className="meeting-review-item-header">
        <div className="meeting-review-title-row">
          <span className="meeting-review-label">{item.label}</span>
          <ReviewStatusBadge status={item.reviewStatus} />
          <AssertionAssociations associations={item.associations} />
        </div>
        <div className="meeting-review-card-actions">
          {evidenceTargetTime ? (
            <button
              type="button"
              className="meeting-evidence-go-button"
              onClick={() => onEvidenceClick(evidenceTargetTime)}
            >
              Go to {evidenceTargetTime}
            </button>
          ) : null}
          <AssertionActionControls
            item={item}
            actionState={{ ...actionState, pending: pending || actionState.pending }}
            reassignOpen={reassigning}
            acceptLabel="Accept"
            onReview={onReview}
            onMarkDone={item.kind === "action" ? onMarkDone : undefined}
          />
          {item.kind === "action" ? (
            <ActionReassignControl
              assertionId={item.assertionId}
              currentAssignee={item.assignee}
              meetingParticipants={meetingParticipants}
              identities={assigneeIdentities}
              pending={pending || actionState.pending}
              onReassign={onReassign}
              onOpenChange={setReassigning}
            />
          ) : null}
        </div>
      </div>
      <p>{item.summary || "No summary recorded."}</p>
      <div className="meeting-review-meta">
        <MeetingReviewMetaItem label="Owner" value={item.owner} />
        <MeetingReviewMetaItem label="Assignee" value={item.assignee} />
        <MeetingReviewMetaItem label="Status" value={displayRawItemStatus(item.status)} />
        <MeetingReviewMetaItem label="Confidence" value={item.confidence} />
        <MeetingReviewMetaItem label="Score" value={item.score} />
      </div>
      {item.evidence ? (
        <details className="meeting-evidence-details">
          <summary>Transcript excerpt</summary>
          <pre className="meeting-evidence-snippet">{item.evidence}</pre>
        </details>
      ) : null}
    </MeetingReviewItemShell>
  );
}

function ReviewSection({
  title,
  count,
  emptyText,
  items,
  onEvidenceClick,
  onReview,
  onReassign,
  onMarkDone,
  getActionState,
  pending,
  focusedItemId,
  meetingParticipants,
  assigneeIdentities,
}: {
  title: string;
  count: number;
  emptyText: string;
  items: MeetingReviewItem[];
  onEvidenceClick: (time: string) => void;
  onReview: (operation: ReviewOperation, item: MeetingReviewItem) => void;
  onReassign: (assertionId: string, assignee: string) => boolean | Promise<boolean>;
  onMarkDone: (item: MeetingReviewItem) => void;
  getActionState: (item: MeetingReviewItem) => { pending: boolean; error: string | null };
  pending: boolean;
  focusedItemId?: string;
  meetingParticipants: string[];
  assigneeIdentities: ActionAssigneeIdentity[];
}) {
  return (
    <MeetingReviewListSection title={title} count={count} emptyText={emptyText}>
      {items.map((item) => (
        <ReviewItemCard
          key={`${item.kind}-${item.label}-${item.id ?? item.summary}`}
          item={item}
          onEvidenceClick={onEvidenceClick}
          onReview={onReview}
          onReassign={onReassign}
          onMarkDone={onMarkDone}
          actionState={getActionState(item)}
          pending={pending}
          focused={Boolean(focusedItemId && item.id === focusedItemId)}
          meetingParticipants={meetingParticipants}
          assigneeIdentities={assigneeIdentities}
        />
      ))}
    </MeetingReviewListSection>
  );
}

export function MeetingsIndex({
  index,
  selectedMeetingId,
  focusedItemId,
  focusedTime,
  openOnLoad = false,
  pendingReviewOnly = false,
  assigneeIdentities,
}: MeetingsIndexProps) {
  const [search, setSearch] = useUrlSearchQuery();
  const [meetings, setMeetings] = useState(index.meetings);
  const [pendingReviewVisibleKeys] = useState(
    () => new Set(index.meetings.flatMap((meeting) => [...meeting.actions, ...meeting.decisions]).filter((item) => item.reviewStatus === "needs_review").map(assertionActionKey)),
  );
  const [participant, setParticipant] = useState("all");
  const [month, setMonth] = useState("all");
  const [selectedId, setSelectedId] = useState(selectedMeetingId ?? index.meetings[0]?.id ?? null);
  const [meetingDetail, setMeetingDetail] = useState<MeetingDetail | null>(null);
  const [meetingLoadingId, setMeetingLoadingId] = useState<string | null>(null);
  const [meetingError, setMeetingError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [transcriptCollapsed, setTranscriptCollapsed] = useState(true);
  const [highlightedTime, setHighlightedTime] = useState<string | null>(null);
  const [scrollRequest, setScrollRequest] = useState<{ time: string; token: number } | null>(null);
  const transcriptLineRefs = useRef<Map<string, HTMLElement>>(new Map());
  const assertionActions = useAssertionActions();

  const participantOptions = useMemo(() => toOptions(index.participants, "All participants"), [index.participants]);
  const monthOptions = useMemo(() => toOptions(index.months, "All months"), [index.months]);
  const normalizedSearch = search.trim();

  const filteredMeetings = meetings.filter((meeting) => {
    if (
      pendingReviewOnly &&
      ![...meeting.actions, ...meeting.decisions].some(
        (item) => item.reviewStatus === "needs_review" || pendingReviewVisibleKeys.has(assertionActionKey(item)),
      )
    ) {
      return false;
    }
    if (participant !== "all" && !meeting.participants.includes(participant)) {
      return false;
    }
    if (month !== "all" && meeting.month !== month) {
      return false;
    }
    return meetingMatchesSearch(meeting, normalizedSearch);
  });

  const selectedMeeting =
    filteredMeetings.find((meeting) => meeting.id === selectedId) ?? filteredMeetings[0] ?? meetings[0] ?? null;
  const visibleDetailActions = useMemo(
    () => (meetingDetail ? meetingDetail.actions.filter((item) => itemMatchesSearch(item, normalizedSearch)) : []),
    [meetingDetail, normalizedSearch],
  );
  const visibleDetailDecisions = useMemo(
    () => (meetingDetail ? meetingDetail.decisions.filter((item) => itemMatchesSearch(item, normalizedSearch)) : []),
    [meetingDetail, normalizedSearch],
  );

  useEffect(() => {
    if (!meetingDetail) {
      return;
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMeetingDetail(null);
      }
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [meetingDetail]);

  useEffect(() => {
    transcriptLineRefs.current.clear();
    setTranscriptCollapsed(true);
    setHighlightedTime(null);
    setScrollRequest(null);
  }, [meetingDetail?.id]);

  useEffect(() => {
    if (transcriptCollapsed || !scrollRequest) {
      return;
    }

    const animationFrame = window.requestAnimationFrame(() => {
      const line = transcriptLineRefs.current.get(scrollRequest.time);
      line?.scrollIntoView({ block: "center" });
      setHighlightedTime(scrollRequest.time);
    });
    const timeout = window.setTimeout(() => {
      setHighlightedTime((current) => (current === scrollRequest.time ? null : current));
    }, 2600);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.clearTimeout(timeout);
    };
  }, [scrollRequest, transcriptCollapsed]);

  async function openMeetingDetail(meeting: MeetingRecording) {
    setMeetingLoadingId(meeting.id);
    setMeetingError(null);

    try {
      const response = await fetch(`/api/meetings/${encodeURIComponent(meeting.id)}/transcript`);
      const payload = (await response.json()) as MeetingDetailResponse;
      if (!response.ok || !payload.ok) {
        throw new Error(payload.ok ? `HTTP ${response.status}` : payload.error);
      }
      setMeetingDetail(payload.meeting ?? payload.transcript ?? null);
    } catch (error) {
      setMeetingError(error instanceof Error ? error.message : String(error));
    } finally {
      setMeetingLoadingId(null);
    }
  }

  function openEvidence(time: string) {
    setTranscriptCollapsed(false);
    setScrollRequest((current) => ({ time, token: (current?.token ?? 0) + 1 }));
  }

  function patchMeetingReviewItems(operation: ReviewOperation, payloadItems: ReviewPayloadItem[]) {
    setMeetings((current) =>
      current.map((meeting) => {
        const actions = applyReviewToItems(meeting.actions, operation, payloadItems);
        const decisions = applyReviewToItems(meeting.decisions, operation, payloadItems);
        return { ...meeting, actions, decisions, actionCount: actions.length, decisionCount: decisions.length };
      }),
    );
    setMeetingDetail((current) =>
      current
        ? (() => {
            const actions = applyReviewToItems(current.actions, operation, payloadItems);
            const decisions = applyReviewToItems(current.decisions, operation, payloadItems);
            return { ...current, actions, decisions, actionCount: actions.length, decisionCount: decisions.length };
          })()
        : current,
    );
  }

  function patchMeetingActionDone(assertionId: string) {
    setMeetings((current) =>
      current.map((meeting) => ({
        ...meeting,
        actions: applyActionDoneToItems(meeting.actions, [assertionId]),
      })),
    );
    setMeetingDetail((current) => (current ? { ...current, actions: applyActionDoneToItems(current.actions, [assertionId]) } : current));
  }

  function postReview(operation: ReviewOperation, items: MeetingReviewItem[]) {
    setActionMessage(null);
    void assertionActions.reviewItems(operation, items, {
      pendingOnly: true,
      emptyMessage: "No pending review items with assertion IDs.",
      onSuccess: (_payload, payloadItems) => patchMeetingReviewItems(operation, payloadItems),
      onMessage: items.length > 1 ? setActionMessage : undefined,
    });
  }

  async function reassignAction(assertionId: string, assignee: string) {
    setActionMessage(null);
    return assertionActions.reassignAction(assertionId, assignee, {
      onSuccess: (reassignPayload: ReassignPayload) => {
        const nextAssignee = reassignPayload.assignee ?? assignee;
        setMeetings((current) =>
          current.map((meeting) => ({
            ...meeting,
            actions: meeting.actions.map((item) => (item.assertionId === assertionId ? { ...item, assignee: nextAssignee } : item)),
          })),
        );
        setMeetingDetail((current) =>
          current
            ? {
                ...current,
                actions: current.actions.map((item) => (item.assertionId === assertionId ? { ...item, assignee: nextAssignee } : item)),
              }
            : current,
        );
      },
    });
  }

  function markActionDone(item: MeetingReviewItem) {
    if (!item.assertionId) {
      setActionMessage("This action does not have a database assertion ID.");
      return;
    }
    setActionMessage(null);
    void assertionActions.markActionDone(item, {
      onSuccess: () => patchMeetingActionDone(item.assertionId as string),
    });
  }

  function reviewItem(operation: ReviewOperation, item: MeetingReviewItem) {
    if (!item.assertionId) {
      setActionMessage("This item does not have a database assertion ID.");
      return;
    }
    void assertionActions.reviewItem(operation, item, {
      onSuccess: (_payload, payloadItems) => patchMeetingReviewItems(operation, payloadItems),
    });
  }

  function acceptPending(items: MeetingReviewItem[]) {
    postReview("accept", pendingReviewItems(items));
  }

  useEffect(() => {
    if (!selectedMeetingId) {
      return;
    }
    const meeting = index.meetings.find((item) => item.id === selectedMeetingId);
    if (!meeting) {
      return;
    }
    setSelectedId(meeting.id);
    if (openOnLoad || focusedItemId || focusedTime) {
      void openMeetingDetail(meeting);
    }
  }, [selectedMeetingId, focusedItemId, focusedTime, openOnLoad, index.meetings]);

  useEffect(() => {
    if (!meetingDetail) {
      return;
    }
    if (focusedTime) {
      openEvidence(focusedTime);
      return;
    }
    if (focusedItemId) {
      const focusedItem = [...meetingDetail.actions, ...meetingDetail.decisions].find((item) => item.id === focusedItemId);
      if (focusedItem?.evidenceTargetTime) {
        openEvidence(focusedItem.evidenceTargetTime);
      }
    }
  }, [meetingDetail, focusedItemId, focusedTime]);

  return (
    <div className="meetings-shell">
      <div className="meetings-controls">
        <SearchControl
          value={search}
          onChange={setSearch}
          placeholder="Search title, participant, action, decision"
          resultSummary={`${filteredMeetings.length} of ${meetings.length} meetings`}
        />
        <CompactSelect
          value={participant}
          options={participantOptions}
          onChange={setParticipant}
          ariaLabel="Participant filter"
          className="compact-select-filter"
        />
        <CompactSelect
          value={month}
          options={monthOptions}
          onChange={setMonth}
          ariaLabel="Month filter"
          className="compact-select-filter"
        />
      </div>

      <div className="routing-toolbar-meta">
        <span>
          Showing {filteredMeetings.length} of {meetings.length} meetings
        </span>
        <span>Index generated {formatDateTime(index.generatedAt)}</span>
        <span>{index.transcriptCount} transcripts tracked</span>
        {pendingReviewOnly ? <span>Pending review only</span> : null}
      </div>
      {actionMessage ? <p className="action-message meeting-action-message">{actionMessage}</p> : null}

      <div className="meetings-layout">
        <div className="meetings-list table-shell">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Title</th>
                <th>Participants</th>
                <th>Review</th>
                <th>Recording</th>
              </tr>
            </thead>
            <tbody>
              {filteredMeetings.map((meeting) => (
                <tr
                  key={meeting.id}
                  className={`meeting-row ${selectedMeeting?.id === meeting.id ? "meeting-row-active" : ""}`}
                  onClick={() => {
                    setSelectedId(meeting.id);
                    setMeetingError(null);
                  }}
                >
                  <td>{formatDate(meeting.date)}</td>
                  <td>{meeting.title}</td>
                  <td>{meeting.participants.slice(0, 4).join(", ")}</td>
                  <td>
                    <CountBadges actions={meeting.actionCount} decisions={meeting.decisionCount} />
                  </td>
                  <td>{meeting.recordingId}</td>
                </tr>
              ))}
              {filteredMeetings.length === 0 ? (
                <tr>
                  <td colSpan={5}>No meetings match the current filters.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <aside className="meeting-detail">
          {selectedMeeting ? (
            <>
              <div className="meeting-detail-heading">
                <div className="meeting-links">
                  <button
                    type="button"
                    className="action-trigger"
                    disabled={meetingLoadingId === selectedMeeting.id}
                    onClick={() => void openMeetingDetail(selectedMeeting)}
                  >
                    {meetingLoadingId === selectedMeeting.id ? "Opening..." : "Review meeting"}
                  </button>
                  <button
                    type="button"
                    className="action-trigger"
                    disabled={!hasAcceptablePendingReview([...selectedMeeting.actions, ...selectedMeeting.decisions])}
                    onClick={() => acceptPending([...selectedMeeting.actions, ...selectedMeeting.decisions])}
                  >
                    Accept pending
                  </button>
                </div>
                <CountBadges actions={selectedMeeting.actionCount} decisions={selectedMeeting.decisionCount} />
              </div>
              <h3>{selectedMeeting.title}</h3>
              <div className="ops-grid meeting-detail-grid">
                <div className="ops-field">
                  <span className="ops-label">Date</span>
                  <span>{formatDateTime(selectedMeeting.dateTime ?? selectedMeeting.date)}</span>
                </div>
                <div className="ops-field">
                  <span className="ops-label">Recording</span>
                  <span>{selectedMeeting.recordingId}</span>
                </div>
                <div className="ops-field">
                  <span className="ops-label">Generated</span>
                  <span>{formatDateTime(selectedMeeting.generatedAt)}</span>
                </div>
                <div className="ops-field">
                  <span className="ops-label">Obsidian Ref</span>
                  <code>{selectedMeeting.obsidianRef}</code>
                  {selectedMeeting.playbackUrl ? (
                    <a href={selectedMeeting.playbackUrl} target="_blank" rel="noreferrer">
                      Open Fathom playback
                    </a>
                  ) : (
                    <span className="muted">No playback URL recorded.</span>
                  )}
                </div>
              </div>

              <div className="meeting-participants">
                <span className="ops-label">Participants</span>
                <div className="task-card-meta">
                  {selectedMeeting.participants.map((name) => (
                    <span key={name} className="task-badge task-badge-neutral">
                      {name}
                    </span>
                  ))}
                </div>
              </div>

              {meetingError ? <p className="action-message">{meetingError}</p> : null}
            </>
          ) : (
            <p className="muted">No meeting selected.</p>
          )}
        </aside>
      </div>

      {meetingDetail ? (
        <div className="task-modal-backdrop" onClick={() => setMeetingDetail(null)}>
          <div
            className="task-modal meeting-review-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="meeting-review-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="meeting-review-modal-header">
              <div className="task-modal-heading">
                <p className="task-card-id">{meetingDetail.obsidianRef}</p>
                <h3 id="meeting-review-title" className="meeting-transcript-title">
                  {meetingDetail.title}
                </h3>
                <div className="meeting-review-header-meta">
                  <span>{formatDateTime(meetingDetail.dateTime)}</span>
                  <CountBadges actions={meetingDetail.actionCount} decisions={meetingDetail.decisionCount} />
                  <div className="task-card-meta">
                    {meetingDetail.participants.map((name) => (
                      <span key={name} className="task-badge task-badge-neutral">
                        {name}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              <div className="task-modal-actions">
                <button
                  type="button"
                  className="action-trigger"
                  disabled={!hasAcceptablePendingReview([...meetingDetail.actions, ...meetingDetail.decisions])}
                  onClick={() => acceptPending([...meetingDetail.actions, ...meetingDetail.decisions])}
                >
                  Accept pending
                </button>
                {meetingDetail.playbackUrl ? (
                  <a className="action-trigger meeting-transcript-playback" href={meetingDetail.playbackUrl} target="_blank" rel="noreferrer">
                    Fathom
                  </a>
                ) : null}
                <button type="button" className="task-modal-close" onClick={() => setMeetingDetail(null)}>
                  Close
                </button>
              </div>
            </div>

            <div className="meeting-review-body">
              <div className="meeting-review-column">
                <ReviewSection
                  title="Actions"
                  count={visibleDetailActions.length}
                  emptyText="No actions extracted."
                  items={visibleDetailActions}
                  onEvidenceClick={openEvidence}
                  onReview={reviewItem}
                  onReassign={reassignAction}
                  onMarkDone={markActionDone}
                  getActionState={assertionActions.getActionState}
                  pending={false}
                  focusedItemId={focusedItemId}
                  meetingParticipants={meetingDetail.participants}
                  assigneeIdentities={assigneeIdentities}
                />
                <ReviewSection
                  title="Decisions"
                  count={visibleDetailDecisions.length}
                  emptyText="No decisions extracted."
                  items={visibleDetailDecisions}
                  onEvidenceClick={openEvidence}
                  onReview={reviewItem}
                  onReassign={reassignAction}
                  onMarkDone={markActionDone}
                  getActionState={assertionActions.getActionState}
                  pending={false}
                  focusedItemId={focusedItemId}
                  meetingParticipants={meetingDetail.participants}
                  assigneeIdentities={assigneeIdentities}
                />
              </div>

              <aside className={`meeting-transcript-pane ${transcriptCollapsed ? "meeting-transcript-pane-collapsed" : ""}`}>
                <div className="meeting-transcript-pane-header">
                  <h4>Transcript</h4>
                  <button type="button" className="meeting-pane-toggle" onClick={() => setTranscriptCollapsed((current) => !current)}>
                    {transcriptCollapsed ? "Expand" : "Collapse"}
                  </button>
                </div>
                {transcriptCollapsed ? (
                  <div className="meeting-transcript-collapsed">
                    <span>{meetingDetail.lines.length} lines</span>
                  </div>
                ) : (
                  <div className="meeting-transcript-body">
                    {meetingDetail.lines.length > 0 ? (
                      meetingDetail.lines.map((line, index) => (
                        <article
                          key={`${line.time}-${line.speaker}-${index}`}
                          ref={(element) => {
                            if (element) {
                              transcriptLineRefs.current.set(line.time, element);
                            }
                          }}
                          className={`meeting-transcript-line ${highlightedTime === line.time ? "meeting-transcript-line-highlighted" : ""}`}
                          data-transcript-time={line.time}
                        >
                          <span className="meeting-transcript-time">{line.time}</span>
                          <span className="meeting-transcript-speaker">{line.speaker}</span>
                          <p>{line.text}</p>
                        </article>
                      ))
                    ) : meetingDetail.rawText ? (
                      <pre className="meeting-transcript-raw">{meetingDetail.rawText}</pre>
                    ) : (
                      <p className="muted">No transcript text found in this meeting file.</p>
                    )}
                  </div>
                )}
              </aside>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
