# Budget patterns

How to build common features for the fewest requests.

## Contents

- [The four levers](#the-four-levers)
- [Recipes](#recipes)
- [Polling cadence](#polling-cadence)
- [Anti-patterns](#anti-patterns)
- [Free-tier survival guide](#free-tier-survival-guide)

## The four levers

1. **Bulk over loop.** `/stock-prices/latest`, `/forex-prices/latest`,
   `/tickers`, `/forex-pairs` return up to 2000 rows each. The unpaginated
   catalogs (`/exchanges`, `/markets`, `/sectors`, `/industries`,
   `/countries`) return everything in one response.
2. **Range over iteration.** `date.gte`/`date.lte` and
   `fiscal_year.gte`/`.lte` collapse a loop into one call.
3. **Cross-entity over per-entity.** `/stock-splits`, `/company/employees`,
   `/earnings-calls`, `/calendar/earnings` all treat `identifier` as optional.
   Omit it and one page covers the whole market.
4. **Cache over refetch.** Respect `Cache-Control`: 24h for reference data and
   forex pairs, 4h for prices, fundamentals, forex rates, calls and the
   calendar. Use `If-None-Match` on logos.

## Recipes

### Company overview page — 4 requests

```bash
B="https://api.roic.ai/v3.0.0"; H="Authorization: Bearer $ROIC_API_KEY"
curl -H "$H" "$B/company/profile/NASDAQ:AAPL"
curl -H "$H" "$B/stock-prices/latest/NASDAQ:AAPL"
curl -H "$H" "$B/stock-prices/NASDAQ:AAPL?date.gte=2023-01-01&adjustment=total_return&order=asc&limit=1000"
curl -H "$H" "$B/fundamental/income-statement/NASDAQ:AAPL?period_type=annual&limit=100"
```

The logo is a fifth request only on first load; afterwards the cached bytes and
`If-None-Match` cover it.

### Watchlist quote board (any size) — 1 request

```bash
curl -H "Authorization: Bearer $ROIC_API_KEY" \
  "https://api.roic.ai/v3.0.0/stock-prices/latest?limit=2000"
```

Join against your local symbol list. Requires Individual or higher; the naive
alternative costs one request per symbol.

### Valuation screen over an exchange — 1 + N requests

One `/tickers?exchange=…&is_primary=true&status=listed&limit=2000` builds the
universe, one `/stock-prices/latest?exchange=…&limit=2000` gets prices, then
one `/fundamental/multiples/{identifier}` per candidate. Filter hard on the
first two responses so N stays small — there is no cross-sectional
fundamentals endpoint, so the only way to keep this cheap is to shrink the
candidate set before the per-symbol phase.

### Earnings season dashboard — 1 request per quarter

```bash
curl -H "Authorization: Bearer $ROIC_API_KEY" \
  "https://api.roic.ai/v3.0.0/calendar/earnings?date.gte=2026-01-01&date.lte=2026-03-31&order=asc&limit=500"
```

Estimates, actuals, and surprises are all on the row — no second call for the
beat/miss table.

### Corporate-action monitor — 1 request per night

```bash
curl -H "Authorization: Bearer $ROIC_API_KEY" \
  "https://api.roic.ai/v3.0.0/stock-splits?date.gte=$(date -u +%F)&limit=500"
```

### Identifier cross-reference table — ~1 request per 2000 symbols

`/tickers?limit=2000` rows already carry `cik`, `cusip`, `isin`, `figi`,
`figi_composite`, `figi_share_class`. Build the mapping table from those pages
instead of calling `/tickers/search` once per external identifier.

### Multi-currency normalization — 1 request

`/forex-prices/latest?currency=USD&limit=2000` returns every pair with USD on
either side. One response converts an entire multi-currency portfolio.

### Full financial model for one company — 11 requests, ever

One call per `/fundamental/...` category with `limit=100` and no date filter
returns the complete annual history of that category. There is no combined
route and no field selection, so pull only the categories your model uses.

## Polling cadence

| Data | `max-age` | Sensible refresh |
| --- | --- | --- |
| Exchanges, markets, sectors, industries, countries, tickers, profiles, logos, forex pairs | 24h | daily |
| Stock and forex prices (latest and historical) | 4h | after each market close; 4h at most |
| Fundamentals | 4h | daily, or on an earnings-calendar trigger |
| Earnings calls and calendar | 4h | 4h during earnings season, daily otherwise |

Prices are end-of-day bars. Polling `/stock-prices/latest` every minute returns
the same row roughly 390 times per session and buys nothing.

Use `/calendar/earnings` as a scheduler: refresh a company's fundamentals and
transcripts only after its `release_date` passes with `is_reported: true`,
instead of polling every company every day.

## Anti-patterns

Each of these is unsupported — the request will fail, so do not build retries
or fallbacks around them.

| Attempt | Reality | Do instead |
| --- | --- | --- |
| `?identifier=AAPL,MSFT,GOOG` | no multi-symbol lists anywhere | bulk route, or one call per symbol |
| `?fields=eps,revenue` | no column selection | take the full row, project locally |
| `?format=csv` / Excel export | JSON only (transcripts also offer `format=text`) | serialize client-side |
| `POST /v3.0.0/batch` | every operation is `GET`; there is no batch endpoint | bulk list routes |
| `?symbol=AAPL` on a route without it | strict schemas → `400 invalid_parameter` | check the reference file for the route's parameters |
| Bare `AAPL`, an ISIN, or a CIK as `identifier` | `400 invalid_parameter` | `/tickers/search?search_by=isin`, then cache the qualified symbol |
| Looping years to build history | burns the whole budget | one `date.gte`/`fiscal_year.gte` range call |
| Per-symbol quote loop over a universe | one request per symbol | `/stock-prices/latest?limit=2000` |
| Retrying a 402 | it is a plan boundary, not a fault | change the query or upgrade |
| Rebuilding a `page` token by hand | opaque, encrypted, 1h TTL, bound to the original filters | follow `next_page_url` verbatim |

## Free-tier survival guide

Five requests per minute and a two-year window. That is enough for a real
product if you spend it deliberately.

- **Budget the first minute.** A company page is four requests; a second page
  view inside the cache window should be zero.
- **Persist the identifier map.** Resolve ISIN/CUSIP/CIK once, store the
  qualified symbol forever. Never re-resolve at runtime.
- **Fetch catalogs once a day.** Sectors, industries, countries, exchanges and
  markets are five requests that stay valid for 24h and carry `symbol_count`,
  which answers most "how big is X" questions without further calls.
- **Stay annual.** `period_type=annual` with no `period_label` is the only
  Free-plan fundamentals shape. One call returns the full permitted history.
- **Ask for exactly two years.** Set `date.gte` to today minus two years rather
  than an open-ended or ancient bound, and the lookback 402 never fires.
- **Accept the shorter transcript list.** `/earnings-calls` returns each
  company's latest two calls on Free without erroring — treat that as the
  contract, not as missing data.
- **Skip the gated routes.** Bulk price boards, the earnings calendar, and
  exchange calendars all 402. Use `/stock-prices/latest/{identifier}` for the
  few symbols on screen, and `earnings_schedule` on the company profile as the
  calendar substitute.
- **Serve stale rather than fail.** When `X-RateLimit-Remaining` hits 0, render
  the cached response and refresh after `X-RateLimit-Reset`.

When these constraints start distorting the product — a wide quote board,
quarterly models, a real calendar — that is the signal to upgrade at
https://roic.ai/pricing rather than to engineer around the limits.
