export type MeetingTranscriptLine = {
  time: string;
  speaker: string;
  text: string;
};

export type MeetingReviewItem = {
  kind: "action" | "decision";
  assertionId: string | null;
  reviewStatus: "needs_review" | "accepted";
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

export type MeetingProvenance = {
  runId: string | null;
  processedAt: string | null;
  webhookReceivedAt: string | null;
  flowId: string | null;
  recordingId: string | null;
  pageMatchStrategy: string | null;
  extractor: string | null;
  modelUsed: string | null;
  promptHash: string | null;
  transcriptSha256: string | null;
  deliveryStatus: string | null;
};

export type ParsedMeetingMarkdown = {
  title: string | null;
  source: string | null;
  pageSchemaVersion: string | null;
  recordingId: string | null;
  meetingTitle: string | null;
  dateTime: string | null;
  meetingDay: string | null;
  meetingMonth: string | null;
  playbackUrl: string | null;
  shareUrl: string | null;
  generatedAt: string | null;
  participants: string[];
  participantKeys: string[];
  actions: MeetingReviewItem[];
  decisions: MeetingReviewItem[];
  transcriptText: string;
  transcriptLines: MeetingTranscriptLine[];
  provenance: MeetingProvenance | null;
};

type FrontmatterValue = string | string[];

function stripWrappedQuotes(value: string) {
  return value.replace(/^['"](.*)['"]$/u, "$1").trim();
}

function parseFrontmatter(markdown: string) {
  const match = markdown.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/u);
  if (!match) {
    return new Map<string, FrontmatterValue>();
  }

  const values = new Map<string, FrontmatterValue>();
  let currentArrayKey: string | null = null;

  for (const rawLine of match[1].split(/\r?\n/u)) {
    const keyMatch = rawLine.match(/^([A-Za-z0-9_]+):\s*(.*)$/u);
    if (keyMatch) {
      const [, key, rawValue] = keyMatch;
      const value = rawValue.trim();
      if (!value) {
        values.set(key, []);
        currentArrayKey = key;
      } else {
        values.set(key, stripWrappedQuotes(value));
        currentArrayKey = null;
      }
      continue;
    }

    const arrayMatch = rawLine.match(/^\s*-\s*(.*)$/u);
    if (arrayMatch && currentArrayKey) {
      const current = values.get(currentArrayKey);
      if (Array.isArray(current)) {
        current.push(stripWrappedQuotes(arrayMatch[1].trim()));
      }
      continue;
    }

    currentArrayKey = null;
  }

  return values;
}

function frontmatterString(map: Map<string, FrontmatterValue>, key: string) {
  const value = map.get(key);
  return typeof value === "string" ? value : null;
}

function frontmatterStringArray(map: Map<string, FrontmatterValue>, key: string) {
  const value = map.get(key);
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

export function parseBulletMetadata(text: string) {
  const metadata = new Map<string, string>();
  for (const line of text.split(/\r?\n/u)) {
    const match = line.match(/^- ([a-z_]+):\s*(.*)$/u);
    if (match) {
      metadata.set(match[1], match[2].trim());
    }
  }
  return metadata;
}

export function extractManagedSection(markdown: string, sectionName: string) {
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

export function normalizeMeetingReviewStatus(value: string | null | undefined): "needs_review" | "accepted" {
  return value === "accepted" ? "accepted" : "needs_review";
}

export function parseEvidenceTimestamps(evidence: string | null) {
  if (!evidence) {
    return [];
  }
  return [...evidence.matchAll(/\[(\d{2}:\d{2}:\d{2})\]/gu)].map((match) => match[1]);
}

export function parseEvidenceTargetTime(evidence: string | null, timestamps: string[]) {
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
    assertionId: null,
    reviewStatus: normalizeMeetingReviewStatus(metadata.get("review_status") ?? metadata.get("reviewStatus")),
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

export function parseParticipants(markdown: string) {
  const match = markdown.match(/## Participants\s*\n([\s\S]*?)(?:\n## |\n# |$)/u);
  if (!match) {
    return [];
  }
  return match[1]
    .split(/\r?\n/u)
    .map((line) => line.match(/^- (.+)$/u)?.[1]?.trim())
    .filter((participant): participant is string => Boolean(participant));
}

export function optionalUrl(value: string | undefined | null) {
  if (!value || value === "n/a" || value === "none") {
    return null;
  }
  return value;
}

export function extractTranscriptText(markdown: string) {
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

export function parseTranscriptLines(transcriptText: string): MeetingTranscriptLine[] {
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

export function parseMeetingMarkdown(markdown: string): ParsedMeetingMarkdown {
  const frontmatter = parseFrontmatter(markdown);
  const metadata = parseBulletMetadata(extractManagedSection(markdown, "metadata"));
  const provenanceMetadata = parseBulletMetadata(extractManagedSection(markdown, "provenance"));
  const review = parseMeetingReviewSections(markdown);
  const transcriptText = extractTranscriptText(markdown);
  const transcriptLines = parseTranscriptLines(transcriptText);
  const frontmatterParticipants = frontmatterStringArray(frontmatter, "participants");
  const participants = frontmatterParticipants.length > 0 ? frontmatterParticipants : parseParticipants(markdown);
  const pageSchemaVersion = frontmatterString(frontmatter, "page_schema_version");
  const dateTime = frontmatterString(frontmatter, "meeting_date") ?? metadata.get("meeting_date") ?? null;
  const meetingDay = frontmatterString(frontmatter, "meeting_day") ?? dateTime?.slice(0, 10) ?? null;
  const meetingMonth = frontmatterString(frontmatter, "meeting_month") ?? meetingDay?.slice(0, 7) ?? null;
  const recordingId = frontmatterString(frontmatter, "recording_id") ?? metadata.get("recording_id") ?? provenanceMetadata.get("recording_id") ?? null;
  const provenance: MeetingProvenance = {
    runId: provenanceMetadata.get("run_id") ?? null,
    processedAt: provenanceMetadata.get("processed_at") ?? null,
    webhookReceivedAt: provenanceMetadata.get("webhook_received_at") ?? null,
    flowId: provenanceMetadata.get("flow_id") ?? null,
    recordingId: provenanceMetadata.get("recording_id") ?? null,
    pageMatchStrategy: provenanceMetadata.get("page_match_strategy") ?? null,
    extractor: provenanceMetadata.get("extractor") ?? null,
    modelUsed: provenanceMetadata.get("model_used") ?? null,
    promptHash: provenanceMetadata.get("prompt_hash") ?? null,
    transcriptSha256: provenanceMetadata.get("transcript_sha256") ?? null,
    deliveryStatus: provenanceMetadata.get("delivery_status") ?? null,
  };

  return {
    title: markdown.match(/^#\s+(.+)$/mu)?.[1]?.trim() ?? frontmatterString(frontmatter, "meeting_title") ?? null,
    source: frontmatterString(frontmatter, "source") ?? metadata.get("source") ?? null,
    pageSchemaVersion,
    recordingId,
    meetingTitle: frontmatterString(frontmatter, "meeting_title"),
    dateTime,
    meetingDay,
    meetingMonth,
    playbackUrl: optionalUrl(frontmatterString(frontmatter, "playback_url") ?? metadata.get("playback_url")),
    shareUrl: optionalUrl(metadata.get("share_url")),
    generatedAt: metadata.get("generated_at") ?? provenance.processedAt,
    participants,
    participantKeys: frontmatterStringArray(frontmatter, "participant_keys"),
    actions: review.actions,
    decisions: review.decisions,
    transcriptText,
    transcriptLines,
    provenance: Object.values(provenance).some((value) => value != null) ? provenance : null,
  };
}
