# Notes for Claude

CounterfeitIQ reads a product photo and compares what it finds with the NAFDAC Greenbook. It is an npm workspace: `apps/api` (Cloudflare Worker), `apps/web` (React on Vercel) and `packages/shared` (the contract both use).

## Rules that must not be broken

- A registry match never proves a pack is genuine, and missing data never proves it is fake. The one exception is a CounterfeitIQ QR code (`?qr=1`) that a connected manufacturer's complete answer says it has no record of: the product owner decided this is called fake.
- A failed, blocked or timed-out lookup is `SOURCE_UNAVAILABLE`, never `NOT_FOUND`. Only a complete live answer can be `NOT_FOUND`.
- Greenbook matches must be exact on the normalized registration number. Never take the first result.
- Fixture data must stay labelled `DEMO_FIXTURE`. A fixture miss is never `NOT_FOUND`, and real registration numbers do not belong in the fixtures.
- Keep `manufacturer` as `null` on live records so it is not compared. The product page's manufacturer goes in `listedManufacturer`, for display only.
- NAFDAC has not authorized this project. Never call the live lookup authorized, official or endorsed, despite the name `authorized_live`.
- Never bypass a CAPTCHA, login or block. Never commit cookies, tokens or `.dev.vars`.
- Do not put debug fields from Greenbook responses in public examples or logs.

- A GTIN alone identifies a trade item, never one pack. Only a serial number reaches `PACK`, and only a known pack gets a scan signal.
- ERP failures are `SOURCE_UNAVAILABLE`, never `NOT_FOUND`. Repeat scans are neutral facts, with no verdict or threshold, because the rescan policy is undecided.
- Simulated ERP data stays marked as demo in the API (`isDemo`), and the site says the demonstration is fictional on the home, `/demo` and help pages. It never reaches a live registry. No real manufacturer or NAFDAC partnership exists, so never imply one.

## Before finishing work

Run `npm run lint`, `npm run typecheck`, `npm test` and `npm run build` from the repo root. Tests must mock Greenbook and must not contact NAFDAC.

## Deploying

Only the owner of the Cloudflare account can deploy. Run `npx wrangler deploy` from `apps/api`, then check `/api/health`. Each photo scan uses real Workers AI neurons, so do not run scans casually.

## Key places

- `docs/erp-integration.md`: ERP flow, connecting a manufacturer, and the demo
- `apps/ai-service/src/erp/`: identifier parsing, connectors, scan reports
- `apps/demo-erp/`: the simulated ERP, with fictional seed data
- `apps/api/src/adapters/`: the reference adapters and their shared contract
- `apps/api/wrangler.jsonc`: live mode, allowed origins and rate limits
- `apps/api/README.md`: provider, limits and configuration
- `docs/greenbook-access.md`: the access basis, and the draft request to NAFDAC

## Open items (2026-10-31)

- Greenbook's real "not found" response has never been seen. If an unknown number shows "could not be checked", check the parser in `apps/api/src/adapters/greenbook.ts`.
- Inactive registrations return `FOUND` with a note, and the verification engine ignores the note. Fixing this needs a change to the shared contract.
- NAFDAC has not been contacted. Do that before any use beyond the hackathon, and set `REFERENCE_MODE` back to `demo` if access is refused.
