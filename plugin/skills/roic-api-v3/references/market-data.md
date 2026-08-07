# Market data

Daily stock prices and corporate actions. Four operations.

Cache policy: `Cache-Control: private, max-age=14400` (4h) on all four. Prices
are end-of-day bars, not a real-time tick feed — polling faster than the TTL
returns identical bytes and burns quota.

## Contents

- [Bulk latest prices](#bulk-latest-prices-the-single-biggest-budget-lever)
- [One latest price](#one-latest-price)
- [Historical price series](#historical-price-series)
- [Adjustment](#adjustment)
- [Stock splits](#stock-splits)

## Bulk latest prices (the single biggest budget lever)

`GET /stock-prices/latest` — **Individual plan or higher.**

| Parameter | Values | Default |
| --- | --- | --- |
| `exchange` | exchange code | — |
| `order` | `asc`, `desc` | `asc` |
| `limit` | 1–**2000** | 500 |
| `page` | opaque cursor | — |

Rows: `symbol`, `date`, `open`, `high`, `low`, `close`, `volume`, `currency` —
one row per ticker, latest bar only.

This replaces the per-symbol quote loop. A 1,500-name watchlist is one request
at `limit=2000`, not 1,500. Filter to `exchange=NASDAQ` when you only need one
venue; otherwise take the whole universe and join locally against your own
symbol list.

```bash
curl -H "Authorization: Bearer $ROIC_API_KEY" \
  "https://api.roic.ai/v3.0.0/stock-prices/latest?limit=2000"
```

On the Free plan this returns `402 payment_required` — "The latest stock
prices list requires an Individual or higher plan." Free-plan code should use
`/stock-prices/latest/{identifier}` for the handful of symbols it actually
shows, and accept that a wide board is not a Free-plan feature.

## One latest price

`GET /stock-prices/latest/{identifier}` — accepts no query parameters except
`apikey`. Free plan. Returns a single object: `symbol`, `date`, `open`,
`high`, `low`, `close`, `volume`, `currency`.

Fine for one to a few symbols. Past roughly a dozen, the bulk route is
cheaper even after accounting for the plan upgrade.

## Historical price series

`GET /stock-prices/{identifier}`

| Parameter | Values | Default |
| --- | --- | --- |
| `date` | exact `YYYY-MM-DD` | — |
| `date.gte` / `date.gt` / `date.lte` / `date.lt` | `YYYY-MM-DD` range bounds | — |
| `adjustment` | `none`, `splits`, `total_return` | `none` |
| `adjusted` | `true`, `false` — **deprecated** | — |
| `order` | `asc`, `desc` | `desc` |
| `limit` | 1–**1000** | 250 |
| `page` | opaque cursor | — |

The response hoists the constants: `{ "data": [...], "symbol": "...",
"currency": "...", "next_page_url": ..., "previous_page_url": ... }`, and each
row is just `date`, `open`, `high`, `low`, `close`, `volume`.

One call with a range and `limit=1000` covers about four trading years. Do not
loop month by month.

```bash
curl -H "Authorization: Bearer $ROIC_API_KEY" \
  "https://api.roic.ai/v3.0.0/stock-prices/NASDAQ:AAPL?date.gte=2020-01-01&date.lte=2024-12-31&adjustment=total_return&order=asc&limit=1000"
```

Inverting the bounds (`date.gte` later than `date.lte`) is
`400 invalid_date_range`, not an empty list.

## Adjustment

| Value | Meaning |
| --- | --- |
| `none` (default) | raw as-traded prices |
| `splits` | split-adjusted |
| `total_return` | split- and dividend-adjusted |

`adjusted=true` is the deprecated boolean alias of `adjustment=splits`.
Sending `adjustment` and `adjusted` together is `400 parameters_exclusive` —
pick one, and prefer `adjustment` in new code.

Choosing the right mode up front avoids a second pull: use `total_return` for
performance and backtests, `splits` for chart continuity, `none` only when you
need the historical tape as printed.

## Stock splits

`GET /stock-splits`

| Parameter | Values | Default |
| --- | --- | --- |
| `identifier` | optional; omit to span all companies | — |
| `date` | exact `YYYY-MM-DD` | — |
| `date.gte` / `date.gt` / `date.lte` / `date.lt` | range bounds | — |
| `order` | `asc`, `desc` | `desc` |
| `limit` | 1–**500** | 100 |
| `page` | opaque cursor | — |

Rows: `id`, `object`, `symbol`, `exchange`, `mic`, `execution_date`, `factor`,
`split_from`, `split_to`, `is_reverse`, `pre_split_shares`,
`post_split_shares`, `pre_split_price`, `post_split_price`, `currency`,
`updated_at`.

Omitting `identifier` makes this a market-wide corporate-action feed. A nightly
"what split today" job is one request:

```bash
curl -H "Authorization: Bearer $ROIC_API_KEY" \
  "https://api.roic.ai/v3.0.0/stock-splits?date.gte=2026-01-01&limit=500"
```

Iterating your universe and calling this once per symbol is the anti-pattern —
the cross-company page already contains every row you would have collected.
