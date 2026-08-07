# Plans, limits, and errors

## Contents

- [Tiers](#tiers)
- [Rate limiting and backoff](#rate-limiting-and-backoff)
- [Lookback](#lookback)
- [Every 402 gate](#every-402-gate)
- [Error catalog](#error-catalog)
- [What each plan can build](#what-each-plan-can-build)

## Tiers

| Plan | Requests/min | Historical lookback |
| --- | --- | --- |
| Free | 5 | 2 years |
| Individual | 300 | 5 years |
| Professional | unlimited* | unlimited |
| Enterprise | unlimited* | unlimited |

\* "Unlimited" means no per-plan cap; a 10,000 requests/minute safety cap still
applies.

There is no credit system and no per-endpoint weighting. **One HTTP request is
one unit**, counted against a 60-second sliding window keyed by API key plus
client IP. A `304` and a `400` both count; only requests you never send are
free. That is why response caching, not retry tuning, is the lever that
matters.

Upgrade path: https://roic.ai/pricing

## Rate limiting and backoff

Every response carries:

| Header | Meaning |
| --- | --- |
| `X-RateLimit-Limit` | your plan's requests-per-minute cap |
| `X-RateLimit-Remaining` | requests left in the current window |
| `X-RateLimit-Reset` | Unix timestamp (seconds) when the window resets |

On breach: `429` with `type: "rate_limit_error"`, `code:
"rate_limit_exceeded"`, and a `Retry-After` header in seconds.

Drive your client from these headers rather than from a fixed sleep. Blind
exponential retry on a 5 rpm plan spends the next window's budget on retries
and never converges.

```python
import time, requests

BASE = "https://api.roic.ai/v3.0.0"

def get(path, params, key):
    while True:
        r = requests.get(f"{BASE}{path}", params=params,
                         headers={"Authorization": f"Bearer {key}"})
        if r.status_code == 429:
            time.sleep(int(r.headers.get("Retry-After", "60")))
            continue
        if r.status_code == 402:
            raise RuntimeError(r.json()["error"]["message"])  # plan boundary, never retry
        r.raise_for_status()
        # Pace proactively so the next call does not trip the limit.
        if int(r.headers.get("X-RateLimit-Remaining", "1")) == 0:
            time.sleep(max(0, int(r.headers["X-RateLimit-Reset"]) - int(time.time())))
        return r.json()
```

If you run several workers, share the budget. The window is keyed on the API
key, so parallel processes contend with each other and each sees the same
`X-RateLimit-Remaining` shrinking underneath it.

## Lookback

Each plan has a date floor: today minus the plan's lookback years. Two
behaviours follow, and the difference matters:

- **Explicit bound past the floor → `402 historical_data_restricted`.** Any
  `date`, `date.gte`, `date.gt`, `date.lte`, `date.lt`, `fiscal_year`, or
  `fiscal_year.*` value that reaches before the floor is rejected. The
  `param` field names the offending parameter, and the message states your
  current window, the window you would gain, and the pricing link.
- **No explicit bound → results are silently floored.** You get data back, it
  simply stops at the plan floor. Do not interpret a short series as missing
  history; check the oldest row's date against your plan window.

Practical consequence: on a Free plan, ask for `fiscal_year.gte` of two years
ago rather than 2000. You get the same rows and no 402.

## Every 402 gate

`402 payment_required_error` fires in exactly these cases.

| Trigger | Code | Minimum plan |
| --- | --- | --- |
| `GET /stock-prices/latest` (bulk board) | `payment_required` | Individual |
| `GET /forex-prices/latest` (bulk board) | `payment_required` | Individual |
| `GET /calendar/earnings` | `payment_required` | Individual |
| `GET /exchanges/trading-hours` | `payment_required` | Individual |
| `GET /exchanges/holidays` | `payment_required` | Individual |
| Fundamentals with `period_type` ≠ `annual`, or any `period_label` | `fundamentals_period_restricted` | Individual |
| Earnings-call retrieve beyond a company's latest 2 calls (Free only) | `earnings_call_restricted` | Individual |
| Any explicit date / fiscal-year bound older than the plan floor | `historical_data_restricted` | depends on how far back |

A 402 is a plan boundary, not a transient failure. Never retry it and never
back off into it — surface the message, which already contains the upgrade
link, and degrade the feature.

## Error catalog

All errors share the shape
`{"error":{"type","code","message","param?","doc_url?","request_id"}}` and are
returned with `Cache-Control: no-store`. Log `request_id` — it is what support
needs.

Types: `invalid_request_error`, `authentication_error`,
`payment_required_error`, `conflict_error`, `rate_limit_error`, `api_error`.

**401 `authentication_error`**

| Code | Cause |
| --- | --- |
| `authentication_required` | no `Authorization` header and no `apikey` |
| `multiple_authentication_methods` | both the header and `apikey` were sent |
| `invalid_authorization_header` | header present but not `Bearer <key>` |
| `invalid_api_key` | key unknown, empty, or `apikey` repeated |

**400 `invalid_request_error`**

| Code | Cause |
| --- | --- |
| `invalid_parameter` | bad value, bad identifier shape, or an **unknown query parameter** |
| `parameter_missing` | a required parameter was omitted |
| `invalid_date_range` | lower bound later than upper bound |
| `parameters_exclusive` | `adjustment` and the deprecated `adjusted` sent together |
| `invalid_pagination_token` / expired token | `page` token malformed, expired (1h), or reused with different filters or `limit` |

Schemas are strict, so a typo like `?symbol=AAPL` on a route that has no
`symbol` parameter is a 400 rather than a silently ignored filter. That is a
feature — it fails loudly instead of quietly returning the wrong universe.

**404 `invalid_request_error` / `resource_missing`** — identifier resolved to
nothing, no data exists for the requested period, or no route matches the path.

**429 `rate_limit_error` / `rate_limit_exceeded`** — see above; obey
`Retry-After`.

**500 / 503 `api_error`** — transient. These are the only statuses worth a
bounded exponential retry.

## What each plan can build

**Free (5 rpm, 2 years).** Single-symbol company pages: profile, logo, one
latest quote, two years of daily prices, annual fundamentals, the latest two
transcripts. Budget five requests per minute total, so cache every response for
its full `Cache-Control` lifetime and drive the UI from local state. Out of
reach: bulk price boards, the earnings calendar, exchange calendars, quarterly
or TTM fundamentals.

**Individual (300 rpm, 5 years).** Everything above plus the bulk stock and
forex boards, the earnings calendar, exchange calendars, and quarterly/TTM
fundamentals. 300 rpm comfortably supports a live dashboard refreshing within
the 4h cache TTLs, plus overnight batch jobs over a few thousand symbols.

**Professional / Enterprise (unlimited, full history).** Whole-universe
screeners, multi-decade backtests, full transcript archives, and cross-sectional
studies. The 10,000 rpm safety cap is the only ceiling, and the cache TTLs are
still the sensible pacing guide.
