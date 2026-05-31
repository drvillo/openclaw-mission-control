import test from "node:test";
import assert from "node:assert/strict";
import { parseMeetingReviewSections } from "./meetings";

function markdownWithSections(actions: string, decisions: string) {
  return `# Meeting

<!-- FATHOM:SECTION actions:start -->
## Actions
${actions}
<!-- FATHOM:SECTION actions:end -->

<!-- FATHOM:SECTION decisions:start -->
## Decisions
${decisions}
<!-- FATHOM:SECTION decisions:end -->

<!-- FATHOM:SECTION transcript:start -->
## Transcript
\`\`\`text
[00:00:01] A: Hello.
\`\`\`
<!-- FATHOM:SECTION transcript:end -->
`;
}

test("parseMeetingReviewSections parses one action and two decisions", () => {
  const parsed = parseMeetingReviewSections(
    markdownWithSections(
      `### C1
- action_id: action-1
- status: needs_review
- assignee: Alice
- confidence: high
- score: 7

Alice to follow up with the team

\`\`\`text
- [00:01:00] Bob: Before. > [00:01:05] Alice: I will follow up. - [00:01:08] Bob: Thanks.
\`\`\``,
      `### D1
- decision_id: decision-1
- owner: Bob
- confidence: medium
- score: 5

Use the new process

\`\`\`text
- [00:02:00] Bob: We should use the new process.
\`\`\`

### D2
- decision_id: decision-2
- owner: Cara
- confidence: high
- score: 8

Defer the launch

\`\`\`text
- [00:03:00] Cara: Defer the launch.
\`\`\``,
    ),
  );

  assert.equal(parsed.actions.length, 1);
  assert.equal(parsed.decisions.length, 2);
  assert.deepEqual(parsed.actions[0], {
    kind: "action",
    label: "C1",
    id: "action-1",
    status: "needs_review",
    taskId: null,
    detailsRef: null,
    owner: null,
    assignee: "Alice",
    confidence: "high",
    score: 7,
    dueDate: null,
    dueText: null,
    summary: "Alice to follow up with the team",
    evidence: "- [00:01:00] Bob: Before. > [00:01:05] Alice: I will follow up. - [00:01:08] Bob: Thanks.",
    evidenceTimestamps: ["00:01:00", "00:01:05", "00:01:08"],
    evidenceTargetTime: "00:01:05",
  });
  assert.equal(parsed.decisions[0].label, "D1");
  assert.equal(parsed.decisions[1].id, "decision-2");
});

test("parseMeetingReviewSections handles no actions and one decision", () => {
  const parsed = parseMeetingReviewSections(
    markdownWithSections(
      "- None extracted.",
      `### D1
- decision_id: decision-1
- owner: Bob
- confidence: high
- score: 6

Keep the current plan

\`\`\`text
- [00:10:00] Bob: Keep the current plan.
\`\`\``,
    ),
  );

  assert.equal(parsed.actions.length, 0);
  assert.equal(parsed.decisions.length, 1);
  assert.equal(parsed.decisions[0].summary, "Keep the current plan");
});

test("parseMeetingReviewSections handles managed sections with none extracted", () => {
  const parsed = parseMeetingReviewSections(markdownWithSections("- None extracted.", "- None extracted."));

  assert.equal(parsed.actions.length, 0);
  assert.equal(parsed.decisions.length, 0);
});

test("parseMeetingReviewSections prefers the quoted evidence timestamp", () => {
  const parsed = parseMeetingReviewSections(
    markdownWithSections(
      `### C1
- action_id: action-1
- status: needs_review
- assignee: Alice
- confidence: high
- score: 7

Alice to send notes

\`\`\`text
- [00:04:00] Bob: First timestamp.
> [00:04:12] Alice: I will send notes.
- [00:04:30] Bob: Later timestamp.
\`\`\``,
      "- None extracted.",
    ),
  );

  assert.deepEqual(parsed.actions[0].evidenceTimestamps, ["00:04:00", "00:04:12", "00:04:30"]);
  assert.equal(parsed.actions[0].evidenceTargetTime, "00:04:12");
});

test("parseMeetingReviewSections handles legacy transcript-only meetings", () => {
  const parsed = parseMeetingReviewSections(`# Legacy

## Transcript
\`\`\`text
[00:00:01] A: Hello.
\`\`\`
`);

  assert.equal(parsed.actions.length, 0);
  assert.equal(parsed.decisions.length, 0);
});
