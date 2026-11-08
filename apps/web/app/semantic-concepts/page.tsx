import { SemanticConceptsPanel } from "../components/semantic-concepts-panel";
import { WorkspaceShell } from "../components/workspace-shell";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function EmptyWorkspace() {
  return null;
}

export default async function SemanticConceptsPage() {
  const semanticConcepts = (
    <div className="workspace-stack semantic-concepts-workspace">
      <section className="workspace-hero">
        <div>
          <p className="eyebrow">Semantic layer</p>
          <h2>Semantic Concepts</h2>
          <p className="intro">
            Review operational concept proposals generated from indexed meeting evidence. The accountability map stays focused on accepted people, actions, and decisions.
          </p>
          <p className="intro">Target concept dropdowns list accepted active concepts only; if there is one target, Mission Control currently has one accepted active concept.</p>
        </div>
      </section>
      <section className="panel semantic-concepts-page-panel">
        <SemanticConceptsPanel />
      </section>
    </div>
  );

  return (
    <main className="page-shell">
      <WorkspaceShell
        activeWorkspace="semantic-concepts"
        work={<EmptyWorkspace />}
        meetings={<EmptyWorkspace />}
        myAccountability={<EmptyWorkspace />}
        mynt={<EmptyWorkspace />}
        semanticConcepts={semanticConcepts}
        identity={<EmptyWorkspace />}
        ops={<EmptyWorkspace />}
        prSwarm={<EmptyWorkspace />}
        selfEvolution={<EmptyWorkspace />}
      />
    </main>
  );
}
