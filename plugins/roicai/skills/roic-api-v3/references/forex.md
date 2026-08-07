# Forex

Currency pairs and daily FX rates. Four operations.

Cache policy: `/forex-pairs` is `private, max-age=86400` (24h, it is reference
data). The three price routes are `private, max-age=14400` (4h).

## Contents

- [Pair identifiers](#pair-identifiers)
- [Pair catalog](#pair-catalog)
- [Bulk latest rates](#bulk-latest-rates)
- [One latest rate](#one-latest-rate)
- [Historical rate series](#historical-rate-series)

## Pair identifiers

Unlike stock tickers, a currency pair is globally unique, so v3 accepts the
bare form. All of these resolve to the same pair:

`FX:EURUSD` · `EURUSD` · `EUR/USD` · `EUR-USD` · `EUR_USD`

Responses always publish the canonical `FX:EURUSD` form. Store that. Anything
that is not two three-letter codes (optionally prefixed and separated) is a
`400 invalid_parameter`.

## Pair catalog

`GET /forex-pairs`

| Parameter | Values | Default |
| --- | --- | --- |
| `base_currency` | 3-letter code, matches the base side | — |
| `quote_currency` | 3-letter code, matches the quote side | — |
| `currency` | 3-letter code, matches **either** side | — |
| `search` | free text over symbol, both codes, and description | — |
| `order` | `asc`, `desc` | `asc` |
| `limit` | 1–**2000** | 500 |
| `page` | opaque cursor | — |

Rows: `symbol`, `name`, `base_currency`, `base_currency_name`,
`quote_currency`, `quote_currency_name`, `is_synthetic`.

`currency=USD` is the budget lever here: it matches `USDxxx` **and** `xxxUSD`
in one request, where `base_currency=USD` plus `quote_currency=USD` would be
two. At `limit=2000` the whole catalog is one call — fetch it once a day and
resolve pairs locally.

```bash
curl -H "Authorization: Bearer $ROIC_API_KEY" \
  "https://api.roic.ai/v3.0.0/forex-pairs?currency=USD&limit=2000"
```

## Bulk latest rates

`GET /forex-prices/latest` — **Individual plan or higher.**

| Parameter | Values | Default |
| --- | --- | --- |
| `base_currency` | 3-letter code | — |
| `quote_currency` | 3-letter code | — |
| `currency` | matches either side | — |
| `order` | `asc`, `desc` | `asc` |
| `limit` | 1–**2000** | 500 |
| `page` | opaque cursor | — |

Rows: `symbol`, `date`, `open`, `high`, `low`, `close` — one row per pair.

This is the FX equivalent of the bulk stock board. A multi-currency
normalization table for a whole portfolio is one request; per-pair fetching is
one request per pair. Free-plan callers get `402 payment_required` — "The
latest forex prices list requires an Individual or higher plan."

```bash
curl -H "Authorization: Bearer $ROIC_API_KEY" \
  "https://api.roic.ai/v3.0.0/forex-prices/latest?currency=USD&limit=2000"
```

## One latest rate

`GET /forex-prices/latest/{identifier}` — no query parameters except `apikey`.
Free plan. Returns a single object: `symbol`, `date`, `open`, `high`, `low`,
`close`.

The Free-plan path for currency conversion: one call per pair you actually
need, cached for the 4h TTL.

## Historical rate series

`GET /forex-prices/{identifier}`

| Parameter | Values | Default |
| --- | --- | --- |
| `date` | exact `YYYY-MM-DD` | — |
| `date.gte` / `date.gt` / `date.lte` / `date.lt` | range bounds | — |
| `order` | `asc`, `desc` | `desc` |
| `limit` | 1–**1000** | 250 |
| `page` | opaque cursor | — |

The envelope hoists `symbol` to the top level and rows are `date`, `open`,
`high`, `low`, `close`.

```bash
curl -H "Authorization: Bearer $ROIC_API_KEY" \
  "https://api.roic.ai/v3.0.0/forex-prices/FX:EURUSD?date.gte=2023-01-01&date.lte=2025-12-31&order=asc&limit=1000"
```

Inverted bounds are `400 invalid_date_range`. An explicit bound older than your
plan's lookback floor is `402 historical_data_restricted`.
