import fs from "node:fs";
import path from "node:path";
import { FATHOM_RECORDINGS_ROOT } from "./config";

export type MeetingRecording = {
  id: string;
  title: string;
  date: string;
  dateTime: string | null;
  month: string;
  participants: string[];
  recordingId: string;
  playbackUrl: string | null;
  generatedAt: string | null;
  filePath: string;
  obsidianRef: string;
  actions: MeetingReviewItem[];
  decisions: MeetingReviewItem[];
  actionCount: number;
  decisionCount: number;
};

export type MeetingIndex = {
  root: string;
  generatedAt: string | null;
  transcriptCount: number;
  meetings: MeetingRecording[];
  participants: string[];
  months: string[];
};

export type MeetingTranscriptLine = {
  time: string;
  speaker: string;
  text: string;
};

export type MeetingReviewItem = {
  kind: "action" | "decision";
  label: string;
  id: string | null;
  status: string | null;
  taskId: string | null;
  detailsRef: string | null;
  owner: string | null;
  assignee: string | null;
  confidence: string | null;
  score: number | null;
  dueDate: string | null;
  dueText: string | null;
  summary: string;
  evidence: string | null;
  evidenceTimestamps: string[];
  evidenceTargetTime: string | null;
};

export type MeetingDetail = {
  id: string;
  title: string;
  dateTime: string | null;
  participants: string[];
  playbackUrl: string | null;
  obsidianRef: string;
  actions: MeetingReviewItem[];
  decisions: MeetingReviewItem[];
  actionCount: number;
  decisionCount: number;
  lines: MeetingTranscriptLine[];
  rawText: string | null;
};

export type MeetingTranscript = MeetingDetail;

function readPrefix(filePath: string, maxBytes = 96_000) {
  const descriptor = fs.openSync(filePath, "r");
  try {
    const buffer = Buffer.alloc(maxBytes);
    const bytesRead = fs.readSync(descriptor, buffer, 0, maxBytes, 0);
    return buffer.subarray(0, bytesRead).toString("utf8");
  } finally {
    fs.closeSync(descriptor);
  }
}

function parseBulletMetadata(text: string) {
  const metadata = new Map<string, string>();
  for (const line of text.split(/\r?\n/u)) {
    const match = line.match(/^- ([a-z_]+):\s*(.*)$/u);
    if (match) {
      metadata.set(match[1], match[2].trim());
    }
  }
  return metadata;
}

function extractManagedSection(markdown: string, sectionName: string) {
  const pattern = new RegExp(
    `<!--\\s*FATHOM:SECTION ${sectionName}:start\\s*-->([\\s\\S]*?)<!--\\s*FATHOM:SECTION ${sectionName}:end\\s*-->`,
    "u",
  );
  return markdown.match(pattern)?.[1]?.trim() ?? "";
}

function parseScore(value: string | undefined) {
  if (!value) {
    return null;
  }
  const score = Number(value);
  return Number.isFinite(score) ? score : null;
}

function parseEvidenceTimestamps(evidence: string | null) {
  if (!evidence) {
    return [];
  }
  return [...evidence.matchAll(/\[(\d{2}:\d{2}:\d{2})\]/gu)].map((match) => match[1]);
}

function parseEvidenceTargetTime(evidence: string | null, timestamps: string[]) {
  if (!evidence) {
    return null;
  }

  for (const line of evidence.split(/\r?\n/u)) {
    const quoteIndex = line.indexOf(">");
    if (quoteIndex === -1) {
      continue;
    }
    const highlightedTimestamp = line.slice(quoteIndex).match(/\[(\d{2}:\d{2}:\d{2})\]/u)?.[1];
    if (highlightedTimestamp) {
      return highlightedTimestamp;
    }
  }

  return timestamps[0] ?? null;
}

function parseReviewItemBlock(kind: "action" | "decision", label: string, block: string): MeetingReviewItem {
  const metadata = parseBulletMetadata(block);
  const evidence = block.match(/```(?:text)?\s*\n([\s\S]*?)\n```/u)?.[1]?.trim() ?? null;
  const evidenceTimestamps = parseEvidenceTimestamps(evidence);
  const summary = block
    .replace(/^###\s+.+$/mu, "")
    .replace(/^- [a-z_]+:\s*.*$/gmu, "")
    .replace(/```(?:text)?\s*\n[\s\S]*?\n```/gu, "")
    .trim();

  return {
    kind,
    label,
    id: metadata.get(`${kind}_id`) ?? null,
    status: metadata.get("status") ?? null,
    taskId: metadata.get("task_id") ?? null,
    detailsRef: metadata.get("details_ref") ?? null,
    owner: metadata.get("owner") ?? null,
    assignee: metadata.get("assignee") ?? null,
    confidence: metadata.get("confidence") ?? null,
    score: parseScore(metadata.get("score")),
    dueDate: metadata.get("due_date") ?? null,
    dueText: metadata.get("due_text") ?? null,
    summary,
    evidence,
    evidenceTimestamps,
    evidenceTargetTime: parseEvidenceTargetTime(evidence, evidenceTimestamps),
  };
}

function parseReviewSection(markdown: string, sectionName: "actions" | "decisions"): MeetingReviewItem[] {
  const section = extractManagedSection(markdown, sectionName);
  if (!section || /(?:^|\n)\s*-\s*None extracted\.\s*(?:\n|$)/iu.test(section)) {
    return [];
  }

  const kind = sectionName === "actions" ? "action" : "decision";
  const headings = [...section.matchAll(/^###\s+(.+?)\s*$/gmu)];
  return headings.map((match, index) => {
    const blockStart = match.index;
    const blockEnd = headings[index + 1]?.index ?? section.length;
    return parseReviewItemBlock(kind, match[1].trim(), section.slice(blockStart, blockEnd));
  });
}

export function parseMeetingReviewSections(markdown: string) {
  return {
    actions: parseReviewSection(markdown, "actions"),
    decisions: parseReviewSection(markdown, "decisions"),
  };
}

function parseParticipants(text: string) {
  const match = text.match(/## Participants\s*\n([\s\S]*?)(?:\n## |\n# |$)/u);
  if (!match) {
    return [];
  }
  return match[1]
    .split(/\r?\n/u)
    .map((line) => line.match(/^- (.+)$/u)?.[1]?.trim())
    .filter((participant): participant is string => Boolean(participant));
}

function parseDateFromFilename(fileName: string) {
  return fileName.match(/^(\d{4}-\d{2}-\d{2})/u)?.[1] ?? "unknown";
}

function parseIndexMetadata() {
  const indexPath = path.join(FATHOM_RECORDINGS_ROOT, "Index.md");
  if (!fs.existsSync(indexPath)) {
    return { generatedAt: null, transcriptCount: 0 };
  }
  try {
    const metadata = parseBulletMetadata(readPrefix(indexPath, 16_000));
    return {
      generatedAt: metadata.get("generated_at") ?? null,
      transcriptCount: Number(metadata.get("transcript_count") ?? 0) || 0,
    };
  } catch {
    return { generatedAt: null, transcriptCount: 0 };
  }
}

function uniqueSorted(values: string[]) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function optionalUrl(value: string | undefined) {
  if (!value || value === "n/a" || value === "none") {
    return null;
  }
  return value;
}

function extractTranscriptText(markdown: string) {
  const managedSection = extractManagedSection(markdown, "transcript");
  const fallbackSection = markdown.match(/## Transcript\s*\n([\s\S]*?)(?:\n## |\n# |$)/u)?.[1] ?? "";
  const section = (managedSection || fallbackSection).trim();
  if (!section) {
    return "";
  }

  const fenced = section.match(/^```(?:text)?\s*\n([\s\S]*?)\n```$/u);
  if (fenced) {
    return fenced[1].trim();
  }

  return section.replace(/^```[^\n]*\n?/u, "").replace(/\n```$/u, "").trim();
}

function parseTranscriptLines(transcriptText: string): MeetingTranscriptLine[] {
  const lines: MeetingTranscriptLine[] = [];

  for (const rawLine of transcriptText.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    const match = line.match(/^\[(\d{2}:\d{2}:\d{2})\]\s+([^:]+):\s*(.*)$/u);
    if (match) {
      lines.push({ time: match[1], speaker: match[2].trim(), text: match[3].trim() });
      continue;
    }

    const previousLine = lines.at(-1);
    if (previousLine) {
      previousLine.text = `${previousLine.text} ${line}`.trim();
    }
  }

  return lines;
}

export function loadMeetingIndex(): MeetingIndex {
  const indexMetadata = parseIndexMetadata();

  if (!fs.existsSync(FATHOM_RECORDINGS_ROOT)) {
    return {
      root: FATHOM_RECORDINGS_ROOT,
      generatedAt: indexMetadata.generatedAt,
      transcriptCount: indexMetadata.transcriptCount,
      meetings: [],
      participants: [],
      months: [],
    };
  }

  const meetings = fs
    .readdirSync(FATHOM_RECORDINGS_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md") && entry.name !== "Index.md")
    .map((entry): MeetingRecording | null => {
      const filePath = path.join(FATHOM_RECORDINGS_ROOT, entry.name);
      try {
        const text = readPrefix(filePath);
        const metadata = parseBulletMetadata(text);
        const title = text.match(/^#\s+(.+)$/mu)?.[1]?.trim() ?? entry.name.replace(/\.md$/u, "");
        const dateTime = metadata.get("meeting_date") ?? null;
        const date = dateTime?.slice(0, 10) ?? parseDateFromFilename(entry.name);
        const recordingId =
          metadata.get("recording_id") ??
          entry.name.match(/fathom-recording-(.+)\.md$/u)?.[1] ??
          entry.name.replace(/\.md$/u, "");
        const stem = entry.name.replace(/\.md$/u, "");
        const review = parseMeetingReviewSections(text);

        return {
          id: stem,
          title,
          date,
          dateTime,
          month: date.slice(0, 7),
          participants: parseParticipants(text),
          recordingId,
          playbackUrl: optionalUrl(metadata.get("playback_url")),
          generatedAt: metadata.get("generated_at") ?? null,
          filePath,
          obsidianRef: `Meeting Recordings/Fathom/${stem}`,
          actions: review.actions,
          decisions: review.decisions,
          actionCount: review.actions.length,
          decisionCount: review.decisions.length,
        };
      } catch {
        return null;
      }
    })
    .filter((meeting): meeting is MeetingRecording => Boolean(meeting))
    .sort(
      (left, right) =>
        (right.dateTime ?? right.date).localeCompare(left.dateTime ?? left.date) ||
        right.recordingId.localeCompare(left.recordingId),
    );

  return {
    root: FATHOM_RECORDINGS_ROOT,
    generatedAt: indexMetadata.generatedAt,
    transcriptCount: indexMetadata.transcriptCount || meetings.length,
    meetings,
    participants: uniqueSorted(meetings.flatMap((meeting) => meeting.participants)),
    months: [...new Set(meetings.map((meeting) => meeting.month))].sort((left, right) => right.localeCompare(left)),
  };
}

export function loadMeetingDetail(meetingId: string): MeetingDetail | null {
  const meeting = loadMeetingIndex().meetings.find((item) => item.id === meetingId);
  if (!meeting) {
    return null;
  }

  const markdown = fs.readFileSync(meeting.filePath, "utf8");
  const transcriptText = extractTranscriptText(markdown);
  const lines = parseTranscriptLines(transcriptText);

  return {
    id: meeting.id,
    title: meeting.title,
    dateTime: meeting.dateTime,
    participants: meeting.participants,
    playbackUrl: meeting.playbackUrl,
    obsidianRef: meeting.obsidianRef,
    actions: meeting.actions,
    decisions: meeting.decisions,
    actionCount: meeting.actionCount,
    decisionCount: meeting.decisionCount,
    lines,
    rawText: lines.length > 0 ? null : transcriptText || null,
  };
}

export function loadMeetingTranscript(meetingId: string): MeetingTranscript | null {
  return loadMeetingDetail(meetingId);
}
