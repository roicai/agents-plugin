#!/usr/bin/env node
/**
 * ROIC.ai Financial Data MCP Server (stock market MCP server).
 *
 * A standalone Model Context Protocol server that connects AI assistants
 * (Claude, ChatGPT, Cursor, VS Code, Codex) to stock prices, financial
 * statements, earnings call transcripts, fundamentals, ratios, and valuation
 * data for 60,000+ public companies via the ROIC.ai REST API.
 *
 * Transport: stdio. Auth: ROIC.ai REST API key (apikey query param).
 *
 * Usage:
 *   ROIC_API_KEY=your_key npx @roicai/mcp-server
 *
 * Get a free API key: https://roic.ai/account/api
 * Docs: https://www.roic.ai/api/mcp
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const API_BASE = (process.env.ROIC_API_BASE || 'https://api.roic.ai/v2').replace(/\/+$/, '');
const API_KEY = process.env.ROIC_API_KEY || process.env.ROICAI_API_KEY || '';
const VERSION = '1.0.0';

if (!API_KEY) {
  // Don't crash: tool discovery still works so clients can list capabilities.
  // Calls will return a clear "set ROIC_API_KEY" error until a key is provided.
  console.error(
    '[roicai-mcp-server] No ROIC_API_KEY set. Get a free key at https://roic.ai/account/api ' +
      'and pass it via the ROIC_API_KEY environment variable.',
  );
}

/** GET a JSON endpoint on the ROIC.ai REST API. */
async function apiGet(path, params = {}) {
  if (!API_KEY) {
    throw new Error(
      'Missing ROIC.ai API key. Set the ROIC_API_KEY environment variable. ' +
        'Get a free key at https://roic.ai/account/api',
    );
  }
  const url = new URL(API_BASE + path);
  url.searchParams.set('format', 'json');
  url.searchParams.set('apikey', API_KEY);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  }

  let res;
  try {
    res = await fetch(url, { headers: { accept: 'application/json' } });
  } catch (err) {
    throw new Error(`Network error contacting ROIC.ai API: ${err?.message || err}`);
  }

  const body = await res.text();
  if (!res.ok) {
    let detail = body;
    try {
      const parsed = JSON.parse(body);
      detail = parsed.error || parsed.message || body;
    } catch {
      /* keep raw body */
    }
    if (res.status === 401 || res.status === 403) {
      throw new Error(
        `ROIC.ai API ${res.status}: ${detail}. Check ROIC_API_KEY or your plan at https://roic.ai/pricing`,
      );
    }
    if (res.status === 429) {
      throw new Error(
        `ROIC.ai API 429 (rate limit). Slow down or upgrade your plan at https://roic.ai/pricing`,
      );
    }
    throw new Error(`ROIC.ai API ${res.status}: ${detail}`);
  }

  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
}

const enc = (v) => encodeURIComponent(String(v));
const asText = (data) => ({
  content: [{ type: 'text', text: typeof data === 'string' ? data : JSON.stringify(data, null, 2) }],
});
const asError = (message) => ({ content: [{ type: 'text', text: message }], isError: true });

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };

const server = new McpServer({ name: 'roicai', version: VERSION });

/** Register a tool that calls the REST API and returns its JSON. */
function tool(name, config, run) {
  server.registerTool(
    name,
    { title: config.title, description: config.description, inputSchema: config.inputSchema, annotations: READ_ONLY },
    async (args) => {
      try {
        return asText(await run(args ?? {}));
      } catch (err) {
        return asError(err?.message || String(err));
      }
    },
  );
}

// ---------------------------------------------------------------------------
// Shared input shapes
// ---------------------------------------------------------------------------

const identifier = z
  .string()
  .describe('Company identifier: ticker symbol (e.g. AAPL), CIK, CUSIP, or ISIN');

/** Period-based financial schema (statements, ratios, valuation, per-share). */
const financialShape = {
  identifier,
  period: z.enum(['annual', 'quarterly']).default('annual').describe('Reporting period'),
  limit: z.number().int().min(1).max(100).default(10).describe('Number of periods to return'),
  fiscal_year_start: z.number().int().optional().describe('Earliest fiscal year to include'),
  fiscal_year_end: z.number().int().optional().describe('Latest fiscal year to include'),
  date_start: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD')
    .optional()
    .describe('Start date filter (YYYY-MM-DD)'),
  date_end: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD')
    .optional()
    .describe('End date filter (YYYY-MM-DD)'),
  order: z.enum(['ASC', 'DESC']).default('DESC').describe('Sort order by date'),
};

const financialArgs = ({ period, limit, fiscal_year_start, fiscal_year_end, date_start, date_end, order }) => ({
  period,
  limit,
  fiscal_year_start,
  fiscal_year_end,
  date_start,
  date_end,
  order,
});

/** Register a fundamental/ratio/metric tool that hits /fundamental/<path>/<identifier>. */
function fundamentalTool(name, path, title, description) {
  tool(name, { title, description, inputSchema: financialShape }, (a) =>
    apiGet(`/fundamental/${path}/${enc(a.identifier)}`, financialArgs(a)),
  );
}

// ---------------------------------------------------------------------------
// Tickers & discovery
// ---------------------------------------------------------------------------

tool(
  'search_tickers',
  {
    title: 'Search Stock Tickers',
    description:
      'Search for stock tickers by ticker symbol or company name. Returns matching companies with exchange info.',
    inputSchema: {
      query: z.string().describe('Search query (ticker symbol or company name)'),
      search_by: z
        .enum(['symbol', 'name'])
        .default('symbol')
        .describe('Search by ticker symbol or by company name'),
      limit: z.number().int().min(1).max(100).default(10).describe('Max results to return'),
      exchange: z.string().optional().describe('Filter by exchange (e.g. NYSE, NASDAQ)'),
    },
  },
  ({ query, search_by, limit, exchange }) =>
    apiGet(search_by === 'name' ? '/tickers/search/name' : '/tickers/search', {
      query,
      limit,
      exchange,
    }),
);

tool(
  'list_tickers',
  {
    title: 'List Tickers',
    description:
      'List available stock tickers (symbol, name, exchange, type, listed status). Use search_tickers for a targeted lookup.',
    inputSchema: {
      exchange: z.string().optional().describe('Filter by exchange (e.g. NYSE, NASDAQ)'),
      listed: z
        .boolean()
        .optional()
        .describe('Filter by listing status (true = listed, false = delisted)'),
      limit: z.number().int().min(1).max(5000).default(100).describe('Max results to return'),
    },
  },
  async ({ exchange, listed, limit }) => {
    const data = exchange
      ? await apiGet(`/tickers/search/exchange/${enc(exchange)}`)
      : await apiGet('/tickers/list', { listed });
    return Array.isArray(data) ? data.slice(0, limit) : data;
  },
);

tool(
  'search_ticker_by_identifier',
  {
    title: 'Search Ticker by CIK / CUSIP / ISIN',
    description:
      'Look up a stock ticker by CIK (SEC identifier), CUSIP (9-char), or ISIN (12-char international identifier).',
    inputSchema: {
      identifier: z.string().describe('The CIK, CUSIP, or ISIN value'),
      type: z.enum(['cik', 'cusip', 'isin']).describe('Type of identifier being searched'),
    },
  },
  ({ identifier: id, type }) => apiGet(`/tickers/search/${type}/${enc(id)}`),
);

// ---------------------------------------------------------------------------
// Reference data
// ---------------------------------------------------------------------------

tool(
  'list_exchanges',
  {
    title: 'List Stock Exchanges',
    description: 'List all stock exchanges with the number of tickers on each.',
    inputSchema: {},
  },
  () => apiGet('/exchanges/list'),
);

tool(
  'list_sectors',
  {
    title: 'List Sectors',
    description: 'List all market sectors with the number of tickers in each.',
    inputSchema: {},
  },
  () => apiGet('/sectors/list'),
);

tool(
  'list_industries',
  {
    title: 'List Industries',
    description: 'List all industries with the number of tickers in each.',
    inputSchema: {},
  },
  () => apiGet('/industries/list'),
);

tool(
  'list_countries',
  {
    title: 'List Countries',
    description: 'List all countries with the number of tickers from each.',
    inputSchema: {},
  },
  () => apiGet('/countries/list'),
);

// ---------------------------------------------------------------------------
// Company
// ---------------------------------------------------------------------------

tool(
  'get_company_profile',
  {
    title: 'Get Company Profile',
    description:
      'Get a detailed company profile: description, CEO, employees, sector, industry, exchange, country, and more. Accepts ticker, CIK, CUSIP, or ISIN.',
    inputSchema: { identifier },
  },
  ({ identifier: id }) => apiGet(`/company/profile/${enc(id)}`),
);

tool(
  'get_company_news',
  {
    title: 'Get Company News',
    description: 'Get recent news articles for a company, with pagination and optional date filtering.',
    inputSchema: {
      identifier,
      limit: z.number().int().min(1).max(50).default(20).describe('Number of articles to return'),
      page: z.number().int().min(0).default(0).describe('Page number for pagination (0-based)'),
      date_start: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD')
        .optional()
        .describe('Start date filter (YYYY-MM-DD)'),
      date_end: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD')
        .optional()
        .describe('End date filter (YYYY-MM-DD)'),
    },
  },
  ({ identifier: id, limit, page, date_start, date_end }) =>
    apiGet(`/company/news/${enc(id)}`, { limit, page, date_start, date_end }),
);

// ---------------------------------------------------------------------------
// Earnings call transcripts
// ---------------------------------------------------------------------------

tool(
  'get_latest_earnings_call',
  {
    title: 'Get Latest Earnings Call',
    description: 'Get the most recent earnings call transcript for a company.',
    inputSchema: { identifier },
  },
  ({ identifier: id }) => apiGet(`/company/earnings-calls/latest/${enc(id)}`),
);

tool(
  'list_earnings_calls',
  {
    title: 'List Earnings Calls',
    description:
      'List available earnings calls for a company (year, quarter, date). Does not include transcript text.',
    inputSchema: {
      identifier,
      limit: z.number().int().min(1).max(500).default(100).describe('Max results to return'),
    },
  },
  ({ identifier: id, limit }) => apiGet(`/company/earnings-calls/list/${enc(id)}`, { limit }),
);

tool(
  'get_earnings_call_transcript',
  {
    title: 'Get Earnings Call Transcript',
    description:
      'Get a specific earnings call transcript by year and quarter. Use list_earnings_calls to find available calls first.',
    inputSchema: {
      identifier,
      year: z.number().int().describe('Fiscal year of the earnings call'),
      quarter: z.number().int().min(1).max(4).describe('Quarter (1-4)'),
    },
  },
  ({ identifier: id, year, quarter }) =>
    apiGet(`/company/earnings-calls/transcript/${enc(id)}`, { year, quarter }),
);

// ---------------------------------------------------------------------------
// Stock prices
// ---------------------------------------------------------------------------

tool(
  'get_stock_prices',
  {
    title: 'Get Historical Stock Prices',
    description:
      'Get historical stock price data (OHLCV) for a company, with optional date range and ordering.',
    inputSchema: {
      identifier,
      date_start: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD')
        .optional()
        .describe('Start date (YYYY-MM-DD)'),
      date_end: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD')
        .optional()
        .describe('End date (YYYY-MM-DD)'),
      limit: z.number().int().min(1).max(1000).default(100).describe('Number of price records'),
      order: z.enum(['ASC', 'DESC']).default('DESC').describe('Sort order by date'),
    },
  },
  ({ identifier: id, date_start, date_end, limit, order }) =>
    apiGet(`/stock-prices/${enc(id)}`, { date_start, date_end, limit, order }),
);

tool(
  'get_latest_stock_price',
  {
    title: 'Get Latest Stock Price',
    description: 'Get the most recent stock price for a company.',
    inputSchema: { identifier },
  },
  ({ identifier: id }) => apiGet(`/stock-prices/latest/${enc(id)}`),
);

// ---------------------------------------------------------------------------
// Financial statements
// ---------------------------------------------------------------------------

fundamentalTool(
  'get_income_statement',
  'income-statement',
  'Get Income Statement',
  'Get income statement data: revenue, gross profit, operating income, net income, EPS, EBITDA, and margins.',
);

fundamentalTool(
  'get_balance_sheet',
  'balance-sheet',
  'Get Balance Sheet',
  'Get balance sheet data: assets, liabilities, debt, equity, shares outstanding, and key balance-sheet ratios.',
);

fundamentalTool(
  'get_cash_flow',
  'cash-flow',
  'Get Cash Flow Statement',
  'Get cash flow data: operating, investing, and financing cash flows, CapEx, free cash flow, and dividends.',
);

// ---------------------------------------------------------------------------
// Financial ratios
// ---------------------------------------------------------------------------

fundamentalTool(
  'get_profitability_ratios',
  'ratios/profitability',
  'Get Profitability Ratios',
  'Get profitability ratios: ROE, ROA, ROIC, gross/operating/EBITDA/profit margins, effective tax rate, and payout ratio.',
);

fundamentalTool(
  'get_credit_ratios',
  'ratios/credit',
  'Get Credit & Debt Ratios',
  'Get credit and debt ratios: net/total debt to EBITDA, debt to equity/capital/assets, and interest coverage.',
);

fundamentalTool(
  'get_liquidity_ratios',
  'ratios/liquidity',
  'Get Liquidity Ratios',
  'Get liquidity ratios: cash, current, and quick ratios, cash-flow-to-liabilities, and the Altman Z-Score.',
);

fundamentalTool(
  'get_working_capital_ratios',
  'ratios/working-capital',
  'Get Working Capital Ratios',
  'Get working-capital efficiency: receivable/inventory/payable turnover and days, and the cash conversion cycle.',
);

fundamentalTool(
  'get_yield_analysis',
  'ratios/yield-analysis',
  'Get Yield Analysis',
  'Get yield metrics: free-cash-flow yield, shareholder yield, capital yield, dividends paid, and enterprise value.',
);

// ---------------------------------------------------------------------------
// Valuation & metrics
// ---------------------------------------------------------------------------

fundamentalTool(
  'get_enterprise_value',
  'enterprise-value',
  'Get Enterprise Value',
  'Get enterprise value metrics: market cap, enterprise value, EV/Sales, EV/EBITDA, and EV/EBIT.',
);

fundamentalTool(
  'get_valuation_multiples',
  'multiples',
  'Get Valuation Multiples',
  'Get valuation multiples: P/E, P/B, P/S, P/CF, P/FCF, EV/Sales, EV/EBITDA, EV/EBIT (last/avg/high/low).',
);

fundamentalTool(
  'get_per_share_data',
  'per-share',
  'Get Per-Share Data',
  'Get per-share metrics: EPS, diluted EPS, revenue, EBITDA, dividends, book value, cash flow, and free cash flow per share.',
);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`[roicai-mcp-server] v${VERSION} ready (stdio) — API ${API_BASE}`);
}

main().catch((err) => {
  console.error('[roicai-mcp-server] fatal:', err);
  process.exit(1);
});
