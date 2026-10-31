# Demo cases

All files and records in this directory must be fictional or redistributable and visibly labelled as demo fixtures. A fixture miss must never be shown as an authoritative NAFDAC `NOT_FOUND` result.

The images are drawn by `npm run fixtures --workspace @counterfeitiq/ai-service`. Each carries a demo banner, and the `DEMO-` numbers cannot be real NAFDAC numbers. They pair with the fixture records in `apps/ai-service/src/sources/demo.ts`.

Results below are from real Gemma runs with `REFERENCE_MODE=demo`. Model output can vary, so treat these as expected results, not guarantees.

| Image | Printed | `/match-product` | `/compare-packaging` |
|---|---|---|---|
| `clean.png` | DEMOZOL 500 mg, `DEMO-0101` | `REGISTRATION_NUMBER_FOUND` | `REGISTRATION_DETAILS_MATCH` |
| `blurry.png` | The same pack, blurred | `NO_CANDIDATES` | `INSUFFICIENT_EVIDENCE` |
| `missing-registration-number.png` | DEMOZOL 500 mg, no number | `SINGLE_CANDIDATE` | `INSUFFICIENT_EVIDENCE` |
| `mismatched-strength.png` | DEMOZOL 250 mg, `DEMO-0101` | `REGISTRATION_NUMBER_FOUND`, strength conflicts | `DETAILS_MISMATCH` |
| `multiple-candidates.png` | DEMOZOL, no strength, no number | `MULTIPLE_CANDIDATES` | `INSUFFICIENT_EVIDENCE` |
| `reference-unavailable.png` | PLACEBRIN, `DEMO-0999`, not in the fixtures | `SOURCE_UNAVAILABLE` | `REFERENCE_UNAVAILABLE` |
