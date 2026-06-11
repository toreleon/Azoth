import { request } from "undici";

async function fetchSsi(symbol: string) {
  const url = `https://iboard-query.ssi.com.vn/stock/${encodeURIComponent(symbol)}`;
  const { statusCode, body } = await request(url, {
    method: "GET",
    headers: { accept: "application/json" },
  });
  console.log(statusCode, await body.text());
}
fetchSsi("FPT,SSI");
