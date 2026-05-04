import * as readline from "node:readline/promises";
import { randomUUID } from "node:crypto";
import { request } from "undici";
import { getDb } from "../storage/db.js";
import type {
  Broker,
  BrokerPosition,
  BrokerSnapshot,
  Order,
  OrderStatus,
  PlaceOrderInput,
} from "./types.js";

/**
 * DNSE Entrade X (LightSpeed v2) live broker.
 *
 * Endpoints based on community projects (ChungkhoanPhaisinh/AutoTrade, 2025-11)
 * and DNSE's hdsd.dnse.com.vn LightSpeed v2 docs. All field names are parsed
 * defensively because DNSE has not published a stable spec.
 *
 *  Required env:
 *    DNSE_USERNAME            — phone or email
 *    DNSE_PASSWORD            — login password
 *    DNSE_ACCOUNT_NO          — sub-account number (e.g. "0001234567")
 *    DNSE_LOAN_PACKAGE_ID     — per-account; fetch from /margin-service/loan-products
 *    AZOTH_LIVE_TRADING=1   — top-level arming flag, must be set explicitly
 *
 *  Order placement requires a trading-token obtained via email OTP. The first
 *  place_order in a process triggers an interactive prompt on the CLI.
 */
const BASE = "https://api.dnse.com.vn";
const NAME = "dnse";

interface PlaceResponse {
  id?: string;
  orderId?: string;
  [key: string]: unknown;
}

interface OrderListItem {
  id?: string;
  orderId?: string;
  symbol?: string;
  side?: string;
  orderType?: string;
  quantity?: number;
  price?: number;
  orderStatus?: string;
  status?: string;
  filledQuantity?: number;
  averagePrice?: number;
  createdAt?: string;
  modifiedAt?: string;
  [key: string]: unknown;
}

interface AccountBalance {
  accountNo?: string;
  cash?: number;
  cashWithdrawable?: number;
  [key: string]: unknown;
}

interface DealItem {
  symbol?: string;
  quantity?: number;
  averageCostPrice?: number;
  [key: string]: unknown;
}

function vndToThousand(vnd: number | null | undefined): number {
  if (vnd == null) return 0;
  return vnd / 1000;
}

function thousandToVnd(thousand: number): number {
  return Math.round(thousand * 1000);
}

function mapStatus(raw: string | undefined): OrderStatus {
  switch ((raw ?? "").toLowerCase()) {
    case "filled":
      return "FILLED";
    case "canceled":
    case "cancelled":
      return "CANCELLED";
    case "rejected":
    case "expired":
      return "REJECTED";
    default:
      return "PENDING"; // Pending, New, PartiallyFilled, ReplacePending, ...
  }
}

export class DNSEBroker implements Broker {
  readonly name = NAME;
  private jwt: string | null = null;
  private jwtExpiresAt = 0;
  private tradingToken: string | null = null;
  private tradingTokenExpiresAt = 0;

  private readonly username: string;
  private readonly password: string;
  private readonly accountNo: string;
  private readonly loanPackageId: number;
  private readonly armed: boolean;

  constructor() {
    const u = process.env.DNSE_USERNAME;
    const p = process.env.DNSE_PASSWORD;
    const a = process.env.DNSE_ACCOUNT_NO;
    const l = process.env.DNSE_LOAN_PACKAGE_ID;
    if (!u || !p || !a || !l) {
      throw new Error(
        "DNSEBroker requires env: DNSE_USERNAME, DNSE_PASSWORD, DNSE_ACCOUNT_NO, DNSE_LOAN_PACKAGE_ID",
      );
    }
    this.username = u;
    this.password = p;
    this.accountNo = a;
    this.loanPackageId = Number(l);
    this.armed = process.env.AZOTH_LIVE_TRADING === "1";
  }

  // ---- Auth ---------------------------------------------------------------

  private async ensureJwt(): Promise<string> {
    if (this.jwt && Date.now() < this.jwtExpiresAt) return this.jwt;
    const { statusCode, body } = await request(`${BASE}/auth-service/login`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ username: this.username, password: this.password }),
    });
    const text = await body.text();
    if (statusCode !== 200) {
      throw new Error(`DNSE login ${statusCode}: ${text.slice(0, 200)}`);
    }
    const json = JSON.parse(text) as { token?: string };
    if (!json.token) throw new Error("DNSE login: missing token in response");
    this.jwt = json.token;
    // Community-reported TTL ~8h. Refresh after 7h to be safe.
    this.jwtExpiresAt = Date.now() + 7 * 3600 * 1000;
    return this.jwt;
  }

  private async requestEmailOtp(): Promise<void> {
    const jwt = await this.ensureJwt();
    const { statusCode, body } = await request(
      `${BASE}/auth-service/api/email-otp`,
      { method: "GET", headers: { authorization: `Bearer ${jwt}` } },
    );
    if (statusCode !== 200) {
      const text = await body.text();
      throw new Error(`DNSE email-otp ${statusCode}: ${text.slice(0, 200)}`);
    }
  }

  private async exchangeOtpForTradingToken(otp: string): Promise<string> {
    const jwt = await this.ensureJwt();
    const { statusCode, body } = await request(
      `${BASE}/order-service/trading-token`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${jwt}`,
          "smart-otp": otp,
          accept: "application/json",
        },
      },
    );
    const text = await body.text();
    if (statusCode !== 200) {
      throw new Error(`DNSE trading-token ${statusCode}: ${text.slice(0, 200)}`);
    }
    const json = JSON.parse(text) as { tradingToken?: string };
    if (!json.tradingToken) {
      throw new Error("DNSE trading-token: missing tradingToken in response");
    }
    this.tradingToken = json.tradingToken;
    this.tradingTokenExpiresAt = Date.now() + 7 * 3600 * 1000;
    return this.tradingToken;
  }

  /**
   * Interactive OTP exchange. Called automatically on first placeOrder; can
   * also be called eagerly at session start.
   */
  async authorizeTrading(): Promise<void> {
    if (this.tradingToken && Date.now() < this.tradingTokenExpiresAt) return;
    await this.requestEmailOtp();
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stderr,
    });
    try {
      const otp = (
        await rl.question(
          "\n  >> DNSE email OTP sent. Enter 6-digit code: ",
        )
      ).trim();
      if (!/^\d{6}$/.test(otp)) {
        throw new Error("OTP must be 6 digits");
      }
      await this.exchangeOtpForTradingToken(otp);
    } finally {
      rl.close();
    }
  }

  // ---- Read endpoints (JWT only) ------------------------------------------

  private async getJson<T>(path: string): Promise<T> {
    const jwt = await this.ensureJwt();
    const { statusCode, body } = await request(`${BASE}${path}`, {
      method: "GET",
      headers: { authorization: `Bearer ${jwt}`, accept: "application/json" },
    });
    const text = await body.text();
    if (statusCode !== 200) {
      throw new Error(`DNSE GET ${path} ${statusCode}: ${text.slice(0, 200)}`);
    }
    return JSON.parse(text) as T;
  }

  async snapshot(): Promise<BrokerSnapshot> {
    const [balance, dealsResp] = await Promise.all([
      this.getJson<AccountBalance>(
        `/order-service/account-balances/${encodeURIComponent(this.accountNo)}`,
      ).catch(() => ({ cash: 0 } as AccountBalance)),
      this.getJson<{ deals?: DealItem[] }>(
        `/deal-service/deals?accountNo=${encodeURIComponent(this.accountNo)}`,
      ).catch(() => ({ deals: [] as DealItem[] })),
    ]);
    const positions: BrokerPosition[] = (dealsResp.deals ?? [])
      .filter((d) => (d.quantity ?? 0) > 0 && d.symbol)
      .map((d) => ({
        ticker: String(d.symbol).toUpperCase(),
        quantity: Number(d.quantity ?? 0),
        avgCost: vndToThousand(d.averageCostPrice ?? 0),
      }));
    return {
      broker: NAME,
      cashVnd: Number(balance.cash ?? balance.cashWithdrawable ?? 0),
      positions,
    };
  }

  async listOrders(
    filter: { ticker?: string; status?: OrderStatus; limit?: number } = {},
  ): Promise<Order[]> {
    const resp = await this.getJson<{ orders?: OrderListItem[] }>(
      `/order-service/v2/orders?accountNo=${encodeURIComponent(this.accountNo)}`,
    ).catch(() => ({ orders: [] as OrderListItem[] }));
    const all = (resp.orders ?? []).map((o): Order => {
      const status = mapStatus(o.orderStatus ?? o.status);
      const id = String(o.id ?? o.orderId ?? "");
      const filledQty = Number(o.filledQuantity ?? 0);
      const filledPrice = o.averagePrice ? vndToThousand(o.averagePrice) : null;
      return {
        id,
        broker: NAME,
        ticker: String(o.symbol ?? "").toUpperCase(),
        side: o.side === "NS" ? "SELL" : "BUY",
        type: (o.orderType === "LO" ? "LIMIT" : "MARKET") as Order["type"],
        quantity: Number(o.quantity ?? 0),
        limitPrice: o.price ? vndToThousand(o.price) : null,
        status,
        rejectReason: null,
        createdAt: o.createdAt ? Math.floor(Date.parse(o.createdAt) / 1000) : 0,
        filledAt:
          status === "FILLED" && o.modifiedAt
            ? Math.floor(Date.parse(o.modifiedAt) / 1000)
            : null,
        filledPrice,
        filledQty: filledQty || null,
        notes: null,
      };
    });
    let out = all;
    if (filter.ticker) {
      const t = filter.ticker.toUpperCase();
      out = out.filter((o) => o.ticker === t);
    }
    if (filter.status) out = out.filter((o) => o.status === filter.status);
    return out.slice(0, filter.limit ?? 50);
  }

  // ---- Order placement ----------------------------------------------------

  async placeOrder(input: PlaceOrderInput): Promise<Order> {
    if (!this.armed) {
      throw new Error(
        "DNSE live trading is disarmed: set AZOTH_LIVE_TRADING=1 to enable real orders",
      );
    }
    if (input.type === "LIMIT" && (input.limitPrice == null || input.limitPrice <= 0)) {
      return this.recordReject(input, "LIMIT order requires positive limitPrice");
    }
    if (input.quantity <= 0 || input.quantity % 100 !== 0) {
      return this.recordReject(input, "quantity must be a positive multiple of 100");
    }

    const jwt = await this.ensureJwt();
    await this.authorizeTrading();

    const body = {
      accountNo: this.accountNo,
      symbol: input.ticker.toUpperCase(),
      side: input.side === "BUY" ? "NB" : "NS",
      orderType: input.type === "LIMIT" ? "LO" : "MP",
      quantity: input.quantity,
      price: input.type === "LIMIT" ? thousandToVnd(input.limitPrice!) : 0,
      loanPackageId: this.loanPackageId,
    };

    const { statusCode, body: respBody } = await request(
      `${BASE}/order-service/v2/orders`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${jwt}`,
          "trading-token": this.tradingToken!,
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify(body),
      },
    );
    const text = await respBody.text();
    if (statusCode < 200 || statusCode >= 300) {
      return this.recordReject(input, `DNSE ${statusCode}: ${text.slice(0, 200)}`);
    }

    let parsed: PlaceResponse = {};
    try {
      parsed = JSON.parse(text) as PlaceResponse;
    } catch {
      // ignore — we'll still record an audit row
    }

    const order: Order = {
      id: String(parsed.id ?? parsed.orderId ?? randomUUID()),
      broker: NAME,
      ticker: input.ticker.toUpperCase(),
      side: input.side,
      type: input.type,
      quantity: input.quantity,
      limitPrice: input.limitPrice ?? null,
      status: mapStatus((parsed as { orderStatus?: string }).orderStatus),
      rejectReason: null,
      createdAt: Math.floor(Date.now() / 1000),
      filledAt: null,
      filledPrice: null,
      filledQty: null,
      notes: input.notes ?? null,
    };
    this.audit(order);
    return order;
  }

  async cancelOrder(id: string): Promise<Order> {
    if (!this.armed) {
      throw new Error(
        "DNSE live trading is disarmed: set AZOTH_LIVE_TRADING=1 to cancel real orders",
      );
    }
    const jwt = await this.ensureJwt();
    await this.authorizeTrading();
    const { statusCode, body } = await request(
      `${BASE}/order-service/v2/orders/${encodeURIComponent(id)}?accountNo=${encodeURIComponent(this.accountNo)}`,
      {
        method: "DELETE",
        headers: {
          authorization: `Bearer ${jwt}`,
          "trading-token": this.tradingToken!,
          accept: "application/json",
        },
      },
    );
    const text = await body.text();
    if (statusCode < 200 || statusCode >= 300) {
      throw new Error(`DNSE cancel ${statusCode}: ${text.slice(0, 200)}`);
    }
    const fresh = await this.listOrders({ limit: 200 });
    const found = fresh.find((o) => o.id === id);
    return (
      found ?? {
        id,
        broker: NAME,
        ticker: "",
        side: "BUY",
        type: "MARKET",
        quantity: 0,
        limitPrice: null,
        status: "CANCELLED",
        rejectReason: null,
        createdAt: 0,
        filledAt: null,
        filledPrice: null,
        filledQty: null,
        notes: null,
      }
    );
  }

  // ---- Local audit trail --------------------------------------------------

  private audit(order: Order) {
    const db = getDb();
    db.prepare(
      `INSERT OR REPLACE INTO broker_orders
       (id,broker,ticker,side,type,quantity,limit_price,status,reject_reason,created_at,filled_at,filled_price,filled_qty,notes)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      order.id,
      order.broker,
      order.ticker,
      order.side,
      order.type,
      order.quantity,
      order.limitPrice,
      order.status,
      order.rejectReason,
      order.createdAt,
      order.filledAt,
      order.filledPrice,
      order.filledQty,
      order.notes,
    );
  }

  private recordReject(input: PlaceOrderInput, reason: string): Order {
    const order: Order = {
      id: randomUUID(),
      broker: NAME,
      ticker: input.ticker.toUpperCase(),
      side: input.side,
      type: input.type,
      quantity: input.quantity,
      limitPrice: input.limitPrice ?? null,
      status: "REJECTED",
      rejectReason: reason,
      createdAt: Math.floor(Date.now() / 1000),
      filledAt: null,
      filledPrice: null,
      filledQty: null,
      notes: input.notes ?? null,
    };
    this.audit(order);
    return order;
  }
}
