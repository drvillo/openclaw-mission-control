"use client";

import type { ReactNode } from "react";

export type WorkspaceId = "work" | "meetings" | "accountability" | "ops";

type WorkspaceShellProps = {
  activeWorkspace: WorkspaceId;
  work: ReactNode;
  meetings: ReactNode;
  mynt: ReactNode;
  ops: ReactNode;
};

const WORKSPACES: { id: WorkspaceId; label: string; href: string }[] = [
  { id: "work", label: "My work", href: "/work" },
  { id: "meetings", label: "My meetings", href: "/meetings" },
  { id: "accountability", label: "Accountability Map", href: "/accountability" },
  { id: "ops", label: "Fonkey Ops", href: "/ops" },
];

export function WorkspaceShell({ activeWorkspace, work, meetings, mynt, ops }: WorkspaceShellProps) {
  const activeContent = activeWorkspace === "work" ? work : activeWorkspace === "meetings" ? meetings : activeWorkspace === "accountability" ? mynt : ops;

  return (
    <div className="workspace-shell">
      <header className="workspace-topbar">
        <div className="brand-block">
          <p className="eyebrow">Mission Control</p>
          <h1>OpenClaw</h1>
        </div>
        <nav className="workspace-tabs" aria-label="Workspace navigation">
          {WORKSPACES.map((workspace) => (
            <a
              key={workspace.id}
              href={workspace.href}
              className={`workspace-tab ${activeWorkspace === workspace.id ? "workspace-tab-active" : ""}`}
            >
              {workspace.label}
            </a>
          ))}
        </nav>
      </header>

      <div className="workspace-content">{activeContent}</div>
    </div>
  );
}
