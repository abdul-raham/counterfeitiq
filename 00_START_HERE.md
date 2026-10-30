# CounterfeitIQ — Start Here

A two-person open-weight-AI hackathon project. This pack contains instructions and contracts, **not a completed application**.

## Project goal
Users photograph product packaging or enter a NAFDAC registration number. A vision-capable open-weight Gemma model extracts claims. For medicines, an approved NAFDAC Greenbook reference adapter retrieves registration information. A deterministic engine compares claims and creates an understandable evidence report. Matching registration details **do not establish physical authenticity**.

## People and agents
- You: product experience, comparison/risk engine, API orchestration, integration coordination.
- Teammate `hareef2107`: Cloudflare Worker, Gemma image extraction, Greenbook adapter, deployment.
- Codex: project foundation, backend verification and review.
- Claude: frontend product implementation and independent review.
- Antigravity: QA, integration and release verification.

## Recommended sequence
1. Give `01_SHARED_RULES.md` to every agent.
2. Give `02_CODEX_PROMPT.md` to Codex first. It creates the **public** repository, invites `hareef2107`, establishes shared contracts and connects Vercel. These steps require your authorized account access.
3. Once the foundation commit is on `main`, start Claude with `03_CLAUDE_PROMPT.md` and teammate with `05_TEAMMATE_PROMPT.md`, in parallel. Codex continues its backend branch.
4. Give Antigravity `04_ANTIGRAVITY_PROMPT.md` for reviews and eventual integration.
5. Use `06_CONTRACTS.md`, `07_GIT_WORKFLOW.md`, `08_TEST_AND_DEMO.md`, and `09_RELEASE_CHECKLIST.md` throughout.

**Never allow multiple agents to edit the same working directory concurrently.** Use separate clones or Git worktrees. Human review and approval are required for merges.

## Product design rules
Minimal, premium, mobile-first. No pills, no emojis, no authentication, no database in MVP. No fabricated official verification, no unsupported 'genuine' verdict.
