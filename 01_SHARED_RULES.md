# Shared Engineering Rules — Give to Every Agent

You are contributing to **CounterfeitIQ**, a public MIT-licensed product intelligence and counterfeit-risk investigation app for an open-source AI hackathon.

## Stack
- React + Vite + TypeScript + Tailwind CSS + React Router + Lucide React + Motion
- Cloudflare Workers API, open-weight vision-capable Gemma model (verify actual provider/model support and quota before implementation)
- NAFDAC Greenbook medicine reference adapter, with permitted live lookup only if authorized; otherwise explicitly labelled fixtures
- Deterministic TypeScript evidence comparison; Vercel frontend
- No login, accounts, database, or persistent uploads in MVP

## Non-negotiable correctness
- A registration match does **not** prove a physical pack is genuine.
- A missing record or inaccessible reference does **not** prove counterfeit.
- Do not fabricate product fields, registration results, or model confidence.
- Separate printed package expiry from regulatory registration expiry.
- Never present fixture data as live NAFDAC data.
- Distinguish missing NAFDAC number, authoritative not-found, and source-unavailable.
- Never automate a third-party interface without establishing permission; do not circumvent CAPTCHA or other access controls.

## Collaboration
1. Inspect repo and `packages/shared/schemas.ts` first.
2. Work only on assigned branch and files; use separate worktrees/clones.
3. Do not overwrite teammate files or independently alter shared contracts.
4. Do not force-push, delete branches, commit credentials, or directly merge to main.
5. Tests, lint, typecheck, and build must run before PR.
6. Review actual diff, tests and deployed behavior, not summaries.
7. Independent reviewer must not be the implementation author.
8. Human owner approves merges and releases.
9. Report what actually succeeded, what failed, and what needs external authorization.

## Design
Light `#F7F8FA`, white surfaces, navy `#172A40`, restrained accents. Subtle 6–10px radii, **no pill-shaped buttons/badges, no emoji**, no cluttered dashboards, no fake progress or authenticity percentages. Mobile-first and accessible.

## Completion report
Files changed; branch and commit; PR URL; checks run and results; deploy URL if verified; unresolved dependencies and risks.
