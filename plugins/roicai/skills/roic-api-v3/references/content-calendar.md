# Content and calendar

Earnings-call transcripts and the earnings calendar. Three operations.

Cache policy: `Cache-Control: private, max-age=14400` (4h) on all three.

## Contents

- [List earnings calls](#list-earnings-calls)
- [Retrieve a transcript](#retrieve-a-transcript)
- [Free-plan transcript limit](#free-plan-transcript-limit)
- [Earnings calendar](#earnings-calendar)

## List earnings calls

`GET /earnings-calls`

| Parameter | Values | Default |
| --- | --- | --- |
| `identifier` | optional; omit to span all companies | — |
| `fiscal_year` | 1990–2100 | — |
| `fiscal_quarter` | 1–4 | — |
| `date` | exact call date `YYYY-MM-DD` | — |
| `date.gte` / `date.gt` / `date.lte` / `date.lt` | call-date range | — |
| `order` | `asc`, `desc` | `desc` |
| `limit` | 1–**100** | 50 |
| `page` | opaque cursor | — |

Rows are summaries only — `id`, `object`, `symbol`, `fiscal_year`,
`fiscal_quarter`, `date`. No transcript text. This is the index you use to
discover which `fiscal_year`/`fiscal_quarter` pairs exist before spending a
request on a full transcript.

Omitting `identifier` spans every company, so "which calls happened this week"
is one request:

```bash
curl -H "Authorization: Bearer $ROIC_API_KEY" \
  "https://api.roic.ai/v3.0.0/earnings-calls?date.gte=2026-01-20&date.lte=2026-01-27&limit=100"
```

## Retrieve a transcript

`GET /earnings-calls/{identifier}?fiscal_year=<year>&fiscal_quarter=<1-4>`

| Parameter | Values | Required |
| --- | --- | --- |
| `fiscal_year` | 1990–2100 | yes |
| `fiscal_quarter` | 1–4 | yes |
| `format` | `json`, `text` | no |

`format=json` returns `transcript` as an array of `{ speaker, text }` turns —
use it when you need per-speaker attribution or want to feed structured turns
to a model. `format=text` returns the transcript as one string. The rest of the
object is `id`, `object`, `symbol`, `fiscal_year`, `fiscal_quarter`, `date`.

There is no "latest call" shortcut and no way to fetch several transcripts in
one request. Get the period from `/earnings-calls` first, then fetch. One
transcript is one request, so cache aggressively — transcripts are immutable
once published.

```bash
curl -H "Authorization: Bearer $ROIC_API_KEY" \
  "https://api.roic.ai/v3.0.0/earnings-calls/NASDAQ:AAPL?fiscal_year=2025&fiscal_quarter=4&format=json"
```

## Free-plan transcript limit

The Free plan includes **the latest two calls per company**. The two routes
express that differently, which matters when you write error handling:

- `/earnings-calls` (list) **silently** returns only each company's two most
  recent calls. No error — the page is simply shorter than a paid plan's.
  Don't treat the shorter list as missing data.
- `/earnings-calls/{identifier}` (retrieve) returns
  `402 earnings_call_restricted` for anything older, with `param: "fiscal_year"`
  and a message pointing at https://roic.ai/pricing.

Paid plans get history bounded by their lookback window instead
(`402 historical_data_restricted` past the floor).

## Earnings calendar

`GET /calendar/earnings` — **Individual plan or higher.**

| Parameter | Values | Default |
| --- | --- | --- |
| `identifier` | optional; omit to span all companies | — |
| `date` | exact release date | — |
| `date.gte` / `date.gt` / `date.lte` / `date.lt` | release-date range | — |
| `order` | `asc`, `desc` | `desc` |
| `limit` | 1–**500** | 100 |
| `page` | opaque cursor | — |

Rows: `id`, `object`, `symbol`, `exchange`, `period_end_date`,
`fiscal_period`, `release_date`, `release_time`, `release_session`,
`is_confirmed`, `is_reported`, `eps_actual`, `eps_estimate`, `eps_surprise`,
`eps_surprise_percent`, `revenue_actual`, `revenue_estimate`,
`revenue_surprise`, `revenue_surprise_percent`, `currency`, `updated_at`.

Estimates, actuals, and surprises all arrive in the same row, so a full
earnings-season dashboard — upcoming schedule plus beat/miss table — is one
request per 500 events:

```bash
curl -H "Authorization: Bearer $ROIC_API_KEY" \
  "https://api.roic.ai/v3.0.0/calendar/earnings?date.gte=2026-01-01&date.lte=2026-03-31&order=asc&limit=500"
```

Free-plan callers get `402 payment_required` — "The earnings calendar requires
an Individual or higher plan." The closest Free-plan substitute is the
`earnings_schedule` and `reporting_calendar` fields on
`/company/profile/{identifier}`, which cover one company at a time.
