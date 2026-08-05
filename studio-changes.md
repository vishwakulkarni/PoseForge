# PoseForge Studio Workflow Canvas Plan

## Goal

Turn the existing Studio preview into a focused, visual PoseForge generation
workspace. The canvas should explain and control the product's core workflow:

```text
[Character 1] + [Character 2] + [Pose reference] = [Generated result]
```

This is not a general-purpose photo editor. The first release keeps the
existing PoseForge generation workflow and presents it as an interactive,
pan-and-zoom canvas.

## Approved scope

- The workspace is ephemeral. Leaving or refreshing Studio clears its canvas
  arrangement and selections.
- Generated records and images continue to appear in the existing History;
  only the temporary canvas arrangement is discarded.
- Support the existing one-to-four ordered character inputs and exactly one
  pose input.
- Preserve Normal and Advanced modes, presets, recipes, creative direction,
  pose collages, engine selection, variant count, readiness checks, usage
  estimates, and generation polling.
- Do not add project persistence, text tools, cropping, filters, layers,
  background removal, outpainting, or other general photo-editing features.

## Studio layout

- Keep a compact PoseForge Studio header.
- Keep the source panel for saved characters, character uploads, and pose
  selection. The panel can be resized within safe bounds or collapsed.
- Replace the static composition preview with the workflow canvas.
- Keep the Direction inspector for Normal and Advanced controls. It can be
  resized independently within safe bounds or collapsed. Keep it open by
  default so generation direction remains immediately available.
- Keep the generation dock for engine selection, readiness, usage, status, and
  the primary Generate action.
- The canvas remains fixed inside the workbench. Wheel and pointer gestures
  manipulate the canvas instead of scrolling the page.

## Visual workflow

### Inputs

- Selecting a saved character or uploading a character photo immediately adds
  a subject card to the canvas.
- Populated inputs show only the uncropped photo and its label; do not wrap the
  photo in a decorative card or box.
- Subject cards use the same left-to-right Person 1-4 order sent to the API.
- Selecting a pose upload or library pose adds a distinct pose-reference card.
- A plus symbol appears between every populated input.
- Empty required inputs are represented by helpful dashed placeholders rather
  than hidden validation rules.

### Output

- An equals symbol separates the inputs from the output region.
- Dashed connectors visually lead from the input group to the output region.
- Before submission, the output is a dashed `Result will appear here` box.
- A queued or running generation reuses that box for status and progress.
- A completed image fills the output card without changing the input layout.
- Multiple variants appear together after the equals sign and remain selectable.
- Failed variants remain visible with their failure state; the existing retry
  or regenerate action remains available.

### Synchronization

- Source-panel selection is the authoritative way to assign a saved character,
  uploaded identity, or pose.
- Canvas card order always mirrors the reducer's character-slot order.
- Removing or replacing a source updates both the canvas and generation form.
- Selecting a generated variant updates the active result shown on the canvas.
- Existing API validation remains authoritative.

## Canvas interaction

The focused workflow contains only a small number of semantic cards, so the
first version should use an accessible React/DOM world layer rather than add a
WebGL dependency intended for a full image editor.

- Drag an empty canvas area to pan.
- Use the mouse wheel or trackpad to zoom around the pointer.
- Support touch panning and pinch-to-zoom where practical.
- Fit the complete workflow from the existing Fit canvas action.
- Allow close photo inspection up to 800% zoom while retaining a safe minimum
  for fitting the complete workflow.
- Preserve usable card and control semantics for keyboard and screen-reader
  users.
- Do not persist the camera or layout after navigation or refresh.

## State architecture

Keep two responsibilities distinct:

1. The existing Studio reducer owns generation inputs, settings, validation,
   multipart serialization, active generation IDs, and selected variant.
2. A local canvas controller owns only the ephemeral camera and interaction
   state.

Derived canvas nodes should be rendered from the reducer and polled generation
records. This avoids a second source of truth for subjects, pose, or results.

Undo and redo, when added, should operate on source selection and temporary
canvas interaction commands. They must not delete persisted generation history.

## Generation lifecycle

1. User selects one to four subjects; cards appear immediately.
2. User selects a pose; it appears as the final input.
3. The canvas shows the complete `subjects + pose = result` equation.
4. Existing validation and engine readiness determine whether Generate is
   enabled.
5. Submission continues through `POST /api/generations`.
6. Existing polling updates output placeholders from pending to running,
   completed, or failed.
7. Completed variants populate the output area and remain available in History.

## Implementation phases

### Phase 1: Visual workflow foundation

- Replace the current artboard composition with subject, pose, operator, and
  result cards.
- Add plus and equals operators, dashed connectors, empty placeholders, and
  queued/running/completed/failed output states.
- Preserve the current Normal/Advanced controls and generation API behavior.

### Phase 2: Canvas navigation

- Add pan, pointer-centered zoom, touch behavior, reset, and fit-to-workflow.
- Prevent canvas gestures from scrolling the surrounding page.
- Add keyboard-accessible equivalents for fit and zoom.

### Phase 3: Workflow refinements

- Add clearer selected-card focus and source-panel synchronization.
- Add safe source removal/replacement actions.
- Add ephemeral undo/redo for supported source and canvas actions.
- Add a navigation warning when the current workspace contains unsaved
  selections; this warning does not imply persistence.

### Phase 4: Quality and rollout

- Add reducer/component tests for one and multiple subjects, pose assignment,
  variants, failures, and generation transitions.
- Add Playwright coverage for the complete select-to-result flow.
- Verify responsive layout, touch interaction, keyboard navigation, reduced
  motion, and screen-reader labels.

## Acceptance criteria for the first working slice

- A selected or uploaded character appears on the canvas without generating.
- Every additional character is shown in API order with a plus between inputs.
- The selected pose appears as an explicit input in the equation.
- An equals sign and dashed visual path separate inputs from output.
- The result area visibly represents empty, queued/running, failed, and
  completed states.
- Existing generation requests, variants, settings, history, and tests continue
  to work.
- Refreshing or leaving Studio does not restore the temporary workspace.
