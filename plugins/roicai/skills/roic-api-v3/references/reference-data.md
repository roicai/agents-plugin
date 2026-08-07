# Reference data

Identity, catalogs, company metadata. Ten operations.

Cache policy: every route here is `Cache-Control: private, max-age=86400` (24h).
The logo route adds `stale-while-revalidate=604800`.

## Contents

- [Unpaginated catalogs](#unpaginated-catalogs)
- [Exchange sessions and holidays](#exchange-sessions-and-holidays)
- [Ticker list](#ticker-list)
- [Ticker search](#ticker-search)
- [Retrieve a ticker](#retrieve-a-ticker)
- [Company profile](#company-profile)
- [Employee counts](#employee-counts)
- [Company logo](#company-logo)

## Unpaginated catalogs

`GET /exchanges` · `GET /markets` · `GET /sectors` · `GET /industries` · `GET /countries`

These take **no parameters except `apikey`**. They return the complete catalog
in one response — no `limit`, no `page`, no `order`. Any other query parameter
is a `400 invalid_parameter`. All five are Free-plan.

Every row carries `symbol_count`, so a "sectors with coverage" or "biggest
exchanges" view needs one request and no fan-out.

| Route | Row fields |
| --- | --- |
| `/exchanges` | `id`, `object`, `code`, `exchange_name`, `exchange_local_name`, `mics`, `markets`, `symbol_count` |
| `/markets` | `id`, `object`, `code`, `country_code`, `exchanges`, `symbol_count` |
| `/sectors` | `id`, `object`, `name`, `symbol_count` |
| `/industries` | `id`, `object`, `name`, `symbol_count` |
| `/countries` | `id`, `object`, `name`, `code`, `symbol_count` |

```bash
curl -H "Authorization: Bearer $ROIC_API_KEY" \
  "https://api.roic.ai/v3.0.0/sectors"
```

## Exchange sessions and holidays

`GET /exchanges/trading-hours?exchange=NASDAQ` — **Individual plan or higher.**
`GET /exchanges/holidays?exchange=NASDAQ` — **Individual plan or higher.**

`exchange` is required; `apikey` is the only other accepted parameter. Both
return a single object, not a list envelope.

- trading hours → `id`, `object`, `exchange`, `timezone`, `trading_hours[]`,
  where each entry is `{ effective_from, regular, extended }`. The whole
  session history arrives in one call, so build the "is the market open now"
  calculation locally instead of re-fetching.
- holidays → `id`, `object`, `exchange`, `holidays[]` as `YYYY-MM-DD` strings.

On the Free plan both return `402 payment_required`.

## Ticker list

`GET /tickers`

| Parameter | Values | Default |
| --- | --- | --- |
| `exchange` | exchange code, e.g. `NASDAQ` | — |
| `type` | security type string | — |
| `is_primary` | `true` / `false`, any casing | — |
| `status` | `listed`, `delisted` | — |
| `listing_country_code` | country code | — |
| `order` | `asc`, `desc` | `asc` |
| `limit` | 1–**2000** | 500 |
| `page` | opaque cursor | — |

Row fields: `id`, `object`, `symbol`, `name`, `exchange`, `mic`, `type`,
`type_specifications`, `is_primary`, `status`, `primary_symbol`, `market`,
`listing_country_code`, `trading_currency`, `fundamental_currency`, `cik`,
`cusip`, `isin`, `figi`, `figi_composite`, `figi_share_class`.

This is the universe-building call. `is_primary=true&status=listed` with
`limit=2000` gives a clean tradable universe a page at a time, and the row
already contains ISIN/CUSIP/CIK/FIGI — so a bulk cross-reference table costs
a handful of requests, not one per symbol.

```bash
curl -H "Authorization: Bearer $ROIC_API_KEY" \
  "https://api.roic.ai/v3.0.0/tickers?exchange=NASDAQ&is_primary=true&status=listed&limit=2000"
```

## Ticker search

`GET /tickers/search?query=<value>`

| Parameter | Values | Default |
| --- | --- | --- |
| `query` | 1–128 chars, required | — |
| `search_by` | see below | `symbol` |
| `limit` | 1–**2000** | 500 |
| `page` | opaque cursor | — |

`search_by` has two behaviours:

- **Ranked text search** — `symbol` (ticker codes and qualified symbols) and
  `name` (company names). Fuzzy, prefix- and containment-aware, relevance
  ordered. There is no `order` parameter.
- **Exact field match** — `exchange`, `mic`, `type`, `primary_symbol`,
  `market`, `listing_country_code`, `trading_currency`, `fundamental_currency`,
  `cik`, `cusip`, `isin`, `figi`, `figi_composite`, `figi_share_class`.

The exact modes are what make this route the identifier resolver. Since v3
rejects a bare ISIN/CUSIP/CIK as an `identifier`, this is the one call that
converts an external identifier into the qualified symbol every other route
wants.

```bash
# ISIN -> qualified symbol, one request
curl -H "Authorization: Bearer $ROIC_API_KEY" \
  "https://api.roic.ai/v3.0.0/tickers/search?query=US0378331005&search_by=isin"
```

Rows are the same shape as `/tickers`. Cache the resulting `symbol` (and `id`)
in your own store; re-resolving on every run is pure waste.

## Retrieve a ticker

`GET /tickers/{identifier}` — accepts no query parameters except `apikey`.
Returns one ticker object (no list envelope). Use it to confirm an identifier
resolves; if you already listed or searched, you already have the row.

## Company profile

`GET /company/profile/{identifier}` — accepts no query parameters except `apikey`.

Returns one object: `id`, `object`, `primary_symbol`, `company_symbols`,
`exchange`, `mic`, `exchange_name`, `exchange_local_name`, `name`,
`description`, `short_description`, `sector`, `industry`,
`fundamental_currency`, `cik`, `cusip`, `isin`, `ceo`, `founded`, `website`,
`phone`, `number_of_employees`, `number_of_shareholders`, `address`, `ipo`,
`reporting_calendar`, `earnings_schedule`.

Secondary listings resolve to the primary company record, and
`company_symbols` lists the siblings — so one profile call covers every
listing of the same company.

## Employee counts

`GET /company/employees`

| Parameter | Values | Default |
| --- | --- | --- |
| `identifier` | optional; omit to span all companies | — |
| `fiscal_year` | exact year, 1–9999 | — |
| `fiscal_year.gte` / `.gt` / `.lte` / `.lt` | range bounds | — |
| `order` | `asc`, `desc` | `desc` |
| `limit` | 1–**500** | 100 |
| `page` | opaque cursor | — |

Rows: `id`, `object`, `symbol`, `fiscal_year`, `employees`.

Omitting `identifier` turns this into a cross-company headcount feed — one
page covers 500 company-years. `fiscal_year.gte` past the plan's lookback
floor returns `402 historical_data_restricted` with `param: "fiscal_year"`.

## Company logo

`GET /company/logo/{identifier}`

| Parameter | Values | Default |
| --- | --- | --- |
| `size` | 16–800 (square pixels) | 128 |
| `greyscale` | `true` / `false` | `false` |
| `format` | `webp`, `png` | `webp` |

Returns image bytes with an `ETag`. Any parameter outside
`apikey`/`size`/`greyscale`/`format` is a `400 invalid_parameter`.

Send the stored validator back and a repeat fetch costs no bandwidth:

```bash
curl -H "Authorization: Bearer $ROIC_API_KEY" \
     -H 'If-None-Match: "<stored-etag>"' \
  "https://api.roic.ai/v3.0.0/company/logo/NASDAQ:AAPL?size=64&format=png"
# -> 304 Not Modified, empty body
```

Secondary listings resolve to the primary company logo, so do not fetch one
logo per listing. Note that a 304 still counts as one request against the
rate limit — the win is bandwidth and latency, not quota. For quota, cache
the bytes for the full 24h `max-age`.
