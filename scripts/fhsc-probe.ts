import { loadConfig } from "../src/config/loader.js";

const LEGACY_BASE = "https://api.finhay.com.vn/gw";
const CURRENT_BASE = "https://api.vinasecurities.com";

function normalizeBaseUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, "");
  return trimmed === LEGACY_BASE ? CURRENT_BASE : trimmed;
}

function todayIso() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function redactBody(text: string): string {
  return text
    .replace(/ak_[A-Za-z0-9]+/g, "ak_REDACTED")
    .replace(/[A-Fa-f0-9]{32,}/g, "HEX_REDACTED")
    .slice(0, 360)
    .replace(/\s+/g, " ")
    .trim();
}

function headerVariants(apiKey: string, apiSecret: string, accessToken: string, accessKey: string, deviceId: string) {
  const common = {
    accept: "application/json",
    "accept-language": "vi",
    "content-type": "application/json",
    "device-type": "WEB",
    "x-channel": "ONLINE",
  };
  const variants: Array<{ name: string; headers: Record<string, string> }> = [];
  if (accessToken && accessKey) {
    variants.push({
      name: "browser session access_token + access_key",
      headers: {
        ...common,
        authorization: `Bearer ${accessToken}`,
        "x-access-key": accessKey,
        ...(deviceId ? { "device-id": deviceId } : {}),
      },
    });
  }
  if (apiKey && apiSecret) {
    variants.push(
      { name: "x-api-key + x-api-secret", headers: { ...common, "x-api-key": apiKey, "x-api-secret": apiSecret } },
      { name: "x-access-key + x-api-secret", headers: { ...common, "x-access-key": apiKey, "x-api-secret": apiSecret } },
      { name: "x-access-key + x-secret-key", headers: { ...common, "x-access-key": apiKey, "x-secret-key": apiSecret } },
      { name: "api-key + secret-key", headers: { ...common, "api-key": apiKey, "secret-key": apiSecret } },
      { name: "bearer api key + x-api-secret", headers: { ...common, authorization: `Bearer ${apiKey}`, "x-api-secret": apiSecret } },
      {
        name: "basic api key:secret",
        headers: {
          ...common,
          authorization: `Basic ${Buffer.from(`${apiKey}:${apiSecret}`, "utf8").toString("base64")}`,
        },
      },
    );
  }
  if (accessToken) {
    variants.push({ name: "bearer access token", headers: { ...common, authorization: `Bearer ${accessToken}` } });
  }
  return variants;
}

async function probe(url: string, headers: Record<string, string>) {
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 10_000);
  try {
    const res = await fetch(url, { method: "GET", headers, signal: ctrl.signal });
    const body = await res.text().catch(() => "");
    const contentType = res.headers.get("content-type") ?? "";
    return {
      status: res.status,
      contentType,
      body: redactBody(body),
    };
  } catch (e) {
    return {
      status: 0,
      contentType: "",
      body: (e as Error).message,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function main() {
  const cfg = loadConfig();
  const fhsc = cfg.fhsc;
  const subAccountId = process.env.FHSC_SUB_ACCOUNT_ID?.trim() || fhsc.sub_account_id.trim();
  const accountId = process.env.FHSC_ACCOUNT_ID?.trim() || fhsc.account_id.trim() || subAccountId;
  const apiKey = process.env.FHSC_API_KEY?.trim() || fhsc.api_key.trim();
  const apiSecret = process.env.FHSC_API_SECRET?.trim() || fhsc.api_secret.trim();
  const accessToken = process.env.FHSC_ACCESS_TOKEN?.trim() || fhsc.access_token.trim();
  const accessKey = process.env.FHSC_ACCESS_KEY?.trim() || fhsc.access_key.trim();
  const deviceId = process.env.FHSC_DEVICE_ID?.trim() || fhsc.device_id.trim();
  const userId = process.env.FHSC_USER_ID?.trim() || fhsc.user_id.trim();
  const configuredBase = normalizeBaseUrl(process.env.FHSC_BASE_URL?.trim() || fhsc.base_url.trim() || CURRENT_BASE);

  if (!subAccountId) throw new Error("Missing FHSC sub-account id in config or FHSC_SUB_ACCOUNT_ID.");
  if (!(apiKey && apiSecret) && !(accessToken && accessKey)) {
    throw new Error("Missing FHSC auth in config/env: api_key + api_secret, or access_token + access_key.");
  }

  const bases = Array.from(new Set([configuredBase, CURRENT_BASE, LEGACY_BASE]));
  const day = todayIso();
  const paths = [
    { name: "portfolio", path: `/trade/v2/sub-accounts/${encodeURIComponent(subAccountId)}/portfolio` },
    { name: "sub-account", path: `/trade/sub-accounts/${encodeURIComponent(subAccountId)}` },
    {
      name: "order-history",
      path: `/trade/accounts/${encodeURIComponent(accountId)}/order-history?from_date=${day}&to_date=${day}&page=1`,
    },
    ...(userId
      ? [
          {
            name: "payment sub-accounts",
            path: `/payments/v2/users/${encodeURIComponent(userId)}/sub-account`,
          },
        ]
      : []),
    { name: "openapi portfolio guess", path: `/openapi/v1/sub-accounts/${encodeURIComponent(subAccountId)}/portfolio` },
    { name: "open-api portfolio guess", path: `/open-api/v1/sub-accounts/${encodeURIComponent(subAccountId)}/portfolio` },
  ];
  const variants = headerVariants(apiKey, apiSecret, accessToken, accessKey, deviceId);

  console.log(
    `FHSC probe sub_account=${subAccountId ? "set" : "missing"} account=${accountId ? "set" : "missing"} bases=${bases.join(", ")}`,
  );
  for (const base of bases) {
    for (const p of paths) {
      for (const variant of variants) {
        const url = `${base}${p.path}`;
        const res = await probe(url, variant.headers);
        const interesting = res.status === 200 || res.status === 401 || res.status === 403 || res.status === 404;
        if (!interesting) continue;
        console.log(`${res.status} ${p.name} ${variant.name} ${base}`);
        console.log(`  ${res.contentType || "no-content-type"} ${res.body || "(empty)"}`);
        if (res.status === 200) return;
      }
    }
  }
}

main().catch((e) => {
  console.error((e as Error).message);
  process.exitCode = 1;
});
