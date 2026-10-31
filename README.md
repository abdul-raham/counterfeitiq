# CounterfeitIQ

CounterfeitIQ is a QR-first medicine information tool. Scan a pack's QR code, and it shows what the manufacturer has on record for that code, where the information came from, and anything worth checking. An open-weight Gemma model can also inspect a photo of the packaging.

- **Live app:** https://counterfeitiq.vercel.app
- **API:** https://counterfeitiq-api.arifopeandu.workers.dev/api/health
- **License:** MIT
- **Run the demo:** [docs/demo.md](docs/demo.md)
- **Architecture:** [docs/architecture.md](docs/architecture.md)
- **ERP integration:** [docs/erp-integration.md](docs/erp-integration.md)

## The idea, and what exists today

In the proposed model, manufacturers keep their products indexed in their own ERP systems and give CounterfeitIQ authorized access to them. Consumers scan a product, and CounterfeitIQ retrieves and explains what's available.

**Today this runs on a simulated ERP with fictional companies and products, and every record says so.** No manufacturer is connected. A NAFDAC collaboration is a future proposal, not an agreement, and NAFDAC has not authorized or endorsed this project.

## What it can and cannot tell you

- A record does not prove a pack is genuine, because a code can be copied. CounterfeitIQ never gives an authenticity verdict or score.
- A missing or unavailable record does not prove a product is fake.
- A repeat scan of a serialized pack is information to look into. The app asks whether the pack is sealed, and suggests a next step. Codes that only identify the product are shared by every pack, so they never show repeats.

## How it works

1. A phone's camera opens the QR code's link directly, or the web app reads it from its own camera or a photo, or takes a typed code. The app also reads EAN, UPC and GS1 Data Matrix codes.
2. `GET /api/scan` on the public Worker (`apps/api`) forwards it to the private intelligence Worker (`apps/ai-service`).
3. That parses the code and asks the manufacturer's source through an `ErpConnector`. Today that's the simulated ERP Worker (`apps/demo-erp`).
4. The app shows the product, manufacturer, batch and pack details that exist, the sources, and warnings such as a recall.

Gemma takes no part in a scan. Packaging inspection (`/inspect`) and NAFDAC number lookup (`/lookup`) are optional and separate. The Greenbook lookup is an experimental, low-volume, user-triggered use of NAFDAC's public site, and no CAPTCHA, login or block is bypassed. See [docs/greenbook-access.md](docs/greenbook-access.md).

## Run it locally

Requires Node.js 22 or later.

```sh
npm ci
npm run dev:web   # set VITE_API_BASE_URL to the API address
```

To run the Workers, see [docs/erp-integration.md](docs/erp-integration.md#running-the-demo). There are no accounts and no stored uploads. Never put provider secrets in `VITE_` variables.

## Checks

```sh
npm run lint
npm run typecheck
npm test
npm run build
```

Tests mock Gemma and the Greenbook, and do not contact NAFDAC.

## Known limitations

- Only the simulated ERP has been run. No real manufacturer API has been tested.
- `/inspect` compares a photo with registration records, not yet with the ERP record.
- Opening a saved product link counts as a scan. A reload of the same page does not.
- The public scan has no sign-in, so anyone who knows a serial number can raise its count.
- The model can misread a photo, so the report shows what it read.

## Before this could be real

- Authorized API access from manufacturers, with agreements on data and uptime
- A conversation with NAFDAC about regulatory collaboration and Greenbook use
- A designed policy for repeat scans, keyed hashes for scan history, and a privacy review

## Contributors

- [abdul-raham](https://github.com/abdul-raham): product, integration and frontend
- [Arif2107](https://github.com/Arif2107): Cloudflare Workers, Gemma extraction, Greenbook adapter, ERP integration
