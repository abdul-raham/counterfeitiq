# Notes for Claude

CounterfeitIQ reads a product photo and compares what it finds with the NAFDAC Greenbook. It is an npm workspace: `apps/api` (Cloudflare Worker), `apps/web` (React on Vercel) and `packages/shared` (the contract both use).

## Rules that must not be broken

- A registry match never proves a pack is genuine, and missing data never proves it is fake.
- A failed, blocked or timed-out lookup is `SOURCE_UNAVAILABLE`, never `NOT_FOUND`. Only a complete live answer can be `NOT_FOUND`.
- Greenbook matches must be exact on the normalized registration number. Never take the first result.
- Fixture data must stay labelled `DEMO_FIXTURE`. A fixture miss is never `NOT_FOUND`, and real registration numbers do not belong in the fixtures.
- Greenbook gives an applicant, not a manufacturer. Keep `manufacturer` as `null` on live records.
- NAFDAC has not authorized this project. Never call the live lookup authorized, official or endorsed, despite the name `authorized_live`.
- Never bypass a CAPTCHA, login or block. Never commit cookies, tokens or `.dev.vars`.
- Do not put debug fields from Greenbook responses in public examples or logs.

## Before finishing work

Run `npm run lint`, `npm run typecheck`, `npm test` and `npm run build` from the repo root. Tests must mock Greenbook and must not contact NAFDAC.

## Deploying

Only the owner of the Cloudflare account can deploy. Run `npx wrangler deploy` from `apps/api`, then check `/api/health`. Each photo scan uses real Workers AI neurons, so do not run scans casually.

## Key places

- `apps/api/src/adapters/`: the reference adapters and their shared contract
- `apps/api/wrangler.jsonc`: live mode, allowed origins and rate limits
- `apps/api/README.md`: provider, limits and configuration
- `docs/greenbook-access.md`: the access basis, and the draft request to NAFDAC

## Open items (2026-10-31)

- Greenbook's real "not found" response has never been seen. If an unknown number shows "could not be checked", check the parser in `apps/api/src/adapters/greenbook.ts`.
- Inactive registrations return `FOUND` with a note, and the verification engine ignores the note. Fixing this needs a change to the shared contract.
- NAFDAC has not been contacted. Do that before any use beyond the hackathon, and set `REFERENCE_MODE` back to `demo` if access is refused.
