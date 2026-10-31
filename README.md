# CounterfeitIQ

CounterfeitIQ is a QR-first product information tool, for medicine, water, food and other regulated products. Scan a pack's QR code, and it shows what the manufacturer has on record for that code, and anything worth checking. An open-weight Gemma model can also inspect a photo of the packaging.

- **Live app:** https://counterfeitiq.vercel.app
- **API:** https://counterfeitiq-api.arifopeandu.workers.dev/api/health
- **License:** MIT
- **Try it:** open https://counterfeitiq.vercel.app/demo and scan a QR code with your phone
- **Run the demo:** [docs/demo.md](docs/demo.md)
- **Architecture:** [docs/architecture.md](docs/architecture.md)
- **ERP integration:** [docs/erp-integration.md](docs/erp-integration.md)

## The idea, and what exists today

In the proposed model, manufacturers keep their products indexed in their own ERP systems and give CounterfeitIQ authorized access to them. Consumers scan a product, and CounterfeitIQ retrieves and explains what's available.

**Today this runs on a simulated ERP with fictional companies and products.** The API marks these records as demo, and the home, `/demo` and help pages say they are fictional. No manufacturer is connected. Partnerships with manufacturers and regulators are future proposals, not agreements, and NAFDAC has not authorized or endorsed this project. Scratch panels are part of the proposed pack design, and the demo QR images don't have them.

## What it can and cannot tell you

- A record does not prove a pack is genuine, because a code can be copied. So a found record is never called genuine.
- A CounterfeitIQ QR code that the manufacturer's records don't hold is called fake, because only a connected manufacturer's packs carry these codes. This covers an unknown product, serial number or batch.
- A typed code or an ordinary barcode with no record is never called fake, and neither is any code when the source can't answer.
- A repeat scan of a serialized pack is information to look into. A scan from the same device is treated as a likely rescan. A scan from another device asks whether you scratched the panel yourself: if so, it's a high-risk duplicate, and if it came scratched, it's a question for the seller. Codes that only identify the product are shared by every pack, so they never show repeats.

## How it works

1. A phone's camera opens the QR code's link directly, or the web app reads it from its own camera or a photo, or takes a typed code. The app also reads EAN, UPC and GS1 Data Matrix codes.
2. `GET /api/scan` on the public Worker (`apps/api`) forwards it to the private intelligence Worker (`apps/ai-service`).
3. That parses the code and asks the manufacturer's source through an `ErpConnector`. Today that's the simulated ERP Worker (`apps/demo-erp`).
4. The app shows the product, batch and pack details that exist, and warnings such as a recall, then a checklist to compare them with the package in your hand.

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

## Partnerships this needs

CounterfeitIQ can't work at real scale without these, and none exists yet:

- **Manufacturers:** authorized API access to their ERP systems, with agreements on data and uptime, and unique QR codes under scratch panels on their packs, uploaded before packs ship
- **Regulators:** collaboration with NAFDAC, and SON for other products, on registration data and on how fake codes get reported

## Also needed before this could be real

- Saving checklist answers and reports, which stay on the phone today
- A designed policy for repeat scans, keyed hashes for scan history, and a privacy review

## Contributors

- [abdul-raham](https://github.com/abdul-raham): product, integration and frontend
- [Arif2107](https://github.com/Arif2107): Cloudflare Workers, Gemma extraction, Greenbook adapter, ERP integration
