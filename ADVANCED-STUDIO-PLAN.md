# Advanced Studio — Implementation Plan

Branch: `main` (PoseForge). The `studio-2` branch was not inspected and will not be.
---

## 1. What exists today (findings that shape the design)

**Frontend** (`web/`, Next 16 App Router, React 19, `@xyflow/react` 12, Tailwind v4, Radix, react-query)

- `/studio` → project gallery; `/studio/[projectId]` → the workbench.
- `studio-view.tsx` (1003 L) owns a 3-column grid: `SourcesPanel | canvas | Inspector`, plus `GenerationDock`. Welded to `studioReducer` (a *character/pose generation form* model, entirely separate from the canvas document).
- `canvas.tsx` (3165 L) is the React Flow canvas. **One node type** (`{poseforge: StudioNode}`) dispatching internally on `data.kind`. Generic machinery worth reusing: node shell + resizer + block menu, `StudioHandle`, `CanvasControls`, undo/redo (`canvasSnapshot`/`applySnapshot`, 20-deep), `nearestOpenPosition`, `arrangeSelectedNodes`, `projectDocument()`, viewport hydration. Domain-specific: `StudioNodeKind` union, `NODE_GEOMETRY`, `buildFlow` (hardcoded character→pose→generate→result), `isValidConnection`.
- `lib/studio/project-workspace.ts` — debounced (5 s) single-flight autosave with `expectedRevision` optimistic concurrency, 409 → `conflict` + `retry()`. Generic; parameterizable.
- Node bodies already implement a clean kind-agnostic contract (`StudioNodeBodyProps` + `StudioNodeActionsContext`); **bodies never render handles** — the shell does.
- Design tokens: `--pf-*` in `globals.css`; a second canvas-scoped token layer `--pf-canvas-*` under `.canvas-panel`; React-Flow-internal classes namespaced `.poseforge-*`. Dark mode = `.dark` class (not `prefers-color-scheme`). `prefers-reduced-motion` block at `studio.css:3915`.
- Tests: vitest + RTL (`tests/setup.ts` already stubs `DOMMatrixReadOnly`/`ResizeObserver` for React Flow), MSW, Playwright e2e (`e2e/flows.spec.ts` studio describe, `e2e/navigation.spec.ts` walks `NAV_ITEMS`).

**Backend** (Express + PGlite/Postgres)

- `routes/studio-projects.js` — list/get/create/update(`expectedRevision`)/delete(soft)/run/runNode/assist. 768 KB document cap, 250 nodes / 500 edges.
- `db/migrations/012_studio_projects.sql` — `studio_projects(id, name, schema_version, revision, document JSONB, is_default, archived_at, …)`. `schemaVersion` exists but **there is no migration function for the graph JSON**; `sanitizeStudioDocument` silently strips unknown node kinds.
- `lib/generationRunner.createGeneration()` is the single shared execution path (dock + studio), with `awaitCompletion`, an in-process queue (`GENERATION_CONCURRENCY` ≤ 6), usage estimation and `generations` row insert. Provider-agnostic.
- `lib/storage.js` — filesystem media under `storage/`, `publicUrl()` ↔ `absolutePathFromPublicUrl()`, served statically at `/storage`. No second media system will be introduced.
- `engines/*` + `GET /api/engines` is the capability catalog (per-engine `capabilities`, `models`). Aspect/resolution vocabulary is **fragmented** (app set of 4 in `lib/studioSettings.js`, fal's set of 10, comfy's pixel table).
- **No video anywhere.** No duration/fps/sound fields, no non-PNG output path (`getGenerationOutputPath` hardcodes `output.png`).
- Already-migrated but **dead** scaffolding: `studio_runs`, `studio_composition_revisions`, and `generations.studio_run_id | composition_node_id | composition_revision_id | parent_generation_id`. Free to adopt for Advanced Studio run/lineage tracking.

---

## 2. Architecture

### Route & navigation
Sibling top-level route (not nested — `site-nav` matches with `startsWith`, so `/studio/advanced` would keep "Studio" highlighted):

```
/studio-advanced                → project gallery + project-type selector
/studio-advanced/[projectId]    → full-bleed node editor
```
One entry appended to `NAV_ITEMS`. `e2e/navigation.spec.ts` picks it up automatically.

### Node registry (the core new abstraction)
`web/lib/advanced-studio/registry/` — one module per node type, plus an index:

```ts
interface AdvNodeDefinition<TData> {
  type: AdvNodeType;              // 'text' | 'imageInput' | 'imageGenerator' | 'videoGenerator' | 'group'
  label: string;
  category: 'inputs' | 'generation' | 'media' | 'organization';
  icon: LucideIcon;
  component: React.ComponentType<AdvNodeBodyProps<TData>>;
  defaultData(ctx): TData;
  geometry: { min: Size; max: Size; default: Size };
  handles(data, caps): { inputs: HandleDef[]; outputs: HandleDef[] };   // model-aware
  validate(data, resolved): ValidationResult;
  serialize(data): Json;  deserialize(json, version): TData;
  capabilities?(data): ModelCapabilities;
}
```
Adding a future node = adding one file + one registry entry. The canvas never learns node names.

### Typed connections
`web/lib/advanced-studio/types.ts` defines `DataType = 'text' | 'image' | 'video' | 'audio'` with a single source of truth for icon (`T`, image, play, waveform), token colour, and edge stroke. `isValidConnection` is derived from the registry: source output type ∈ target input `accepts`, plus per-handle `maxConnections` and no-duplicate-source rules, implemented data-first rather than as a hand-written switch.

Drag feedback: `onConnectStart` stamps `data-connecting-type` on the flow root; CSS dims incompatible handles and highlights compatible ones using `--pf-*` tokens. Rejected connections surface a short toast via the existing `useToast()`.

### Separation of concerns (no mega-component)
```
lib/advanced-studio/
  types.ts                 data types, handle defs, colours
  registry/                node definitions (one file per node)
  document.ts              serialize/deserialize + schema version + migrations
  validation.ts            connection + pre-generate validation
  capabilities.ts          model catalog adapter over /api/engines
  resolve-inputs.ts        walk edges → typed inputs per node
  use-adv-workspace.ts     persistence (wraps the existing workspace hook)
  use-generation.ts        submit / status / retry / double-submit guard
components/advanced-studio/
  canvas.tsx               ReactFlow host only
  node-shell.tsx           chrome, resizer, handles, context menu
  nodes/*.tsx              bodies (presentation, no handles)
  toolbar.tsx  add-node-menu.tsx  group-node.tsx  context-menu.tsx
app/studio-advanced/…
```

### Storage (per your choice: shared table + discriminator)
- Migration `013_advanced_studio_workspace.sql`: `ALTER TABLE studio_projects ADD COLUMN workspace TEXT NOT NULL DEFAULT 'studio' CHECK (workspace IN ('studio','advanced'))` + index; the `is_default` unique partial index is scoped to `workspace='studio'` so Advanced Studio has no forced default project.
- Every list/get/create/delete query filters by workspace → **existing Studio projects can never appear in Advanced Studio, and vice-versa.**
- Document: `schemaVersion: 2` for advanced docs, with a real `migrateDocument(doc)` ladder (`1→2`, and an unknown-future-version guard that opens read-only rather than silently stripping). Advanced docs get their own sanitizer (`lib/advancedStudioProject.js`) so the existing `sanitizeStudioDocument` is untouched.
- Persisted: `workspace`, `template`, nodes (position, size, per-node config, model selections), groups + membership, typed edges, viewport, generation metadata, asset **references** (`/storage/...` URLs) — never inlined media. Node/edge caps raised for advanced docs; document cap raised to 2 MB (references only, so this is generous).

### Video generation (per your choice: real fal.ai engine)
New `engines/falVideoEngine.js` following `falEngine`'s exact `fal.subscribe` pattern (already a dependency, key already in `settings`/`FAL_KEY`).
- Declares a real capability catalog per model: supported inputs (prompt / start frame / end frame / reference image), durations, aspect ratios, resolutions, sound.
- `lib/storage.js` gains a video output path (`output.mp4`) and `lib/generationRunner` a `mediaKind: 'image' | 'video'` branch; `generations` gains `media_kind` + `advanced_settings` already exists for duration/resolution/sound.
- No key configured → node shows a clear "Add a fal.ai key in Settings" state, not a crash.
- Model menu is generated from `/api/engines` — **nothing from the reference screenshots is hardcoded.**

### Generation flow per node
`resolve inputs → validate required → validate model settings → POST /api/advanced-projects/:id/nodes/:nodeId/run → queued/running/completed/failed → persist asset → update that node only`. Double-submit guarded by an in-flight ref + disabled button + server-side idempotency on `(projectId, nodeId, requestKey)`. A failed node stores its error on the node and is retried alone.

---

## 3. Reuse vs. new

**Reused as-is:** all of `components/ui/*`, `site-nav`, `page-shell`, `lib/api/client|hooks|types`, `lib/utils`, `lib/clipboard-image`, `components/studio/primitives.tsx`, `--pf-*` tokens, `tests/setup.ts` + helpers, vitest/playwright config, `lib/generationRunner`, `lib/generationQueue`, `lib/storage`, `engines/index` registry, `/api/media/preview`, `lib/studioPipeline.buildWaves`, the `expectedRevision` concurrency pattern, the route-test module-stubbing harness.

**Reused with parameterization:** `project-workspace.ts` (API namespace + localStorage key), `studio.css` (extract the shared `.poseforge-*` node/handle/edge/menu layer + `--pf-canvas-*` tokens into `studio-canvas-core.css`, imported by both — **no rule changes to existing selectors**), `StudioNode` shell / `StudioHandle` / `CanvasControls` / lightbox / undo-redo / `nearestOpenPosition` / `arrangeSelectedNodes` (lifted into shared modules by *copy-then-generalize* only where in-place parameterization would risk the existing Studio).

**New:** the two routes + views, project-type selector, node registry + all node definitions, typed-connection system, add-node menu, context menus, group/scene node, storyboard template, capability adapter, `falVideoEngine`, advanced document sanitizer + migration ladder, `routes/advanced-studio-projects.js`, and all new tests.

---

## 4. Phases (checking in between)

**Phase A — foundation & image workflow**
migration 013 + advanced sanitizer/migrations + routes; nav entry + both routes; project gallery + project-type modal (Image / Video / Storyboard / Blank); canvas host, node shell, registry; Text, Image Input, Image Generator nodes; typed handles + validation + drag highlighting; add-node menu (toolbar / right-click / searchable / categories); toolbar (title, save status, add node, zoom, fit, undo/redo, optional minimap); persistence + viewport restore + autosave; unit tests for registry, validation, document round-trip, migration, request construction.

**Phase B — video**
`falVideoEngine` + capability catalog + storage/runner video path; Video Generator node with model-driven handles, duration/aspect/resolution/sound, playback, retry; model-switch coercion tests.

**Phase C — organization & polish**
Group/scene nodes (resize, membership, move-with-children, duplicate, delete-with-confirm), storyboard template on the same node system, copy/paste/duplicate, perf pass (memoized nodes, isolated prompt typing, debounced persistence, lazy video UI, 25-node stress test), a11y pass, e2e specs, screenshots, existing-Studio regression run.

**Gates each phase:** `npm test`, `npm --prefix web run typecheck`, `npm --prefix web run lint`, `npm --prefix web run build`, plus `npm run test:e2e` in Phase C.

---

## 5. Risks / open items

- `sanitizeStudioDocument`'s strip-unknown behavior means the advanced path must use its own sanitizer — the existing one stays byte-identical.
- Extracting shared CSS is the highest-risk step for "don't break Studio"; it is done as a pure move of whole rule blocks with a visual e2e screenshot diff as the check.
- fal video model availability/pricing is not verifiable without a key; the catalog is written so models are declared in one file and easy to correct.
- Minimap: React Flow ships one; included behind a toolbar toggle, off by default.
