/**
 * Types mirroring the Express API response shapes.
 *
 * These are hand-written rather than generated because the Express layer has
 * no schema source of truth. Each type notes the route it came from so the
 * two stay reviewable together.
 */

export type GenerationStatus = 'pending' | 'running' | 'completed' | 'failed';

export type EngineKey =
  | 'codex'
  | 'openai'
  | 'replicate'
  | 'fal'
  | 'gemini'
  | 'comfy'
  | 'antigravity'
  | (string & {});

/** GET /api/characters */
export interface CharacterSummary {
  id: string;
  name: string;
  createdAt: string;
  primaryPhotoUrl: string | null;
}

/** GET /api/characters/:id */
export interface CharacterDetail {
  id: string;
  name: string;
  createdAt: string;
  photos: Array<{ id: string; url: string; isPrimary: boolean }>;
}

/** GET /api/presets */
export interface Preset {
  id: string;
  type: 'background' | 'style';
  name: string;
  isCustom: boolean;
}

/** GET /api/engines */
export interface EngineInfo {
  key: EngineKey;
  label: string;
  ready: boolean;
  reason?: string | null;
  models?: Array<{ id: string; label: string }>;
}

export interface EnginesResponse {
  engines: EngineInfo[];
  defaultEngine: EngineKey;
}

/** GET /api/pose-references */
export interface PoseReference {
  id: string;
  title: string | null;
  category: string | null;
  tags: string[];
  tagStatus: 'pending' | 'tagged' | 'skipped';
  imageUrl: string;
  sourceProvider: string | null;
  sourcePageUrl: string | null;
  isCustom: boolean;
  createdAt: string;
}

/** Persisted on every generation row as usage_metrics JSONB. */
export interface UsageMetrics {
  source?: 'estimated' | 'actual' | 'partial';
  rateDate?: string;
  model?: string | null;
  providerRequestId?: string | null;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  estimatedCostUsd?: number | null;
  actualCostUsd?: number | null;
  pricingNote?: string;
}

/** GET /api/generations */
export interface Generation {
  id: string;
  status: GenerationStatus;
  engine: EngineKey;
  characters: Array<{
    position: number;
    characterId: string | null;
    name: string | null;
    photoUrl: string;
  }>;
  posePhotoUrl: string;
  poseReferenceId: string | null;
  poseTitle: string | null;
  outputUrl: string | null;
  backgroundPreset: Preset | null;
  stylePreset: Preset | null;
  prompt: string;
  studioMode: 'normal' | 'advanced';
  advancedSettings: Record<string, unknown>;
  batchId: string | null;
  usage: UsageMetrics;
  documentSheetUrl: string | null;
  passportSheetUrl: string | null;
  errorMessage: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface GenerationListResponse {
  generations: Generation[];
  nextCursor: string | null;
}

/** POST /api/generations */
export interface GenerationAccepted {
  id: string;
  generationIds: string[];
  batchId: string | null;
  status: 'pending';
}

/** GET /api/generations/estimate */
export interface UsageEstimate {
  source: string;
  rateDate: string;
  model: string | null;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number | null;
  pricingNote: string;
  variants?: number;
}

/** GET /api/recipes */
export interface Recipe {
  id: string;
  name: string;
  settings: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

/** GET /api/settings */
export interface Credential {
  configured: boolean;
  masked: string | null;
  source: 'environment' | 'database' | null;
}

export interface Settings {
  defaultEngine: EngineKey;
  openaiApiKey: Credential;
  replicateApiKey: Credential;
  falApiKey: Credential;
  geminiApiKey: Credential;
  geminiModel: string;
  antigravityModel: string;
  comfyEndpoint: string;
  comfyModel: string;
  comfyWorkflow: {
    configured: boolean;
    source: 'environment' | 'database' | null;
    bytes: number | null;
  };
}

/* ------------------------------------------- Document / passport photos */

/** GET /api/passport/config */
export interface DocumentProfile {
  id: string;
  countryCode: string;
  country: string;
  documentType: string;
  label: string;
  retrievedOn: string;
  sourceVersionLabel: string;
  sourceUpdatedOn: string | null;
  officialLinks: Array<{ label: string; url: string }>;
  requirements: string[];
  output: {
    widthPx: number;
    heightPx: number;
    format: 'png' | 'jpeg';
    printWidthMm: number;
    printHeightMm: number;
    sheet: boolean;
    minBytes?: number;
    maxBytes?: number;
  };
  prompt: string;
  disclaimer: string;
}

export interface PassportConfig {
  retrievedOn: string;
  profiles: DocumentProfile[];
}

/** POST /api/passport */
export interface PassportAccepted {
  id: string;
  status: 'pending' | 'completed';
}

/* ------------------------------------------------------------------ *
 * Metrics — new in the re-architecture. Served by GET /api/metrics.
 * ------------------------------------------------------------------ */

export type MetricsScope = 'session' | 'historical';
export type MetricsBucket = 'daily' | 'weekly' | 'monthly' | 'runs';

export interface MetricsTotals {
  totalRuns: number;
  completedRuns: number;
  failedRuns: number;
  inFlightRuns: number;
  successRate: number | null;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  totalCostUsd: number;
  activeDays: number;
  firstRunAt: string | null;
  lastRunAt: string | null;
  avgTokensPerDay: number;
  avgTokensPerWeek: number;
  avgCostPerDay: number;
  avgCostPerRun: number | null;
  latencyMs: { p50: number | null; p95: number | null; max: number | null };
  queueWaitMs: { p50: number | null; p95: number | null; max: number | null };
  /** Share of runs whose usage is recorded (actual) rather than estimated. */
  actualUsageShare: number | null;
}

export interface MetricsSeriesPoint {
  bucket: string;
  /** Cumulative totals keyed by engine, plus an `all` roll-up. */
  tokens: Record<string, number>;
  cost: Record<string, number>;
  runs: Record<string, number>;
}

export interface MetricsEngineRow {
  engine: EngineKey;
  model: string | null;
  runs: number;
  completed: number;
  failed: number;
  successRate: number | null;
  tokens: number;
  costUsd: number;
  avgLatencyMs: number | null;
  p95LatencyMs: number | null;
  share: number;
}

export interface MetricsFailureRow {
  reason: string;
  count: number;
  engines: EngineKey[];
  lastSeenAt: string;
}

export interface AccountLimitWindow {
  usedPercent: number;
  remainingPercent: number;
  windowDurationMins: number | null;
  resetsAt: string | null;
}

export interface CodexLimits {
  available: boolean;
  loading?: boolean;
  planType: string | null;
  fiveHour: AccountLimitWindow | null;
  weekly: AccountLimitWindow | null;
  reason: string | null;
}

export interface AntigravityLimits {
  available: boolean;
  loading?: boolean;
  groups: Array<{
    name: string;
    description: string | null;
    fiveHour: AccountLimitWindow | null;
    weekly: AccountLimitWindow | null;
  }>;
  reason: string | null;
}

export interface MetricsResponse {
  scope: MetricsScope;
  generatedAt: string;
  /** Server process start — the boundary for `session` scope. */
  sessionStartedAt: string;
  health: {
    status: 'healthy' | 'degraded' | 'down';
    readyEngines: number;
    totalEngines: number;
    queueDepth: number;
    detail: string;
  };
  totals: MetricsTotals;
  series: {
    daily: MetricsSeriesPoint[];
    weekly: MetricsSeriesPoint[];
    monthly: MetricsSeriesPoint[];
    runs: MetricsSeriesPoint[];
  };
  engines: MetricsEngineRow[];
  failures: MetricsFailureRow[];
  /** Live account limits read from the locally authenticated Codex CLI. */
  codexLimits: CodexLimits;
  /** Live quota groups read from the locally authenticated Antigravity CLI. */
  antigravityLimits: AntigravityLimits;
  library: {
    characters: number;
    poseReferences: number;
    customPoseReferences: number;
    recipes: number;
    mostUsedCharacter: { id: string; name: string; runs: number } | null;
    mostUsedPose: { id: string; title: string | null; runs: number } | null;
  };
}
