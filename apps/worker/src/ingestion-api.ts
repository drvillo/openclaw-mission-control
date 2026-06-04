import { openMissionControlDb } from "@ocmc/db";
import { DATABASE_PATH, MISSION_CONTROL_INGEST_TOKEN } from "./config";
import { ingestMeetingNotePath, type IngestMeetingNotePathOptions } from "./meetings-ingestion";

type HeaderReader = Pick<Headers, "get"> | Record<string, string | string[] | undefined>;

type IngestMeetingsRequestOptions = IngestMeetingNotePathOptions & {
  dbPath?: string;
  token?: string;
};

export type IngestMeetingsApiResult = {
  status: number;
  body: {
    ok: boolean;
    error?: string;
    payload?: Record<string, unknown>;
  };
};

function getHeader(headers: HeaderReader | undefined, name: string) {
  if (!headers) {
    return "";
  }
  if ("get" in headers && typeof headers.get === "function") {
    return headers.get(name) ?? "";
  }
  const record = headers as Record<string, string | string[] | undefined>;
  const value = record[name] ?? record[name.toLowerCase()];
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function isAuthorized(headers: HeaderReader | undefined, expectedToken: string) {
  if (!expectedToken) {
    return true;
  }
  const header = getHeader(headers, "authorization").trim();
  return header === `Bearer ${expectedToken}`;
}

function statusForIngestionFailure(errorKind: string | undefined) {
  if (errorKind === "invalid_path") {
    return 400;
  }
  if (errorKind === "not_found") {
    return 404;
  }
  return 422;
}

export async function handleIngestMeetingsRequest(
  body: unknown,
  headers?: HeaderReader,
  options: IngestMeetingsRequestOptions = {},
): Promise<IngestMeetingsApiResult> {
  const expectedToken = options.token ?? MISSION_CONTROL_INGEST_TOKEN;
  if (!isAuthorized(headers, expectedToken)) {
    return { status: 401, body: { ok: false, error: "Unauthorized" } };
  }

  if (!body || typeof body !== "object" || typeof (body as { sourcePath?: unknown }).sourcePath !== "string") {
    return { status: 400, body: { ok: false, error: "sourcePath is required" } };
  }

  try {
    const db = openMissionControlDb(options.dbPath ?? DATABASE_PATH);
    const result = ingestMeetingNotePath(db, (body as { sourcePath: string }).sourcePath, options);
    if (result.status === "failed") {
      return {
        status: statusForIngestionFailure(result.errorKind),
        body: {
          ok: false,
          error: result.error ?? "Meeting ingestion failed",
          payload: {
            status: "failed",
            canonicalSourcePath: result.canonicalSourcePath,
            ingestionRunId: result.ingestionRunId,
          },
        },
      };
    }

    return {
      status: 200,
      body: {
        ok: true,
        payload: {
          status: result.status,
          sourceDocumentId: result.sourceDocumentId,
          meetingId: result.meetingId,
          documentVersionId: result.documentVersionId,
          extractionRunId: result.extractionRunId,
          canonicalSourcePath: result.canonicalSourcePath,
          participantCount: result.participantCount,
          transcriptSegmentCount: result.transcriptSegmentCount,
          actionCount: result.actionCount,
          decisionCount: result.decisionCount,
        },
      },
    };
  } catch (error) {
    return {
      status: 500,
      body: { ok: false, error: error instanceof Error ? error.message : String(error) },
    };
  }
}
