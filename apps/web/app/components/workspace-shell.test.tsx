import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { WorkspaceShell } from "./workspace-shell";

describe("WorkspaceShell", () => {
  test("exposes Semantic Concepts as a top-level workspace and renders it when active", () => {
    render(
      <WorkspaceShell
        activeWorkspace="semantic-concepts"
        work={<section>Work content</section>}
        meetings={<section>Meetings content</section>}
        myAccountability={<section>My accountability content</section>}
        mynt={<section>Accountability map content</section>}
        semanticConcepts={<section aria-label="semantic workspace">Semantic concept workspace content</section>}
        identity={<section>Identity content</section>}
        ops={<section>Ops content</section>}
        prSwarm={<section>PR Swarm content</section>}
        selfEvolution={<section>Self-evolution content</section>}
      />,
    );

    const navLink = screen.getByRole("link", { name: "Semantic Concepts" });
    expect(navLink).toHaveAttribute("href", "/semantic-concepts");
    expect(navLink).toHaveClass("workspace-tab-active");
    expect(screen.getByLabelText("semantic workspace")).toHaveTextContent("Semantic concept workspace content");
    expect(screen.queryByText("Accountability map content")).not.toBeInTheDocument();
  });

  test("exposes PR Swarm as a top-level workspace and renders it when active", () => {
    render(
      <WorkspaceShell
        activeWorkspace="pr-swarm"
        work={<section>Work content</section>}
        meetings={<section>Meetings content</section>}
        myAccountability={<section>My accountability content</section>}
        mynt={<section>Accountability map content</section>}
        semanticConcepts={<section>Semantic concept content</section>}
        identity={<section>Identity content</section>}
        ops={<section>Ops content</section>}
        prSwarm={<section aria-label="pr swarm workspace">PR Swarm content</section>}
        selfEvolution={<section>Self-evolution content</section>}
      />,
    );

    const navLink = screen.getByRole("link", { name: "PR Swarm" });
    expect(navLink).toHaveAttribute("href", "/pr-swarm");
    expect(navLink).toHaveClass("workspace-tab-active");
    expect(screen.getByLabelText("pr swarm workspace")).toHaveTextContent("PR Swarm content");
    expect(screen.queryByText("Ops content")).not.toBeInTheDocument();
  });
});
