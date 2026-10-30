# Codex — Project Foundation + Verification Backend

You are the principal backend engineer and technical lead for CounterfeitIQ. Read `01_SHARED_RULES.md`, `06_CONTRACTS.md`, and `07_GIT_WORKFLOW.md` before coding.

## Ownership
Branch `feat/product-backend`. Own `apps/api/src/routes/analyze.ts`, `apps/api/src/services/**`, backend tests, and initial repository foundation. Do not modify teammate-owned `apps/api/src/ai/**`, `apps/api/src/adapters/**`, Worker entrypoint or Wrangler configuration.

## Phase 0 — Complete major setup first
1. Check authenticated GitHub account and whether `counterfeitiq` repo exists; do not duplicate. Create **public** repo `counterfeitiq` under correct account, with MIT license and README. Invite **`hareef2107`** with Write access; report invitation pending vs accepted accurately.
2. Initialize npm-workspaces monorepo with `apps/web`, `apps/api`, `packages/shared`, `samples/demo-cases`. Create root scripts `dev:web`, `dev:api`, `build`, `test`, `typecheck`, `lint`; make them functional for present modules. Add `.gitignore`, `.env.example`, README and CI.
3. Create and commit stable shared types/schema to `main` **before** feature branches. Align on `06_CONTRACTS.md`. Establish branches `feat/product-backend`, `feat/product-frontend`, `feat/ai-infrastructure` from same commit. Use PR reviews; keep `main` stable.
4. Connect GitHub repo to Vercel and deploy initial React/Vite frontend. Set Vercel root `apps/web`, correct workspace-aware install/build, output `dist`, production branch `main`, preview deploys where available, SPA fallback and `VITE_API_BASE_URL` placeholder. Verify initial URL and nested route refresh. If account permission is required, ask for it and continue other setup.
5. Set GitHub Actions to install, lint, typecheck, test, build. Never claim a setup action succeeded without checking.
6. Coordinate with teammate so he initializes Cloudflare Worker and owns provider secrets.

## Phase 1 — Verification engine
Implement pure TypeScript functions `normalizeProductName`, `normalizeNafdacNumber`, `normalizeManufacturer`, `normalizeStrength`, `compareProduct`, `assessPackageExpiry`, `assessRegistrationExpiry`, `buildFindings`, `buildInvestigation`.

Compare NAFDAC number, medicine name, manufacturer, strength and reliable ingredients. Handle case/whitespace normalization without erasing meaningful dosage differences. Return field-level matched/mismatched/unknown evidence, provenance and explanations. Do not equate a missing field with a mismatch. Handle month-only expiry conservatively and distinguish package vs registration dates.

Use statuses: `REGISTRATION_DETAILS_MATCH`, `DETAILS_MISMATCH`, `RECORD_NOT_FOUND`, `INSUFFICIENT_EVIDENCE`, `REFERENCE_UNAVAILABLE`. Add a separate `UNSUPPORTED_CATEGORY` capability indication for non-medicine scans; do not claim Greenbook checks non-medicines. No unsupported fake/genuine verdicts or authenticity percentages.

## Phase 2 — Orchestration
Build a Cloudflare Worker-compatible `POST /api/analyze` route module and manual registration lookup route. Inject `extractProduct(image)` and `lookupMedicine(number)` as dependencies. Validate input, extract, determine category, lookup medicines only, compare, assess expiry, build evidence report. Implement typed mocks for independent development. Do not create a second Worker entrypoint.

## Phase 3 — Tests
Use Vitest for normalizations, name/manufacturer/strength mismatches, null fields, invalid dates, package vs registration expiry, missing number, no match, source down, fixture provenance, non-medicine, malformed model output, oversized/wrong file, error handling. Add API tests. Run lint/typecheck/test/build and report exact results.

## Phase 4 — Independent review
Review teammate's AI/Greenbook PR: exact match, JSON parsing, permissions, model support, provenance, quotas, secrets, CORS and failure states. Review Claude's frontend PR for actual functionality, accessibility and API compatibility. Provide actionable review findings; do not self-approve.

## Phase 5 — Handover
Open `feat/product-backend` PR. Report changed files, tests, commit, PR, dependencies. Human approval required before merge.
