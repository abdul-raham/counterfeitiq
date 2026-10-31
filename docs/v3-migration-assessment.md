# CounterfeitIQ V3 migration assessment and proposed interface

**Status: implemented on `feat/v3-erp-integration`, described in [erp-integration.md](erp-integration.md). There is no separate contract owner, so the choices below were made there. The sections below record the audit and the original plan.**

Audited on 2026-10-31 against `main` at `fdaa256`, open PRs #16, #17 and #18, and the unmerged branch `feat/v2-ai-intelligence` at `9adebe0`.

## Summary

- `main` is a working V1 product: photo extraction, Greenbook lookup and comparison. V3 keeps almost all of it.
- V2 exists only in open PRs and one unmerged branch. No V2 backend, database, sign-in or scratch-code service was ever built, so retiring V2 removes nothing from production.
- PRs #16, #17 and #18 target a design V3 rules out: Supabase, tenants, portals and secret codes. They should not merge as they stand.
- `feat/v2-ai-intelligence` still fits V3 and should be the base for this work.
- `main` has no GTIN parsing, barcode reading, persistent storage or ERP code. Those are all new.

## KEEP, MODIFY, RETIRE, DELETE

### KEEP

| Item | Where | Why |
|---|---|---|
| Greenbook adapter and access rules | `apps/api/src/adapters/` | Fails closed, cached, rate-limited, exact-number only. Stays separate from ERP data |
| `/api/analyze`, `/api/reference/:number`, photo flow | `apps/api`, `apps/web` | The working production path, and the base of optional AI |
| Normalizers, expiry checks, comparison | `apps/api/src/services/` | Reused by V3 comparison |
| Worker security: CORS allowlist, rate limits, bounded uploads, error shape | `apps/api` | No reason to change |
| Standalone AI Worker: extraction, evidence, comparison, provenance, service token | `feat/v2-ai-intelligence` | Matches V3 section 7. Real Gemma inference is proven there |
| Rule that repeat scans are signals, not proof | `docs/v2-architecture-migration.md` | V3 section 8 says the same |

### MODIFY

| Item | Change |
|---|---|
| `apps/ai-service` | Add a comparison against ERP records, alongside the Greenbook. Add the ERP integration layer, or move it to its own workspace if Codex prefers (question 1) |
| `apps/ai-service` provenance | Add `sourceType`, `sourceName`, `retrievalStatus` and `unavailableFields`, which V3 section 6 requires |
| `/api/health` | Report ERP source status |
| `compareProduct` | Fix `normalizeNafdacNumber` dropping hyphens, which equates `A11-23456` with `A1-123456`. Only the AI service corrects this today |
| `MedicineReference` | Add registration status, so a non-active registration reaches the verdict. This is an open item in `CLAUDE.md`, and needs Codex |
| Web scanner | Owned by the frontend. `main` has no barcode reading. PR #18's `QrScanner` reads QR codes only, and its fallback, jsQR, cannot read EAN-13 or GS1 DataMatrix, which pharmaceutical packs use |
| `README.md`, `CLAUDE.md` | Describe the V3 model, and state that the NAFDAC partnership and ERP mandate are proposals |

### RETIRE

These should stay in git history, unmerged. Closing the PRs is Abdulrahman's decision.

| Item | Why | Worth salvaging |
|---|---|---|
| PR #16: auth, tenant, code contracts, `docs/openapi-v2.yaml` | Tenancy, secret codes and Supabase are ruled out | Batch and pack status names, and the `authenticityConfirmed: false` idea |
| PR #17: V2 harness and tests | Tests a service V3 will not build | Its leakage checks and contract-compliance approach |
| PR #18: portals, scratch and code journey | No portal and no scratch codes in V3 | `/scan`, manual entry, the safe QR routing, the product page and three-checks-separate wording |
| Planned Supabase/PostgreSQL | Ruled out | Nothing |

### DELETE

Nothing on `main` needs deleting.

- The old `ai-worker` in `Arif2107/counterfeit_ai` is not deployed and needs no team action.
- `jsqr` should not be added, because PR #18 introduces it for QR only. This is settled when #18 is reworked.
- Delete stale V2 branches only after their PRs are closed.

## Proposed architecture

```text
Consumer scan
  → apps/api                    public route, rate limits, no ERP credentials
  → Identifier resolver         GTIN, GS1 element string, GS1 Digital Link
  → ERP connector               contract below, chosen by GTIN prefix
  → Normalizer                  product, batch, pack
  → Product intelligence response, with provenance

Separate, optional: Greenbook reference and Gemma packaging comparison
```

The simulated provider is a separate Worker, `apps/demo-erp`, with its own token, reached by real HTTP. This means the demo uses the same code path as a real manufacturer API. Service bindings are the likely deployed route, because a Worker calling another Worker's `workers.dev` address on the same account may be blocked. This needs testing.

## Proposed contract

### Identifier resolution

| Scanned input | Parsed as | Identity level |
|---|---|---|
| 8, 12, 13 or 14 digit GTIN with a valid check digit | GTIN | `PRODUCT` |
| GS1 string with `(01)` and `(10)` | GTIN and batch | `BATCH` |
| GS1 string or Digital Link with `(01)` and `(21)` | GTIN and serial | `PACK` |
| Anything else | No lookup | `UNRESOLVED` |

A GTIN alone is always `PRODUCT`. Only a serial number can reach `PACK`.

### Connector

```ts
interface ErpConnector {
  readonly sourceName: string;
  readonly sourceType: 'SIMULATED_ERP' | 'MANUFACTURER_API';
  capabilities(): ErpCapabilities;
  resolveGtin(gtin: string): Promise<SourceResult<ProductIdentity>>;
  getProduct(gtin: string): Promise<SourceResult<ProductIdentity>>;
  getBatch(gtin: string, batchNumber: string): Promise<SourceResult<BatchIdentity>>;
  getPack(gtin: string, serial: string): Promise<SourceResult<PackIdentity>>;
  getSourceStatus(): Promise<SourceStatus>;
}

interface SourceResult<T> {
  status: 'FOUND' | 'NOT_FOUND' | 'UNSUPPORTED' | 'SOURCE_UNAVAILABLE';
  data: T | null;
  provenance: Provenance;
}

interface Provenance {
  sourceType: 'SIMULATED_ERP' | 'MANUFACTURER_API' | 'NAFDAC_PUBLIC_REFERENCE' | 'DEMO_REFERENCE_FIXTURE' | 'NONE';
  sourceName: string;
  retrievalStatus: 'RETRIEVED' | 'NOT_FOUND' | 'UNAVAILABLE' | 'NOT_ATTEMPTED';
  retrievedAt: string | null;
  dataAsOf: string | null;
  isDemo: boolean;
  unavailableFields: string[];
}
```

A connector failure or timeout is `SOURCE_UNAVAILABLE`, never `NOT_FOUND`. An unsupported operation is `UNSUPPORTED`. No code path fills a gap from another source.

### Normalized records

```ts
interface ProductIdentity {
  gtin: string; productName: string; brand: string | null; manufacturer: string | null;
  nafdacNumber: string | null; strength: string | null; dosageForm: string | null;
  ingredients: string[]; category: string | null;
}
interface BatchIdentity {
  gtin: string; batchNumber: string; manufacturingDate: string | null; expiryDate: string | null;
  status: 'ACTIVE' | 'BLOCKED' | 'RECALLED' | 'EXPIRED' | 'UNKNOWN';
}
interface PackIdentity {
  gtin: string; serial: string; batchNumber: string | null;
  status: 'ACTIVE' | 'BLOCKED' | 'UNKNOWN';
}
```

### Service operations

All are service-to-service, with a bearer token.

| Suggested name | Route | Notes |
|---|---|---|
| `resolveIdentifier` | `POST /resolve-identifier` | Returns the identity level and available records |
| `getProduct` | `GET /products/:gtin` | |
| `getBatch` | `GET /products/:gtin/batches/:batch` | |
| `getPack` | `GET /products/:gtin/packs/:serial` | Read-only |
| `getSourceStatus` | `GET /source-status` | Availability and data freshness |
| `extractPackaging` | `POST /extract` | Exists on `feat/v2-ai-intelligence` |
| `comparePackaging` | `POST /compare-packaging` | Exists. Add an ERP record as a comparison source |

The simulated ERP exposes `GET /v1/products/:gtin`, `/v1/products/:gtin/batches/:batch`, `/v1/packs/:gtin/:serial` and `/v1/status`. Those are this project's own demo routes, not any vendor's API.

### Consumer report

The response has no field that says genuine or counterfeit. It keeps `physicalAuthenticityConfirmed: false`, states the identity level, and carries one `provenance` per source. A blocked or recalled batch is reported as what the manufacturer's record says.

For a product-level scan, the response includes no repeat-scan information.

## Fictional demo data

- Three fictional companies, each with several products, batches for selected products, and selected serialized packs.
- Cases: ordinary GTIN only, missing reference data, one recalled batch, and one product with inconsistent packaging details.
- GTINs use the GS1 restricted-circulation prefix range (`200` to `299`), so they should never collide with a real trade item. Check-digits are valid.
- Registration numbers use the `DEMO-` prefix from the AI service fixtures.
- Every record and response is labelled fictional, and live mode can never read this data.

## Scan events

There is no storage on `main`. Options that add no database vendor:

| Option | Assessment |
|---|---|
| One SQLite-backed Durable Object | **Recommended.** Strongly consistent, on the existing Cloudflare account, and removable. Data persists until deleted, so it needs a retention limit |
| Workers KV | Eventually consistent, so counts of repeat scans can be wrong |
| Memory in an isolate | Lost at any time, and differs per location. Acceptable only for tests |

A scan event holds a hashed pack key, a timestamp and a random anonymous device value from the browser, which a person can clear. It holds no raw IP address. The API returns only neutral facts, such as a scan count and first-seen time. No threshold or decision is included, because the rescan policy is undecided.

## Implementation plan, after agreement

1. Rebase `feat/v2-ai-intelligence`, and open or merge it as the base.
2. Build the identifier resolver and connector contract, with tests.
3. Build `apps/demo-erp` with seeded data.
4. Build the HTTP connector, normalizer and service routes.
5. Add scan events, once the storage option is agreed.
6. Add ERP comparison to `/compare-packaging`.
7. Document how a real manufacturer API connects, and open the PR.

Each item in V3 section 10 becomes a test. All ERP tests use a mocked or local provider, and none contacts NAFDAC.

## Choices made

1. The ERP layer lives in `apps/ai-service/src/erp`.
2. `apps/api` exposes `GET /api/scan?identifier=` and `GET /api/source-status`. The identifier is a query value, because GS1 strings contain brackets and slashes.
3. The V3 types stay in `apps/ai-service`, and `packages/shared` is unchanged.
4. Only `POST /resolve-identifier` records a scan event. `getPack` is read-only, so a read has no side effect.

## Decisions for Abdulrahman

1. **Close PRs #16, #17 and #18?** Recommendation: close #16 and #17, and rework #18 for V3.
2. **Merge `feat/v2-ai-intelligence` first?** It has no PR yet. Recommendation: open it as the base for this work.
3. **Accept the Durable Object for scan events?** It is built, with 30-day retention. It is simple to remove.
4. **Keep live Greenbook lookups in production?** V3 says "where permitted", but `main` runs `authorized_live` on an evaluation basis that NAFDAC has not approved, and `docs/greenbook-access.md` says to contact NAFDAC after the hackathon. Recommendation: keep it for the evaluation only, then return to `demo` until NAFDAC replies.
5. **Who deploys?** Two more Workers need the Cloudflare account owner, and a token each.

## Facts to keep accurate in public text

- NAFDAC has not partnered with or authorized CounterfeitIQ.
- Compulsory ERP integration is a proposal, not a regulation.
- No manufacturer API or commercial ERP product is integrated. The simulated provider is not a real one.
