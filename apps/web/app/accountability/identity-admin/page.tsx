import { IdentityAdminView } from "../../components/identity-admin-view";
import { loadMeetingIndex } from "../../lib/meetings";
import { buildMyntIndex } from "../../lib/mynt";
import { loadObsidianTaskBoard } from "../../lib/openclaw";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function IdentityAdminPage() {
  const meetingIndex = loadMeetingIndex();
  const taskBoard = await loadObsidianTaskBoard();
  const myntIndex = buildMyntIndex(meetingIndex, taskBoard);

  return (
    <main className="page-shell">
      <div className="workspace-stack">
        <section className="workspace-hero">
          <div>
            <p className="eyebrow">Accountability Map</p>
            <h1>Identity Admin</h1>
            <p className="intro">Canonical identities, aliases, and duplicate review for people extracted from Fathom meeting notes.</p>
          </div>
          <div className="action-row">
            <a className="action-trigger" href="/accountability">
              Back to Accountability Map
            </a>
          </div>
        </section>
        <IdentityAdminView index={myntIndex} />
      </div>
    </main>
  );
}

