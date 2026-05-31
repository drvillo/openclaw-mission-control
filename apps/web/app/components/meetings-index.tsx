"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CompactSelect, type CompactSelectOption } from "./compact-select";
import { formatDisplayDate, formatDisplayDateTime } from "../lib/date-format";
import type { MeetingDetail, MeetingIndex, MeetingRecording, MeetingReviewItem } from "../lib/meetings";

type MeetingsIndexProps = {
  index: MeetingIndex;
  selectedMeetingId?: string;
  focusedItemId?: string;
  focusedTime?: string;
  openOnLoad?: boolean;
};

type MeetingDetailResponse =
  | { ok: true; meeting?: MeetingDetail; transcript?: MeetingDetail }
  | { ok: false; error: string };

function formatDate(value: string) {
  return formatDisplayDate(value);
}

function formatDateTime(value: string | null) {
  return formatDisplayDateTime(value);
}

function toOptions(values: string[], allLabel: string): CompactSelectOption[] {
  return [{ value: "all", label: allLabel }, ...values.map((value) => ({ value, label: value }))];
}

function reviewHaystack(items: MeetingReviewItem[]) {
  return items
    .map((item) =>
      [item.label, item.id, item.status, item.owner, item.assignee, item.confidence, item.summary, item.evidence]
        .filter(Boolean)
        .join(" "),
    )
    .join(" ");
}

function meetingMatchesSearch(meeting: MeetingRecording, query: string) {
  if (!query) {
    return true;
  }
  const haystack = [
    meeting.title,
    meeting.date,
    meeting.month,
    meeting.recordingId,
    meeting.obsidianRef,
    meeting.participants.join(" "),
    reviewHaystack(meeting.actions),
    reviewHaystack(meeting.decisions),
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
}

function CountBadges({ actions, decisions }: { actions: number; decisions: number }) {
  return (
    <span className="meeting-count-badges" aria-label={`${actions} actions and ${decisions} decisions`}>
      <span className="meeting-count-badge">A {actions}</span>
      <span className="meeting-count-badge">D {decisions}</span>
    </span>
  );
}

function ItemMeta({ label, value }: { label: string; value: string | number | null }) {
  if (value === null || value === "") {
    return null;
  }
  return (
    <span className="meeting-review-meta-item">
      <span>{label}</span>
      <strong>{value}</strong>
    </span>
  );
}

function ReviewItemCard({
  item,
  onEvidenceClick,
  focused,
}: {
  item: MeetingReviewItem;
  onEvidenceClick: (time: string) => void;
  focused?: boolean;
}) {
  const evidenceTargetTime = item.evidenceTargetTime;

  return (
    <article className={`meeting-review-item ${focused ? "meeting-review-item-focused" : ""}`}>
      <div className="meeting-review-item-header">
        <span className="meeting-review-label">{item.label}</span>
        {evidenceTargetTime ? (
          <button
            type="button"
            className="meeting-evidence-go-button"
            onClick={() => onEvidenceClick(evidenceTargetTime)}
          >
            Go to {evidenceTargetTime}
          </button>
        ) : null}
      </div>
      <p>{item.summary || "No summary recorded."}</p>
      <div className="meeting-review-meta">
        <ItemMeta label="Owner" value={item.owner} />
        <ItemMeta label="Assignee" value={item.assignee} />
        <ItemMeta label="Status" value={item.status} />
        <ItemMeta label="Confidence" value={item.confidence} />
        <ItemMeta label="Score" value={item.score} />
      </div>
      {item.evidence ? (
        <details className="meeting-evidence-details">
          <summary>Transcript excerpt</summary>
          <pre className="meeting-evidence-snippet">{item.evidence}</pre>
        </details>
      ) : null}
    </article>
  );
}

function ReviewSection({
  title,
  count,
  emptyText,
  items,
  onEvidenceClick,
  focusedItemId,
}: {
  title: string;
  count: number;
  emptyText: string;
  items: MeetingReviewItem[];
  onEvidenceClick: (time: string) => void;
  focusedItemId?: string;
}) {
  return (
    <section className="meeting-review-section">
      <div className="meeting-review-section-header">
        <h4>{title}</h4>
        <span className="meeting-review-section-count">{count}</span>
      </div>
      {items.length > 0 ? (
        <div className="meeting-review-list">
          {items.map((item) => (
            <ReviewItemCard
              key={`${item.kind}-${item.label}-${item.id ?? item.summary}`}
              item={item}
              onEvidenceClick={onEvidenceClick}
              focused={Boolean(focusedItemId && item.id === focusedItemId)}
            />
          ))}
        </div>
      ) : (
        <p className="meeting-review-empty">{emptyText}</p>
      )}
    </section>
  );
}

export function MeetingsIndex({ index, selectedMeetingId, focusedItemId, focusedTime, openOnLoad = false }: MeetingsIndexProps) {
  const [search, setSearch] = useState("");
  const [participant, setParticipant] = useState("all");
  const [month, setMonth] = useState("all");
  const [selectedId, setSelectedId] = useState(selectedMeetingId ?? index.meetings[0]?.id ?? null);
  const [meetingDetail, setMeetingDetail] = useState<MeetingDetail | null>(null);
  const [meetingLoadingId, setMeetingLoadingId] = useState<string | null>(null);
  const [meetingError, setMeetingError] = useState<string | null>(null);
  const [transcriptCollapsed, setTranscriptCollapsed] = useState(true);
  const [highlightedTime, setHighlightedTime] = useState<string | null>(null);
  const [scrollRequest, setScrollRequest] = useState<{ time: string; token: number } | null>(null);
  const transcriptLineRefs = useRef<Map<string, HTMLElement>>(new Map());

  const participantOptions = useMemo(() => toOptions(index.participants, "All participants"), [index.participants]);
  const monthOptions = useMemo(() => toOptions(index.months, "All months"), [index.months]);
  const normalizedSearch = search.trim().toLowerCase();

  const filteredMeetings = index.meetings.filter((meeting) => {
    if (participant !== "all" && !meeting.participants.includes(participant)) {
      return false;
    }
    if (month !== "all" && meeting.month !== month) {
      return false;
    }
    return meetingMatchesSearch(meeting, normalizedSearch);
  });

  const selectedMeeting =
    filteredMeetings.find((meeting) => meeting.id === selectedId) ?? filteredMeetings[0] ?? index.meetings[0] ?? null;

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
        <label className="task-search">
          <span className="sr-only">Search meetings</span>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search title, participant, date, recording"
          />
        </label>
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
          Showing {filteredMeetings.length} of {index.meetings.length} meetings
        </span>
        <span>Index generated {formatDateTime(index.generatedAt)}</span>
        <span>{index.transcriptCount} transcripts tracked</span>
      </div>

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
                <p className="eyebrow">Selected Meeting</p>
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

              <div className="meeting-links">
                <button
                  type="button"
                  className="action-trigger"
                  disabled={meetingLoadingId === selectedMeeting.id}
                  onClick={() => void openMeetingDetail(selectedMeeting)}
                >
                  {meetingLoadingId === selectedMeeting.id ? "Opening..." : "Review meeting"}
                </button>
                {selectedMeeting.playbackUrl ? (
                  <a href={selectedMeeting.playbackUrl} target="_blank" rel="noreferrer">
                    Open Fathom playback
                  </a>
                ) : (
                  <span className="muted">No playback URL recorded.</span>
                )}
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
                  count={meetingDetail.actionCount}
                  emptyText="No actions extracted."
                  items={meetingDetail.actions}
                  onEvidenceClick={openEvidence}
                  focusedItemId={focusedItemId}
                />
                <ReviewSection
                  title="Decisions"
                  count={meetingDetail.decisionCount}
                  emptyText="No decisions extracted."
                  items={meetingDetail.decisions}
                  onEvidenceClick={openEvidence}
                  focusedItemId={focusedItemId}
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
