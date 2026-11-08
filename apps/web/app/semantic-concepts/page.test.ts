import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

describe("Semantic Concepts page", () => {
  test("uses the constrained page shell while preserving the focused workspace payload", () => {
    const pageSource = readFileSync(join(process.cwd(), "app/semantic-concepts/page.tsx"), "utf8");
    expect(pageSource).toContain("page-shell");
    expect(pageSource).toContain("WorkspaceShell");
    expect(pageSource).toContain("SemanticConceptsPanel");
    expect(pageSource).toContain("semantic-concepts-page-panel");
    expect(pageSource).not.toContain("MissionControlPage");
  });
});
