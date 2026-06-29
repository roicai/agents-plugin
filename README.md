# ROIC.ai Financial Data MCP Server

[![npm](https://img.shields.io/npm/v/@roicai/mcp-server.svg)](https://www.npmjs.com/package/@roicai/mcp-server)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![Model Context Protocol](https://img.shields.io/badge/MCP-compatible-7c3aed.svg)](https://modelcontextprotocol.io)

**A financial data MCP server and stock market MCP server.** It connects AI assistants (Claude, ChatGPT, Cursor, VS Code, and OpenAI Codex) to stock prices, financial statements, earnings call transcripts, fundamentals, ratios, and valuation data for **60,000+ public companies** through the [Model Context Protocol (MCP)](https://modelcontextprotocol.io).

One server gives your assistant **MCP for financial statements**, **MCP for earnings**, and **MCP for fundamentals**. Ask a question in plain language and the model fetches live stock-market data from the [ROIC.ai REST API](https://www.roic.ai/api) on demand, no copy-paste.

> Powered by [ROIC.ai](https://www.roic.ai) — financial statements, ratios, valuation multiples, and earnings transcripts for public companies across 70+ global exchanges.

It is **open source** and **free to run** from this GitHub repo: bring a free API key and you have a finance MCP server and a stock price MCP server in one. Unlike a single-source feed such as Yahoo Finance, ROIC.ai serves standardized financial statements, pre-computed ratios, and valuation multiples across 70+ exchanges, so the model gets clean, comparable numbers instead of scraped tables.

---

## Quickstart

You need a free ROIC.ai API key. Get one at **https://roic.ai/account/api**.

Run the server directly with `npx` (no install):

```bash
ROIC_API_KEY=your_key npx @roicai/mcp-server
```

### Claude Desktop / Cursor

Add to your MCP config (`claude_desktop_config.json` for Claude Desktop, `.cursor/mcp.json` for Cursor):

```json
{
  "mcpServers": {
    "roicai": {
      "command": "npx",
      "args": ["-y", "@roicai/mcp-server"],
      "env": { "ROIC_API_KEY": "your_key_here" }
    }
  }
}
```

### Claude Code (CLI)

```bash
claude mcp add roicai --env ROIC_API_KEY=your_key -- npx -y @roicai/mcp-server
```

### VS Code

Add to `.vscode/mcp.json`:

```json
{
  "servers": {
    "roicai": {
      "command": "npx",
      "args": ["-y", "@roicai/mcp-server"],
      "env": { "ROIC_API_KEY": "your_key_here" }
    }
  }
}
```

### OpenAI Codex

Add to `~/.codex/config.toml`:

```toml
[mcp_servers.roicai]
command = "npx"
args = ["-y", "@roicai/mcp-server"]
env = { ROIC_API_KEY = "your_key_here" }
```

Restart your client and ask: _"Show me Apple's income statement for the last 3 years using roicai."_

---

## What you get

This stock market MCP server exposes **25 read-only tools** across seven categories:

- **Financial statements** — income statement, balance sheet, cash flow (annual or quarterly).
- **Financial ratios** — profitability (ROE, ROA, ROIC, margins), credit/debt, liquidity, working capital, yield.
- **Valuation** — P/E, P/B, P/S, EV/EBITDA and other multiples, enterprise value, per-share data.
- **Earnings calls** — full earnings call transcripts by year and quarter.
- **Stock prices** — real-time and historical OHLCV with date ranges (a stock price MCP server in its own right).
- **Company data** — profiles (CEO, sector, industry, employees) and news.
- **Discovery** — search and list tickers, exchanges, sectors, industries, countries.

## Tools

| Tool | What it returns |
| --- | --- |
| `search_tickers` | Search tickers by symbol or company name |
| `list_tickers` | List tickers (filter by exchange / listed status) |
| `search_ticker_by_identifier` | Resolve a ticker by CIK, CUSIP, or ISIN |
| `list_exchanges` | All stock exchanges with ticker counts |
| `list_sectors` | All market sectors with ticker counts |
| `list_industries` | All industries with ticker counts |
| `list_countries` | All countries with ticker counts |
| `get_company_profile` | Description, CEO, employees, sector, industry |
| `get_company_news` | Recent news articles, paginated and date-filtered |
| `get_latest_earnings_call` | Most recent earnings call transcript |
| `list_earnings_calls` | Available earnings calls (year, quarter, date) |
| `get_earnings_call_transcript` | A specific transcript by year and quarter |
| `get_stock_prices` | Historical OHLCV stock prices with date range |
| `get_latest_stock_price` | Most recent stock price |
| `get_income_statement` | Revenue, gross profit, net income, EPS, EBITDA, margins |
| `get_balance_sheet` | Assets, liabilities, debt, equity, shares outstanding |
| `get_cash_flow` | Operating / investing / financing cash flow, CapEx, FCF |
| `get_profitability_ratios` | ROE, ROA, ROIC, margins, tax rate, payout |
| `get_credit_ratios` | Debt/EBITDA, debt/equity, interest coverage |
| `get_liquidity_ratios` | Current, quick, cash ratios, Altman Z-Score |
| `get_working_capital_ratios` | Turnover, days, cash conversion cycle |
| `get_yield_analysis` | FCF yield, shareholder yield, capital yield |
| `get_enterprise_value` | Market cap, EV, EV/Sales, EV/EBITDA |
| `get_valuation_multiples` | P/E, P/B, P/S, P/CF, EV multiples |
| `get_per_share_data` | EPS, revenue, book value, cash flow per share |

Every tool accepts a company `identifier` that can be a **ticker** (e.g. `AAPL`), **CIK**, **CUSIP**, or **ISIN**. Financial tools accept `period` (`annual` or `quarterly`), `limit`, `order`, and date / fiscal-year filters.

## Example prompts

```text
Compare Microsoft and Google profitability over the last 3 years (margins and ROE).
Is Tesla overvalued? Show its P/E, EV/EBITDA, and P/S vs the last 5 years.
What did Apple management say about AI in the latest earnings call?
Show Amazon's daily stock prices for January 2025.
Which sectors have the most publicly traded companies?
```

## Authentication

The server authenticates to the ROIC.ai REST API with an API key passed as the `ROIC_API_KEY` environment variable. Get a free key at [roic.ai/account/api](https://roic.ai/account/api). The free tier covers every tool across all public companies; paid plans raise the rate limit and history depth. See [pricing](https://roic.ai/pricing).

## Configuration

| Variable | Default | Description |
| --- | --- | --- |
| `ROIC_API_KEY` | (required) | Your ROIC.ai REST API key |
| `ROIC_API_BASE` | `https://api.roic.ai/v2` | Override the API base URL |

## Local development

```bash
git clone https://github.com/roicai/mcp-server.git
cd mcp-server
npm install
ROIC_API_KEY=your_key npm start
```

Requires Node.js 18+ (uses the built-in `fetch`).

## Hosted version (OAuth, no API key)

Prefer not to manage an API key? ROIC.ai also runs a hosted MCP server at `https://mcp.roic.ai/mcp` over Streamable HTTP with OAuth sign-in. Setup guides for ChatGPT, Claude, Cursor, VS Code, and Codex: [roic.ai/api/mcp](https://www.roic.ai/api/mcp).

## Links

- Docs: https://www.roic.ai/api/mcp
- REST API: https://www.roic.ai/api
- Get an API key: https://roic.ai/account/api
- Model Context Protocol: https://modelcontextprotocol.io

## License

MIT © [ROIC.ai](https://www.roic.ai)
