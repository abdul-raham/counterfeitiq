# Hackathon demo

Everything scanned in this demo is fictional. Scanning uses no AI quota. Only packaging inspection does, at about 8 neurons per photo.

**Before you start:** open https://counterfeitiq.vercel.app/demo on a laptop, which shows every code. Printable copies are in [`apps/web/public/qr/`](../apps/web/public/qr/).

**Two ways to scan:** point a phone's normal camera at a QR code and tap the link, or open https://counterfeitiq.vercel.app/scan and use the app's camera. Both work without an account.

## Demo codes

| Image | Shows | Code, if you type it |
|---|---|---|
| `1-product.png` | Product and manufacturer only | `2000000001012` |
| `2-product-no-batch-data.png` | "This QR code is fake": a product with no batch, so no parent record | `2000000001029` |
| `3-batch-code.png` | Adds batch details | `(01)02000000001012(10)DX2041` |
| `4-serialized-pack.png` | Adds pack details. Scan from a second device for the scratch panel buttons | `(01)02000000001012(10)DX2041(17)280131(21)DEMOSN0001` |
| `5-recalled-batch.png` | Recall warning | `(01)02000000001012(10)DX2042` |
| `6-expired-batch.png` | Expired warning | `(01)02000000001012(10)DX1999` |
| `7-blocked-pack.png` | Blocked pack warning | `(01)02000000001012(21)DEMOSN0003` |
| `8-incomplete-record.png` | A record with missing details | `2000000002026` |
| `12-bottled-water.png` | A non-medicine product, with its pack size | `(01)02000000004013(10)WT3001(17)270930(21)DEMOWT0001` |
| `9-fake-code.png` | "This QR code is fake": unknown product | `2000000009995` |
| `10-fake-pack.png` | "This QR code is fake": real product, serial never issued | `(01)02000000001012(21)FAKESN0001` |
| `11-fake-batch.png` | "This QR code is fake": real product, batch never issued | `(01)02000000001012(10)FAKEBATCH` |

Each code on `/demo` also has an "Open result" link, if a camera fails on stage. Typing a code shows "No record found" instead of "fake", because a typed code can be a typo. A real product's barcode shows the same, or an unreadable code, because only fictional products are connected.

## Three-minute script

1. **The problem:** "People can't easily check what a medicine's manufacturer has on record for the pack in their hand."
2. **Scan the product code:** show the product and the manufacturer, and say that this comes from a simulated system. Say that this code identifies the product type, so every pack shares it.
3. **Scan the serialized pack:** show the batch and pack details.
4. **Check the package:** tap "No" on the checklist, and tick what differs. That tells us exactly which detail conflicted.
5. **Scan the same pack from a second phone:** answer "Was this panel previously scratched by you?". "Yes" is likely your own scan. "No" is a high-risk duplicate. The same device again is treated as a likely rescan.
6. **Scan the recalled batch:** show the warning.
7. **Scan the fake pack:** the product is real, but the manufacturer never issued that serial number. Show "This QR code is fake", and say why: only a connected manufacturer's packs carry these QR codes, so someone made this one.
8. **Optional, Inspect packaging:** upload a photo of a pack, and show what Gemma read and how it compares with the registration record.
9. **The vision:** "Manufacturers would give authorized access to their ERP systems, and we'd explore working with NAFDAC. Neither exists yet, which is why these records are simulated."

## What to say if asked

- **"Does this prove a medicine is genuine?"** No. A QR code can be copied, so this shows what's on record.
- **"How can you say fake when there's no record?"** A CounterfeitIQ QR code only goes on the packs of connected manufacturers, so one missing from their records wasn't issued by them. This relies on manufacturers uploading codes before packs ship. If the source can't answer, or a code is typed, we don't say fake.
- **"Can a counterfeiter copy a real QR code?"** Yes. That's why a found record is never called genuine, and why a serialized pack asks about the seal on a repeat scan.
- **"Why does a second scan matter?"** The code sits under a scratch panel, so nobody should have read it before the panel was scratched. Scratch panels aren't on the demo images yet: this is the proposed pack design.
- **"Is NAFDAC involved?"** No. A partnership is a future proposal. The Greenbook lookup is experimental and not endorsed by NAFDAC.
- **"What does Gemma do?"** It reads a packaging photo. It doesn't take part in a QR scan.

## If something fails

- **The camera won't open:** use "Choose a photo of the QR code", or tap a demo code on `/scan`.
- **The camera won't focus:** make the code bigger on the screen and reduce glare, or use a printed copy.
- **"The service is unavailable":** check that all three Workers are deployed, with `/api/scan` responding.
