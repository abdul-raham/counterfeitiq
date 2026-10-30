# CounterfeitIQ

CounterfeitIQ is an evidence-based product investigation tool for an open-source AI hackathon. It reads packaging with a vision-capable open-weight Gemma model and, for medicines, compares extracted claims with an authorized NAFDAC Greenbook lookup or clearly labelled demo fixtures.

Registration details matching does not prove that a physical pack is genuine. Missing or unavailable reference data does not prove a product is counterfeit.

## Workspace

- `apps/web`: React/Vite frontend deployed to Vercel
- `apps/api`: Cloudflare Worker API foundation
- `packages/shared`: frozen cross-team API contracts
- `samples/demo-cases`: fictional, clearly labelled demo inputs

Requires Node.js 22 or later. Install with `npm ci`, then run `npm run dev:web`. Use `.env.example` as the list of public configuration keys; never place provider secrets in `VITE_` variables.

## Checks

```sh
npm run lint
npm run typecheck
npm test
npm run build
```

The MVP has no accounts, database, or persistent image uploads. Live NAFDAC access must be explicitly authorized; otherwise the application must disclose demo-fixture provenance.

