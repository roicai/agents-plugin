---
name: roic-api-v2
description: >-
  Guides correct, budget-efficient use of the legacy roic.ai v2 REST API
  (https://api.roic.ai/v2) — query-string API-key auth, the symbol/CIK/CUSIP/ISIN
  identifier model, ticker and reference lookups, company profile/news/logo,
  earnings-call transcripts, the 11 fundamentals routes (statements, ratio
  groups, enterprise value, multiples, per-share), stock prices and splits, plan
  tiers and rate limits, and the call patterns that pull whole histories in one
  request instead of looping. Use when writing, reviewing, or debugging any code
  that calls api.roic.ai/v2, when choosing endpoints or query parameters for
  roic.ai financial data, when hitting roic.ai 401/403/429 responses, when
  pulling income statements, balance sheets, cash flow, financial ratios,
  valuation multiples, earnings transcripts or historical prices from roic.ai,
  or when planning a roic.ai integration's request budget — even if the user
  only says "the roic API" without naming a version.
---

# roic.ai v2 API

> **Building something new? Use v3 instead.** v2 is the legacy public surface and
> is kept for existing integrations. v3 adds `Authorization: Bearer` auth, cursor
> pagination, and bulk "latest price for every ticker" routes that v2 has no
> equivalent for. Only stay on v2 when the caller is already on v2, or when they
> ask for v2 by name.

## Basics

- **Base URL**: `https://api.roic.ai/v2`
- **Auth**: API key in the **query string only** — `?apikey=<key>`. There is no
  bearer-token or header auth on v2. (`?key=` is accepted as a legacy alias;
  prefer `apikey`.) A missing or unknown key returns **401** on every route.
- **Responses**: JSON. Success bodies are a bare array (or a bare object for
  single-row routes) — there is no `{data, meta}` envelope. Errors are
  `{"error": "..."}` with the status on the HTTP response.
- **Identifiers**: every `{identifier}` path segment accepts a **ticker symbol,
  CIK, CUSIP, or ISIN** interchangeably — resolution is case-insensitive. You do
  not need a lookup call before requesting data for a known symbol.
- **Get a key / upgrade**: https://roic.ai/pricing

```bash
curl "https://api.roic.ai/v2/fundamental/income-statement/AAPL?period=annual&limit=250&apikey=$ROIC_API_KEY"
```

## Endpoint routing

| You need…                                          | Route family                          | Reference                     |
| -------------------------------------------------- | ------------------------------------- | ----------------------------- |
| Find or list tickers; dump an exchange              | `/v2/tickers/...`                     | <references/endpoints.md>     |
| Exchanges, sectors, industries, countries           | `/v2/{exchanges,sectors,industries,countries}/list` | <references/endpoints.md> |
| Company profile, news, logo                         | `/v2/company/...`                     | <references/endpoints.md>     |
| Earnings-call transcripts                           | `/v2/company/earnings-calls/...`      | <references/endpoints.md>     |
| Daily OHLCV prices, latest price, splits            | `/v2/stock-prices/...`, `/v2/stock-splits` | <references/endpoints.md> |
| Statements, ratios, EV / multiples / per-share      | `/v2/fundamental/...` (11 routes)     | <references/fundamentals.md>  |
| Plan limits, rate-limit state, 401/403/429 handling | `/v2/usage`                           | <references/plans-and-limits.md> |
| Minimising request count                            | —                                     | <references/budget-patterns.md> |

Read the matching reference before writing calls: parameter names, maximums, and
defaults differ per route family and guessing them wastes a request (and, on the
free tier, a fifth of a minute's quota).

## Budget rules

Requests are metered per minute (free: 5/min), so the difference between a good
and a bad integration is usually one call versus fifty. The four levers:

1. **Pull full history in one call.** Every `/v2/fundamental/*` route takes
   `limit` up to **250** plus `fiscal_year_start`/`fiscal_year_end`. One request
   with `limit=250` returns every period the plan allows. Never loop a request
   per fiscal year, and never loop per quarter — `period=quarterly` already
   returns all quarters.
2. **Take price history in one call too.** `/v2/stock-prices/{identifier}`
   accepts `limit` up to **100000** with `date_start`/`date_end`, which covers
   decades of daily bars in a single request.
3. **Dump lists, don't iterate symbols.** `/v2/tickers/search/exchange/{exchange}`
   returns the whole exchange listing at once. **No v2 route accepts multiple
   tickers** — a portfolio of 40 names costs 40 requests per data type, so cache
   what you fetch and pick the widest route available.
4. **Bound anything paginated.** News is the only offset-paginated route
   (`page` + `limit` ≤ 200). Always pass `date_start`/`date_end` so the pages
   terminate instead of walking backwards forever.

## Things v2 does not do

Knowing these up front avoids wasted probing requests:

- **No multi-ticker/batch requests** on any route.
- **No column/field selection.** Fundamentals routes always return the entire
  metric block for that route; pick the narrowest route rather than filtering
  server-side. Fields that are null for a period are omitted from the row.
- **No cursor pagination.** Only `/v2/company/news/{identifier}` paginates, and
  it uses `page` offsets, which drift if new articles land mid-walk.
- **No conditional requests on data routes** — JSON routes send no `ETag`, so
  `If-None-Match` cannot save you a call. Honour `Cache-Control` instead:
  reference data and profiles are cacheable for 24h, financials/prices/news for
  4h. (The logo route is the one exception: it does serve an `ETag` and answers
  `304`.)
- **No webhooks or streaming.** Poll on the cache window, not tighter.

## Response and error shapes

| Status | Meaning                                                                                |
| ------ | -------------------------------------------------------------------------------------- |
| 200    | Bare JSON array/object. An empty array is a legitimate "no rows" answer on news.        |
| 401    | Missing or unknown `apikey`.                                                            |
| 403    | The request explicitly asked for dates older than the plan's lookback window.           |
| 404    | `{"error": "Company not found"}` / "No price data found" etc. — identifier or data gap. |
| 422    | Query-parameter validation failed (out-of-range `limit`, missing required `query`).     |
| 429    | Rate limit exceeded; a `Retry-After` header says how long to wait.                      |

403 is the one that surprises people: asking for a date range the plan does not
cover is an error, while asking for "as much as possible" silently returns the
allowed window. See <references/plans-and-limits.md> before writing retry or
back-off logic.
