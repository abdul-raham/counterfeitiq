# Teammate (`hareef2107`) — Cloudflare, Gemma and Greenbook

You own `feat/ai-infrastructure`. Read `01_SHARED_RULES.md` and `06_CONTRACTS.md`. Build independently and export modules for the other developer's orchestrator. Do not overwrite `apps/web/**`, `apps/api/src/services/**`, or `apps/api/src/routes/analyze.ts`.

## Phase 0 — Cloudflare infrastructure
After shared foundation lands on main, create branch `feat/ai-infrastructure`. Initialize TypeScript Cloudflare Worker under `apps/api`, Wrangler config and `GET /api/health`. Configure CORS, image size/MIME checks, bounded timeouts, structured errors and rate limiting where available. Set secrets using Cloudflare secret management, never in repo. Test `wrangler dev`, then deploy Worker. Confirm model availability, exact open-weight Gemma model ID, **vision/image support**, request shape and quota before committing to a provider. If Workers AI model not supported, use a verified alternative hosted Gemma provider with server-side secrets, preserving open-weight model requirement.

## Phase 1 — Gemma extraction
Implement `extractProduct(image: Blob): Promise<ExtractedProduct>` or equivalent Worker-compatible signature. Extract product category, product name, brand, manufacturer, NAFDAC registration number, ingredients, strength, batch number, manufacturing date, printed expiry. Use strict prompt, JSON parse/schema validation, null for missing/unreadable values, model error handling, retry only when safe. Do not infer product details absent from image. Test medicine, blurry image, and non-medicine.

## Phase 2 — NAFDAC Greenbook adapter
Source: https://greenbook.nafdac.gov.ng/ . Earlier browser HAR observation: server-side DataTables-style GET to site root, with query parameters including `draw=2`, `start=0`, `length=10`, `columns[5][search][value]=A6-100103`. JSON response shape: `{draw, recordsTotal, recordsFiltered, data:[...]}`; observed fields include `product_name`, `NAFDAC`, `strength`, approval and registration expiry. **This is an observed browser interface, not a documented/authorized public third-party API.** Confirm access permission before automated live requests; otherwise use local sample fixture with `source: DEMO_FIXTURE`. Do not bypass CAPTCHA or access restrictions.

Implement `lookupMedicine(nafdacNumber): Promise<ReferenceLookupResult>` with normalization, exact registration-number match (never trust partial DataTables results), field mapping, `FOUND`, `NOT_FOUND`, `SOURCE_UNAVAILABLE`, source provenance and timestamp. Confirm actual field names against response; never invent manufacturer/ingredients. Sample test number `A6-100103` (recombinant hepatitis B vaccine from earlier research) can be used for authorized lookup/fixture tests; label source accurately. Avoid storing raw user images or credentials.

## Phase 3 — Integration interface
Export both functions. Supply typed sample success, no-match and unavailable responses. Do not implement comparison engine or final `/api/analyze` route; other developer owns orchestration. Agree with `packages/shared/schemas.ts` and report contract discrepancies before changes.

## Phase 4 — Tests and deployment
Test clear/blurry/invalid images, missing number, non-medicine, invalid number, source failure, exact match, malformed JSON, model timeout, quota, large upload, CORS. Deploy Worker and share verified URL and environment variable names. Add setup README and `.env.example` placeholders, never real secrets. Open PR `feat/ai-infrastructure` → main for independent Codex/Antigravity review. Human approves merge.
