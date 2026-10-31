# CounterfeitIQ V2 frontend migration

Status: built on `feat/v2-consumer-manufacturer-ui`, against Codex's uncommitted contract from `feat/v2-core-backend`. **No V2 backend exists yet, so do not deploy this to production until it does.** Until then, the main "Scan a product" journey ends at "The service is unavailable".

## Migration map

| Status | Item | Notes |
|---|---|---|
| Retained | Design tokens, `Button`, `Input`, `StatusMessage`, `ErrorState`, `Skeleton`, `Layout`, `ErrorBoundary`, request error handling | Teal accent tokens and an `accent` tone added |
| Retained, moved | Photo flow: `/scan` to `/inspect`, `/report` to `/inspect/report` | Behaviour unchanged. Still uses V1 `/api/analyze` |
| Retained | `/lookup`, the Greenbook registration lookup | Linked from `/scan`, not in the main navigation |
| Replaced | `HomePage` | Now leads with the scan, scratch and code journey |
| Added | `/scan` (QR camera and manual entry), `/product/:identifier`, `/authenticate`, `/verification/result`, `/report` (report a concern), `/help` | |
| Added | Manufacturer portal, admin portal, `ProtectedPortal`, tables, dialogs, typed V2 client, V2 sample fixtures | |
| Removed | Nothing | |

## Safety rules enforced in the interface

- **Scan never consumes a code.** `GET /api/public/scan/{id}` sends no secret, and the code goes only through `POST /api/public/authenticate`.
- **The secret code is never kept.** It stays out of URLs and browser storage, and only the result stays in memory.
- **No authenticity claims.** A reply with `authenticityConfirmed` other than `false` is refused. A first check says "Code recognized, first check" and states that a code can be copied.
- **Double taps send once.** A code can only be first-checked once, so the button locks while a request is in flight.
- **A failed attempt is explained.** If a request fails, it may still have reached the server, so a later "checked before" result says it may be the person's own attempt.
- **QR codes cannot redirect anyone.** The scanner extracts a pack ID and only ever routes to the app's own product page.
- **The three checks stay separate.** Code check, registration lookup and packaging inspection have separate screens and wording.
- **The interface is not the security boundary.** `ProtectedPortal` only decides what to show. The session token is held in memory, and the API must authorize every request.

## Contract gaps for Codex

The frontend has a temporary, unchanged copy of the contract in `src/lib/v2/contract.ts`. When the contract merges, delete it and import from `@counterfeitiq/shared/v2`.

These screens show "Not connected yet" and name the missing endpoint until it exists:

| Needed | Used by |
|---|---|
| A sign-in method | Both login pages. **This blocks both portals** |
| A way to create an account before applying | `/manufacturer/apply`, which requires a bearer token |
| `GET /api/manufacturer/applications/mine` | `/manufacturer/pending` after a return visit |
| `GET /api/manufacturer/profile`, `GET /api/manufacturer/members` | `/manufacturer/settings` |
| `GET /api/manufacturer/batches` | Batch list, batch detail, batch dropdown |
| `GET /api/manufacturer/code-allocations` | Allocation list |
| `PATCH /api/manufacturer/products/{id}` | Editing a product |
| A controlled secret-export operation | Printing real labels |
| `GET /api/admin/manufacturers`, `/products`, `/batches`, `/code-allocations`, `/verification-events`, `/investigations`, `/audit-log` | The matching admin pages |
| A way to block a batch | Admin batch controls. The `batch:block` permission exists, but no route does |

Other questions:

- **Not found:** `ApiErrorCode` has no not-found value. The client treats a 404 as "pack not found" unless its code is `SERVICE_UNAVAILABLE`, which is what the Worker returns for a missing route. Please add an explicit code.
- **Suspicious reports:** `SuspiciousProductReport` has no route, so `/report` uses `POST /api/public/investigations`. Please confirm that's intended.
- **Revoking:** the admin screen takes a code ID, but no route lists codes or finds one by pack.
- **Pagination:** list responses return `nextCursor`, but the contract has no cursor parameter, so the tables show the first page only.
- **Packaging AI:** `/api/ai/extract` uses service authentication and an image URL, so the browser keeps using V1 `/api/analyze`.

## Sample mode

`VITE_USE_SAMPLE_DATA=true` runs every flow on fictional in-memory data, under a permanent banner. Fixtures are in `src/features/sample` and load as separate chunks. Without that setting, the app never shows fixture data. Demo labels exist only in this mode and are marked "DEMONSTRATION LABEL. NOT A REAL CODE."

Try `/scan`, which lists sample packs and their codes. Any details sign in to the sample portals.

## Not built yet

- Product editing, staff management, investigation details and a batch block control all need the endpoints above.
- Analytics are limited to simple counts.
- Tested in Chrome only. A real phone, iOS Safari and a printed QR code are all untested.
