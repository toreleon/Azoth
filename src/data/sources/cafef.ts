import { request } from "undici";

const CAFEF = "https://cafef.vn";
const HEADERS = {
  accept: "application/json, text/plain, */*",
  referer: "https://cafef.vn/",
  "user-agent":
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Azoth/0.1",
};

async function getJson<T>(url: string): Promise<T> {
  const { statusCode, body } = await request(url, { method: "GET", headers: HEADERS });
  if (statusCode !== 200) {
    throw new Error(`CafeF ${statusCode}: ${url}`);
  }
  return (await body.json()) as T;
}

export interface CafefCompanyIntro {
  Name?: string;
  Symbol?: string;
  Logo?: string;
  CenterId?: number | string;
  Intro?: string;
  Web?: string;
  MarketCap?: number;
  CategoryName?: string; // sector
  [key: string]: unknown;
}

export interface CafefScreenerItem {
  Url?: string;
  CenterName?: string;
  Symbol: string;
  TradeCenterID?: number;
  ChangePrice?: number;
  ChangeVolume?: number;
  VonHoa?: number;
  EPS?: number;
  PE?: number;
  Beta?: number;
  Price?: number;
  UpdatedDate?: string;
  FullName?: string;
  ParentCategoryId?: number;
}

export interface CafefScreenerSnapshot {
  categories: Record<number, string>;
  items: CafefScreenerItem[];
}

export async function getCompanyIntro(ticker: string): Promise<CafefCompanyIntro | null> {
  const url = `${CAFEF}/du-lieu/Ajax/PageNew/CompanyIntro.ashx?Symbol=${encodeURIComponent(
    ticker.toUpperCase(),
  )}`;
  const json = await getJson<{ Success: boolean; Data: CafefCompanyIntro | null }>(url);
  return json.Success ? json.Data : null;
}

export async function getScreenerSnapshot(): Promise<CafefScreenerSnapshot> {
  const url = `${CAFEF}/du-lieu/screener.aspx`;
  const { statusCode, body } = await request(url, {
    method: "GET",
    headers: HEADERS,
  });
  if (statusCode !== 200) {
    throw new Error(`CafeF screener ${statusCode}: ${url}`);
  }
  const html = await body.text();
  const dataMatch = /var\s+jsonData\s*=\s*(\[[\s\S]*?\]);/.exec(html);
  if (!dataMatch?.[1]) {
    throw new Error("CafeF screener did not include jsonData");
  }

  const categories: Record<number, string> = {};
  const categorySelect = /<select[^>]*id="Category"[\s\S]*?<\/select>/i.exec(html)?.[0] ?? "";
  for (const match of categorySelect.matchAll(/<option\s+value="(\d+)">([^<]+)<\/option>/gi)) {
    categories[Number(match[1])] = decodeHtml(match[2] ?? "");
  }

  return {
    categories,
    items: JSON.parse(dataMatch[1].replace(/\bNaN\b/g, "null")) as CafefScreenerItem[],
  };
}

export interface CafefNewsItem {
  Symbol?: string | null;
  Title: string;
  NewsId?: number | string | null;
  SubTitle?: string;
  NewsType?: number | string;
  Image?: string;
  // CafeF returns either /Date(unix-ms)/ in DeployDate or PublishDate as ISO,
  // depending on endpoint. We expose both.
  DeployDate?: string;
  PublishDate?: string;
  // CafeF News.ashx uses LinkDetail; NewsByPaging uses Url.
  LinkDetail?: string;
  Url?: string;
  Source?: string;
}

/** Parse CafeF "/Date(1777512060000)/" Microsoft date format to ISO string. */
export function parseCafefDate(input?: string): string | undefined {
  if (!input) return undefined;
  const m = /\/Date\((\d+)\)\//.exec(input);
  if (m) return new Date(Number(m[1])).toISOString();
  // Already ISO-ish
  const d = new Date(input);
  return Number.isNaN(d.getTime()) ? input : d.toISOString();
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

export async function getTickerNews(
  ticker: string,
  newsType: 0 | 96 | 97 = 0,
  pageSize = 15,
  pageIndex = 1,
): Promise<CafefNewsItem[]> {
  const url = `${CAFEF}/du-lieu/Ajax/PageNew/News.ashx?Symbol=${encodeURIComponent(
    ticker.toUpperCase(),
  )}&NewsType=${newsType}&PageIndex=${pageIndex}&PageSize=${pageSize}`;
  const json = await getJson<{ Success: boolean; Data: CafefNewsItem[] }>(url);
  return json.Success ? json.Data : [];
}

export interface CafefRatioBucket {
  Time?: string;
  Year?: number;
  Quater?: number;
  Value?: { Code: string; Name: string; Value: number }[];
}

export async function getFinancialRatios(
  ticker: string,
  reportType: "QUY" | "NAM" = "QUY",
  totalRow = 4,
  endYear = new Date().getFullYear(),
): Promise<CafefRatioBucket[]> {
  const url = `${CAFEF}/du-lieu/Ajax/PageNew/GetDataChiSoTaiChinh.ashx?Symbol=${encodeURIComponent(
    ticker.toUpperCase(),
  )}&TotalRow=${totalRow}&EndDate=${endYear}&ReportType=${reportType}&Sort=DESC`;
  const json = await getJson<{
    Success: boolean;
    Data?: { Count?: number; Value?: CafefRatioBucket[] };
  }>(url);
  return json.Success ? json.Data?.Value ?? [] : [];
}
