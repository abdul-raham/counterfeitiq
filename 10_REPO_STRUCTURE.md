# Monorepo File Ownership

```text
counterfeitiq/
├── apps/
│   ├── web/                       # Claude
│   │   └── src/
│   │       ├── components/
│   │       ├── features/scanner/
│   │       ├── features/report/
│   │       ├── pages/
│   │       └── lib/
│   └── api/
│       ├── src/
│       │   ├── index.ts           # Teammate: Worker entrypoint
│       │   ├── ai/                # Teammate: Gemma
│       │   ├── adapters/          # Teammate: Greenbook
│       │   ├── routes/analyze.ts  # Codex: API orchestration
│       │   └── services/          # Codex: comparison/risk/report
│       └── wrangler.jsonc         # Teammate
├── packages/shared/schemas.ts    # Freeze on main before branching
├── samples/demo-cases/
├── .github/workflows/             # Codex: CI
├── .env.example
├── README.md
├── LICENSE
└── package.json
```

## Environment example
Frontend `VITE_API_BASE_URL` and `VITE_APP_NAME=CounterfeitIQ`. Backend secrets stored only in Cloudflare; never put Gemma provider credentials in `VITE_` variables or Git. Use authorized reference mode `authorized_live` only with permission; otherwise `demo` with visible provenance.

## Hand-off interfaces
Teammate exports `extractProduct(image)` and `lookupMedicine(number)`; Codex orchestrates and compares; Claude consumes `AnalysisResponse`; Antigravity validates integration. The exact module paths and runtime signatures must be agreed before feature development.
