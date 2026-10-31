# Hackathon demo

Everything in this demo is fictional, apart from the optional NAFDAC number lookup in step 7. Scanning uses no AI quota. Only packaging inspection does, at about 8 neurons per photo.

**Before you start:** display or print the codes in [`demo/barcodes/`](demo/barcodes/) on another screen or on paper. Then open https://counterfeitiq.vercel.app/scan on a phone and allow camera access.

## Demo codes

| Scan this | Shows | Code |
|---|---|---|
| `product-barcode.png` | Product and manufacturer only | `2000000000015` |
| `batch-code.png` | Adds batch details | `(01)02000000000015(10)ZEN2401(17)280630` |
| `serialized-pack.png` | Adds pack details, and a repeat notice on the second scan | `(01)02000000000015(10)ZEN2401(17)280630(21)SN0001` |
| `recalled-batch.png` | Recall warning | `(01)02000000000015(21)SN0003` |
| `expired-batch.png` | Expired warning | `(01)02000000000015(21)SN0002` |
| `no-record.png` | No record found | `2000000000046` |
| `source-offline.png` | Source unavailable | `2000000000039` |

These are also listed on `/scan`, if a camera fails on stage.

## Three-minute script

1. **The problem:** "People can't easily check what a medicine's manufacturer has on record for the pack in their hand."
2. **Scan the product barcode:** show the product, the manufacturer and the Demo record label. Say that this barcode identifies the product type, so every pack shares it.
3. **Scan the serialized pack:** show the batch and pack details.
4. **Scan the same pack again:** show the repeat notice. Say it's information to look into, not a verdict.
5. **Scan the recalled batch:** show the warning.
6. **Scan `no-record.png`, then `source-offline.png`:** show that a missing record isn't called fake, and an outage isn't called a missing record.
7. **Optional, Inspect packaging:** upload a photo of a pack, and show what Gemma read and how it compares. You can also show a live NAFDAC number lookup at `/lookup`.
8. **The vision:** "Manufacturers would give authorized access to their ERP systems, and we'd explore working with NAFDAC. Neither exists yet, which is why these records are simulated."

## What to say if asked

- **"Does this prove a medicine is genuine?"** No. A barcode can be copied, so this shows what's on record.
- **"Is NAFDAC involved?"** No. A partnership is a future proposal. The Greenbook lookup is experimental and not endorsed by NAFDAC.
- **"Is the data real?"** The scanned companies and products are fictional, and the GTINs use the GS1 range reserved for internal use.

## If something fails

- **The camera won't open:** use "Choose a photo of the barcode", or tap a demo code on `/scan`.
- **The camera won't focus:** make the code bigger on the screen and reduce glare, or use a printed copy.
- **A repeat count looks low:** counts are held in temporary memory, and the app says so.
