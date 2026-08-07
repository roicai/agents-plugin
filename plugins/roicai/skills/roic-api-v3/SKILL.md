---
name: roic-api-v3
description: >-
  Guides correct, budget-efficient use of the roic.ai v3 REST API
  (https://api.roic.ai/v3.0.0) — bearer/apikey auth, the strict
  EXCHANGE:SYMBOL identifier model, cursor pagination, reference catalogs,
  ticker search by ISIN/CUSIP/CIK/FIGI, stock and forex prices, bulk
  whole-universe latest-price feeds, the 11 fundamentals routes, stock splits,
  employee counts, earnings calls and transcripts, the earnings calendar, plan
  tiers, rate limits and 402 gates. Use when writing, reviewing, or debugging
  code that calls api.roic.ai/v3.0.0, when choosing endpoints or query
  parameters for roic.ai financial data, when hitting roic.ai 400/401/402/429
  responses, when pulling income statements, balance sheets, cash flow,
  ratios, multiples, per-share metrics, transcripts or price history from
  roic.ai, or when planning a roic.ai integration's request budget — even if
  the user only says "the roic API" without naming a version.
---

# roic.ai v3 API

Base URL `https://api.roic.ai/v3.0.0`. Every operation is a `GET`. 35 operations, all documented in `references/`.

## Authenticate

Send **exactly one** credential. Sending both is a 401.

```bash
# Recommended — keeps the key out of URLs, logs, and referrers
curl -H "Authorization: Bearer $ROIC_API_KEY" \
  "https://api.roic.ai/v3.0.0/tickers/NASDAQ:AAPL"

# Browser-friendly alternative
curl "https://api.roic.ai/v3.0.0/tickers/NASDAQ:AAPL?apikey=$ROIC_API_KEY"
```

## Identifiers (the most common source of 400s)

`identifier` accepts only shapes that resolve to exactly one listing:

| Shape | Example | Notes |
| --- | --- | --- |
| Qualified symbol | `NASDAQ:AAPL` | exchange and symbol, colon separated |
| Public ID | `tkr_cO46h8pgSu9Qqy`, `cmp_…` | returned in every `id` field |
| FIGI | `BBG000B9XRY4` | |

A bare `AAPL`, a CIK, a CUSIP, or an ISIN maps to several listings, so v3
rejects them with `400 invalid_parameter`. Resolve them once through
`/tickers/search?search_by=isin&query=US0378331005`, cache the qualified
symbol, and reuse it. Forex uses its own shape: `FX:EURUSD`, or bare
`EURUSD` / `EUR/USD` / `EUR-USD` / `EUR_USD`.

## Response shape

Lists return `{ "data": [...], "next_page_url": null, "previous_page_url": null }`.
Single-resource routes return the object itself with no envelope. Two
price lists hoist the shared context to the top level: `/stock-prices/{identifier}`
adds `symbol` and `currency`, `/forex-prices/{identifier}` adds `symbol`.

Errors are Stripe-shaped and always carry a `request_id`:

```json
{"error":{"type":"payment_required_error","code":"historical_data_restricted",
  "message":"…","param":"date","request_id":"…"}}
```

Paginate by following `next_page_url` verbatim. The `page` value is an opaque
encrypted token bound to the exact filters and `limit` of the first call, and
it expires after 1 hour. Never construct, mutate, or persist it long-term.

## Routing table

| Building… | Call | Requests | Plan |
| --- | --- | --- | --- |
| Symbol/ISIN/CUSIP/CIK/FIGI lookup | `/tickers/search` | 1 | Free |
| Universe or exchange constituent list | `/tickers` (`limit=2000`) | 1 per 2000 | Free |
| Exchange / market / sector / industry / country catalog | `/exchanges`, `/markets`, `/sectors`, `/industries`, `/countries` | 1, unpaginated | Free |
| Company header card | `/company/profile/{identifier}` | 1 | Free |
| Company logo | `/company/logo/{identifier}` | 1, then 304s | Free |
| Whole-universe quote board | `/stock-prices/latest` (`limit=2000`) | 1 per 2000 tickers | Individual+ |
| One quote | `/stock-prices/latest/{identifier}` | 1 | Free |
| Price chart / backtest series | `/stock-prices/{identifier}` + `date.gte`/`date.lte` (`limit=1000`) | 1 per 1000 bars | Free |
| Corporate-action feed | `/stock-splits` (omit `identifier` for all companies) | 1 per 500 | Free |
| Financial statements, ratios, multiples, per-share | 11 `/fundamental/...` routes (`limit=100`) | 1 per statement type | Free (annual) |
| Headcount history | `/company/employees` | 1 per 500 | Free |
| FX rate board | `/forex-prices/latest` (`limit=2000`) | 1 | Individual+ |
| FX time series | `/forex-prices/{identifier}` (`limit=1000`) | 1 per 1000 | Free |
| Pair catalog | `/forex-pairs` (`limit=2000`) | 1 | Free |
| Transcript archive index | `/earnings-calls` (omit `identifier` for all companies) | 1 per 100 | Free (latest 2/company) |
| One transcript | `/earnings-calls/{identifier}` + `fiscal_year` + `fiscal_quarter` | 1 | Free (latest 2/company) |
| Upcoming/reported earnings + estimates | `/calendar/earnings` | 1 per 500 | Individual+ |
| Exchange sessions / holidays | `/exchanges/trading-hours`, `/exchanges/holidays` | 1 | Individual+ |

Read the matching reference before writing code:

- <references/reference-data.md> — exchanges, markets, sectors, industries, countries, tickers, search, profile, employees, logo
- <references/market-data.md> — stock prices, bulk latest, splits, split/total-return adjustment
- <references/fundamentals.md> — the 11 statement and ratio routes, shared query model, period semantics
- <references/forex.md> — pairs, prices, bulk latest, `FX:EURUSD` identifiers
- <references/content-calendar.md> — earnings calls, transcripts, earnings calendar
- <references/plans-and-limits.md> — tiers, rate-limit headers, backoff, every 402 gate, full error catalog
- <references/budget-patterns.md> — dashboard recipes, polling cadence, free-tier survival guide

## Ten rules that decide your request budget

1. **One request per range, never per period.** `date.gte`/`date.gt`/`date.lte`/`date.lt` and `fiscal_year.gte`/`.gt`/`.lte`/`.lt` exist so a decade is one call. A loop over years is the single most expensive mistake against a 5 rpm free plan.
2. **Max out `limit`.** Defaults are conservative (50–500); maxima are 100 (fundamentals, calls), 500 (splits, employees, calendar), 1000 (price series), 2000 (tickers, search, latest prices, forex pairs).
3. **Prefer the bulk route to the per-symbol loop.** 500 symbols through `/stock-prices/latest/{identifier}` is 500 requests; `/stock-prices/latest?limit=2000` is one.
4. **Omit `identifier` to span all companies** on `/stock-splits`, `/company/employees`, `/earnings-calls`, `/calendar/earnings`. That turns a per-company loop into one cross-entity page.
5. **Resolve identity once.** Search by ISIN/CUSIP/CIK/FIGI, then cache the qualified symbol. Every later call is a direct hit.
6. **Honour `Cache-Control`.** Reference data and forex pairs are `private, max-age=86400`; prices, fundamentals, forex rates, calls and the calendar are `private, max-age=14400`. Polling faster than the TTL spends quota on identical bytes.
7. **Send `If-None-Match` for logos.** A matching `ETag` returns `304` with no body.
8. **Back off from the headers, not from guesswork.** Read `X-RateLimit-Remaining` and `X-RateLimit-Reset`; on `429`, sleep exactly `Retry-After` seconds.
9. **Never retry a 402.** It is a plan boundary, not a transient fault. Fix the query or point the user at https://roic.ai/pricing.
10. **Do not attempt what v3 does not support.** There are no comma-separated multi-symbol lists, no field/column selection, no CSV or Excel export, and no POST batch endpoint. Unknown query parameters are rejected with `400`, so probing for them wastes quota.
