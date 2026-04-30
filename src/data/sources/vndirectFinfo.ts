import { request } from "undici";

const FINFO = "https://api-finfo.vndirect.com.vn";

export interface RatioPoint {
  code: string;
  reportDate: string;
  itemCode: number | string;
  ratioCode: string;
  itemName?: string;
  value: number;
  group?: string;
}

export interface FinfoListResponse<T> {
  data: T[];
  currentPage: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

const HEADERS = {
  accept: "application/json, text/plain, */*",
  "accept-language": "en-US,en;q=0.9,vi;q=0.8",
  origin: "https://dstock.vndirect.com.vn",
  referer: "https://dstock.vndirect.com.vn/",
  "user-agent":
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
};

async function getJson<T>(url: string): Promise<T> {
  const { statusCode, body } = await request(url, { method: "GET", headers: HEADERS });
  if (statusCode !== 200) {
    const text = await body.text().catch(() => "");
    throw new Error(`VNDirect Finfo ${statusCode}: ${url} ${text.slice(0, 120)}`);
  }
  return (await body.json()) as T;
}

export async function getRatio(
  ticker: string,
  ratioCode: string,
  size = 4,
): Promise<RatioPoint[]> {
  const q = encodeURIComponent(`code:${ticker.toUpperCase()}~ratioCode:${ratioCode}`);
  const url = `${FINFO}/v4/ratios?q=${q}&sort=reportDate:desc&size=${size}`;
  const json = await getJson<FinfoListResponse<RatioPoint>>(url);
  return json.data;
}

/**
 * Note: VNDirect's /v4/ratios only carries trading-level ratios.
 * Profitability ratios (ROE, ROA, EPS, BVPS) come from CafeF
 * (`getFinancialRatios` in cafef.ts).
 */
export const RATIOS = {
  PE: "PRICE_TO_EARNINGS",
  PB: "PRICE_TO_BOOK",
  PS: "PRICE_TO_SALES",
  DIV_YIELD: "DIVIDEND_YIELD",
  MARKETCAP: "MARKETCAP",
  SHARES_OUTSTANDING: "OUTSTANDING_SHARES",
  FOREIGN_OWNERSHIP: "FOREIGN_OWNERSHIP",
  PRICE_CHG_PCT_1M: "PRICE_CHG_PCT_CR_1M",
  PRICE_CHG_PCT_1Y: "PRICE_CHG_PCT_CR_1Y",
} as const;

export interface CompanyProfile {
  code: string;
  floor: string;
  vnName?: string;
  enName?: string;
  foundDate?: string;
  vnAddress?: string;
  phone?: string;
  website?: string;
  vnSummary?: string;
  enSummary?: string;
}

export async function getCompanyProfile(ticker: string): Promise<CompanyProfile | null> {
  const q = encodeURIComponent(`code:${ticker.toUpperCase()}`);
  const url = `${FINFO}/v4/company_profiles?q=${q}`;
  const json = await getJson<FinfoListResponse<CompanyProfile>>(url);
  return json.data[0] ?? null;
}
