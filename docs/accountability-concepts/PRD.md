# PRD: Accountability Concepts Semantic Layer

## Overview

Mission Control's Accountability Map currently shows people, actions, decisions, and their direct relationships. It helps inspect accountability, but it does not yet provide a semantic layer for recurring themes that emerge across meetings and assertion history.

Accountability Concepts add that semantic layer. A concept is a recurring accountability theme found in actions and decisions. Concepts help the team lead understand, at a glance, what accountable themes are showing up repeatedly, who is involved, what decisions/actions belong together, and which areas need attention.

Concepts are distinct from workstreams. Workstreams describe how the team organizes work. Concepts describe recurring accountability patterns that may cut across workstreams, meetings, and owners.

## Problem

Actions and decisions are currently inspectable as individual records or through people-centric graph relationships. This makes it hard to quickly answer:

- Which accountable themes are recurring across multiple conversations?
- Which actions and decisions belong to the same semantic concern?
- Which people are repeatedly involved in a theme, even across separate meetings or workstreams?
- Which recurring themes have open actions, pending review, or fragmented ownership?

Without a semantic layer, the leader has to infer these themes manually by reading many cards, meetings, or graph relationships.

## Goals

- Add a team-readable semantic layer over the Accountability Map.
- Cluster accountable assertions around recurring concepts.
- Keep the Accountability Map centered on actions and decisions.
- Preserve all existing accountability workflows: review, reject, reassign, mark done, filters, and graph selection.
- Let assertions remain visible even when no concept is assigned.
- Support leader-owned curation of concept identity, labels, summaries, merges, splits, and discards.
- Provide both landscape and attention lenses over the same concept identities.

## Non-Goals

- Do not turn the Accountability Map into a general meeting-topic map.
- Do not create concepts from transcript discussion alone.
- Do not make concepts the same as workstreams.
- Do not require every assertion to have a concept.
- Do not add a private leadership brief or separate private summary layer.
- Do not change existing assertion review/reassign/mark-done mutation semantics.
- Do not replace existing people/assertion graph nodes with concept nodes in the first visual model.

## Users And Audience

Primary user:

- The team leader using Mission Control for accountability sensemaking and follow-up.

Secondary audience:

- The team, because concept labels and summaries should be neutral, transparent, and understandable if shared.

The system should optimize for the leader's speed of sensemaking while keeping the canonical concept language suitable for team-shared accountability.

## Core Product Decisions

- Concepts are based on actions and decisions only.
- Transcript text can support concept summaries or disambiguation only when tied to assertion evidence.
- Concepts and workstreams are separate classification axes.
- Each assertion can have at most one concept.
- Concepts are high-signal only.
- About 10 active concepts should be visible by default.
- Manual concept-level curation persists and should shape future automatic discovery.
- Manual assertion assignment is a strong hint for future discovery, not a permanent lock.
- Discarding a concept should suppress substantially similar future suggestions.
- Landscape and attention modes use the same concept set; only ranking and emphasis change.

## Concept Definition

An Accountability Concept is a recurring semantic accountability theme represented by one or more actions or decisions.

A good concept:

- Appears through accountable assertions, not conversation alone.
- Recurs across meetings, time, or assertion history.
- Has a clear team-readable workstream-like label, but is not necessarily a formal workstream.
- Helps explain why a set of actions and decisions belong together.
- Can be summarized neutrally for the team.

Example:

- "Investigation agency" is a concept if it connects several actions and decisions across meetings.
- If "Investigation agency" is only discussed in transcripts and never produces an action or decision, it is background context, not an Accountability Concept.

## User Experience

### Assertion Views

When an assertion has a concept assignment, action and decision cards should show a compact concept label. Assertions without concepts should render normally.

Concept labels should be neutral and unobtrusive. They should add context without interfering with review, reassign, mark-done, or selection controls.

### Accountability Graph

The graph should keep its current people/assertion model. Concepts are an optional overlay.

When enabled, the overlay should show concept grouping around assigned assertion nodes. Assertions without concepts remain visible outside concept regions.

Selecting a concept should show a detail panel with:

- concept label
- neutral summary
- actions and decisions
- involved people
- recent meetings
- open actions
- pending review count
- representative assertions

### Landscape And Attention Lenses

Landscape mode should help answer: "What recurring accountability themes define the current map?"

Attention mode should help answer: "Which of those same themes need focus now?"

Attention should consider:

- open actions
- pending review
- fragmented ownership

The modes must not change concept identities or assignments.

## Curation

Curation should happen primarily from the graph overlay and should be available on demand. It should not become a mandatory review inbox.

Supported curation actions:

- rename concept
- update concept summary
- discard concept
- merge concept into another concept
- split concept into new concepts
- manually assign or clear an assertion concept

Concept-level decisions persist. All curation actions should be event logged.

## Automatic Discovery

Automatic discovery should be assertion-first.

Inputs:

- assertion summary
- assertion kind
- owner
- meeting title and date
- evidence text and timestamp when present
- associated identities

Ranking signals:

- cross-meeting recurrence
- assertion count
- recent activity
- involved people as a secondary signal

Discovery should leave low-signal or routine assertions unlabeled. It should not classify every assertion just to increase coverage.

## Data And System Expectations

The implementation should add persistent concepts, assignments, and event history. It should enrich existing `MyntItem` assertion data with optional concept metadata.

Existing graph node and link behavior must remain backward compatible when no concepts exist.

The one-concept-per-assertion rule should be enforced at the persistence layer.

## Success Criteria

The feature is successful when:

- The leader can quickly understand recurring accountability themes without reading many individual cards.
- Concept labels are understandable to the team.
- Existing accountability workflows behave as before.
- Concepts can be curated without creating a new mandatory review process.
- Assertions without concepts remain visible and useful.
- Automatic discovery proposes high-signal recurring concepts without flooding the map.

## Risks And Tradeoffs

- Separating concepts from workstreams adds a second classification axis. The benefit is detecting cross-cutting accountability themes; the cost is more curation and naming discipline.
- One concept per assertion keeps the map cleaner but requires ambiguity to be resolved through concept refinement.
- Automatic discovery may overfit to generic topics unless discarded concepts and high-signal thresholds are respected.
- Cluster regions could make the graph visually noisy if not optional and restrained.

## Implementation Plan

Implementation is split into independently testable phases:

1. [Persistent Concept Model](./phase-1-persistent-concept-model.md)
2. [Assertion UI Labels](./phase-2-assertion-ui-labels.md)
3. [Graph Concept Metadata And Toggle](./phase-3-graph-concept-metadata-toggle.md)
4. [Cluster Regions And Concept Selection](./phase-4-cluster-regions-selection.md)
5. [Manual Curation](./phase-5-manual-curation.md)
6. [Concept Proposal And Backfill](./phase-6-concept-proposal-backfill.md)
7. [Documentation And Readiness](./phase-7-documentation-readiness.md)
