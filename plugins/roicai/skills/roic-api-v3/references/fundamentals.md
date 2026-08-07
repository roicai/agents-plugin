# Fundamentals

Eleven routes, one shared query model. Each returns flat rows of one period
with every metric in that category.

Cache policy: `Cache-Control: private, max-age=14400` (4h). Fundamentals change
on filing day, so a 4h client cache is conservative — a daily refresh is
usually enough.

## Contents

- [The eleven routes](#the-eleven-routes)
- [Shared query model](#shared-query-model)
- [Period semantics](#period-semantics)
- [Common row fields](#common-row-fields)
- [Field categories](#field-categories)
- [Budget notes](#budget-notes)

## The eleven routes

All take the form `GET /fundamental/<category>/{identifier}`.

| Route | `object` | What it holds |
| --- | --- | --- |
| `/fundamental/income-statement/{identifier}` | `v3.fundamentals.income_statement` | revenue through EPS, margins, EBITDA/EBIT |
| `/fundamental/balance-sheet/{identifier}` | `v3.fundamentals.balance_sheet` | assets, liabilities, equity, net debt, shares out |
| `/fundamental/cash-flow/{identifier}` | `v3.fundamentals.cash_flow_statement` | operating/investing/financing, capex, FCF |
| `/fundamental/ratios/profitability/{identifier}` | `v3.fundamentals.profitability_ratio` | ROE, ROA, ROIC, margins, tax rate, payout |
| `/fundamental/ratios/credit/{identifier}` | `v3.fundamentals.credit_ratio` | leverage and coverage ratios |
| `/fundamental/ratios/liquidity/{identifier}` | `v3.fundamentals.liquidity_ratio` | current/quick/cash ratio, Altman Z |
| `/fundamental/ratios/working-capital/{identifier}` | `v3.fundamentals.working_capital_ratio` | turnover days, cash conversion cycle |
| `/fundamental/ratios/yield-analysis/{identifier}` | `v3.fundamentals.yield_analysis_ratio` | FCF yield, shareholder yield, capital yield |
| `/fundamental/enterprise-value/{identifier}` | `v3.fundamentals.enterprise_value` | market cap, EV, EV/TTM multiples |
| `/fundamental/multiples/{identifier}` | `v3.fundamentals.valuation_multiple` | P/E, P/B, P/S, P/FCF, EV multiples with hi/lo/avg |
| `/fundamental/per-share/{identifier}` | `v3.fundamentals.per_share_metric` | EPS, BVPS, FCF/share, dividends per share |

There is **no combined endpoint and no field selection**. A screen that needs
revenue and ROIC is two requests, not one — pick the smallest set of categories
that answers the question rather than pulling all eleven by reflex.

## Shared query model

| Parameter | Values | Default |
| --- | --- | --- |
| `period_type` | `annual`, `quarterly`, `ttm` | `annual` |
| `period_label` | `FY`, `Q1`, `Q2`, `Q3`, `Q4` | — |
| `date` | exact `YYYY-MM-DD` period end | — |
| `date.gte` / `date.gt` / `date.lte` / `date.lt` | period-end range bounds | — |
| `fiscal_year.gte` / `.gt` / `.lte` / `.lt` | fiscal-year bounds, 1–9999 | — |
| `order` | `asc`, `desc` | `desc` |
| `limit` | 1–**100** | 50 |
| `page` | opaque cursor | — |

One exception: `/fundamental/ratios/profitability` and
`/fundamental/ratios/credit` do **not** accept the exact `date` parameter. They
accept the `date.*` range bounds and everything else. Use `date.gte`+`date.lte`
with the same value if you need a single period there.

Any parameter outside this list is `400 invalid_parameter` — there is no
`fields`, `metrics`, `columns`, or `format` parameter.

## Period semantics

- `period_type=annual` (default) returns fiscal years.
- `period_type=quarterly` returns individual quarters.
- `period_type=ttm` returns trailing-twelve-month periods.
- `period_label` narrows to a specific label. `FY` pairs with annual; `Q1`–`Q4`
  pair with quarterly. Mismatched combinations are rejected.

**Free plan:** anything other than `period_type=annual` with no `period_label`
returns `402 fundamentals_period_restricted` — "The Free plan includes annual
fundamentals only." The `param` field tells you which parameter tripped it
(`period_type` or `period_label`). Do not retry; either drop to annual or
upgrade at https://roic.ai/pricing.

## Common row fields

Every row from every category starts with the same period header:

`id`, `object`, `symbol`, `period_type`, `period_end_date`, `fiscal_year`,
`period_label`, `currency`, `price_currency`, `fx_applied`

`currency` is the reporting currency; `price_currency` and `fx_applied` tell
you whether market-linked figures were converted. Check `fx_applied` before
comparing valuation metrics across listings in different currencies.

## Field categories

Row bodies are flat and wide — every metric in the category is present on every
row, with `null` where the filer did not report it. Representative fields:

- **income statement** — `is_sales_revenue_turnover`, `is_cogs`,
  `is_gross_profit`, `is_oper_income`, `is_pretax_income`, `is_net_income`,
  `eps`, `diluted_eps`, `ebitda`, `ebit`, `gross_margin`, `oper_margin`,
  `profit_margin`, `div_per_shr`
- **balance sheet** — `bs_cash_near_cash_item`, `bs_inventories`,
  `bs_cur_asset_report`, `bs_tot_asset`, `bs_cur_liab`, `bs_tot_liab`,
  `bs_total_equity`, `bs_sh_out`, `net_debt`, `cur_ratio`, `num_of_employees`
- **cash flow** — `cf_cash_from_oper`, `cf_cash_from_inv_act`,
  `cf_cash_from_fin_act`, `cf_cap_expenditures`, `cf_free_cash_flow`,
  `cf_free_cash_flow_firm`, `cf_dvd_paid`, `cf_stock_based_compensation`
- **profitability** — `return_com_eqy`, `return_on_asset`, `return_on_cap`,
  `return_on_inv_capital`, `eff_tax_rate`, `dvd_payout_ratio`,
  `sustain_growth_rt`
- **credit** — `tot_debt_to_ebitda`, `net_debt_to_ebitda`,
  `ebitda_to_interest_expn`, `lt_debt_to_tot_cap`, `net_debt_to_capital`
- **liquidity** — `cash_ratio`, `cur_ratio`, `quick_ratio`,
  `cash_flow_to_tot_liab`, `altman_z_score`
- **working capital** — `acct_rcv_days`, `invent_days`,
  `accounts_payable_turnover_days`, `cash_conversion_cycle`
- **yield analysis** — `ttm_free_cash_flow`, `free_cash_flow_yield`,
  `shareholder_yield_cff`, `shareholder_yield_ex_debt`, `capital_yield`
- **enterprise value** — `market_cap`, `enterprise_value`, `ev_to_ttm_sales`,
  `ev_to_ttm_ebitda`, `ev_to_ttm_ebit`, `diluted_ev`, `total_debt_to_ev`
- **multiples** — `pe_ratio`, `pr_to_book_ratio`, `pr_to_sales_ratio`,
  `pr_to_free_cash_flow`, plus `average_*` / `high_*` / `low_*` variants and
  `pr_last`, `pr_high`, `pr_low`
- **per share** — `revenue_per_sh`, `ebitda_per_sh`, `eps`, `diluted_eps`,
  `div_per_shr`, `cash_flow_per_sh`, `free_cash_flow_per_sh`,
  `book_val_per_sh`, `tang_book_val_per_sh`

Because the row is already complete, computing a derived metric client-side is
free; asking for a second category to get one number is not.

## Budget notes

At `limit=100` a single annual call returns a century of filings — more history
than exists for any issuer. Never paginate annual fundamentals and never loop
per year.

```bash
# Twenty-five fiscal years of income statements, one request
curl -H "Authorization: Bearer $ROIC_API_KEY" \
  "https://api.roic.ai/v3.0.0/fundamental/income-statement/NASDAQ:AAPL?period_type=annual&fiscal_year.gte=2000&order=asc&limit=100"
```

Quarterly is where pagination starts to matter: 100 quarters is 25 years, so a
long quarterly history of one company is still one or two requests.

An explicit `date.*` or `fiscal_year.*` bound that reaches past your plan's
lookback floor returns `402 historical_data_restricted`. If you omit explicit
bounds, the response is silently floored at the plan limit instead — see
<plans-and-limits.md>.
