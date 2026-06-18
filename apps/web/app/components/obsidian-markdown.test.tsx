import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { ObsidianMarkdown, type ObsidianDocumentReference } from "./obsidian-markdown";

const linkedDocument: ObsidianDocumentReference = {
  label: "Packet index",
  title: "Packet index",
  path: "/vault/System/OpenClaw Self-Evolution/Review Packets/Index.md",
  vaultPath: "System/OpenClaw Self-Evolution/Review Packets/Index.md",
  href: "obsidian://open?vault=test&file=System%2FOpenClaw%20Self-Evolution%2FReview%20Packets%2FIndex",
  exists: true,
  markdown: "# Packet index",
  sectionId: null,
};

describe("ObsidianMarkdown", () => {
  test("renders headings, tables, lists, and strips Obsidian metadata", () => {
    render(
      <ObsidianMarkdown
        markdown={`---\ntype: packet\n---\n\n# Review Packet\n\n<!-- hidden metadata -->\n\n- First item\n- Second item\n\n| Gate | Status |\n|---|---|\n| facts_ok | PASS |`}
      />,
    );

    expect(screen.getByRole("heading", { level: 1, name: "Review Packet" })).toBeInTheDocument();
    expect(screen.queryByText("type: packet")).not.toBeInTheDocument();
    expect(screen.queryByText("hidden metadata")).not.toBeInTheDocument();
    expect(screen.getByText("First item")).toBeInTheDocument();
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByText("facts_ok")).toBeInTheDocument();
  });

  test("opens known wiki links through the provided callback", () => {
    const onOpenDocument = vi.fn();

    render(
      <ObsidianMarkdown
        markdown={`See [[System/OpenClaw Self-Evolution/Review Packets/Index|Packet index]] for details.`}
        documents={[linkedDocument]}
        onOpenDocument={onOpenDocument}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Packet index" }));

    expect(onOpenDocument).toHaveBeenCalledWith(linkedDocument);
  });

  test("converts inline task references into app links", () => {
    render(
      <ObsidianMarkdown
        markdown={`Review task: task-20260608-001.`}
        resolveInlineHref={(token) => (token === "task-20260608-001" ? "/work/tasks/task-20260608-001" : null)}
      />,
    );

    expect(screen.getByRole("link", { name: "task-20260608-001" })).toHaveAttribute("href", "/work/tasks/task-20260608-001");
  });
});
