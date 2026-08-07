# Plans, rate limits, and error behaviour

Two things vary by plan on v2: **requests per minute** and **how far back in
history you may reach**. Every plan can call every endpoint — there is no
per-endpoint entitlement, so a 403 is always about dates, never about the route.

## Tiers

| Plan                  | Requests / minute | Historical lookback |
| --------------------- | ----------------- | ------------------- |
| Free                  | 5                 | 2 years             |
| Individual (basic)    | 300               | 5 years             |
| Professional (pro)    | unlimited\*       | unlimited           |
| Enterprise            | unlimited\*       | unlimited           |

\* A high safety cap still applies server-side; normal traffic never reaches it.

Upgrade at **https://roic.ai/pricing**.

## `GET /v2/usage` — check your plan without spending quota

```bash
curl "https://api.roic.ai/v2/usage?apikey=$ROIC_API_KEY"
```

```json
{
  "plan": "free",
  "limit": 5,
  "remaining": 3,
  "reset": 1735689600,
  "lookbackYears": 2,
  "window": "1m"
}
```

- `limit` and `lookbackYears` are `null` on unlimited plans.
- `reset` is a Unix timestamp (seconds) for when the current window frees up.
- This route is **exempt from the rate limit** — calling it does not consume a
  request. It still needs a valid key (401 otherwise) and is sent `no-cache`.

Call it once at startup to size your own client-side throttle instead of
discovering the limit through 429s.

## Rate limiting

Every metered response carries:

| Header                  | Meaning                                        |
| ----------------------- | ---------------------------------------------- |
| `X-RateLimit-Limit`     | Requests allowed in the current 1-minute window |
| `X-RateLimit-Remaining` | Requests left in the window                     |
| `X-RateLimit-Reset`     | Unix timestamp (seconds) when the window rolls  |

On breach the API returns **429** with a `Retry-After` header (seconds) and:

```json
{"error": "Rate limit exceeded: max 5 requests/minute on the free plan. Retry in 42s or upgrade at https://roic.ai/pricing"}
```

The window is a **sliding** one-minute window, not a fixed calendar minute, so
bursting five requests then waiting 60 seconds is not the same as pacing them —
respect `Retry-After` rather than guessing. See
[budget-patterns.md](budget-patterns.md) for a client-side pattern.

## Lookback: 403 versus silent capping

The plan floor is "today minus `lookbackYears`". How a request meets that floor
depends on whether it *asked* for old data:

**You asked explicitly → 403.** If `date_start`, `date_end`,
`fiscal_year_start`, `fiscal_year_end`, or `year` names a point older than the
floor, the request is rejected before any data is read:

```json
{"error": "Your Free plan includes 2 years of history. This request reaches back ~11 years. Upgrade to Professional for unlimited history: https://roic.ai/pricing"}
```

The message names the minimum plan that would cover the range, so surface it to
the user verbatim rather than replacing it with a generic "forbidden". Note the
status is **403**, not 402 — do not branch on a payment-required code.

**You did not ask → silently capped.** A request with no date bounds is served
successfully with a truncated window: rows older than the floor are filtered
out, *and* your `limit` is quietly reduced to the number of periods the window
can hold:

| Route cadence                      | Free (2y) effective cap | Individual (5y) effective cap |
| ---------------------------------- | ----------------------- | ----------------------------- |
| `period=annual`                    | 3 rows                  | 6 rows                        |
| `period=quarterly` / `Q1..Q4` / `TTM` | 12 rows              | 24 rows                       |
| Daily prices                       | 1098 rows               | 2196 rows                     |
| Event data (splits, news)          | no row cap; date floor only | no row cap; date floor only |

(The cap is `(lookbackYears + 1) x periods-per-year`, deliberately one year
loose so it never trims inside the allowed window.)

**The practical consequence:** on a limited plan, `limit=250` is *not* an error
and *not* a full history — you get the plan window. If your code asserts "I
requested 250 periods so I have 250 periods", it will silently analyse three
years of data. Check `X-RateLimit-*`-style expectations against the actual row
count, or read `lookbackYears` from `/v2/usage` first.

Unlimited plans are unaffected: no floor, no cap, `limit` honoured as given.

## Authentication failures

| Situation                          | Status | Body                                                                          |
| ---------------------------------- | ------ | ----------------------------------------------------------------------------- |
| No `apikey` at all                 | 401    | `{"error": "Invalid or missing API key. Get one at https://roic.ai/account."}` |
| Unknown / revoked key              | 401    | same                                                                          |
| Valid key, no paid subscription    | 200    | Served as the Free tier                                                       |

A registered key with no subscription is a *valid* key — free tier, not 401. So
a 401 always means the key string itself is wrong (typo, wrong environment,
URL-encoding), never that the account needs upgrading. Never retry a 401.

## Retry guidance

| Status | Retry?                                                                   |
| ------ | ------------------------------------------------------------------------ |
| 401    | No — fix the key.                                                        |
| 403    | No — narrow the date range, or upgrade. Retrying identical params re-fails. |
| 404    | No — the identifier or the period genuinely has no data.                  |
| 422    | No — a parameter is out of range; fix it (check maximums per route).      |
| 429    | Yes, after `Retry-After` seconds.                                        |
| 5xx    | Yes, with exponential backoff. The body carries an ingestion ID — include it if you contact support. |
