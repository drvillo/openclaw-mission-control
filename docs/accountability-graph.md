# Accountability Map 3D Graph

## Requirements satisfied

- The existing table/list views remain the default. Graph mode is opt-in through a `Table/List` / `3D Graph` toggle.
- Existing operational affordances are preserved and reused:
  - person view: archive older than 30 days, selected-person `Accept pending`, per-card approve/reject, action reassign, action-only mark done
  - action/decision registers: status filter tabs, archive older than 30 days, accept/reject all pending, accept/reject selected, action-only mark selected done, per-row/per-card approve/reject/reassign/mark done where already supported
- No new mutation endpoint or decision-done operation was introduced. Graph cards call the same review/reassign/mark-done paths as the existing UI.
- Current filters are preserved:
  - `/accountability/people` renders the current people view scope as graph: unarchived, non-self Accountability Map people, with pending-only narrowing when that route is used.
  - `/accountability/actions/{all,accepted,pending}` and `/accountability/decisions/{all,accepted,pending}` render the exact filtered register dataset as graph.
- Actions, decisions, people, unresolved identities, and edge/association types are visually differentiated with colors, labels, directional ownership arrows, particles for pending relationships, and a legend.
- Clicking a person node selects it, highlights immediate graph relationships, expands highlight through directly related assertion nodes, and shows owned plus associated actions/decisions in a detail panel.
- Desktop browsers are the primary target. The graph is designed for exploration first while keeping direct controls available after selection.

## Safe assumptions

- “Social graph” is represented as an accountability graph: person nodes, action/decision assertion nodes, ownership edges, associated-identity edges, participant-context edges, and same-meeting edges.
- Self-owned items remain hidden in the people map because the current people UI hides them, but filtered action/decision register graph mode includes self if the underlying table filter includes self.
- Archived items stay excluded because all current Accountability Map views exclude them except archive preview state.

## Library choice

The graph uses `react-force-graph-3d`, a mature React wrapper around Three.js/WebGL and `d3-force-3d`, with built-in camera controls, node/link interactions, labels, sizing, coloring, and dynamic data updates.

Because it depends on browser/WebGL APIs, it is isolated behind a client-only Next.js dynamic import (`ssr: false`) so server rendering does not touch `window`/WebGL.

## Follow-up evaluation questions

1. Should meetings become first-class nodes instead of remaining implicit same-meeting links?
2. Should archived history become an optional faded overlay?
3. Should participant-only nodes get a richer relationship panel even when they do not own accountability items?
4. What scale should be optimized first: tens, hundreds, or thousands of assertions?
