# AI infrastructure handoff

Status on 2026-10-31, branch `feat/ai-infrastructure`. Provider details, limits and measured timings are in [README.md](README.md).

## What is done

- Extraction runs on Cloudflare Workers AI with `@cf/google/gemma-4-26b-a4b-it`. It replaces the unverified `gemma-3-27b-it` call.
- Model replies are parsed strictly. Anything off-contract becomes a retryable `SERVICE_UNAVAILABLE`.
- No model configured returns `SERVICE_UNAVAILABLE`, never mock data.
- Uploads are checked from their bytes, and chunked uploads stop at the size limit.
- Registration numbers match exactly. Previously `A11-23456` matched the `A1-123456` fixture.
- CORS is an origin allowlist, not `*`. Each client address gets 20 analyses and 60 lookups a minute.
- Provider errors and model replies stay out of logs and responses.
- The Worker is live at `https://counterfeitiq-api.arifopeandu.workers.dev`, on Arif's Cloudflare account.

The deployed Worker was built before `main` was merged into this branch, so redeploy after this PR merges.

## Secrets

There are none, so nothing needs sharing. `GEMMA_API_KEY` and `GEMMA_API_URL` are gone, because the `AI` binding authenticates through the Cloudflare account. Settings are plain values in `wrangler.jsonc`.

To run the API locally, use `npx wrangler login` with your own Cloudflare account. Free is enough, and calls count against that account's daily allowance. To deploy to the existing Worker, Arif must either run the deploy or add you as a member of his Cloudflare account. Deploying from your own account creates a different URL.

## What is left

| Task | Owner | Note |
|---|---|---|
| Open and review this PR | Arif, then a reviewer | Not opened yet |
| Add the production web origin to `ALLOWED_ORIGINS`, then redeploy | Arif | Needs the Vercel URL. Until then the production site cannot call the API |
| Set `VITE_API_BASE_URL` in Vercel to the Worker URL | Whoever owns the Vercel project | |
| Get NAFDAC's permission for automated access | Not assigned | Blocks live lookups. `robots.txt` does not count as permission |
| Test with real product photos | Not assigned | Smoke tests used generated fictional packs |

## Merging with #10 and #11

This branch and both PRs change `apps/api/src/app.ts`, `apps/api/src/adapters/reference.ts` and `apps/api/src/index.test.ts`. #11 also changes `wrangler.jsonc`, so expect conflicts.

Whichever merges second should keep:

- Exact number matching from `canonicalNafdacNumber`. The Greenbook adapter needs the same rule, not the hyphen-stripping `normalizeNafdacNumber`.
- The `Env` fields and bindings in `wrangler.jsonc`: `AI`, the two limiters, `GEMMA_MODEL` and `ALLOWED_ORIGINS`.
- The provider switch from #11, which renames `REFERENCE_MODE` to `REFERENCE_PROVIDER`. `/api/health` reports `referenceMode` and needs updating to match.

## Known risks

- The model can invent text for a photo it cannot read. It named a real medicine from a blurred image until the prompt forbade it. The prompt reduces this and cannot rule it out.
- Blurry photos returned a 503 before the prompt change, and the cause was not found. Failures now log a reason as `extraction_malformed`.
- Timeouts and provider rate limits were tested with mocks only.
- A 4 MiB upload took up to 23 s against the 30 s timeout.
- Peak CPU was 387 ms, above the 10 ms documented for Workers Free, with no failures so far. The account's plan was not confirmed.
