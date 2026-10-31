# CounterfeitIQ

CounterfeitIQ is a barcode-first medicine information tool. Scan a pack, and it shows what the manufacturer has on record for that code, where the information came from, and anything worth checking. An open-weight Gemma model can also inspect a photo of the packaging.

- **Live app:** https://counterfeitiq.vercel.app
- **API:** https://counterfeitiq-api.arifopeandu.workers.dev/api/health
- **License:** MIT
- **Run the demo:** [docs/demo.md](docs/demo.md)
- **Architecture:** [docs/architecture.md](docs/architecture.md)

## The idea, and what exists today

In the proposed model, manufacturers keep their products indexed in their own ERP systems and give CounterfeitIQ authorized access to them. Consumers scan a product, and CounterfeitIQ retrieves and explains what's available.

**Today this runs on a simulated ERP with fictional companies and products, and every record says so.** No manufacturer is connected. A NAFDAC collaboration is a future proposal, not an agreement, and NAFDAC has not authorized or endorsed this project.

## What it can and cannot tell you

- A record does not prove a pack is genuine, because a code can be copied. CounterfeitIQ never gives an authenticity verdict or score.
- A missing or unavailable record does not prove a product is fake.
- A repeat scan of a serialized pack is information to look into, not proof of anything. Plain barcodes are shared by every pack, so they never show repeats.

## How a scan works

1. The web app reads an EAN or UPC barcode, GS1 Data Matrix or QR code from the camera or a photo, or takes a typed code.
2. `POST /api/v3/resolve` parses the code into a GTIN, plus any batch and serial number.
3. The `ErpAdapter` looks it up, and the response labels the source that answered.
4. The app shows the product, manufacturer, batch and pack details that exist, with warnings such as a recall or expired batch.

Packaging inspection (`/inspect`) and NAFDAC number lookup (`/lookup`) are optional and separate. The Greenbook lookup is an experimental, low-volume, user-triggered use of NAFDAC's public site, and no CAPTCHA, login or block is bypassed. See [docs/greenbook-access.md](docs/greenbook-access.md).

## Repository

- `apps/web`: React app on Vercel
- `apps/api`: Cloudflare Worker. See [apps/api/README.md](apps/api/README.md) for the model, limits and configuration
- `apps/api/src/v3`: identifier parsing, simulated ERP, scan events and the resolve route
- `packages/shared`: contracts shared by both, with V3 in `v3.ts`

## Run it locally

Requires Node.js 22 or later.

```sh
npm ci
npm run dev:api   # needs npx wrangler login, because the AI binding is remote
npm run dev:web   # set VITE_API_BASE_URL to the API address
```

There are no accounts, no database and no stored uploads. Never put provider secrets in `VITE_` variables.

## Checks

```sh
npm run lint
npm run typecheck
npm test
npm run build
```

Tests mock Gemma and the Greenbook, and do not contact NAFDAC.

## Known limitations

- Scan counts live in temporary memory, so they can reset or undercount.
- The simulated ERP is built into the Worker, so connecting a real manufacturer means writing a new `ErpAdapter`, plus agreements and authentication.
- Not every code form is supported. Plain batch and serial parsing covers GS1 fields 01, 10, 11, 15, 17 and 21.
- The model can misread a photo, so the report shows what it read.

## Before this could be real

- Authorized API access from manufacturers, with agreements on data and uptime
- A conversation with NAFDAC about regulatory collaboration and Greenbook use
- Durable storage and a designed risk model for repeat scans, with a privacy review

## Contributors

- [abdul-raham](https://github.com/abdul-raham): product, integration and frontend
- [Arif2107](https://github.com/Arif2107): Cloudflare Worker, Gemma extraction and Greenbook adapter
