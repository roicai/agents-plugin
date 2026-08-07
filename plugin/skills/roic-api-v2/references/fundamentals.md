# v2 fundamentals: statements, ratios, valuation metrics

Eleven routes share one query signature and one response shape. They all sit
under `https://api.roic.ai/v2/fundamental/` and all take an `{identifier}`
(symbol, CIK, CUSIP, or ISIN).

Contents: [Shared query signature](#shared-query-signature) ·
[Response shape](#response-shape) · [The 11 routes](#the-11-routes) ·
[Field lists](#field-lists)

## Shared query signature

| Param               | Type / range                                        | Default  |
| ------------------- | --------------------------------------------------- | -------- |
| `apikey`            | string, query only                                  | required |
| `period`            | `Q1` `Q2` `Q3` `Q4` `annual` `quarterly` `TTM` (case-insensitive) | `annual` |
| `limit`             | integer 1–**250**                                    | 10       |
| `fiscal_year_start` | integer year, inclusive                              | —        |
| `fiscal_year_end`   | integer year, inclusive                              | —        |
| `date_start`        | `YYYY-MM-DD`, inclusive                              | —        |
| `date_end`          | `YYYY-MM-DD`, inclusive                              | —        |
| `order`             | `asc` / `desc` (sorts by report `date`)              | `desc`   |

Notes that save a debugging cycle:

- `limit` defaults to **10**, so a request without it silently returns only the
  last 10 periods. If you want history, say `limit=250`.
- An unrecognised `period` value is not rejected — it simply applies *no* period
  filter, so the response mixes annual, quarterly and TTM rows. Spell it exactly.
- `Q1`–`Q4` mean "that quarter across years", not "the latest quarter". Use
  `period=quarterly` for every quarter in sequence.
- `limit` above 250 is a 422. On limited plans a *bare* `limit` is silently
  reduced to the plan window instead — see [plans-and-limits.md](plans-and-limits.md).

## Response shape

A bare JSON array, one object per period, each starting with the same keys:

```json
[
  {
    "ticker": "AAPL",
    "date": "2024-09-28",
    "period": "annual",
    "period_label": "FY",
    "fiscal_year": "2024",
    "currency": "USD",
    "is_sales_revenue_turnover": 391035000000
  }
]
```

- **Null metrics are omitted from the row**, not returned as `null` — always
  read fields defensively rather than assuming a fixed key set.
- `currency` is present on the three statements and the five ratio groups, and
  absent on the three valuation-metric routes (enterprise value, multiples,
  per-share), whose figures are unit-less ratios or already reported per share.
- There is **no field-selection parameter**. Each route returns its whole block,
  so choose the narrowest route that has what you need instead of pulling the
  income statement and discarding 40 columns.
- No rows for the filter → `[]` with 200. Unknown identifier → 404
  `{"error": "Company not found"}`.

```bash
# Full annual history, one request
curl "https://api.roic.ai/v2/fundamental/income-statement/AAPL?period=annual&limit=250&order=asc&apikey=$ROIC_API_KEY"

# A decade of quarters, bounded by fiscal year
curl "https://api.roic.ai/v2/fundamental/ratios/profitability/MSFT?period=quarterly&limit=250&fiscal_year_start=2015&fiscal_year_end=2024&apikey=$ROIC_API_KEY"
```

## The 11 routes

| # | Route (`/v2/fundamental/...`)       | Block                  | Currency |
| - | ----------------------------------- | ---------------------- | -------- |
| 1 | `income-statement/{identifier}`     | Income statement       | yes      |
| 2 | `balance-sheet/{identifier}`        | Balance sheet          | yes      |
| 3 | `cash-flow/{identifier}`            | Cash flow statement    | yes      |
| 4 | `ratios/profitability/{identifier}` | Profitability ratios   | yes      |
| 5 | `ratios/credit/{identifier}`        | Credit / leverage      | yes      |
| 6 | `ratios/liquidity/{identifier}`     | Liquidity + solvency   | yes      |
| 7 | `ratios/working-capital/{identifier}`| Working capital cycle | yes      |
| 8 | `ratios/yield-analysis/{identifier}`| Cash returns & yields  | yes      |
| 9 | `enterprise-value/{identifier}`     | EV bridge + EV ratios  | no       |
| 10| `multiples/{identifier}`            | Valuation multiples    | no       |
| 11| `per-share/{identifier}`            | Per-share data         | no       |

The cash-flow route is `cash-flow`, not `cash-flow-statement`; the valuation
routes are `multiples` and `per-share`, not `valuation-multiples` /
`per-share-data`. All eleven are cached `public, max-age=14400` (4h).

## Field lists

Field names are the JSON keys returned by each route.

### 1. Income statement
`is_sales_revenue_turnover`, `is_sales_and_services_revenues`, `is_cogs`,
`is_cog_and_services_sold`, `is_gross_profit`, `is_other_oper_income`,
`is_operating_expn`, `is_sg_and_a_expense`, `is_operating_expenses_r_and_d`,
`is_other_operating_expenses`, `is_oper_income`, `is_nonop_income_loss`,
`is_net_interest_expense`, `is_int_expense`, `is_int_income`,
`is_other_nonop_income_loss`, `is_pretax_income`, `is_inc_tax_exp`,
`is_inc_loss_affil`, `is_inc_bef_xo_item`, `is_xo_gl_net_of_tax`,
`is_discontinued_operations`, `is_extraord_items_and_acctg_chng`,
`is_ni_including_minority_int_ratio`, `is_min_noncontrol_interest_credits`,
`is_net_income`, `is_tot_cash_pfd_dvd`, `is_other_adjustments`,
`is_earn_for_common`, `is_avg_num_sh_for_eps`, `eps`, `eps_cont_ops`,
`is_sh_for_diluted_eps`, `diluted_eps`, `dil_eps_cont_ops`, `ebitda`,
`ebitda_margin`, `ebita`, `ebit`, `gross_margin`, `oper_margin`,
`profit_margin`, `actual_sales_per_empl`, `div_per_shr`, `is_depr_exp`

### 2. Balance sheet
`bs_c_and_ce_and_sti_detailed`, `bs_cash_near_cash_item`,
`bs_mkt_sec_other_st_invest`, `bs_acct_note_rcv`, `bs_accts_rec_excl_notes_rec`,
`bs_notes_receivable`, `bs_loans_receivable`, `bs_other_current_receivable`,
`bs_inventories`, `bs_invtry_raw_materials`, `bs_invtry_in_progress`,
`bs_invtry_finished_goods`, `bs_invtry_adj`, `bs_other_inv`,
`bs_other_current_assets_detailed`, `bs_prepay`,
`bs_deriv_and_hedging_assets_st`, `bs_assets_held_for_sale_st`,
`bs_deferred_tax_assets_st`, `bs_other_cur_asset_less_prepay`,
`bs_cur_asset_report`, `bs_net_fix_asset`, `bs_gross_fix_asset`,
`bs_accum_depr`, `bs_lt_invest`, `bs_long_term_investments`,
`bs_lt_receivables`, `bs_other_assets_def_chrg_other`,
`bs_disclosed_intangibles`, `bs_goodwill`, `bs_other_intangible_assets_detailed`,
`bs_deferred_tax_assets_lt`, `bs_deriv_and_hedging_assets_lt`,
`bs_other_noncurrent_assets_detailed`, `bs_tot_non_cur_asset`, `bs_tot_asset`,
`bs_acct_payable_and_accruals_detailed`, `bs_acct_payable`, `bs_taxes_payable`,
`bs_interest_and_dividends_payable`, `bs_accrual`, `bs_st_borrow`,
`bs_short_term_debt_detailed`, `bs_st_capital_lease_obligations`,
`bs_other_current_liabs_sub_detailed`, `bs_st_deferred_revenue`,
`bs_derivative_and_hedging_liabs_st`, `bs_deferred_tax_liabs_st`,
`bs_other_current_liabs_detailed`, `bs_cur_liab`, `bs_lt_borrow`,
`bs_long_term_borrowings_detailed`, `bs_lt_capital_lease_obligations`,
`bs_other_noncur_liabs_sub_detailed`, `bs_accrued_liabilities`,
`bs_pension_liabilities`, `bs_lt_deferred_revenue`,
`bs_deferred_tax_liabilities_lt`, `bs_derivative_and_hedging_liabs_lt`,
`bs_other_noncurrent_liabs_detailed`, `bs_non_cur_liab`, `bs_tot_liab`,
`bs_pfd_eqty_and_hybrid_cptl`, `bs_sh_cap_and_apic`, `bs_common_stock`,
`bs_add_paid_in_cap`, `bs_amt_of_tsy_stock`, `bs_pure_retained_earnings`,
`bs_other_ins_res_to_shrhldr_eqy`, `bs_eqty_bef_minority_int_detailed`,
`bs_minority_noncontrolling_interest`, `bs_total_equity`,
`bs_tot_liab_and_eqy`, `bs_sh_out`, `bs_total_capital_leases`, `net_debt`,
`net_debt_to_shrhldr_eqty`, `tce_ratio`, `cur_ratio`, `cash_conversion_cycle`,
`num_of_employees`

### 3. Cash flow
`cf_net_inc`, `cf_depr_amort`, `cf_non_cash_items_detailed`,
`cf_stock_based_compensation`, `cf_def_inc_tax`, `cf_asset_impairment_charge`,
`cf_other_non_cash_adj_less_detailed`, `cf_chng_non_cash_work_cap`,
`cf_acct_rcv_unbilled_rev`, `cf_change_in_inventories`,
`cf_change_in_prepaid_assets`, `cf_change_in_accounts_payable`,
`cf_inc_dec_in_ot_op_ast_liab_detail`, `cf_net_cash_discont_ops_oper`,
`cf_cash_from_oper`, `cf_chg_in_fxd_and_intang_ast_detailed`,
`cf_disp_fxd_and_intangibles_detailed`, `cf_disposal_of_fixed_prod_assets`,
`cf_disposal_of_intangible_assets`, `cf_acquis_fxd_and_intang_detailed`,
`cf_purchase_of_fixed_prod_assets`, `cf_acquisition_of_intang_assets`,
`cf_net_chg_in_lt_invest_detailed`, `cf_decr_invest`, `cf_incr_invest`,
`cf_nt_csh_rcvd_pd_for_acquis_div`, `cf_cash_for_divestitures`,
`cf_cash_for_acquis_subsidiaries`, `cf_cash_for_joint_ventures_assoc`,
`cf_other_investing_act_detailed`, `cf_net_cash_discontinued_ops_inv`,
`cf_cash_from_inv_act`, `cf_dvd_paid`, `cf_nt_csh_proc_pymt_debt`,
`cf_proc_debt_and_capital_lease`, `cf_pymt_debt_and_capital_lease`,
`cf_proc_fr_repurch_eqty_detailed`, `cf_incr_cap_stock`, `cf_decr_cap_stock`,
`cf_other_financing_act_excl_fx`, `cf_net_cash_discontinued_ops_fin`,
`cf_cash_from_fin_act`, `cf_effect_foreign_exchanges`, `cf_net_chng_cash`,
`cf_cap_expenditures`, `ebitda`, `ebitda_margin`, `cf_net_cash_paid_for_aquis`,
`cf_free_cash_flow`, `cf_free_cash_flow_firm`, `free_cash_flow_equity`,
`free_cash_flow_per_sh`, `pr_to_free_cash_flow`, `cash_flow_to_net_inc`

### 4. Profitability ratios
`return_com_eqy`, `return_on_asset`, `return_on_cap`, `return_on_inv_capital`,
`gross_margin`, `ebitda_margin`, `oper_margin`, `incremental_operating_margin`,
`pretax_inc_to_net_sales`, `profit_margin`, `net_income_to_common_margin`,
`eff_tax_rate`, `dvd_payout_ratio`, `sustain_growth_rt`

### 5. Credit ratios
`short_and_long_term_debt`, `bs_st_borrow`, `bs_lt_borrow`,
`tot_debt_to_ebitda`, `net_debt_to_ebitda`, `total_debt_to_ebit`,
`net_debt_to_ebit`, `ebitda_to_interest_expn`,
`ebitda_les_cap_expend_to_int_exp`, `oper_inc_to_int_exp`, `is_int_expense`,
`com_eqy_to_tot_asset`, `lt_debt_to_tot_eqy`, `lt_debt_to_tot_cap`,
`lt_debt_to_tot_asset`, `tot_debt_to_tot_eqy`, `tot_debt_to_tot_cap`,
`tot_debt_to_tot_asset`, `net_debt_to_shrhldr_eqty`, `net_debt_to_capital`,
`ebitda`, `ebitda_after_capex`, `is_oper_income`

### 6. Liquidity ratios
`cash_ratio`, `cur_ratio`, `quick_ratio`, `cfo_to_avg_current_liabilities`,
`com_eqy_to_tot_asset`, `lt_debt_to_tot_eqy`, `lt_debt_to_tot_cap`,
`lt_debt_to_tot_asset`, `tot_debt_to_tot_eqy`, `tot_debt_to_tot_cap`,
`tot_debt_to_tot_asset`, `cash_flow_to_tot_liab`, `cap_expend_ratio`,
`altman_z_score`

### 7. Working-capital ratios
`acct_rcv_turn`, `acct_rcv_days`, `invent_turn`, `invent_days`,
`accounts_payable_turnover`, `accounts_payable_turnover_days`,
`cash_conversion_cycle`, `inv_to_cash_days`, `bs_inventories`,
`bs_invtry_raw_materials`, `bs_invtry_in_progress`, `bs_invtry_finished_goods`,
`bs_other_inv`

### 8. Yield analysis
`ttm_cash_from_oper`, `ttm_cap_expend`, `ttm_free_cash_flow`,
`free_cash_flow_yield`, `cf_dvd_paid`, `cf_proc_fr_repurch_eqty_detailed`,
`cf_pymt_debt_and_capital_lease`, `cf_other_financing_act_excl_fx`, `ttm_cff`,
`shareholder_yield_cff`, `returned_capital_ex_debt`, `shareholder_yield_ex_debt`,
`cf_cash_from_oper`, `cf_cap_expenditures`, `ttm_after_tax_interest_expense`,
`cf_free_cash_flow_firm`, `enterprise_value`, `ttm_fcf_to_firm_yield`,
`capital_yield`

### 9. Enterprise value
`market_cap`, `bs_cash_near_cash_item`, `bs_pfd_eqty_and_hybrid_cptl`,
`bs_minority_noncontrolling_interest`, `short_and_long_term_debt`,
`enterprise_value`, `bs_tot_cap`, `tot_debt_to_tot_cap`, `total_debt_to_ev`,
`ev_to_ttm_sales`, `ev_to_ttm_ebitda`, `ev_to_ttm_ebit`,
`ev_to_ttm_cash_flow_firm`, `ev_to_ttm_free_cash_flow_firm`, `diluted_mkt_cap`,
`diluted_ev`, `ev_to_sh_out`, `ttm_net_sales`, `ttm_ebitda`, `ttm_oper_inc`,
`ttm_cash_flow_firm`, `ttm_free_cash_flow_firm`

### 10. Valuation multiples
`pe_ratio`, `average_price_earnings_ratio`, `pe_ratio_with_high_clos_pr`,
`pe_ratio_with_low_clos_pr`, `pr_to_book_ratio`, `average_price_to_book_ratio`,
`high_closing_price_to_book_ratio`, `low_closing_price_to_book_ratio`,
`pr_to_tang_bv_per_sh`, `average_price_to_tangible_bps`,
`high_price_to_tangible_bps`, `low_price_to_tangible_bps`, `pr_to_sales_ratio`,
`average_price_to_sales_ratio`, `high_closing_price_to_sales_ratio`,
`low_closing_price_to_sales_ratio`, `pr_to_cash_flow`,
`average_price_to_cash_flow`, `high_closing_price_to_cash_flow`,
`low_closing_price_to_cash_flow`, `pr_to_free_cash_flow`,
`average_price_to_free_cash_flow`, `high_price_to_free_cash_flow`,
`low_price_to_free_cash_flow`, `ev_to_ttm_sales`, `average_ev_to_ttm_sales`,
`high_ev_to_ttm_sales`, `low_ev_to_ttm_sales`, `ev_to_ttm_ebitda`,
`avg_ev_to_ttm_ebitda`, `high_ev_to_ttm_ebitda`, `low_ev_to_ttm_ebitda`,
`ev_to_ttm_ebit`, `average_ev_to_ttm_ebit`, `high_ev_to_ttm_ebit`,
`low_ev_to_ttm_ebit`, `pr_last`, `pr_high`, `pr_low`, `enterprise_value`,
`average_enterprise_value`, `high_enterprise_value`, `low_enterprise_value`,
`bs_sh_out`

### 11. Per-share data
`bs_sh_out`, `is_sh_for_diluted_eps`, `is_avg_num_sh_for_eps`, `revenue_per_sh`,
`ebitda_per_sh`, `oper_inc_per_sh`, `eps`, `eps_cont_ops`, `diluted_eps`,
`dil_eps_cont_ops`, `div_per_shr`, `cash_flow_per_sh`, `free_cash_flow_per_sh`,
`cash_st_investments_per_sh`, `book_val_per_sh`, `tang_book_val_per_sh`

Several fields appear in more than one block (`ebitda`, `cur_ratio`,
`enterprise_value`, `bs_sh_out`…). If you need two of them, pick the single
route that already carries both rather than making two calls.
