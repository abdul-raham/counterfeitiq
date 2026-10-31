# CounterfeitIQ API

Cloudflare Worker behind the web app. It reads packaging photos with Gemma and, for medicines, looks up the registration number.

Deployed at `https://counterfeitiq-api.arifopeandu.workers.dev`.

| Route | Purpose |
|---|---|
| `GET /api/health` | Status, `visionConfigured`, `referenceMode` |
| `POST /api/analyze` | Multipart field `image`; returns `AnalysisResponse` |
| `GET /api/reference/:number` | Manual lookup; returns `ReferenceLookupResult` |

## Vision provider

| | |
|---|---|
| Provider | Cloudflare Workers AI, through the `AI` binding |
| Model ID | `@cf/google/gemma-4-26b-a4b-it` |
| Image input | Cloudflare lists Vision: Yes. The [input schema](https://developers.cloudflare.com/workers-ai/models/gemma-4-26b-a4b-it/sync-input.json) defines an `image_url` content part |
| Request format | One user message with a `text` part and an `image_url` part holding a base64 data URI, `max_tokens: 1000`, `temperature: 0`, `chat_template_kwargs.enable_thinking: false` |
| Image limit | Cloudflare publishes none. The Worker enforces 4 MiB, JPEG, PNG or WebP, checked from the file's bytes |
| Quota | 10,000 free Neurons a day, reset at 00:00 UTC. A call used about 7 to 8 Neurons, so roughly 1,250 calls a day. Over the free allowance on the Free plan: 429, code 3036 |
| Rate limit | 300 requests a minute for text generation. No Gemma-specific override is listed. The Worker also limits each client address to 20 analyses and 60 lookups a minute |
| Timeout | Cloudflare publishes no inference timeout. The Worker stops waiting after 30 s and returns `MODEL_TIMEOUT`; the provider call is not cancelled |

The data-URI format is not stated in Cloudflare's docs. It is proven by the smoke test below.

Measured on the deployed Worker on 2026-10-31:

| Input | Time | Result |
|---|---|---|
| 69 KB JPEG | 3.8 to 4.0 s | Number read correctly |
| 28 KB PNG | 3.3 to 3.7 s | Number read correctly |
| 930 KB PNG, 1700x1105 | 5.2 to 5.9 s | Number read correctly |
| 4 MiB JPEG (small image with padding) | 11.8 to 23.2 s | Number read correctly |

Those times include upload. The 4 MiB case came within 7 s of the timeout on a home connection, so the web app should keep compressing photos before upload. Peak Worker CPU was 387 ms with no failures, above the 10 ms documented for Workers Free, so watch for error 1102 on real traffic. Test images were generated fictional packs, not photos of real products.

## Behaviour without a source

- No `AI` binding or `GEMMA_MODEL`: `SERVICE_UNAVAILABLE`, never mock extraction.
- Model reply that is not exactly the contract JSON: `SERVICE_UNAVAILABLE`, `retryable: true`. Only the reason is logged, never the reply.
- `REFERENCE_MODE=demo`: fictional fixtures only, labelled `DEMO_FIXTURE` and `authoritative: false`.
- Fixture miss: `SOURCE_UNAVAILABLE`, never `NOT_FOUND`. `NOT_FOUND` is reserved for a real live lookup.
- `REFERENCE_MODE=authorized_live` with `GREENBOOK_ACCESS_BASIS` set: experimental, low-volume lookups against NAFDAC's public Greenbook, not endorsed by NAFDAC. See [docs/greenbook-access.md](../../docs/greenbook-access.md). Without the basis, nothing is sent. Failures return `SOURCE_UNAVAILABLE`, never fixtures.

Registration numbers match exactly: letter case, a label and dash style are ignored, but hyphen position counts, so `A11-23456` is not `A1-123456`.

The model can invent text for a photo it cannot read. In testing it named a real medicine from a blurred image until the prompt forbade it. The prompt reduces this and cannot rule it out, so a verdict must rest on the comparison, not on extracted text alone.

## Configuration

There are no real secrets: the `AI` binding authenticates through the Cloudflare account. Worker settings still live outside the code, in `apps/api/.env`, which Git ignores. Copy [.env.example](.env.example) to `.env` and fill it in.

`npm run deploy` uploads that file with `wrangler deploy --secrets-file .env`. A plain `wrangler deploy` keeps the values already uploaded, so a changed `.env` only takes effect through `npm run deploy`. Bindings and rate limits stay in `wrangler.jsonc`, because Cloudflare reads them only from there.

| Name | Type | Value |
|---|---|---|
| `AI` | Binding | Workers AI |
| `ANALYZE_LIMITER` | Binding | 20 per minute per client address |
| `REFERENCE_LIMITER` | Binding | 60 per minute per client address |
| `ENVIRONMENT` | `.env` | `production` |
| `GEMMA_MODEL` | `.env` | `@cf/google/gemma-4-26b-a4b-it` |
| `REFERENCE_MODE` | `.env` | `demo` or `authorized_live` |
| `GREENBOOK_LIMITER` | Binding | 10 Greenbook requests per minute |
| `GREENBOOK_ACCESS_BASIS` | `.env` | Why live requests are made; empty sends nothing |
| `ALLOWED_ORIGINS` | `.env` | Comma-separated exact origins; must include the production web origin |

The web app needs `VITE_API_BASE_URL` set to the Worker URL.

Rate limits are approximate and counted per Cloudflare location, so a short burst can pass slightly over the limit. Mobile networks can share an address, so raise the limits if real users see 429s.

## Commands

```bash
npm test --workspace @counterfeitiq/api
npm run dev --workspace @counterfeitiq/api
cd apps/api && npx wrangler login && npm run deploy
```

Tests need no quota. `wrangler dev` calls the real model, because the AI binding is remote.
