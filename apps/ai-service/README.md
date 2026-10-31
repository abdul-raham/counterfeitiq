# CounterfeitIQ AI service

A standalone Cloudflare Worker that reads medicine packaging with Gemma, finds candidate reference records and compares the two. Only the CounterfeitIQ backend calls it.

It supports the pack-code authentication flow and does not replace it. It issues no codes, and it cannot show that a physical medicine is genuine or counterfeit. Every comparison returns `physicalAuthenticityConfirmed: false`.

## Audit of the existing AI code

Audited `counterfeitiq/main` at `fdaa256`.

| Existing code | Finding | Decision |
|---|---|---|
| `apps/api/src/ai/extraction.ts` | Real Gemma on Workers AI with strict hand-written parsing. No evidence or legibility per field | Reuse `detectImageType` and the request format. New prompt and schema here |
| `apps/api/src/adapters/greenbook.ts` | Rate-limited, cached, fails closed, exact-number matching only | Reuse unchanged through `createReferenceAdapter` |
| `apps/api/src/adapters/reference.ts` | One fixture, private to the module | Keep. This service has its own `DEMO-` fixtures so matching can be shown |
| `apps/api/src/services/compare.ts` | `normalizeNafdacNumber` drops hyphens, so `A11-23456` equals `A1-123456` | Reuse with a correction here. `/api/analyze` is safe because its lookup is exact, but `/compare-packaging` accepts a selected candidate |
| `compare.ts` strength and manufacturer checks | `125 mg/5 ml` against `25 mg/ml`, reordered combinations and partial company names give false mismatches | Stricter comparisons in `src/normalize.ts`. Unclear values are `UNKNOWN` |
| `services/expiry.ts`, `services/normalize.ts` | Sound, and package and registration expiry are already separate | Reuse |
| `ai-worker` in the old `counterfeit_ai` repo | Superseded and not deployed. Allows 5 MiB | Not used |
| Pack-code authentication | Not on `main` | No dependency. This service neither reads nor writes authentication events |

The smallest reliable migration was a new Worker that imports these modules. `apps/api` and `packages/shared` are unchanged, so `/api/analyze` cannot regress.

## Provider

| | |
|---|---|
| Provider | Cloudflare Workers AI, through the `AI` binding. The Worker orchestrates and Cloudflare runs the model |
| Model ID | `@cf/google/gemma-4-26b-a4b-it` |
| Pricing | $0.10 per million input tokens, $0.30 per million output tokens ([model page](https://developers.cloudflare.com/workers-ai/models/gemma-4-26b-a4b-it/), checked 2026-10-31) |
| Context | 256,000 tokens |
| License | Apache 2.0 ([Gemma 4 license](https://ai.google.dev/gemma/apache_2)) |
| Credentials | None in code. The binding authenticates through the Cloudflare account |

[Gemma's Terms of Use](https://ai.google.dev/gemma/terms) say they do not cover Gemma 4. The [Prohibited Use Policy](https://ai.google.dev/gemma/prohibited_use_policy) names no version, so it is unclear whether it binds Gemma 4 users. Follow it anyway: it restricts automated healthcare decisions and misleading health claims. This is not legal advice.

Add another provider by implementing `VisionProvider` in `src/provider.ts`.

## Endpoints

Every `POST` needs `Authorization: Bearer <AI_SERVICE_TOKEN>`. There are no CORS headers, because browsers must not call this service.

| Route | Input | Output |
|---|---|---|
| `GET /health` | None | Configuration status, no secrets |
| `POST /extract` | Multipart field `image`: JPEG, PNG or WebP, at most 4 MiB, checked from its bytes | `{ extraction, inference, notice }` |
| `POST /match-product` | `{ extraction }` | `{ outcome, candidates, explanation, provenance, notice }` |
| `POST /compare-packaging` | `{ extraction, selectedNafdacNumber? }` | `{ status, findings, packagingNotes, provenance, physicalAuthenticityConfirmed, notice }` |

Schemas are in `src/contract.ts`. Errors have the shared shape `{ error: { code, message, retryable } }`, with two additions here: `UNAUTHORIZED` and `INVALID_REQUEST`.

| Status | Code | Retry |
|---|---|---|
| 400 | `INVALID_REQUEST` | No |
| 401 | `UNAUTHORIZED` | No |
| 413 | `FILE_TOO_LARGE` | No |
| 415 | `INVALID_FILE_TYPE` | No |
| 422 | `UNREADABLE_IMAGE` | No |
| 429 | `RATE_LIMITED` | Yes, after `Retry-After` |
| 503 | `SERVICE_UNAVAILABLE` | When `retryable` is true |
| 504 | `MODEL_TIMEOUT` | Yes |

### Examples

These are from a real Gemma run on `samples/demo-cases/mismatched-strength.png`, shortened.

```bash
curl -X POST "$AI_SERVICE_URL/extract" \
  -H "Authorization: Bearer $AI_SERVICE_TOKEN" \
  -F "image=@samples/demo-cases/mismatched-strength.png;type=image/png"
```

```json
{
  "extraction": {
    "category": "medicine",
    "imageQuality": "GOOD",
    "fields": {
      "productName": { "value": "DEMOZOL", "evidence": "DEMOZOL", "legibility": "CLEAR" },
      "nafdacNumber": { "value": "DEMO-0101", "evidence": "NAFDAC Reg. No: DEMO-0101", "legibility": "CLEAR" },
      "strength": { "value": "250 mg", "evidence": "250 mg", "legibility": "CLEAR" },
      "gtin": { "value": null, "evidence": null, "legibility": "NOT_VISIBLE" }
    },
    "activeIngredients": ["Demozolamine 250 mg"],
    "otherClaims": ["Each dose contains: Demozolamine 250 mg"],
    "missingFields": ["gtin"],
    "uncertainFields": []
  },
  "inference": { "provider": "cloudflare-workers-ai", "model": "@cf/google/gemma-4-26b-a4b-it", "latencyMs": 9711 }
}
```

```bash
curl -X POST "$AI_SERVICE_URL/compare-packaging" \
  -H "Authorization: Bearer $AI_SERVICE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"extraction": <the extraction above>}'
```

```json
{
  "status": "DETAILS_MISMATCH",
  "findings": [
    { "code": "NAFDACNUMBER_MATCH", "field": "nafdacNumber", "status": "MATCH", "severity": "INFO" },
    {
      "code": "STRENGTH_MISMATCH", "field": "strength", "status": "MISMATCH", "severity": "HIGH",
      "packagingValue": "250 mg", "referenceValue": "500 mg",
      "explanation": "Strength differs from the available reference value."
    }
  ],
  "packagingNotes": [],
  "provenance": {
    "category": "DEMO_FIXTURE", "isDemo": true, "officialIntegration": false,
    "requestedAt": "2026-10-31T13:09:33.454Z", "retrievedAt": "2026-10-31T00:00:00.000Z",
    "sourceUrl": null, "note": "Fictional demo fixture. Not a NAFDAC record."
  },
  "physicalAuthenticityConfirmed": false
}
```

## How results are decided

**Extraction.** The reply must be one JSON object that passes the strict schema. Anything else is a retryable `SERVICE_UNAVAILABLE`, and the reply is never logged. The only tolerance is a bare `null` for an unprinted field, which real Gemma replies contain. After validation, deterministic checks apply:

- `UNREADABLE` image: every value is removed, even if the model supplied some.
- `POOR` image, or a value that is not in its own evidence: `UNCERTAIN`.
- Uncertain or invalid registration number: the value is withheld and the evidence kept, so it is never looked up.
- A date that is not ISO: kept as evidence only, and `/compare-packaging` asks for it to be inspected.
- A barcode with a bad check digit: `UNCERTAIN`.

Legibility is categorical because a model's own percentages are not calibrated.

**Matching.** A registration number must match exactly. With no number, a source that supports it is searched by name, and strength narrows the results. Several records that fit stay `MULTIPLE_CANDIDATES`, and none is chosen. Candidates are lists of matched, conflicting and unknown fields, with no invented score.

**Comparison.** No model runs here. The service looks up the reference itself, so a caller cannot supply a record or its provenance. A difference in a hard-to-read value is `*_NEEDS_CLEARER_PHOTO`, not a mismatch.

A registration record describes a product. It is never a batch or pack record, and batch numbers are not compared. Medicine expiry (`PACKAGE_EXPIRED`) and registration expiry (`REGISTRATION_EXPIRED`) are separate notes. Nothing here is an authentication-code event.

## Reference sources

Set by `REFERENCE_MODE`. Without a value it is `demo`, and an unknown value fails closed.

| Category | When |
|---|---|
| `DEMO_FIXTURE` | `REFERENCE_MODE=demo`. Fictional `DEMO-` records. A miss is `SOURCE_UNAVAILABLE`, never `NOT_FOUND` |
| `LIVE_REGULATORY_REFERENCE` | `REFERENCE_MODE=authorized_live` and a complete Greenbook answer. Experimental: NAFDAC has not authorized it, and `officialIntegration` is always `false` |
| `SOURCE_UNAVAILABLE` | A live lookup failed. Fixtures are never used instead |
| `NO_SOURCE` | No lookup ran: no number, no access basis, a held-back request, or a name search on the Greenbook |
| `AUTHORIZED_REFERENCE_SNAPSHOT` | Reserved. No such snapshot exists |

Read [docs/greenbook-access.md](../../docs/greenbook-access.md) before using live mode. The Greenbook is searched only by exact number, because that is the only request observed so far and the project's rule. No request was sent to NAFDAC while building this service, and the tests mock it.

The Worker uses the same `GREENBOOK_LIMITER` namespace as `apps/api`, so both share one budget per Cloudflare location. Cloudflare does not guarantee a strict combined limit, and each Worker keeps its own per-isolate cache and limit.

## Limits

| | |
|---|---|
| Image | 4 MiB, the shared `MAX_IMAGE_BYTES` |
| JSON body | 64 KiB |
| Model timeout | 30 s, then `MODEL_TIMEOUT`. The provider call is not cancelled, so it is not retried |
| Retries | One, after 500 ms, for provider faults only. Rate limits and malformed replies are not retried |
| `/extract` | 20 a minute |
| `/match-product`, `/compare-packaging` | 60 a minute combined |

## Measured latency

Measured on 2026-10-31 through `wrangler dev` with the remote AI binding, from a home connection. These are six fictional 900x640 PNGs, not photographs, and not a deployed Worker.

| Case | Model time |
|---|---|
| Clean | 4.0 s, then 7.3 s |
| Blurry | 3.2 s |
| Missing registration number | 7.4 s |
| Mismatched strength | 9.7 s, then 11.9 s |
| Multiple candidates | 8.6 s |
| Reference unavailable | 5.0 s |

## Configuration

| Name | Type | Value |
|---|---|---|
| `AI` | Binding | Workers AI |
| `AI_SERVICE_TOKEN` | Secret | Long random value shared with the backend. Without it every `POST` returns 503 |
| `GEMMA_MODEL` | Variable | `@cf/google/gemma-4-26b-a4b-it` |
| `REFERENCE_MODE` | Variable | `demo` or `authorized_live` |
| `GREENBOOK_ACCESS_BASIS` | Variable | The basis for live requests. Empty sends nothing |
| `EXTRACT_LIMITER`, `REFERENCE_LIMITER`, `GREENBOOK_LIMITER` | Bindings | See `wrangler.jsonc` |

```bash
npm test --workspace @counterfeitiq/ai-service   # no quota, no network

# Real model, spends Neurons
cd apps/ai-service
npx wrangler dev --port 8788 --var AI_SERVICE_TOKEN:local-only
AI_SERVICE_TOKEN=local-only npm run demo

# Only the owner of the Cloudflare account can deploy
npx wrangler secret put AI_SERVICE_TOKEN
npx wrangler deploy
```

This Worker has not been deployed.

## Integrating from the backend

1. Keep `AI_SERVICE_TOKEN` and the service URL in the backend's secrets, never in the web app.
2. Send the upload to `/extract`, then pass `extraction` unchanged to the other two routes. Use a 35 s client timeout on `/extract` and 15 s on the others.
3. Call `/match-product` first. Pass `selectedNafdacNumber` to `/compare-packaging` only when a person chose a candidate.
4. Show `provenance` with every result, and label `isDemo` results as demonstration data.
5. Keep these results apart from verification events. A discrepancy here is not a code-reuse signal, and neither result changes the other.
6. Show `RECORD_NOT_FOUND`, `NO_CANDIDATES`, `SOURCE_UNAVAILABLE` and `NO_SOURCE` as not confirmed, never as counterfeit.

The types are in `src/contract.ts`. Move them to `packages/shared` through a contract PR once the backend adopts them.

## Known limitations

- Gemma can invent text. The prompt and checks reduce this but cannot rule it out, so a person must be able to check any discrepancy against the pack. Only clean rendered fixtures have been tested, not phone photos of real packs.
- Live mode cannot suggest candidates without a registration number.
- Live records have `manufacturer: null`, so the manufacturer stays `UNKNOWN` on live results.
- A printed ingredient with a dose, such as `Demozolamine 500 mg`, does not equal `Demozolamine`, so ingredients usually stay `UNKNOWN`.
- Bearer tokens have no per-caller identity. Rotate the secret on both sides together.
- The cross-app imports of `apps/api/src` would be better as a shared package, once the shared-contract owner agrees.
