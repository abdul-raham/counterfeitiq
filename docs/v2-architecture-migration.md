# CounterfeitIQ V2 architecture migration

## Existing system audit

The repository is a TypeScript npm-workspace monorepo containing a Vite/React web application, a Cloudflare Worker API, and a shared contract package. The Worker currently exposes health, image analysis, and NAFDAC Greenbook reference routes. It has no identity provider, durable database, manufacturer tenancy, code issuance, or transactional authentication state.

Reusable V1 components:

- Cloudflare Worker entrypoint, CORS allowlist, request limiting, upload bounds, and standardized errors.
- Workers AI extraction boundary and strict model-output validation.
- Greenbook adapter, provenance rules, and evidence comparison/report logic.
- Shared image, extraction, reference, and investigation contracts.
- CI checks and the existing API/shared test structure.

Legacy assumptions to isolate rather than delete:

- `/api/analyze` and `/api/reference/:number` make packaging analysis the primary journey.
- `VerificationStatus` describes reference-record comparison, not secret-code authentication.
- The frontend owns a scan-photo/report flow and has no authenticated manufacturer or admin surfaces.
- The Worker is stateless and rebuilds dependencies per request.
- `REFERENCE_MODE`, Greenbook access, and fixture provenance are unrelated to manufacturer-issued authentication codes.

## Target architecture

- `packages/shared/v2.ts`: versioned domain and transport contracts, exported as `@counterfeitiq/shared/v2`.
- `docs/openapi-v2.yaml`: public, manufacturer, admin, investigation, and AI HTTP contract.
- PostgreSQL/Supabase: source of truth for tenants, products, batches, packs, protected code digests, append-only verification events, investigations, and audit logs.
- Cloudflare Worker: API gateway, authorization enforcement, rate limiting, validation, and orchestration.
- Transactional database function: atomically changes an active code from unused to first-verified and appends its event.
- Arif's AI service: authenticated optional dependency; its output remains non-authoritative evidence.
- Existing V1 routes remain operational during migration and can later be mounted under the V2 investigation service.

## Security boundaries

- Every manufacturer-owned row carries `manufacturer_id`; authorization is enforced server-side and through PostgreSQL row-level security.
- Platform administration is a separate explicit role; manufacturer approval does not assert NAFDAC approval.
- Public IDs and secret codes are independent random values. Only a keyed digest of a normalized secret is retained after controlled one-time export.
- Public scan never accepts or consumes a secret.
- Authentication uses a constant-shape response, rate limiting, keyed lookup, and an atomic transaction.
- Verification and audit events are append-only. Lifecycle state is stored separately.
- A repeated valid code is a risk signal, not automatic proof of counterfeiting; a valid code is not proof that a physical pack is genuine.

## Contract-first delivery plan

1. Merge the V2 shared types and OpenAPI contract without changing V1 behavior.
2. Add PostgreSQL migrations, RLS policies, transaction functions, and fictional seeds.
3. Implement identity/authorization middleware and tenant-scoped repositories.
4. Implement manufacturer application, product, batch, allocation, and activation APIs.
5. Implement secure generation, controlled export, reconciliation, revocation, and blocking.
6. Implement public scan and atomic secret authentication with append-only events.
7. Add admin decisions, audit access, suspicious activity, and manufacturer event feeds.
8. Integrate the optional authenticated AI boundary and preserve V1 evidence reports.
9. Run tenant, concurrency, leakage, abuse, and end-to-end security tests before switching the frontend.

Database implementation should prefer Supabase PostgreSQL because V2 requires transactions, constraints, row-level security, and append-only audit controls that the current stateless Worker does not provide. The exact authentication provider and Supabase project remain deployment decisions; contracts do not assume client-side database access.
