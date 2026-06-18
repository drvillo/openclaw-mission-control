"use client";

import type { ReactNode } from "react";

export type WorkspaceId = "work" | "meetings" | "my-accountability" | "accountability" | "identity" | "ops" | "self-evolution";

type WorkspaceShellProps = {
  activeWorkspace: WorkspaceId;
  work: ReactNode;
  meetings: ReactNode;
  myAccountability: ReactNode;
  mynt: ReactNode;
  identity: ReactNode;
  ops: ReactNode;
  selfEvolution: ReactNode;
};

const WORKSPACES: { id: WorkspaceId; label: string; href: string }[] = [
  { id: "work", label: "My work", href: "/work" },
  { id: "meetings", label: "My meetings", href: "/meetings" },
  { id: "my-accountability", label: "My Accountability", href: "/my-accountability" },
  { id: "accountability", label: "Accountability Map", href: "/accountability" },
  { id: "identity", label: "Identity Admin", href: "/identity-admin" },
  { id: "self-evolution", label: "Self-Evolution", href: "/self-evolution" },
  { id: "ops", label: "Fonkey Ops", href: "/ops" },
];

export function WorkspaceShell({ activeWorkspace, work, meetings, myAccountability, mynt, identity, ops, selfEvolution }: WorkspaceShellProps) {
  const activeContent =
    activeWorkspace === "work"
      ? work
      : activeWorkspace === "meetings"
        ? meetings
        : activeWorkspace === "my-accountability"
          ? myAccountability
          : activeWorkspace === "accountability"
            ? mynt
            : activeWorkspace === "identity"
              ? identity
              : activeWorkspace === "self-evolution"
                ? selfEvolution
                : ops;

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
