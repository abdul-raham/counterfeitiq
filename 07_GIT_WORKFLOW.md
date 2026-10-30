# Git, PRs and Merge Workflow

## Branches
- `main`: reviewed foundation and release.
- `feat/product-backend`: Codex verification engine and API orchestration.
- `feat/product-frontend`: Claude React app.
- `feat/ai-infrastructure`: teammate Cloudflare/Gemma/Greenbook.
- `integration/final`: Antigravity integration fixes after feature merges.

Use separate clones or worktrees for agents. Avoid concurrent edits to the same checkout.

## Foundation first
Repo creator confirms correct owner, creates public `counterfeitiq`, MIT license, README, invites `hareef2107` with Write access, establishes workspace, shared contracts, CI and Vercel. Commit foundation to `main`, then branch from that exact commit.

## Working commands
```bash
git fetch origin
git status
git switch feat/product-backend  # replace with your own branch
# edit, test, commit
git add .
git commit -m "feat: implement verification engine"
git push -u origin feat/product-backend
# if GitHub CLI is available
gh pr create --base main --head feat/product-backend --title "Verification engine" --body "Implementation, tests, risks"
```

## Reviews
- Codex PR reviewed by Claude + Antigravity.
- Claude PR reviewed by Codex + Antigravity.
- Teammate PR reviewed by Codex + Antigravity.
- Integration PR reviewed by Codex + human owner.

Run:
```bash
git fetch origin
git diff origin/main...origin/feat/product-backend
npm ci
npm run typecheck
npm run lint
npm test
npm run build
gh pr list
gh pr checks <PR_NUMBER>
```

Only run commands that exist in actual workspace. Report failures; never claim CI passed without checking. Protect main if repository settings permit. Require passing checks and human review. Never force-push shared branches or commit secrets.

## Merge order
1. Review each feature PR independently; fix blocking findings.
2. Human approves and merges **teammate infrastructure**, **backend**, and **frontend** PRs in an order that keeps CI green (coordinate interfaces).
3. Create `integration/final` from latest `main`, wire services and resolve small integration issues.
4. Run full tests, review integration PR, human merges.
5. Verify Vercel production and Worker smoke tests; submit repo and deployment URLs.

If PRs cannot be merged independently because of temporarily unresolved imports, use an integration branch from a reviewed baseline and merge via reviewed PR without breaking main.
