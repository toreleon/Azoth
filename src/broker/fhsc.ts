import { randomUUID } from "node:crypto";
import { request } from "undici";
import { loadConfig, updateConfig } from "../config/loader.js";
import { getDb } from "../storage/db.js";
import { DEFAULT_FHSC_BASE_URL as DEFAULT_BASE, FHSC_BROKER_NAME as NAME } from "./fhsc/constants.js";
import type {
  FhscAssetSummary,
  FhscCashTransactionItem,
  FhscEnvelope,
  FhscOrderItem,
  FhscPaymentSubAccount,
  FhscPortfolioItem,
  FhscRightItem,
  FhscSubAccount,
} from "./fhsc/types.js";
import {
  daysAgoIso,
  inDateRange,
  isSuccess,
  mapSide,
  normalizeBaseUrl,
  normalizeDate,
  normalizeOrder,
  numberOf,
  payload,
  rowsFrom,
  todayIso,
  todayRange,
  vndToThousand,
} from "./fhsc/utils.js";
import type {
  Broker,
  BrokerAccountHistory,
  BrokerAccountHistoryFilter,
  BrokerCashTransaction,
  BrokerHistoryFill,
  BrokerHistoryOrder,
  BrokerHistoryUnavailable,
  BrokerPosition,
  BrokerSubAccount,
  BrokerRightEvent,
  BrokerSnapshot,
  Order,
  OrderStatus,
  PlaceOrderInput,
} from "./types.js";

/**
 * Finhay Securities (FHSC, formerly VNSC) broker integration.
 *
 * FHSC exposes API-key management in the web app with read:account/read:market
 * scopes. The stable public surface observed from the app covers account,
 * portfolio, and order-history reads. Order placement is deliberately gated
 * until an official trading API contract is provided.
 *
 * Required config or env:
 *   FHSC_SUB_ACCOUNT_ID  — numeric sub-account id used by FHSC endpoints
 *
 * Auth config or env, choose one:
 *   FHSC_ACCESS_TOKEN    — browser/API bearer token
 *   FHSC_ACCESS_KEY      — browser session access key used as x-access-key
 *   FHSC_REFRESH_TOKEN   — browser session refresh token used by invest.fhsc.com.vn
 *   FHSC_DEVICE_ID       — browser session device id used as device-id
 *   FHSC_API_KEY         — OpenAPI key from invest.fhsc.com.vn/quan-ly-api
 *   FHSC_API_SECRET      — OpenAPI secret paired with FHSC_API_KEY
 *
 * Optional env:
 *   FHSC_BASE_URL        — defaults to https://api.vinasecurities.com
 *   FHSC_ACCOUNT_ID      — separate account id for order-history, if needed
 */
export class FHSCBroker implements Broker {
  readonly name = NAME;
  private readonly baseUrl: string;
  private readonly subAccountId: string;
  private readonly accountId: string;
  private accessToken: string;
  private readonly accessKey: string;
  private readonly refreshToken: string;
  private readonly deviceId: string;
  private readonly userId: string;
  private readonly custId: string;
  private readonly apiKey: string;
  private readonly apiSecret: string;

  constructor() {
    const cfg = loadConfig().fhsc;
    this.baseUrl = normalizeBaseUrl(process.env.FHSC_BASE_URL?.trim() || cfg.base_url.trim() || DEFAULT_BASE);
    const subAccountId = process.env.FHSC_SUB_ACCOUNT_ID?.trim() || cfg.sub_account_id.trim();
    const accessToken = process.env.FHSC_ACCESS_TOKEN?.trim() || cfg.access_token.trim();
    const accessKey = process.env.FHSC_ACCESS_KEY?.trim() || cfg.access_key.trim();
    const refreshToken = process.env.FHSC_REFRESH_TOKEN?.trim() || cfg.refresh_token.trim();
    const deviceId = process.env.FHSC_DEVICE_ID?.trim() || cfg.device_id.trim();
    const userId = process.env.FHSC_USER_ID?.trim() || cfg.user_id.trim();
    const custId = process.env.FHSC_CUST_ID?.trim() || cfg.cust_id.trim();
    const apiKey = process.env.FHSC_API_KEY?.trim() || cfg.api_key.trim();
    const apiSecret = process.env.FHSC_API_SECRET?.trim() || cfg.api_secret.trim();
    if (!subAccountId) {
      throw new Error("FHSCBroker requires FHSC sub_account_id in config or env FHSC_SUB_ACCOUNT_ID");
    }
    if (!((accessToken || refreshToken) && accessKey) && !(apiKey && apiSecret)) {
      throw new Error(
        "FHSCBroker requires config/env auth: browser session access_key + access_token/refresh_token, or api_key + api_secret",
      );
    }
    this.subAccountId = subAccountId;
    this.accountId = process.env.FHSC_ACCOUNT_ID?.trim() || cfg.account_id.trim() || subAccountId;
    this.accessToken = accessToken;
    this.accessKey = accessKey;
    this.refreshToken = refreshToken;
    this.deviceId = deviceId;
    this.userId = userId;
    this.custId = custId;
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
  }

  private authHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      accept: "application/json",
      "accept-language": "vi",
      "content-type": "application/json",
      "device-type": "WEB",
      "x-channel": "ONLINE",
    };
    if ((this.accessToken || this.refreshToken) && this.accessKey) {
      if (this.accessToken) headers.authorization = `Bearer ${this.accessToken}`;
      headers["x-access-key"] = this.accessKey;
      if (this.deviceId) headers["device-id"] = this.deviceId;
      return headers;
    }
    if (this.apiKey) headers["x-api-key"] = this.apiKey;
    if (this.apiSecret) headers["x-api-secret"] = this.apiSecret;
    return headers;
  }

  private async refreshAccessToken(): Promise<boolean> {
    if (!this.refreshToken || !this.accessKey) return false;
    const url = new URL(`${this.baseUrl}/auth/v1/authentication`);
    url.searchParams.set("scope", "refresh_token_v1");
    url.searchParams.set("token", this.refreshToken);
    const { statusCode, body } = await request(url, {
      method: "GET",
      headers: this.authHeaders(),
    });
    const text = await body.text();
    if (statusCode < 200 || statusCode >= 300) return false;
    const json = JSON.parse(text) as FhscEnvelope<{ access_token?: string }>;
    if (!isSuccess(json)) return false;
    const nextToken = (json.result as { access_token?: string } | undefined)?.access_token
      ?? (json.data as { access_token?: string } | undefined)?.access_token;
    if (!nextToken) return false;
    this.accessToken = nextToken;
    try {
      const current = loadConfig();
      updateConfig({ fhsc: { ...current.fhsc, access_token: nextToken } });
    } catch {
      // Runtime refresh should not fail the broker read if persisting the token fails.
    }
    return true;
  }

  private async getJson<T>(
    path: string,
    params: Record<string, string | number> = {},
    retryOnUnauthorized = true,
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, String(value));
    }
    const { statusCode, body } = await request(url, {
      method: "GET",
      headers: this.authHeaders(),
    });
    const text = await body.text();
    if (statusCode === 401 && retryOnUnauthorized && await this.refreshAccessToken()) {
      return this.getJson<T>(path, params, false);
    }
    if (statusCode < 200 || statusCode >= 300) {
      const hint =
        text.includes("InvalidTokenException") || text.includes("Thông tin xác thực không hợp lệ")
          ? " FHSC /trade endpoints expect browser-session credentials (access_token + access_key + device_id); OpenAPI key/secret alone is rejected by this endpoint."
          : "";
      throw new Error(`FHSC GET ${path} ${statusCode}: ${text.slice(0, 200)}${hint}`);
    }
    const json = JSON.parse(text) as FhscEnvelope<T>;
    if (!isSuccess(json)) {
      throw new Error(`FHSC GET ${path}: ${json.message ?? JSON.stringify(json).slice(0, 200)}`);
    }
    return payload(json);
  }

  private async paymentSubAccounts(): Promise<FhscPaymentSubAccount[]> {
    if (!this.userId) return [];
    return this.getJson<FhscPaymentSubAccount[]>(
      `/payments/v2/users/${encodeURIComponent(this.userId)}/sub-account`,
    ).catch(() => []);
  }

  private async assetsSummary(): Promise<FhscAssetSummary | null> {
    if (!this.userId) return null;
    const paths = [
      `/accounts/v3/users/${encodeURIComponent(this.userId)}/assets/summary`,
      `/accounts/v4/users/${encodeURIComponent(this.userId)}/assets/summary`,
    ];
    for (const path of paths) {
      try {
        return await this.getJson<FhscAssetSummary>(path);
      } catch {
        continue;
      }
    }
    return null;
  }

  private async portfolioForSubAccount(subAccountId: string): Promise<FhscPortfolioItem[]> {
    const raw = await this.getJson<{ portfolio?: FhscPortfolioItem[] } | FhscPortfolioItem[]>(
      `/trade/v2/sub-accounts/${encodeURIComponent(subAccountId)}/portfolio`,
    );
    const rows = Array.isArray(raw) ? raw : (raw.portfolio ?? []);
    return rows.map((row) => ({ ...row, sub_account_id: row.sub_account_id ?? subAccountId }));
  }

  private async historySubAccounts(): Promise<BrokerSubAccount[]> {
    const paymentAccounts = await this.paymentSubAccounts();
    if (paymentAccounts.length > 0) {
      return paymentAccounts
        .map((account) => ({
          id: String(account.sub_account_id ?? "").trim(),
          type: account.type,
          cashVnd: numberOf(account.balance),
          blockedCashVnd: numberOf(account.blocked_balance),
          totalCashVnd: numberOf(account.total_balance),
          label: account.sub_account_ext,
        }))
        .filter((account) => account.id);
    }
    return [{
      id: this.subAccountId,
      cashVnd: 0,
      label: this.accountId !== this.subAccountId ? this.accountId : undefined,
    }];
  }

  private async orderHistoryForSubAccount(
    subAccountId: string,
    fromDate: string,
    toDate: string,
    maxPages = 5,
  ): Promise<FhscOrderItem[]> {
    const rows: FhscOrderItem[] = [];
    const seen = new Set<string>();
    for (let page = 1; page <= maxPages; page += 1) {
      const raw = await this.getJson<unknown>(
        `/trade/accounts/${encodeURIComponent(subAccountId)}/order-history`,
        { from_date: fromDate, to_date: toDate, page },
      );
      const pageRows = rowsFrom<FhscOrderItem>(raw, ["data", "orders", "items", "rows"]);
      if (pageRows.length === 0) break;
      for (const row of pageRows) {
        const key = String(row.order_id ?? row.id ?? `${subAccountId}-${JSON.stringify(row)}`);
        if (seen.has(key)) continue;
        seen.add(key);
        rows.push(row);
      }
      if (pageRows.length < 20) break;
    }
    return rows;
  }

  private async cashTransactionsForSubAccount(
    subAccountId: string,
    fromDate: string,
    toDate: string,
    maxPages = 5,
  ): Promise<FhscCashTransactionItem[]> {
    if (!this.userId) {
      throw new Error("FHSC transaction history requires user_id in config");
    }
    const rows: FhscCashTransactionItem[] = [];
    const seen = new Set<string>();
    const size = 50;
    for (let page = 1; page <= maxPages; page += 1) {
      const raw = await this.getJson<unknown>(
        `/payments/v3/users/${encodeURIComponent(this.userId)}/sub-accounts/${encodeURIComponent(subAccountId)}/transactions`,
        { size, page, transaction_status: "COMPLETED" },
      );
      const pageRows = rowsFrom<FhscCashTransactionItem>(raw, [
        "transactions",
        "data",
        "items",
        "rows",
      ]);
      if (pageRows.length === 0) break;
      for (const row of pageRows) {
        if (!inDateRange(row.transaction_date ?? row.bus_date, fromDate, toDate)) continue;
        const key = String(row.id ?? row.transaction_number ?? `${subAccountId}-${JSON.stringify(row)}`);
        if (seen.has(key)) continue;
        seen.add(key);
        rows.push(row);
      }
      if (pageRows.length < size) break;
    }
    return rows;
  }

  private async rightsForSubAccount(
    subAccountId: string,
    filter: BrokerAccountHistoryFilter,
    fromDate: string,
    toDate: string,
  ): Promise<FhscRightItem[]> {
    const raw = await this.getJson<unknown>(
      `/trade/v5/account/${encodeURIComponent(subAccountId)}/user-rights`,
      {
        fromDate,
        toDate,
        ...(filter.ticker ? { symbol: filter.ticker.toUpperCase() } : {}),
      },
    );
    return rowsFrom<FhscRightItem>(raw, ["data", "rights", "items", "rows", "list"]);
  }

  private normalizeHistoryOrder(row: FhscOrderItem, subAccountId: string): BrokerHistoryOrder {
    const qty = numberOf(row.order_qtty ?? row.quantity);
    const filledQty = numberOf(row.exec_qtty);
    return {
      id: String(row.order_id ?? row.id ?? ""),
      subAccountId,
      ticker: String(row.symbol ?? "").toUpperCase(),
      side: mapSide(row.side),
      type: String(row.orderType ?? row.order_type ?? ""),
      status: String(row.status ?? ""),
      orderDate: normalizeDate(row.tx_date ?? row.created_at),
      quantity: qty,
      limitPriceThousandVnd: row.price || row.order_price ? vndToThousand(row.price ?? row.order_price) : null,
      filledQty,
      filledPriceThousandVnd: row.exec_price ? vndToThousand(row.exec_price) : null,
      feeVnd: numberOf(row.fee_amt) || undefined,
      taxVnd: numberOf(row.tax_amt) || undefined,
    };
  }

  private normalizeFill(row: FhscOrderItem, subAccountId: string): BrokerHistoryFill | null {
    const quantity = numberOf(row.exec_qtty);
    if (quantity <= 0) return null;
    const priceVnd = numberOf(row.exec_price);
    return {
      orderId: String(row.order_id ?? row.id ?? ""),
      subAccountId,
      ticker: String(row.symbol ?? "").toUpperCase(),
      side: mapSide(row.side),
      tradeDate: normalizeDate(row.tx_date ?? row.created_at),
      quantity,
      priceThousandVnd: priceVnd > 0 ? priceVnd / 1000 : null,
      grossValueVnd: priceVnd > 0 ? priceVnd * quantity : null,
      feeVnd: numberOf(row.fee_amt) || undefined,
      taxVnd: numberOf(row.tax_amt) || undefined,
    };
  }

  private normalizeCashTransaction(row: FhscCashTransactionItem, subAccountId: string): BrokerCashTransaction {
    return {
      id: String(row.id ?? row.transaction_number ?? ""),
      subAccountId: String(row.sub_account_id ?? subAccountId),
      transactionDate: normalizeDate(row.transaction_date),
      businessDate: normalizeDate(row.bus_date),
      type: row.transaction_type,
      flow: row.transaction_flow,
      status: row.transaction_status,
      amountVnd: numberOf(row.amount),
      title: row.title,
      description: row.description ?? row.tr_desc,
      code: row.code,
    };
  }

  private normalizeRight(row: FhscRightItem, subAccountId: string): BrokerRightEvent {
    return {
      id: String(row.caMastId ?? row.id ?? ""),
      subAccountId,
      ticker: String(row.symbol ?? "").toUpperCase(),
      type: row.type ?? row.catType,
      status: row.userRightRegisterStatus ?? row.status,
      reportDate: normalizeDate(row.reportDate),
      startDate: normalizeDate(row.startDate),
      endDate: normalizeDate(row.endDate ?? row.lastRegisterDate),
      finishDate: normalizeDate(row.finishDate),
      ratio: row.ratio,
      ownedShares: numberOf(row.ownNumberOfShare) || undefined,
      waitingShares: numberOf(row.numberOfWaitingStock) || undefined,
      amountVnd: numberOf(row.amount) || undefined,
      priceVnd: numberOf(row.price) || undefined,
      maxRegisterQuantity: numberOf(row.maxRegisterQuantity) || undefined,
      registeredQuantity: numberOf(row.registeredQuantity) || undefined,
    };
  }

  private normalizePositions(portfolio: FhscPortfolioItem[]): BrokerPosition[] {
    const byTicker = new Map<
      string,
      {
        ticker: string;
        quantity: number;
        costValue: number;
        marketValueVnd: number;
        unrealizedPnlVnd: number;
        subAccountId?: string;
        custodyCode?: string;
        lastPrice?: number;
      }
    >();
    for (const p of portfolio) {
      const ticker = String(p.symbol ?? p.ticker ?? "").toUpperCase().trim();
      const quantity = numberOf(p.trade ?? p.total ?? p.quantity);
      if (!ticker || quantity <= 0) continue;
      const avgCost = vndToThousand(p.cost_price ?? p.avg_cost ?? p.average_cost);
      const lastPrice = vndToThousand(p.close_price ?? p.basic_price);
      const marketValueVnd = numberOf(p.basic_price_amount);
      const unrealizedPnlVnd = numberOf(p.pnl_amount);
      const subAccountId = String(p.sub_account_id ?? "").trim();
      const custodyCode = String(p.custodycd ?? "").trim();
      const key = `${ticker}|${subAccountId}|${custodyCode}`;
      const current = byTicker.get(key) ?? {
        ticker,
        quantity: 0,
        costValue: 0,
        marketValueVnd: 0,
        unrealizedPnlVnd: 0,
        subAccountId: subAccountId || undefined,
        custodyCode: custodyCode || undefined,
      };
      current.quantity += quantity;
      current.costValue += avgCost * quantity;
      current.marketValueVnd += marketValueVnd;
      current.unrealizedPnlVnd += unrealizedPnlVnd;
      if (lastPrice > 0) current.lastPrice = lastPrice;
      byTicker.set(key, current);
    }
    return Array.from(byTicker.values()).map((value) => ({
      ticker: value.ticker,
      quantity: value.quantity,
      avgCost: value.quantity > 0 ? value.costValue / value.quantity : 0,
      lastPrice: value.lastPrice,
      marketValueVnd: value.marketValueVnd || undefined,
      unrealizedPnlVnd: value.unrealizedPnlVnd || undefined,
      unrealizedPnlPct:
        value.costValue > 0 ? (value.unrealizedPnlVnd / (value.costValue * 1000)) * 100 : undefined,
      subAccountId: value.subAccountId,
      custodyCode: value.custodyCode,
    }));
  }

  async snapshot(): Promise<BrokerSnapshot> {
    const [paymentAccounts, assetSummary] = await Promise.all([
      this.paymentSubAccounts(),
      this.assetsSummary(),
    ]);
    const subAccountIds = Array.from(
      new Set(
        [
          this.subAccountId,
          ...paymentAccounts.map((account) => String(account.sub_account_id ?? "").trim()),
        ].filter(Boolean),
      ),
    );
    const [accountResult, ...portfolioResults] = await Promise.allSettled([
      this.getJson<FhscSubAccount>(`/trade/sub-accounts/${encodeURIComponent(this.subAccountId)}`),
      ...subAccountIds.map((id) => this.portfolioForSubAccount(id)),
    ]);
    if (
      paymentAccounts.length === 0 &&
      accountResult.status === "rejected" &&
      portfolioResults.every((result) => result.status === "rejected") &&
      !assetSummary
    ) {
      throw new Error(
        `FHSC snapshot failed: ${String(accountResult.reason)}; ${portfolioResults
          .map((result) => (result.status === "rejected" ? String(result.reason) : "portfolio ok"))
          .join("; ")}`,
      );
    }
    const account = accountResult.status === "fulfilled" ? accountResult.value : ({} as FhscSubAccount);
    const portfolio = portfolioResults.flatMap((result) => (result.status === "fulfilled" ? result.value : []));
    const positions = this.normalizePositions(portfolio);
    const paymentCash = paymentAccounts.reduce(
      (sum, account) => sum + numberOf(account.balance ?? account.total_balance),
      0,
    );
    const blockedBalance = paymentAccounts.reduce((sum, account) => sum + numberOf(account.blocked_balance), 0);
    const summaryCash = numberOf(assetSummary?.money?.total);
    const summaryDebt = numberOf(assetSummary?.debt?.total ?? assetSummary?.debt?.owe_deposit);
    const summaryNav = numberOf(assetSummary?.net_asset_value);
    return {
      broker: NAME,
      cashVnd:
        summaryCash > 0
          ? summaryCash
          : paymentAccounts.length > 0
          ? paymentCash
          : numberOf(account.balance ?? account.cash ?? account.cash_balance ?? account.buying_power),
      positions,
      subAccounts:
        paymentAccounts.length > 0
          ? paymentAccounts.map((account) => ({
              id: String(account.sub_account_id ?? ""),
              type: account.type,
              cashVnd: numberOf(account.balance),
              blockedCashVnd: numberOf(account.blocked_balance),
              totalCashVnd: numberOf(account.total_balance),
              label: account.sub_account_ext,
            }))
          : undefined,
      marginUsedVnd:
        summaryDebt > 0
          ? summaryDebt
          : paymentAccounts.length > 0
          ? blockedBalance
          : numberOf(account.margin_used ?? account.marginUsed),
      totalEquityVnd: summaryNav > 0 ? summaryNav : undefined,
    };
  }

  async accountHistory(filter: BrokerAccountHistoryFilter = {}): Promise<BrokerAccountHistory> {
    const fromDate = filter.fromDate ?? daysAgoIso(365);
    const toDate = filter.toDate ?? todayIso();
    const limit = Math.max(1, Math.min(filter.limit ?? 100, 500));
    const ticker = filter.ticker?.toUpperCase();
    const accounts = (await this.historySubAccounts()).filter((account) => account.id);
    const unavailable: BrokerHistoryUnavailable[] = [];

    const orderResults = await Promise.allSettled(
      accounts.map(async (account) => ({
        subAccountId: account.id,
        rows: await this.orderHistoryForSubAccount(account.id, fromDate, toDate),
      })),
    );
    const transactionResults = await Promise.allSettled(
      accounts.map(async (account) => ({
        subAccountId: account.id,
        rows: await this.cashTransactionsForSubAccount(account.id, fromDate, toDate),
      })),
    );
    const rightResults = await Promise.allSettled(
      accounts.map(async (account) => ({
        subAccountId: account.id,
        rows: await this.rightsForSubAccount(account.id, filter, fromDate, toDate),
      })),
    );

    const orders: BrokerHistoryOrder[] = [];
    const fills: BrokerHistoryFill[] = [];
    for (const result of orderResults) {
      if (result.status === "rejected") {
        unavailable.push({ source: "order_history", error: String(result.reason).slice(0, 240) });
        continue;
      }
      for (const row of result.value.rows) {
        if (ticker && String(row.symbol ?? "").toUpperCase() !== ticker) continue;
        orders.push(this.normalizeHistoryOrder(row, result.value.subAccountId));
        const fill = this.normalizeFill(row, result.value.subAccountId);
        if (fill) fills.push(fill);
      }
    }

    const transactions: BrokerCashTransaction[] = [];
    for (const result of transactionResults) {
      if (result.status === "rejected") {
        unavailable.push({ source: "transactions", error: String(result.reason).slice(0, 240) });
        continue;
      }
      transactions.push(
        ...result.value.rows.map((row) => this.normalizeCashTransaction(row, result.value.subAccountId)),
      );
    }

    const rights: BrokerRightEvent[] = [];
    for (const result of rightResults) {
      if (result.status === "rejected") {
        unavailable.push({ source: "rights", error: String(result.reason).slice(0, 240) });
        continue;
      }
      rights.push(
        ...result.value.rows
          .filter((row) => !ticker || String(row.symbol ?? "").toUpperCase() === ticker)
          .map((row) => this.normalizeRight(row, result.value.subAccountId)),
      );
    }

    const dateDesc = (value: string | null | undefined) => value ?? "";
    orders.sort((a, b) => dateDesc(b.orderDate).localeCompare(dateDesc(a.orderDate)));
    fills.sort((a, b) => dateDesc(b.tradeDate).localeCompare(dateDesc(a.tradeDate)));
    transactions.sort((a, b) => dateDesc(b.transactionDate).localeCompare(dateDesc(a.transactionDate)));
    rights.sort((a, b) => dateDesc(b.reportDate).localeCompare(dateDesc(a.reportDate)));

    return {
      broker: NAME,
      fromDate,
      toDate,
      subAccounts: accounts,
      orders: orders.slice(0, limit),
      fills: fills.slice(0, limit),
      transactions: transactions.slice(0, limit),
      rights: rights.slice(0, limit),
      ...(unavailable.length > 0 ? { unavailable } : {}),
    };
  }

  async listOrders(
    filter: { ticker?: string; status?: OrderStatus; limit?: number } = {},
  ): Promise<Order[]> {
    const { from, to } = todayRange();
    const rows = await this.orderHistoryForSubAccount(this.accountId, from, to, 1).catch(() => []);
    let orders = rows.map(normalizeOrder);
    if (filter.ticker) {
      const t = filter.ticker.toUpperCase();
      orders = orders.filter((o) => o.ticker === t);
    }
    if (filter.status) orders = orders.filter((o) => o.status === filter.status);
    return orders.slice(0, filter.limit ?? 50);
  }

  async placeOrder(input: PlaceOrderInput): Promise<Order> {
    return this.recordRejectedOrder(
      input,
      "FHSC trading API is not enabled: read-only OpenAPI integration supports snapshot and order history only",
    );
  }

  async recordRejectedOrder(input: PlaceOrderInput, reason: string): Promise<Order> {
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

  async cancelOrder(id: string): Promise<Order> {
    throw new Error(`FHSC cancel is not available in read-only OpenAPI mode for order ${id}`);
  }

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
}
