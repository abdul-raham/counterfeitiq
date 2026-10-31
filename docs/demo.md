# Hackathon demo

Everything scanned in this demo is fictional. Scanning uses no AI quota. Only packaging inspection does, at about 8 neurons per photo.

**Before you start:** open the images in [`demo/qr-codes/`](demo/qr-codes/) on a laptop or print them.

**Two ways to scan:** point a phone's normal camera at a QR code and tap the link, or open https://counterfeitiq.vercel.app/scan and use the app's camera. Both work without an account.

## Demo codes

| Image | Shows | Code, if you type it |
|---|---|---|
| `1-product.png` | Product and manufacturer only | `2000000001012` |
| `2-product-no-batch-data.png` | A product with nothing else indexed | `2000000001029` |
| `3-batch-code.png` | Adds batch details | `(01)02000000001012(10)DX2041` |
| `4-serialized-pack.png` | Adds pack details. Scan twice for the repeat notice | `(01)02000000001012(10)DX2041(17)280131(21)DEMOSN0001` |
| `5-recalled-batch.png` | Recall warning | `(01)02000000001012(10)DX2042` |
| `6-expired-batch.png` | Expired warning | `(01)02000000001012(10)DX1999` |
| `7-blocked-pack.png` | Blocked pack warning | `(01)02000000001012(21)DEMOSN0003` |
| `8-incomplete-record.png` | A record with missing details | `2000000002026` |
| `9-no-record.png` | No record found | `2000000009995` |

These are also listed on `/scan`, if a camera fails on stage. To make more, any online QR code generator works: enter a code from the table and scan the result. A real product's barcode or QR code will show "No record found" or an unreadable code, because only fictional products are connected.

## Three-minute script

1. **The problem:** "People can't easily check what a medicine's manufacturer has on record for the pack in their hand."
2. **Scan the product code:** show the product, the manufacturer and the demo label. Say that this code identifies the product type, so every pack shares it.
3. **Scan the serialized pack:** show the batch and pack details.
4. **Scan the same pack again:** show the repeat notice, and answer "Is this pack still sealed?". Sealed leads to a pharmacist. Opened leads to the seller.
5. **Scan the recalled batch:** show the warning.
6. **Scan the code with no record:** show that a missing record isn't called fake.
7. **Optional, Inspect packaging:** upload a photo of a pack, and show what Gemma read and how it compares with the registration record.
8. **The vision:** "Manufacturers would give authorized access to their ERP systems, and we'd explore working with NAFDAC. Neither exists yet, which is why these records are simulated."

## What to say if asked

- **"Does this prove a medicine is genuine?"** No. A QR code can be copied, so this shows what's on record.
- **"Why not say fake when there's no record?"** Because only connected manufacturers can answer, so a real medicine could show no record. If every manufacturer were connected, this could become a much stronger signal.
- **"Why not say fake on a second scan?"** A code on the outside can be read without opening the pack, and shops scan packs too. A repeat on a sealed pack is a reason to check, not a verdict.
- **"Is NAFDAC involved?"** No. A partnership is a future proposal. The Greenbook lookup is experimental and not endorsed by NAFDAC.
- **"What does Gemma do?"** It reads a packaging photo. It doesn't take part in a QR scan.

## If something fails

- **The camera won't open:** use "Choose a photo of the QR code", or tap a demo code on `/scan`.
- **The camera won't focus:** make the code bigger on the screen and reduce glare, or use a printed copy.
- **"The service is unavailable":** check that all three Workers are deployed, with `/api/scan` responding.
