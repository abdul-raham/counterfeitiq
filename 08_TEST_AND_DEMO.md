# Tests and Hackathon Demonstration

## Automated checks
- Unit: normalization, name/manufacturer/strength comparison, null/unknown fields, month-only expiry, registration vs package expiry, no authenticity verdict.
- Backend integration: extraction schema, missing number, not found vs unavailable, non-medicine, fixtures, timeout, malformed model output, file size/type.
- Frontend: upload, camera fallback, manual lookup, loading/error/retry, evidence report, keyboard navigation, mobile layout.
- Infrastructure: health, CORS, rate limiting, provider quotas, secrets, Worker and Vercel deployments.

## Judge-ready scenarios
1. **Registered medicine:** photograph real medicine; show Gemma extracted details and permitted Greenbook comparison (or explicitly labelled demo reference).
2. **Simulated mismatch:** clearly labelled mock package using intentionally conflicting product name or strength; show exact discrepancy, not an unsupported counterfeit verdict.
3. **Expired package:** package/test image with past printed expiry; distinguish from regulatory registration expiry.
4. **Unknown registration:** show `RECORD_NOT_FOUND` only after a successful authorized lookup; otherwise `REFERENCE_UNAVAILABLE`.
5. **Blurry image:** extraction returns unknown/null and requests clearer photo.
6. **Food/cosmetic:** Gemma reads packaging; Greenbook verification is not claimed.

## Three-minute narrative
- Problem: fake or misleading packaging and difficulty checking registration details.
- Demo: scan → AI extracts claims → reference lookup → evidence comparison → plain-language report.
- Explain AI role: open-weight Gemma does image understanding; deterministic rules prevent unsupported conclusions.
- Show simulated mismatch and source attribution.
- State limitations: valid registration does not authenticate a physical pack; Greenbook primarily medicines; automated access subject to authorization.
- Finish with public GitHub MIT license and working deployment.

## Hackathon constraints
Confirm event's actual build-window, submission deadline and allowed preparation rules. Do not misrepresent prebuilt work as created during the event. Prioritize real end-to-end functionality before animations.
