import { request } from "undici";

const SSI_QUERY = "https://iboard-query.ssi.com.vn";

export interface SsiQuote {
  ticker: string;
  exchange: string;
  ref: number;
  ceiling: number;
  floor: number;
  companyNameVi?: string;
  companyNameEn?: string;
  raw: unknown;
}

export async function getQuote(symbol: string): Promise<SsiQuote> {
  const url = `${SSI_QUERY}/stock/${encodeURIComponent(symbol.toUpperCase())}`;
  const { statusCode, body } = await request(url, {
    method: "GET",
    headers: { accept: "application/json" },
  });
  const json = (await body.json()) as {
    code?: string;
    message?: string;
    data?: Record<string, unknown>;
  };
  if (statusCode !== 200 || !json.data) {
    throw new Error(
      `SSI iBoard quote ${statusCode}: ${json.message ?? "no data"}`,
    );
  }
  const d = json.data as Record<string, unknown>;
  return {
    ticker: String(d.ss ?? d.stockSymbol ?? symbol).toUpperCase(),
    exchange: String(d.exchange ?? d.boardId ?? "unknown"),
    ref: Number(d.ref ?? d.refPrice ?? 0),
    ceiling: Number(d.ceiling ?? d.ceilingPrice ?? 0),
    floor: Number(d.floor ?? d.floorPrice ?? 0),
    companyNameVi: d.companyNameVi as string | undefined,
    companyNameEn: d.companyNameEn as string | undefined,
    raw: d,
  };
}
