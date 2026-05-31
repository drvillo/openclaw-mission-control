import test from "node:test";
import assert from "node:assert/strict";
import { buildMyntIndexFromState, previewMyntArchive, type MyntState } from "./mynt";
import type { MeetingIndex, MeetingRecording } from "./meetings";
import type { ObsidianBoardTask } from "./openclaw";

function state(overrides: Partial<MyntState> = {}): MyntState {
  return {
    version: 1,
    showSelfDefault: false,
    archivedItemIds: [],
    identities: [
      {
        id: "francesco@lunarrails.io",
        email: "francesco@lunarrails.io",
        displayName: "Francesco Vivoli",
        aliases: ["Francesco Vivoli", "francesco@lunarrails.io"],
        isSelf: true,
      },
      {
        id: "alice@example.com",
        email: "alice@example.com",
        displayName: "Alice Example",
        aliases: ["Alice Example"],
      },
    ],
    ...overrides,
  };
}

function meeting(partial: Partial<MeetingRecording> = {}): MeetingRecording {
  return {
    id: "2026-05-20-fathom-recording-1",
    title: "Accountability review",
    date: "2026-05-20",
    dateTime: "2026-05-20T10:00:00Z",
    month: "2026-05",
    participants: ["Alice Example <alice@example.com>", "Francesco Vivoli"],
    recordingId: "1",
    playbackUrl: "https://example.test/fathom",
    generatedAt: null,
    filePath: "/tmp/meeting.md",
    obsidianRef: "Meeting Recordings/Fathom/one",
    actions: [],
    decisions: [],
    actionCount: 0,
    decisionCount: 0,
    ...partial,
  };
}

function index(meetings: MeetingRecording[]): MeetingIndex {
  return { root: "/tmp", generatedAt: null, transcriptCount: meetings.length, meetings, participants: [], months: [] };
}

test("buildMyntIndexFromState ranks people by unarchived action and decision totals", () => {
  const first = meeting({
    actions: [
      {
        kind: "action",
        label: "C1",
        id: "action-1",
        status: "created",
        taskId: "task-1",
        detailsRef: null,
        owner: null,
        assignee: "Alice Example",
        confidence: "high",
        score: 7,
        dueDate: null,
        dueText: null,
        summary: "Alice sends the update",
        evidence: null,
        evidenceTimestamps: [],
        evidenceTargetTime: "00:01:00",
      },
      {
        kind: "action",
        label: "C2",
        id: "action-2",
        status: "created",
        taskId: null,
        detailsRef: null,
        owner: null,
        assignee: "Francesco Vivoli",
        confidence: "high",
        score: 7,
        dueDate: null,
        dueText: null,
        summary: "Francesco sends the note",
        evidence: null,
        evidenceTimestamps: [],
        evidenceTargetTime: null,
      },
    ],
    decisions: [
      {
        kind: "decision",
        label: "D1",
        id: "decision-1",
        status: null,
        taskId: null,
        detailsRef: null,
        owner: "Alice Example",
        assignee: null,
        confidence: "high",
        score: 6,
        dueDate: null,
        dueText: null,
        summary: "Use the new process",
        evidence: null,
        evidenceTimestamps: [],
        evidenceTargetTime: null,
      },
    ],
  });
  const mynt = buildMyntIndexFromState(index([first]), state());

  assert.equal(mynt.people.length, 1);
  assert.equal(mynt.people[0].displayName, "Alice Example");
  assert.equal(mynt.people[0].totalCount, 2);
  assert.equal(mynt.people[0].actionCount, 1);
  assert.equal(mynt.people[0].decisionCount, 1);
  assert.equal(mynt.hiddenSelfCount, 1);
});

test("buildMyntIndexFromState excludes archived item ids", () => {
  const mynt = buildMyntIndexFromState(
    index([
      meeting({
        actions: [
          {
            kind: "action",
            label: "C1",
            id: "action-archived",
            status: "created",
            taskId: null,
            detailsRef: null,
            owner: null,
            assignee: "Alice Example",
            confidence: "high",
            score: 7,
            dueDate: null,
            dueText: null,
            summary: "Archived action",
            evidence: null,
            evidenceTimestamps: [],
            evidenceTargetTime: null,
          },
        ],
        decisions: [],
      }),
    ]),
    state({ archivedItemIds: ["action-archived"] }),
  );

  assert.equal(mynt.people.length, 0);
  assert.equal(mynt.archivedCount, 1);
});

test("identity alias matching resolves unique full-name aliases only", () => {
  const mynt = buildMyntIndexFromState(
    index([
      meeting({
        actions: [
          {
            kind: "action",
            label: "C1",
            id: "action-alias",
            status: "created",
            taskId: null,
            detailsRef: null,
            owner: null,
            assignee: "Alice Example",
            confidence: "high",
            score: 7,
            dueDate: null,
            dueText: null,
            summary: "Alice follows up",
            evidence: null,
            evidenceTimestamps: [],
            evidenceTargetTime: null,
          },
        ],
        decisions: [],
      }),
    ]),
    state(),
  );

  assert.equal(mynt.peopleWithSelf[0].identityId, "alice@example.com");
  assert.equal(mynt.peopleWithSelf[0].resolved, true);
});

test("buildMyntIndexFromState infers clear full-name identities without manual review", () => {
  const mynt = buildMyntIndexFromState(
    index([
      meeting({
        participants: ["David Barkwith", "Francesco Vivoli"],
        actions: [
          {
            kind: "action",
            label: "C1",
            id: "action-david-1",
            status: "created",
            taskId: null,
            detailsRef: null,
            owner: null,
            assignee: "David Barkwith",
            confidence: "high",
            score: 7,
            dueDate: null,
            dueText: null,
            summary: "David follows up",
            evidence: null,
            evidenceTimestamps: [],
            evidenceTargetTime: null,
          },
          {
            kind: "action",
            label: "C2",
            id: "action-david-2",
            status: "created",
            taskId: null,
            detailsRef: null,
            owner: null,
            assignee: "David Barkwith",
            confidence: "high",
            score: 7,
            dueDate: null,
            dueText: null,
            summary: "David sends the report",
            evidence: null,
            evidenceTimestamps: [],
            evidenceTargetTime: null,
          },
        ],
        decisions: [],
      }),
    ]),
    state({
      identities: [
        {
          id: "francesco@lunarrails.io",
          email: "francesco@lunarrails.io",
          displayName: "Francesco Vivoli",
          aliases: ["Francesco Vivoli", "francesco@lunarrails.io"],
          isSelf: true,
        },
      ],
    }),
  );

  const david = mynt.people.find((person) => person.displayName === "David Barkwith");
  assert.equal(david?.resolved, true);
  assert.equal(david?.identityId, "name:david barkwith");
  assert.equal(david?.totalCount, 2);
  assert.equal(mynt.identities.some((identity) => identity.displayName === "David Barkwith" && identity.inferred), true);
  assert.equal(mynt.duplicates.some((candidate) => candidate.displayName === "David Barkwith"), false);
});

test("buildMyntIndexFromState keeps ambiguous single-token names for manual review", () => {
  const mynt = buildMyntIndexFromState(
    index([
      meeting({
        participants: ["David Barkwith", "Francesco Vivoli"],
        actions: [
          {
            kind: "action",
            label: "C1",
            id: "action-dave",
            status: "created",
            taskId: null,
            detailsRef: null,
            owner: null,
            assignee: "Dave",
            confidence: "medium",
            score: 5,
            dueDate: null,
            dueText: null,
            summary: "Dave follows up",
            evidence: null,
            evidenceTimestamps: [],
            evidenceTargetTime: null,
          },
        ],
        decisions: [],
      }),
    ]),
    state({
      identities: [
        {
          id: "francesco@lunarrails.io",
          email: "francesco@lunarrails.io",
          displayName: "Francesco Vivoli",
          aliases: ["Francesco Vivoli", "francesco@lunarrails.io"],
          isSelf: true,
        },
      ],
    }),
  );

  assert.equal(mynt.people.find((person) => person.displayName === "Dave")?.resolved, false);
  assert.equal(mynt.identities.some((identity) => identity.displayName === "David Barkwith" && identity.inferred), true);
  assert.equal(mynt.duplicates.some((candidate) => candidate.displayName === "Dave"), true);
});

test("previewMyntArchive counts older items and linked Fathom tasks", () => {
  const mynt = buildMyntIndexFromState(
    index([
      meeting({
        date: "2026-04-01",
        actions: [
          {
            kind: "action",
            label: "C1",
            id: "action-old",
            status: "created",
            taskId: "task-20260401-001",
            detailsRef: null,
            owner: null,
            assignee: "Alice Example",
            confidence: "high",
            score: 7,
            dueDate: null,
            dueText: null,
            summary: "Old action",
            evidence: null,
            evidenceTimestamps: [],
            evidenceTargetTime: null,
          },
        ],
        decisions: [],
      }),
    ]),
    state(),
  );
  const tasks = [
    {
      id: "task-20260401-001",
      detail_body: "- source: fathom\n",
    } as ObsidianBoardTask,
  ];

  const preview = previewMyntArchive(mynt.items, tasks, 30, new Date("2026-05-29T00:00:00Z"));
  assert.equal(preview.itemCount, 1);
  assert.equal(preview.peopleAffected, 1);
  assert.deepEqual(preview.linkedTaskIds, ["task-20260401-001"]);
});
