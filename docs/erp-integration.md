# ERP integration

CounterfeitIQ resolves a scanned barcode through a manufacturer's ERP API and returns a product report with its sources.

**Only a simulated ERP is connected.** No real manufacturer, commercial ERP product or NAFDAC system is integrated. The NAFDAC partnership and compulsory ERP integration are proposals, not authorizations or regulations.

## Flow

```text
Scanner → GET /api/scan?identifier=…          apps/api, public, rate limited
        → POST /resolve-identifier            apps/ai-service, service token
        → Identifier parser → ErpConnector → normalized records
        → GET /v1/products/…                  apps/demo-erp, or a manufacturer API
```

Registration data comes from a separate reference source, and each source is listed in the report's `sources`. Gemma is optional and never takes part in a scan.

## What a scan means

| Scanned | Identity level | Scan signal |
|---|---|---|
| GTIN alone | `PRODUCT` | Never. Many packs share a GTIN |
| GTIN and batch | `BATCH` | Never |
| GTIN and serial, in a GS1 string, DataMatrix or Digital Link | `PACK` | Only if the source knows the serial |

A scan signal holds neutral facts: total scans, a lower bound on devices, and first and last seen times. It has no threshold and no verdict, because the rescan policy is undecided. A repeat scan can be a pharmacist, a family member or a copied code, so it needs context.

## Connecting a real manufacturer

Do this only with the manufacturer's written agreement.

**If their API can match this format,** set the variables below. No code changes.

| Route | Answer |
|---|---|
| `GET /v1/status` | `{ available, capabilities: { batches, packs } }` |
| `GET /v1/products/:gtin` | `gtin, description, brand, company, nafdac_reg, strength, form, actives, category` |
| `GET /v1/products/:gtin/batches/:batch` | `gtin, lot_no, mfg_date, exp_date, lot_status` |
| `GET /v1/products/:gtin/packs/:serial` | `gtin, serial, lot_no, pack_state` |

GTINs have 14 digits. Answers are wrapped as `{ as_of, data }`, and a real source must not send `fictional: true`. Use `404` for an unknown record and `501` for an unsupported operation. Anything else counts as `SOURCE_UNAVAILABLE`. Authentication is a bearer token.

**If it cannot,** add a connector that implements `ErpConnector` in `apps/ai-service/src/erp/types.ts`, and map its fields in the way `http-connector.ts` does. Several manufacturers can be connected with `gtinPrefixes`.

Rules for any connector:

- Failures are returned as `SOURCE_UNAVAILABLE`, never thrown and never `NOT_FOUND`.
- Missing values stay `null` and appear in `unavailableFields`. Nothing is filled in from another source.
- A real manufacturer's status words must be mapped deliberately. Unmapped values become `UNKNOWN`.

Then set `ERP_MODE=manufacturer_api`. The connector refuses fictional data in this mode, and refuses unmarked data in `demo` mode.

## Running the demo

```bash
cd apps/demo-erp
npx wrangler dev --port 8789 --var DEMO_ERP_TOKEN:local-erp-token

cd apps/ai-service
npx wrangler dev --port 8788 --inspector-port 9238 --var AI_SERVICE_TOKEN:local-service-token \
  --var ERP_BASE_URL:http://127.0.0.1:8789 --var ERP_API_TOKEN:local-erp-token
AI_SERVICE_TOKEN=local-service-token npm run erp-demo -- 02000000001012

cd apps/api
npx wrangler dev --port 8787 --inspector-port 9237 --var REFERENCE_MODE:demo \
  --var INTELLIGENCE_URL:http://127.0.0.1:8788 --var AI_SERVICE_TOKEN:local-service-token
curl -G http://127.0.0.1:8787/api/scan --data-urlencode "identifier=(01)02000000001012(21)DEMOSN0001"
```

On Windows, check that an old `workerd` process is not still holding a port after stopping `wrangler dev`.

Measured locally on 2026-10-31, over real HTTP between local Workers, a scan took 8 to 42 ms. A deployed Worker will differ. Each `wrangler dev` run has its own scan history.

## Demo data

All fictional, in `apps/demo-erp/src/seed.ts`. GTINs use the GS1 restricted-circulation prefix `200`.

| Case | Identifier |
|---|---|
| Product with batches and packs | `02000000001012` Demozol 500 mg |
| Ordinary GTIN only | Demozol 250 mg, `gtin14('200000000102')` |
| Serialized pack | `(01)02000000001012(21)DEMOSN0001` |
| Recalled batch | `(01)02000000001012(10)DX2042` |
| Blocked batch | Examplin 100 mg, batch `EX5001` |
| Blocked pack | `(01)02000000001012(21)DEMOSN0003` |
| Expired batch | `(01)02000000001012(10)DX1999` |
| Missing reference data | Placebrin Junior, `gtin14('200000000202')` |
| Inconsistent packaging | `samples/demo-cases/mismatched-strength.png` against Demozol 500 mg |
| Unknown product | `gtin14('200000000999')` |

## Configuration

| Worker | Name | Type | Value |
|---|---|---|---|
| `apps/demo-erp` | `DEMO_ERP_TOKEN` | Secret | Long random value |
| `apps/ai-service` | `ERP_MODE` | Variable | `demo` or `manufacturer_api`. Anything else connects nothing |
| `apps/ai-service` | `ERP_BASE_URL` | Variable | The ERP's address |
| `apps/ai-service` | `ERP_API_TOKEN` | Secret | Equal to `DEMO_ERP_TOKEN` in demo mode |
| `apps/ai-service` | `ERP_SOURCE_NAME` | Variable | Optional display name |
| `apps/ai-service` | `SCAN_HISTORY` | Durable Object | Already in `wrangler.jsonc` |
| `apps/api` | `INTELLIGENCE_URL` | Variable | The AI service address |
| `apps/api` | `AI_SERVICE_TOKEN` | Secret | Equal to the AI service's token |

Deploy in this order: `apps/demo-erp`, `apps/ai-service`, `apps/api`. Only the Cloudflare account owner can deploy.

Workers on one account may not be able to reach each other through `workers.dev` addresses. This has not been tested. If it fails, add a service binding as `ERP_SERVICE` in `apps/ai-service`, and call `apps/ai-service` through a binding from `apps/api`, which needs a small code change.

## Scan history

- One Durable Object per pack, so counts are exact.
- It stores a hash of the GTIN and serial, a hash of the browser's random device value, a count and two timestamps.
- It stores no IP address, name or location.
- A pack's history is erased 30 days after its last scan.
- The hashes are unsalted. A serial number is guessable, so a keyed hash should replace this before any real use.
- `distinctDevices` is a lower bound and easy to defeat. It is a signal for the demo, not a control.

## Limitations

- The web app has no barcode scanner on `main`, and it needs EAN-13 and GS1 DataMatrix support. `/api/scan` works, but nothing in the interface calls it yet.
- The public scan has no sign-in, so a person who knows a serial number can scan it and raise its count.
- Only the demo connector has been run. The format above has not been tested with a real ERP.
- Every scan is a live call to the ERP, with no caching.
- Registration lookups for real manufacturers are the existing Greenbook rules, in [greenbook-access.md](greenbook-access.md).
