# Budget patterns

On the free tier you get five requests a minute. Most v2 integrations that feel
"too slow" or "rate limited constantly" are not fetching too much data — they
are fetching a small amount of data across far too many requests. These are the
patterns that collapse a loop into a call.

## 1. Whole fundamental history in one request

`limit` on every `/v2/fundamental/*` route goes to **250**, which is more
periods than any listed company has. Combine it with a fiscal-year range when
you want a specific era.

```bash
# 20+ years of annual income statements — one request
curl "https://api.roic.ai/v2/fundamental/income-statement/AAPL?period=annual&limit=250&order=asc&apikey=$ROIC_API_KEY"

# Every quarter from FY2015 to FY2024 — still one request
curl "https://api.roic.ai/v2/fundamental/balance-sheet/AAPL?period=quarterly&limit=250&fiscal_year_start=2015&fiscal_year_end=2024&apikey=$ROIC_API_KEY"
```

Anti-pattern to delete on sight:

```python
# 20 requests, 20x the quota, identical result to one limit=250 call
for year in range(2005, 2025):
    get(f"/v2/fundamental/income-statement/AAPL?fiscal_year_start={year}&fiscal_year_end={year}")
```

Same for quarters: `period=quarterly` already returns every quarter. Looping
`period=Q1..Q4` quadruples the cost and returns a subset each time.

Remember the default `limit` is **10**. Omitting it is the other common bug —
you silently get a decade of annuals or two and a half years of quarters.

## 2. Whole price history in one request

```bash
curl "https://api.roic.ai/v2/stock-prices/AAPL?limit=100000&date_start=1990-01-01&order=asc&apikey=$ROIC_API_KEY"
```

100000 daily bars is roughly 400 years of trading — the ceiling exists precisely
so nobody has to window by year. Add `date_start`/`date_end` only to narrow the
range you actually want, never to paginate.

For a single quote use `/v2/stock-prices/latest/{identifier}`; it is one row and
avoids parsing a history you will throw away.

## 3. Whole exchange in one request

```bash
curl "https://api.roic.ai/v2/tickers/search/exchange/NASDAQ?apikey=$ROIC_API_KEY"
```

This returns every listing on the exchange with no `limit`. `/v2/tickers/list`
does the same for the entire universe. Both are cached 24h — fetch once a day
into your own store and resolve symbols locally instead of calling
`/v2/tickers/search` per user keystroke.

The same logic applies to `/v2/exchanges/list`, `/v2/sectors/list`,
`/v2/industries/list`, `/v2/countries/list`: static, cheap, cache daily.

## 4. Bound news pagination

News is the only paginated route, and it is offset-based (`page` x `limit`),
which means an article published mid-walk shifts every later page by one and can
duplicate or skip rows.

```bash
# page 0, 1, 2 … within a fixed window; stop when a page returns < limit rows
curl "https://api.roic.ai/v2/company/news/AAPL?limit=200&page=0&date_start=2024-01-01&date_end=2024-03-31&apikey=$ROIC_API_KEY"
```

Rules that keep this cheap and correct:

- Always set `date_start` **and** `date_end`, so the walk terminates.
- Use `limit=200` (the max) so a quarter of news is one or two pages, not ten.
- Stop as soon as a page returns fewer than `limit` rows.
- Poll for new articles by re-querying only the recent window, not by re-walking
  the archive. The route is cached 4h, so polling faster than that gains nothing.

## 5. Fetch transcripts by index, not by sweep

`/v2/company/earnings-calls/list/{identifier}` returns the year/quarter index
without transcript bodies (`limit` up to 500). Read the index once, then fetch
only the specific transcripts you need via
`/v2/company/earnings-calls/transcript/{identifier}?year=&quarter=`. Sweeping
every quarter "to see what exists" burns quota on 404s and megabytes of text.

## 6. Respect the cache windows

The API tells you how long its own data is good for. Mirror those windows in
your client cache; requests served from your cache cost nothing.

| Data                                                    | `Cache-Control` |
| ------------------------------------------------------- | --------------- |
| Ticker lists, searches, exchanges/sectors/industries/countries, company profile, per-company splits | 24h (`max-age=86400`) |
| Fundamentals, ratios, valuation metrics, prices, news, earnings calls, split calendar | 4h (`max-age=14400`) |

There is no `ETag` on JSON routes, so a conditional request cannot save you a
call — the cache window is the whole mechanism. (Only `/v2/company/logo/...`
supports `ETag`/`If-None-Match`/`304`.)

## 7. Throttle from `/v2/usage`, back off on 429

Read `/v2/usage` once at startup (it costs no quota) and size a client-side
limiter from `limit`. Then treat 429 as authoritative:

```python
r = session.get(url, params={**params, "apikey": API_KEY})
if r.status_code == 429:
    time.sleep(int(r.headers.get("Retry-After", "60")))
    r = session.get(url, params={**params, "apikey": API_KEY})
r.raise_for_status()
```

Watch `X-RateLimit-Remaining` on every response and slow down before it reaches
zero; the window slides, so pausing early is cheaper than colliding.

Do **not** retry 401, 403, 404, or 422 — none of them become successful on a
second identical attempt, and each one still counts against the quota.

## 8. Sequence a multi-company job deliberately

There is no batch route: N companies x M data types = N x M requests. So:

1. Resolve every symbol locally from a cached ticker dump (0 requests).
2. Pick the **narrowest** fundamentals route that has the fields you need — one
   call to `ratios/profitability` beats pulling the full income statement and
   the full balance sheet to compute margins yourself.
3. Fetch full history per company in one call each, and persist it. Fundamentals
   change quarterly; re-fetching daily is pure waste.
4. Refresh only prices (and only the recent tail) on a short cycle.

A 40-name watchlist done this way is 40 requests on first load and a handful per
day afterwards. Done naively — profile + statements + ratios + prices, looped
per year — it is thousands.

## 9. If the request budget is the bottleneck, move to v3

v3 adds cursor pagination and bulk routes that return the latest price for every
ticker in a single call, which v2 has no equivalent for. For a new build, or a
rewrite whose cost is dominated by per-symbol fan-out, v3 is the right target
rather than tuning v2 further.
