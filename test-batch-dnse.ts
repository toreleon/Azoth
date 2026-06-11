import { request } from "undici";

async function fetchOhlcs(symbol: string) {
  const url = `https://services.entrade.com.vn/chart-api/v2/ohlcs/stock?symbol=${encodeURIComponent(
    symbol,
  )}&resolution=1D&from=1700000000&to=1800000000`;
  const { statusCode, body } = await request(url, {
    method: "GET",
    headers: { accept: "application/json" },
  });
  console.log(statusCode, await body.text());
}
fetchOhlcs("FPT,SSI");
