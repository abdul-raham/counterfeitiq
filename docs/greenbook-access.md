# NAFDAC Greenbook access

**Status on 2026-10-31: permission not established. The application stays in demonstration mode and must not be described as live NAFDAC verification.**

The live adapter is built and tested against mocked responses, but it makes no requests until NAFDAC's permission is recorded in `GREENBOOK_ACCESS_APPROVAL`.

## Evidence

Checked on 2026-10-31.

| Check | Result | What it means |
| --- | --- | --- |
| `greenbook.nafdac.gov.ng/robots.txt` | `User-agent: *` with an empty `Disallow:` | Crawling is not restricted |
| `nafdac.gov.ng/robots.txt` | Only `/wp-admin/` is disallowed | Does not cover the Greenbook |
| `admin.greenbook.nafdac.gov.ng/robots.txt` | 404 | No statement |
| Terms pages: `/terms` and `/about` on the Greenbook; `/terms-of-use/`, `/terms-and-conditions/` and `/privacy-policy/` on nafdac.gov.ng | All 404 | No published terms found at these addresses |
| Greenbook home page | No links to terms, API or data reuse. Footer: "© NAFDAC 2025. All rights reserved." | Rights are reserved, and reuse is not addressed |
| `greenbook.nafdac.gov.ng/privacy_policy_ios.html`, effective 2023-03-13 | Covers the mobile app. Says nothing about automated access, scraping, APIs or reuse. Refers to Terms and Conditions "accessible at NAFDAC Greenbook", with no link | **Terms exist but we could not find them.** Ask NAFDAC for them |
| Web search for an API or an automated access policy | None found | A public API is not documented |
| CAPTCHA, login, or rate limit headers | None seen on the home page or the single search | Nothing had to be bypassed |
| Response from NAFDAC | None. They have not been contacted yet | **This is the blocker** |

Automated access is not prohibited anywhere we looked, but nothing confirms it is permitted. A robots.txt file is a crawling convention and not a grant of rights, and third-party scrapers of the Greenbook show only that scraping happens. Only NAFDAC can settle this.

## To unblock

1. Send the request below to `nafdac@nafdac.gov.ng`, the address NAFDAC publishes for information requests.
2. Add the reply, or the terms it points to, to the table above.
3. Set `GREENBOOK_ACCESS_APPROVAL` to where the permission is recorded, then follow [Switching mode](#switching-mode).

### Draft request

> **Subject:** Request for permission to query the NAFDAC Greenbook from a medicine-checking application
>
> Dear NAFDAC team,
>
> We are building CounterfeitIQ, an open-source tool that helps people in Nigeria check a medicine pack. It reads the registration number from a photo, compares the pack with the Greenbook entry, and links back to the Greenbook as the source.
>
> We would like to look up individual registration numbers through the public search at greenbook.nafdac.gov.ng from our server. We could not find terms covering this, so we are asking before enabling it.
>
> - We would search only for the number a user is checking, and would not download or republish the database.
> - Each request would identify our application, and results would be cached for up to six hours.
> - We would send at most 30 requests per minute, and would stop when asked to slow down.
> - The tool states that a registry match does not prove that a pack is genuine.
>
> Do we have your permission to do this? If you prefer another route, such as an API or a data agreement, or lower limits, we will follow it.
>
> Kind regards,
> [Name, role, contact details]

## Observed request

Sent once by hand with `curl`, for `A6-100103`, at 2026-10-31T09:42:59Z. It used an identifying User-Agent and no cookies or CSRF token. This, the robots.txt files, the home page and the policy pages are the only requests made to NAFDAC sites during this work.

```http
GET https://greenbook.nafdac.gov.ng/?draw=1&start=0&length=10&search[value]=A6-100103&search[regex]=false&search_ingredient=&columns[0][data]=product_name&columns[0][name]=product_name&columns[0][searchable]=true&...
Accept: application/json
X-Requested-With: XMLHttpRequest
User-Agent: CounterfeitIQ-access-check/0.1
```

The `columns` parameters repeat for the 12 columns listed in `apps/api/src/adapters/greenbook.ts`.

Sanitized response: HTTP 200, `application/json`, 6.6 KB, 0.59 s. Fields not used by the adapter, session cookies and internal timestamps are removed.

```json
{
  "draw": 1,
  "recordsTotal": 8966,
  "recordsFiltered": 1,
  "data": [
    {
      "product_name": "Recombinant Hepatitis B Vaccine 0.5 mL (Pediatric)**",
      "NAFDAC": "A6-100103",
      "strength": "10 mcg/0.5 mL",
      "expiry_date": "2028-05-30",
      "status": "Active",
      "ingredient": { "ingredient_name": "Hepatitis B vaccine" },
      "applicant": { "name": "Biovaccines Nigeria Ltd" }
    }
  ]
}
```

Only the positive path has been seen for real. The live shape of an empty result, and of Greenbook errors and rate limiting, is inferred from the DataTables format and has not been observed. Repeat the request above for an unknown number once access is approved.

## Switching mode

Set these on the API Worker. The frontend and verification engine need no changes.

| Variable | Values | Default |
| --- | --- | --- |
| `REFERENCE_MODE` | `demo` or `authorized_live` | `demo` |
| `GREENBOOK_ACCESS_APPROVAL` | Where NAFDAC's permission is recorded, such as `NAFDAC email 2026-11-02, ref 123` | Empty |

| `REFERENCE_MODE` | Approval | Behaviour |
| --- | --- | --- |
| `demo` or unset | Ignored | Fictional records, labelled `DEMO_FIXTURE`. A miss is `SOURCE_UNAVAILABLE` |
| `authorized_live` | Set | Live Greenbook. Failures never fall back to fixtures |
| `authorized_live` | Empty | Nothing is sent. `SOURCE_UNAVAILABLE` with `NOT_EXECUTED` |
| Anything else | Ignored | Nothing is sent. `SOURCE_UNAVAILABLE` with `NOT_EXECUTED` |

```sh
# Demonstration mode (current)
npx wrangler deploy --var REFERENCE_MODE:demo

# Live mode: only after this document records NAFDAC's permission
npx wrangler deploy --var REFERENCE_MODE:authorized_live --var "GREENBOOK_ACCESS_APPROVAL:<where it is recorded>"
```

The endpoint, 8 second timeout, cache lifetimes and request limits are constants at the top of `apps/api/src/adapters/greenbook.ts`, so they are changed in code rather than by configuration. Only the official origin is used.

## Smoke test

**Do not run this until the permission above is recorded.** It has not been run yet. It is never part of `npm test` or CI, and it refuses to start without an approval, before any request is sent.

```sh
GREENBOOK_ACCESS_APPROVAL="<where it is recorded>" npm run smoke:greenbook --workspace @counterfeitiq/api
```

It sends one lookup for `A6-100103` through the real adapter, checks for an exact match with live provenance, and prints only the outcome. It prints no headers or cookies.

## How the live adapter behaves

| Situation | Result |
| --- | --- |
| Exactly matching record | `FOUND`, `LIVE_OFFICIAL`, authoritative |
| Complete result list with no exact match | `NOT_FOUND`, `LIVE_OFFICIAL`, authoritative |
| More results than the 10 received | `SOURCE_UNAVAILABLE`, since the record could be among the rest |
| Records with the same number that disagree | `SOURCE_UNAVAILABLE`, rather than choosing one |
| Timeout (8 s), network error, redirect, non-200, HTML, or malformed or error JSON | `SOURCE_UNAVAILABLE` with live provenance and `authoritative: false` |
| 429 or 503 | As above, then no requests for `Retry-After` seconds, between 1 minute and 1 hour |
| Missing number, or a number with no hyphen | `SOURCE_UNAVAILABLE`, `NOT_EXECUTED`, no request |
| Non-medicine | No lookup, as `shouldLookupMedicine` already decides. `reference` is `null` |
| Request budget used up | `SOURCE_UNAVAILABLE`, `NOT_EXECUTED`, no request |

Limits: 30 requests a minute per isolate, plus the `GREENBOOK_LIMITER` binding at 30 a minute per Cloudflare location. `FOUND` is cached for 6 hours and `NOT_FOUND` for 1 hour, per isolate. Failures are never cached. Total traffic can therefore exceed 30 a minute across locations, so lower these limits if NAFDAC asks for a stricter one.

## Known limitations

- **Manufacturer:** the Greenbook search gives an applicant, not a manufacturer, so `manufacturer` is `null` and is not compared.
- **Inactive registrations:** the Greenbook includes these, but `MedicineReference` has no status field. They return `FOUND` with a `provenance.note` saying the registration is not listed as active. The report shows this note, but the verification engine does not act on it.
- **Numbers with no hyphen:** the Greenbook search cannot match these, so they are not looked up.
- **Stored number format:** the search is a text match on the hyphenated number. A record stored in another form, such as with a space, would not be returned, and the result would be an authoritative `NOT_FOUND`. How consistently the Greenbook stores numbers has not been checked. **Check this before go-live.**
- **Concurrent lookups:** these are not merged, because a Worker must not await a promise from another request. Two simultaneous lookups of an uncached number send two requests, within the rate limits.
