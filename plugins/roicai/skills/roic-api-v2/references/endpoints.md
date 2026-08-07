# v2 endpoint map

Everything below is under `https://api.roic.ai/v2` and needs `?apikey=<key>`.
Fundamentals (statements, ratios, valuation metrics) live in
[fundamentals.md](fundamentals.md).

Contents: [Common parameters](#common-parameters) · [Tickers](#tickers) ·
[Reference lists](#reference-lists) · [Company](#company) ·
[Earnings calls](#earnings-calls) · [Market data](#market-data) ·
[Account](#account)

## Common parameters

| Param    | Applies to  | Notes                                                                                      |
| -------- | ----------- | ------------------------------------------------------------------------------------------ |
| `apikey` | every route | Query string only. Missing/unknown → 401.                                                    |
| `order`  | dated lists | `asc` or `desc`, case-insensitive. Default `desc`. Any other value is treated as `desc`.      |
| `limit`  | list routes | Maximum differs per route (see below). Out-of-range values are rejected with 422, not capped. |

Dates are `YYYY-MM-DD` strings. `date_end` is inclusive on news and prices.

`{identifier}` accepts a ticker symbol, CIK, CUSIP, or ISIN. When one identifier
maps to several listings (e.g. a CUSIP shared by `AAPL` and `AAPL.MX`), the API
picks deterministically: exact symbol match first, then the unsuffixed primary
listing.

## Tickers

| Route                                    | Query params                                                    | Returns                                                       |
| ---------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------- |
| `GET /tickers/list`                      | `listed` (boolean-ish string: `true`/`false`)                     | Every ticker: `symbol, name, exchange_name, exchange, type, listed`. No `limit` — this is the full universe, so cache it. |
| `GET /tickers/search`                    | `query` (**required**), `limit` 1–100 (default 10), `exchange`     | Typo-tolerant blended search over symbol *and* company name.  |
| `GET /tickers/search/name`               | `query` (**required**), `limit` 1–100 (default 10), `exchange`     | Name-focused variant of the same search.                      |
| `GET /tickers/search/cik/{cik}`          | —                                                                 | Single match, includes `cik`.                                 |
| `GET /tickers/search/cusip/{cusip}`      | —                                                                 | Single match, includes `cusip`.                               |
| `GET /tickers/search/isin/{isin}`        | —                                                                 | Single match, includes `isin`.                                |
| `GET /tickers/search/exchange/{exchange}`| —                                                                 | Every ticker on one exchange, unlimited rows. One call per exchange. |

`exchange` values are the short codes from `/exchanges/list` (matched
case-insensitively). Empty result sets on these routes return **404**, not `[]`.

`Cache-Control: public, max-age=86400` (24h) on all ticker routes.

```bash
curl "https://api.roic.ai/v2/tickers/search?query=appel&limit=5&apikey=$ROIC_API_KEY"
curl "https://api.roic.ai/v2/tickers/search/exchange/NASDAQ?apikey=$ROIC_API_KEY"
```

## Reference lists

All four take no parameters beyond `apikey`/`format`, return every row, and are
cached 24h. Fetch once per day at most.

| Route                    | Columns                                |
| ------------------------ | -------------------------------------- |
| `GET /exchanges/list`    | `exchange, exchange_name, ticker_count` |
| `GET /sectors/list`      | `sector, ticker_count`                  |
| `GET /industries/list`   | `industry, ticker_count`                |
| `GET /countries/list`    | `country, country_code, ticker_count`   |

## Company

### `GET /company/profile/{identifier}`

No parameters. Returns one object with `ticker, company_name, cik, cusip, isin,
currency, description, website, address, city, state, zip, country,
country_code, phone, sector, industry, ceo, full_time_employees, ipo_date,
is_adr, price, dividend_yield, last_dividend, dividend_date, ex_dividend_date,
earnings_date, percentage_held_by_insiders, percentage_held_by_institutions,
short_shares_outstanding, short_shares_outstanding_percentage, exchange,
exchange_short_name`. Cached 24h — treat it as static per day.

### `GET /company/news/{identifier}`

| Param        | Range                       | Default |
| ------------ | --------------------------- | ------- |
| `limit`      | 1–200                       | 20      |
| `page`       | ≥ 0, offset = `page*limit`  | 0       |
| `date_start` | `YYYY-MM-DD`                | —       |
| `date_end`   | `YYYY-MM-DD` (inclusive)    | —       |

Rows: `symbol, title, article_url, article_text, published_date, site`, newest
first. This is the **only** paginated route in v2, and it is offset-based — new
articles arriving mid-walk shift rows across pages, so bound every walk with
`date_start`/`date_end` and stop when a page is short. An empty result is `[]`
with 200 (not 404). Cached 4h.

### `GET /company/logo/{identifier}`

Serves image **bytes**, not JSON or a URL.

| Param       | Values                    | Default |
| ----------- | ------------------------- | ------- |
| `size`      | 16–800 (px, longest side) | 128     |
| `greyscale` | `true`/`false`            | `false` |
| `format`    | `webp` or `png`           | `webp`  |

Never upscales beyond the stored image. This is the one route that sends an
`ETag` and answers `If-None-Match` with `304`, so cache the ETag if you re-fetch
logos. A company with no stored logo returns 404.

## Earnings calls

| Route                                            | Params                                                | Returns                                     |
| ------------------------------------------------ | ----------------------------------------------------- | ------------------------------------------- |
| `GET /company/earnings-calls/latest/{identifier}` | —                                                     | One object: `symbol, year, quarter, date, content` |
| `GET /company/earnings-calls/list/{identifier}`   | `limit` 1–500 (default 100)                           | `symbol, year, quarter, date` — the index, no transcript text |
| `GET /company/earnings-calls/transcript/{identifier}` | `year` (**required**), `quarter` (**required**, 1–4) | One object incl. full `content`              |

Use `list` to discover which quarters exist, then fetch only the transcripts you
actually need — transcript bodies are large. Missing `year`/`quarter` on the
transcript route is a 422; a quarter with no call is a 404. Cached 4h.

```bash
curl "https://api.roic.ai/v2/company/earnings-calls/list/MSFT?limit=20&apikey=$ROIC_API_KEY"
curl "https://api.roic.ai/v2/company/earnings-calls/transcript/MSFT?year=2024&quarter=3&apikey=$ROIC_API_KEY"
```

## Market data

### `GET /stock-prices/{identifier}` — daily OHLCV history

| Param        | Range                    | Default |
| ------------ | ------------------------ | ------- |
| `limit`      | 1–**100000**             | 100     |
| `date_start` | `YYYY-MM-DD`             | —       |
| `date_end`   | `YYYY-MM-DD`             | —       |
| `order`      | `asc`/`desc`             | `desc`  |

Columns: `date, open, high, low, close, adj_close, volume, unadjusted_volume,
change, change_percent, vwap, label`. The 100000 ceiling exists so a full daily
history is a single request — use it rather than year-by-year windows. Cached 4h.

### `GET /stock-prices/latest/{identifier}`

No parameters; one row, same columns. Cached 4h. There is no bulk
"latest price for every ticker" route in v2 (v3 has one).

### `GET /stock-splits` — split calendar across all tickers

| Param        | Range                   | Default |
| ------------ | ----------------------- | ------- |
| `limit`      | 1–10000                 | 100     |
| `date_start` | `YYYY-MM-DD`            | —       |
| `date_end`   | `YYYY-MM-DD`            | —       |
| `order`      | `asc`/`desc`            | `desc`  |

### `GET /stock-splits/{identifier}` — one company's split history

No parameters beyond `apikey`. Cached 24h (the calendar route is cached 4h).

Split columns: `id, symbol, split_date, split_ratio, split_factor,
is_reverse_split, pre_split_shares, post_split_shares, pre_split_price,
post_split_price, currency`.

## Account

### `GET /usage`

Returns the caller's plan and live rate-limit state without consuming quota. See
[plans-and-limits.md](plans-and-limits.md).
