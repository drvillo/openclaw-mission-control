import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import type {
  ConceptRegistrySnapshot,
  EvidencePacketSeed,
  SemanticConceptProposalRun,
  SemanticExtractionBundle,
} from "@openclaw/semantic-layer";
import {
  autoApplySafeSemanticConceptProposals,
  importSemanticConceptProposalRun,
  listAccountabilityConcepts,
  listSemanticConceptSuppressions,
  openMissionControlDb,
  resolveSemanticConceptProposalRunAssertionTargets,
  type SemanticAssertionCandidateResolutionInput,
  type SemanticAutoApplyResult,
  type SemanticProposalImportResult,
} from "./sqlite";

type SemanticLayerModule = typeof import("@openclaw/semantic-layer");

export type MissionControlSemanticRuntimeConfig = {
  missionControlDbPath: string;
  semanticDbPath: string;
  extractionPath?: string | null;
  noteRoots: string[];
  synthesisProvider: string;
  embeddingProvider: string;
  openaiApiKey?: string | null;
  openaiBaseUrl?: string | null;
  llmModel: string;
  embeddingModel: string;
};

export type SemanticLayerStatusPayload = {
  semanticDbPath: string;
  extractionSource: { kind: "jsonl" | "notes" | "none"; path?: string; roots?: string[]; bundleCount: number; diagnostics: string[] };
  index: ReturnType<SemanticLayerModule["semanticIndexStatus"]> | null;
  providers: {
    synthesis: { provider: string; model: string | null; operational: boolean; diagnostics: string[] };
    embedding: { provider: string; model: string | null; operational: boolean; diagnostics: string[] };
  };
  operational: boolean;
  diagnostics: string[];
};

export type SemanticSearchPayload = {
  query: string;
  results: Awaited<ReturnType<SemanticLayerModule["retrieveSemanticNeighbors"]>>;
};

export type SemanticProposalPullOptions = {
  query?: string | null;
  reason?: string | null;
  importIntoReview?: boolean;
  maxProposals?: number;
  maxPackets?: number;
};

export type SemanticProposalPullResult = {
  proposalRun: Record<string, unknown>;
  resolution: { resolutions: ReturnType<typeof resolveSemanticConceptProposalRunAssertionTargets>["resolutions"]; unresolved: string[] };
  imported: SemanticProposalImportResult | null;
};

export type SemanticRefreshExecuteInput = {
  trigger: string;
  source?: string | null;
  sourceDocumentId?: string | null;
  documentVersionId?: string | null;
  ingestionRunId?: string | null;
  query?: string | null;
  reason?: string | null;
  maxProposals?: number;
  maxPackets?: number;
  minAutoApplyConfidence?: number;
  reviewer?: string | null;
};

export type SemanticRefreshExecuteResult = {
  indexVersionId: string | null;
  proposalRunId: string | null;
  proposalsImported: number;
  autoApplied: number;
  pending: number;
  autoApply: SemanticAutoApplyResult;
};

function defaultConfig(): MissionControlSemanticRuntimeConfig {
  const openclawHome = process.env.OPENCLAW_HOME ?? "/Users/fonkey-oc/.openclaw";
  const obsidianVault = process.env.OBSIDIAN_VAULT ?? "/Users/fonkey-oc/obsidian-fhq-data";
  const stateDir = process.env.MISSION_CONTROL_STATE_DIR ?? path.join(openclawHome, "mission-control-state");
  const fathomRoot = path.join(obsidianVault, "Meeting Recordings", "Fathom");
  return {
    missionControlDbPath: process.env.MISSION_CONTROL_DB_PATH ?? path.join(stateDir, "mission-control.sqlite"),
    semanticDbPath: process.env.MISSION_CONTROL_SEMANTIC_DB_PATH ?? path.join(openclawHome, "semantic", "meetings.sqlite"),
    extractionPath: process.env.MISSION_CONTROL_SEMANTIC_EXTRACTION_PATH ?? "",
    noteRoots: (process.env.MISSION_CONTROL_SEMANTIC_NOTE_ROOTS ?? fathomRoot)
      .split(path.delimiter)
      .map((root) => root.trim())
      .filter(Boolean),
    synthesisProvider: process.env.MISSION_CONTROL_SEMANTIC_SYNTHESIS_PROVIDER ?? "disabled",
    embeddingProvider: process.env.MISSION_CONTROL_SEMANTIC_EMBEDDING_PROVIDER ?? "disabled",
    openaiApiKey: process.env.MISSION_CONTROL_SEMANTIC_OPENAI_API_KEY ?? process.env.OPENAI_API_KEY ?? "",
    openaiBaseUrl: process.env.MISSION_CONTROL_SEMANTIC_OPENAI_BASE_URL ?? process.env.OPENAI_BASE_URL ?? "",
    llmModel: process.env.MISSION_CONTROL_SEMANTIC_LLM_MODEL ?? "gpt-4.1-mini",
    embeddingModel: process.env.MISSION_CONTROL_SEMANTIC_EMBEDDING_MODEL ?? "text-embedding-3-small",
  };
}

function runtimeConfig(config?: Partial<MissionControlSemanticRuntimeConfig>): MissionControlSemanticRuntimeConfig {
  const defaults = defaultConfig();
  return { ...defaults, ...config, noteRoots: config?.noteRoots ?? defaults.noteRoots };
}

async function semanticLayer(): Promise<SemanticLayerModule> {
  return import("@openclaw/semantic-layer");
}

function providerDiagnostics(config: MissionControlSemanticRuntimeConfig, kind: "synthesis" | "embedding") {
  const provider = kind === "synthesis" ? config.synthesisProvider : config.embeddingProvider;
  const model = kind === "synthesis" ? config.llmModel : config.embeddingModel;
  const diagnostics: string[] = [];
  if (provider !== "openai") diagnostics.push(`${kind} provider is '${provider}', not operational provider 'openai'`);
  if (provider === "openai" && !config.openaiApiKey) diagnostics.push(`${kind} provider openai is missing API key`);
  return { provider, model: provider === "openai" ? model : null, operational: provider === "openai" && Boolean(config.openaiApiKey), diagnostics };
}

function createEmbeddingProvider(semantic: SemanticLayerModule, config: MissionControlSemanticRuntimeConfig) {
  const status = providerDiagnostics(config, "embedding");
  if (!status.operational) throw new Error(`Semantic embedding provider is not operational: ${status.diagnostics.join("; ")}`);
  return new semantic.OpenAIEmbeddingProvider({ apiKey: config.openaiApiKey ?? "", baseUrl: config.openaiBaseUrl || undefined, model: config.embeddingModel });
}

function createSynthesisProvider(semantic: SemanticLayerModule, config: MissionControlSemanticRuntimeConfig) {
  const status = providerDiagnostics(config, "synthesis");
  if (!status.operational) throw new Error(`Semantic synthesis provider is not operational: ${status.diagnostics.join("; ")}`);
  return new semantic.OpenAIConceptSynthesisProvider({ apiKey: config.openaiApiKey ?? "", baseUrl: config.openaiBaseUrl || undefined, model: config.llmModel });
}

function openSemanticDb(semantic: SemanticLayerModule, config: MissionControlSemanticRuntimeConfig) {
  if (!config.semanticDbPath || !existsSync(config.semanticDbPath)) {
    return null;
  }
  return semantic.openSemanticStore(config.semanticDbPath);
}

async function loadBundles(semantic: SemanticLayerModule, config: MissionControlSemanticRuntimeConfig): Promise<{ bundles: SemanticExtractionBundle[]; source: SemanticLayerStatusPayload["extractionSource"] }> {
  if (config.extractionPath) {
    if (!existsSync(config.extractionPath)) {
      return { bundles: [], source: { kind: "jsonl", path: config.extractionPath, bundleCount: 0, diagnostics: ["configured extraction JSONL does not exist"] } };
    }
    const bundles = semantic.loadExtractionBundlesFile(config.extractionPath);
    return { bundles, source: { kind: "jsonl", path: config.extractionPath, bundleCount: bundles.length, diagnostics: [] } };
  }

  const roots = config.noteRoots.filter((root) => existsSync(root));
  if (roots.length === 0) {
    return { bundles: [], source: { kind: "none", bundleCount: 0, diagnostics: ["no semantic extraction path or readable note roots configured"] } };
  }
  const notePaths = semantic.discoverMarkdownNotes(roots);
  const bundles = notePaths.map((notePath) => semantic.extractSemanticMeetingNote(semantic.parseSemanticMeetingNoteFile(notePath, { allowedRoots: roots })));
  return { bundles, source: { kind: "notes", roots, bundleCount: bundles.length, diagnostics: [] } };
}

function candidateResolutionInputs(bundles: SemanticExtractionBundle[]): SemanticAssertionCandidateResolutionInput[] {
  return bundles.flatMap((bundle) =>
    bundle.assertionCandidates
      .filter((candidate) => candidate.kind === "action" || candidate.kind === "decision")
      .map((candidate) => ({
        candidateId: candidate.candidateId,
        kind: candidate.kind,
        text: candidate.text,
        normalizedText: candidate.normalizedText,
        sourceRef: candidate.sourceRef,
      })),
  );
}

function registryScope(_label: string): "operational_process" {
  return "operational_process";
}

async function mcRegistrySnapshot(semantic: SemanticLayerModule, config: MissionControlSemanticRuntimeConfig): Promise<ConceptRegistrySnapshot> {
  const db = openMissionControlDb(config.missionControlDbPath);
  try {
    const concepts = listAccountabilityConcepts(db, ["active", "dormant"]);
    const suppressions = listSemanticConceptSuppressions(db);
    return semantic.buildConceptRegistrySnapshot(
      [
        ...concepts.map((concept) => ({
          conceptId: concept.conceptId,
          canonicalLabel: concept.label,
          definition: concept.summary || concept.label,
          scope: registryScope(concept.label),
          status: concept.status === "dormant" ? "candidate" as const : "accepted" as const,
          createdAt: concept.createdAt,
          updatedAt: concept.updatedAt,
        })),
        ...suppressions.map((suppression) => ({
          conceptId: suppression.suppressionId,
          canonicalLabel: suppression.normalizedLabel,
          definition: suppression.reason ? `Suppressed semantic concept suggestion: ${suppression.reason}` : "Suppressed semantic concept suggestion",
          scope: registryScope(suppression.normalizedLabel),
          status: "deprecated" as const,
          createdAt: suppression.createdAt,
          updatedAt: suppression.createdAt,
          aliases: [suppression.normalizedLabel],
        })),
      ],
      { snapshotVersionSeed: "mission-control-accountability-concepts" },
    );
  } finally {
    db.close();
  }
}

function querySeed(options: Pick<SemanticProposalPullOptions, "query" | "reason">): EvidencePacketSeed[] | undefined {
  const text = options.query?.trim();
  if (!text) return undefined;
  return [{ reason: options.reason?.trim() || "mission_control_query", text }];
}

function latestIndexVersionId(status: ReturnType<SemanticLayerModule["semanticIndexStatus"]> | null) {
  const latest = status?.latestIndexVersion;
  if (!latest || typeof latest !== "object") return null;
  const value = (latest as Record<string, unknown>).index_version_id ?? (latest as Record<string, unknown>).indexVersionId;
  return typeof value === "string" && value.trim() ? value : null;
}

export async function getMissionControlSemanticStatus(configOverrides?: Partial<MissionControlSemanticRuntimeConfig>): Promise<SemanticLayerStatusPayload> {
  const config = runtimeConfig(configOverrides);
  const semantic = await semanticLayer();
  const { bundles, source } = await loadBundles(semantic, config);
  const db = openSemanticDb(semantic, config);
  const providers = { synthesis: providerDiagnostics(config, "synthesis"), embedding: providerDiagnostics(config, "embedding") };
  try {
    const index = db ? semantic.semanticIndexStatus(db) : null;
    const diagnostics = [
      ...source.diagnostics,
      ...providers.synthesis.diagnostics,
      ...providers.embedding.diagnostics,
    ];
    if (!db) diagnostics.push(`semantic DB not found at ${config.semanticDbPath}`);
    if (db && !index?.latestIndexVersion) diagnostics.push("semantic DB has no ready index version");
    return {
      semanticDbPath: config.semanticDbPath,
      extractionSource: { ...source, bundleCount: bundles.length },
      index,
      providers,
      operational: providers.synthesis.operational && providers.embedding.operational && Boolean(db && index?.latestIndexVersion),
      diagnostics,
    };
  } finally {
    db?.close();
  }
}

export async function buildMissionControlSemanticIndex(configOverrides?: Partial<MissionControlSemanticRuntimeConfig>) {
  const config = runtimeConfig(configOverrides);
  const semantic = await semanticLayer();
  const { bundles, source } = await loadBundles(semantic, config);
  if (bundles.length === 0) throw new Error(`No semantic extraction bundles available (${source.diagnostics.join("; ") || "empty source"})`);
  mkdirSync(path.dirname(config.semanticDbPath), { recursive: true });
  const db = semantic.openSemanticStore(config.semanticDbPath);
  try {
    const result = await semantic.buildSemanticIndex(db, bundles, createEmbeddingProvider(semantic, config));
    return { result, source: { ...source, bundleCount: bundles.length }, status: semantic.semanticIndexStatus(db) };
  } finally {
    db.close();
  }
}

export async function searchMissionControlSemanticIndex(query: string, limit = 8, configOverrides?: Partial<MissionControlSemanticRuntimeConfig>): Promise<SemanticSearchPayload> {
  const config = runtimeConfig(configOverrides);
  const semantic = await semanticLayer();
  const db = openSemanticDb(semantic, config);
  if (!db) {
    throw new Error(`Semantic DB not found at ${config.semanticDbPath}`);
  }
  try {
    return { query, results: await semantic.retrieveSemanticNeighbors(db, query, { limit, provider: createEmbeddingProvider(semantic, config) }) };
  } finally {
    db.close();
  }
}

export async function buildMissionControlSemanticEvidencePackets(options: { query?: string | null; reason?: string | null; limit?: number } = {}, configOverrides?: Partial<MissionControlSemanticRuntimeConfig>) {
  const config = runtimeConfig(configOverrides);
  const semantic = await semanticLayer();
  const { bundles, source } = await loadBundles(semantic, config);
  if (bundles.length === 0) {
    throw new Error(`No semantic extraction bundles available (${source.diagnostics.join("; ") || "empty source"})`);
  }
  const db = openSemanticDb(semantic, config);
  try {
    const status = db ? semantic.semanticIndexStatus(db) : null;
    return await semantic.buildSemanticEvidencePackets(
      db,
      bundles,
      querySeed(options) ?? semantic.defaultEvidencePacketSeeds(bundles).slice(0, options.limit ?? 6),
      { indexVersion: latestIndexVersionId(status) ?? "mission-control-unindexed", limit: options.limit ?? 8, provider: createEmbeddingProvider(semantic, config), registrySnapshot: await mcRegistrySnapshot(semantic, config), includeRegistryContext: true },
    );
  } finally {
    db?.close();
  }
}

async function pullMissionControlSemanticProposalRunWithDb(
  mcDb: DatabaseSync,
  options: SemanticProposalPullOptions = {},
  configOverrides?: Partial<MissionControlSemanticRuntimeConfig>,
): Promise<SemanticProposalPullResult> {
  const config = runtimeConfig(configOverrides);
  const semantic = await semanticLayer();
  const { bundles, source } = await loadBundles(semantic, config);
  if (bundles.length === 0) {
    throw new Error(`No semantic extraction bundles available (${source.diagnostics.join("; ") || "empty source"})`);
  }
  const db = openSemanticDb(semantic, config);
  if (!db) throw new Error(`Semantic DB not found at ${config.semanticDbPath}; build the semantic index first.`);
  let proposalRun: SemanticConceptProposalRun;
  try {
    const status = semantic.semanticIndexStatus(db);
    if (!status.latestIndexVersion) throw new Error("Semantic DB has no ready index version; build the semantic index first.");
    proposalRun = await semantic.generateSemanticConceptProposalRun(bundles, {
      db,
      indexVersion: latestIndexVersionId(status) ?? undefined,
      registrySnapshot: await mcRegistrySnapshot(semantic, config),
      provider: createSynthesisProvider(semantic, config),
      embeddingProvider: createEmbeddingProvider(semantic, config),
      seeds: querySeed(options),
      maxPackets: options.maxPackets ?? 8,
      maxProposals: options.maxProposals ?? 12,
      filter: options.query?.trim() || null,
    });
  } finally {
    db?.close();
  }

  const resolved = resolveSemanticConceptProposalRunAssertionTargets(mcDb, proposalRun as unknown as Record<string, unknown>, candidateResolutionInputs(bundles));
  const importResult = options.importIntoReview ? importSemanticConceptProposalRun(mcDb, resolved.proposalRun) : null;
  return {
    proposalRun: resolved.proposalRun,
    resolution: { resolutions: resolved.resolutions, unresolved: resolved.unresolved },
    imported: importResult,
  };
}

export async function pullMissionControlSemanticProposalRun(
  options: SemanticProposalPullOptions = {},
  configOverrides?: Partial<MissionControlSemanticRuntimeConfig>,
): Promise<SemanticProposalPullResult> {
  const config = runtimeConfig(configOverrides);
  const mcDb = openMissionControlDb(config.missionControlDbPath);
  try {
    return await pullMissionControlSemanticProposalRunWithDb(mcDb, options, config);
  } finally {
    mcDb.close();
  }
}

export async function executeMissionControlSemanticRefresh(
  db: DatabaseSync,
  input: SemanticRefreshExecuteInput,
  configOverrides?: Partial<MissionControlSemanticRuntimeConfig>,
): Promise<SemanticRefreshExecuteResult> {
  const indexPayload = await buildMissionControlSemanticIndex(configOverrides);
  const indexVersionId = latestIndexVersionId(indexPayload.status);
  const pulled = await pullMissionControlSemanticProposalRunWithDb(
    db,
    {
      importIntoReview: true,
      query: input.query ?? null,
      reason: input.reason ?? input.trigger,
      maxPackets: input.maxPackets,
      maxProposals: input.maxProposals,
    },
    configOverrides,
  );
  const proposalRunId = pulled.imported?.proposalRunId ?? (typeof pulled.proposalRun.proposalRunId === "string" ? pulled.proposalRun.proposalRunId : null);
  const autoApply = autoApplySafeSemanticConceptProposals(db, {
    proposalRunId: proposalRunId ?? undefined,
    minConfidence: input.minAutoApplyConfidence,
    reviewer: input.reviewer ?? "semantic_auto",
  });
  return {
    indexVersionId,
    proposalRunId,
    proposalsImported: pulled.imported?.proposalsImported ?? 0,
    autoApplied: autoApply.applied,
    pending: autoApply.pending,
    autoApply,
  };
}

export function semanticExtractionSourceSummary(configOverrides?: Partial<MissionControlSemanticRuntimeConfig>) {
  const config = runtimeConfig(configOverrides);
  return {
    semanticDbPath: config.semanticDbPath,
    extractionPath: config.extractionPath || null,
    noteRoots: config.noteRoots.map((root) => path.resolve(root)),
  };
}
