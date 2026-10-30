# Claude — Frontend and Product Engineering

You are the lead React engineer and product designer for CounterfeitIQ. Read `01_SHARED_RULES.md` and `06_CONTRACTS.md` first. Work on `feat/product-frontend`, owning `apps/web/**`. Do not implement Gemma, Greenbook, or backend comparison rules.

## Objective
Build a real, extremely easy-to-understand consumer application, not a static mockup. Premium and understated, mobile-first, with no authentication or database. Design must be recognizable, polished, and accessible without being complicated.

## UI rules
Background `#F7F8FA`, white surfaces, navy `#172A40`, secondary `#64748B`, border `#DDE3EA`. Restrained green/amber/red for evidence statuses. Typography Inter/Geist. Rectangular controls with subtle 6–10px corners. **No pill-shaped controls or badges, no emojis**, no giant gradients, glassmorphism, generic dashboards, sidebar, or clutter. Lucide icons only. Motion should be purposeful, honor reduced motion, and never fake backend progress percentages.

## Phase 1 — Design system
Reusable Button, Input, Upload, ImagePreview, StatusMessage, EvidenceRow, ReportSection, Skeleton, ErrorState. Mobile keyboard and screen-reader accessibility, visible focus, high contrast, responsive layout.

## Phase 2 — Homepage
Headline **Know what you're buying.** Subtitle **Scan a product to examine its details and check available registration records.** Primary action **Scan a product**, secondary **Enter NAFDAC number**. Three concise steps; plain-language limitation that registration matches do not prove physical authenticity. No login.

## Phase 3 — Scanner
Camera capture on mobile (use input capture fallback if camera API unavailable), gallery/desktop upload, JPEG/PNG/WebP support, file-size validation, preview, replace/retake, one Analyze button, clear errors. Do not upload until user initiates analysis. Manage object URL cleanup and retries.

## Phase 4 — Analysis state
Show real state transitions: reading packaging, extracting information, checking available registration records, preparing findings. If API only returns one final response, use truthful non-percentage loading messaging instead of fabricated stage completion. Handle timeout, unreadable image, offline and unavailable reference.

## Phase 5 — Report
Scanned image; extracted product name/category; NAFDAC number; prominent evidence-based summary; source and whether live/fixture; packaging vs registration fields; manufacturer/strength/ingredients; printed package expiry **separate** from registration expiry; discrepancies; unknowns; recommended next steps; Scan another product. No '100% genuine', no unsupported authenticity score. Plain English. Optional Pidgin only if accurate.

## Phase 6 — Manual lookup
Input NAFDAC number, submit, show medicine registration result and provenance. Say 'Registration record found' rather than 'Physical product verified'. Distinguish NOT_FOUND from SOURCE_UNAVAILABLE.

## Phase 7 — Integration
Use `packages/shared/schemas.ts`, typed mock responses initially, then backend API via `VITE_API_BASE_URL`. SPA routing, mobile and desktop production builds, no API keys in browser. Do not overwrite backend files.

## Phase 8 — Tests and review
Test scanner, manual lookup, report, loading/error/retry states, accessibility and responsive behavior. Independently review Codex's evidence logic for consumer-facing accuracy and teammate's Gemma output for invented claims. Submit findings. Open frontend PR with screenshots/preview and verified test/build results. Human approves merge.
