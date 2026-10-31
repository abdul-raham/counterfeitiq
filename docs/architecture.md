# CounterfeitIQ V3 architecture

```mermaid
flowchart TD
    User[Consumer's phone or browser]
    subgraph Web["Web app (React on Vercel)"]
        Scan["/scan: camera, photo or typed code"]
        Product["/product/:identifier: record, source and warnings"]
        Inspect["/inspect: optional packaging inspection"]
    end
    subgraph Worker["API (Cloudflare Worker)"]
        Resolve["POST /api/v3/resolve"]
        Parse["Identifier parser: GTIN, GS1 Data Matrix, Digital Link"]
        Events["Scan events: temporary memory"]
        Analyze["POST /api/analyze"]
        Reference["GET /api/reference/:number"]
    end
    ERP["ErpAdapter"]
    Demo["Simulated ERP: fictional records"]
    Real["Authorized manufacturer ERP: future"]
    Gemma["Gemma on Workers AI"]
    Greenbook["NAFDAC public Greenbook: experimental, not endorsed"]

    User --> Scan --> Resolve
    Resolve --> Parse --> ERP
    ERP --> Demo
    ERP -.-> Real
    Resolve --> Events
    Resolve --> Product
    User --> Inspect --> Analyze
    Analyze --> Gemma
    Analyze --> Greenbook
    Reference --> Greenbook
```

## Key decisions

- **No database or accounts.** There are no logins, and nothing here needs Supabase.
- **`ErpAdapter` is the integration point.** A real manufacturer connection replaces the simulated adapter, and the response labels which kind of source answered.
- **Product, batch and pack stay separate.** Every pack of a product shares a plain barcode, so only a serialized pack can show a repeat scan.
- **Only fresh scans count.** Reloads and the back button don't record a scan event.
- **Failures are never "not found".** If the source can't answer, the result is `UNAVAILABLE`.

## Scan event limits

Events are held in memory by each Worker instance, and hold a code, a time, the identity level and a random per-tab ID. They hold no IP address or personal details. They reset when an instance restarts and aren't shared between instances, so repeat counts can be too low. The app tells people this next to any repeat count. Real tracking would need durable storage and a proper risk model.

The contract is in [`packages/shared/v3.ts`](../packages/shared/v3.ts).

## Earlier work

The scratch-code, manufacturer portal and admin work was never merged. It is kept under the tags `archive/v2-frontend`, `archive/v2-backend-contracts` and `archive/v2-qa`. The state of `main` before V3 is tagged `archive/pre-v3-main`.
