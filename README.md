# CounterfeitIQ

CounterfeitIQ helps people examine a product before they trust it. Photograph the packaging or enter a NAFDAC number, and it reads the printed details with an open-weight Gemma model, looks up medicines in NAFDAC's public Greenbook, and gives a plain report of what matches, what differs and what is still unknown.

- **Live app:** https://counterfeitiq.vercel.app
- **API:** https://counterfeitiq-api.arifopeandu.workers.dev/api/health
- **License:** MIT

## What it can and cannot tell you

- A registration match does not prove that a physical pack is genuine, because counterfeit packaging can copy real details.
- A missing or unavailable record does not prove that a product is counterfeit.
- CounterfeitIQ never gives an authenticity verdict or score.

## Source disclosure

CounterfeitIQ performs experimental, low-volume, user-triggered lookups against NAFDAC's publicly accessible Greenbook. **NAFDAC has not authorized or endorsed this project.** No CAPTCHA, login or block is bypassed, and any block stops the lookup. The setting name `authorized_live` is historical and does not mean NAFDAC gave permission. The evidence and the draft request to NAFDAC are in [docs/greenbook-access.md](docs/greenbook-access.md).

## How it works

1. The web app (React on Vercel) reduces large photos on the device and uploads one only when the user asks.
2. The API (Cloudflare Worker) checks the file, and Gemma on Workers AI (`@cf/google/gemma-4-26b-a4b-it`) extracts the printed details as strict JSON.
3. For medicines, the Greenbook adapter searches for the number and accepts only an exact match.
4. A deterministic TypeScript engine compares the pack with the record and writes the findings. The model never decides the result.
5. The report shows every value side by side, the source and when it was checked, and separate pack and registration expiry dates.

A failed, blocked or timed-out lookup is reported as "could not be checked", never as "not found".

## Repository

- `apps/web`: frontend
- `apps/api`: Worker API. Provider, limits and configuration are in [apps/api/README.md](apps/api/README.md)
- `packages/shared`: API contract shared by both
- `samples/demo-cases`: fictional, clearly labelled demo inputs

## Run it locally

Requires Node.js 22 or later.

```sh
npm ci
npm run dev:web
```

Set `VITE_API_BASE_URL` to the API address. To run the app without an API, set `VITE_USE_SAMPLE_DATA=true`, which shows fictional data under a permanent banner. `npm run dev:api` needs `npx wrangler login`, and each photo scan uses real Workers AI quota.

Never place provider secrets in `VITE_` variables. There are no accounts, database or stored uploads.

## Checks

```sh
npm run lint
npm run typecheck
npm test
npm run build
```

Tests mock Gemma and the Greenbook, and do not contact NAFDAC.

## Known limitations

- The Greenbook lists an applicant, not always the manufacturer, so the manufacturer is not compared on live records.
- Greenbook coverage is focused on medicines. Other products are read, but no registration check is claimed.
- A pack may word a product name differently from its record, which can show as a difference to check rather than proof of a problem.
- The model can misread a photo. The report shows what it read so people can check it against the pack.
- An inactive registration is flagged from a note on the record, because the shared contract has no status field yet.

## Contributors

- [abdul-raham](https://github.com/abdul-raham): product, integration and frontend
- [Arif2107](https://github.com/Arif2107): Cloudflare Worker, Gemma extraction and Greenbook adapter
