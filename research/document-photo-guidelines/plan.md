# Document photo guideline research plan

Date: 2026-08-03 (America/Los_Angeles)

## Decision

Define safe, dated PoseForge presets for U.S. passport and visa photos, Indian passport and visa/e-Visa photos, and India OCI application photos without presenting generated output as guaranteed-compliant.

## Falsifiable hypotheses

1. U.S. passport and U.S. visa photo geometry can share a 2 × 2 inch / 600 × 600 pixel output profile, although their official source pages and application workflows differ.
2. India passport and OCI applications require a square photograph, while India e-Visa uses a square upload with explicit pixel/file constraints.
3. Official pages do not consistently expose a reliable “last updated” date, so PoseForge must distinguish the source page's published update date from PoseForge's own “information retrieved” date.

## Sources and stop criteria

- Prefer official government domains and application portals.
- Store exact URLs, retrieved dates, and short verbatim evidence in one file per source.
- Flag conflicts instead of silently normalizing them.
- Stop when every supported document preset has an official source, dimensions/background/head guidance, and an honest date label.

## Risks

- Consular pages can conflict with central portals or describe paper versus online applications differently.
- Government pages may change without an explicit page-update timestamp.
- AI-generated or digitally altered photographs may be rejected even when dimensions are correct.
