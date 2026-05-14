export type Side = "BUY" | "SELL";
export type OrderType = "MARKET" | "LIMIT";
export type OrderStatus = "PENDING" | "FILLED" | "CANCELLED" | "REJECTED";

export interface PlaceOrderInput {
  ticker: string;
  side: Side;
  type: OrderType;
  quantity: number;        // shares; HOSE lot = 100
  limitPrice?: number;     // thousand VND, required for LIMIT
  notes?: string;
}

export interface Order {
  id: string;
  broker: string;
  ticker: string;
  side: Side;
  type: OrderType;
  quantity: number;
  limitPrice: number | null;
  status: OrderStatus;
  rejectReason: string | null;
  createdAt: number;       // unix seconds
  filledAt: number | null;
  filledPrice: number | null;
  filledQty: number | null;
  notes: string | null;
}

export interface BrokerPosition {
  ticker: string;
  quantity: number;
  avgCost: number;         // thousand VND
  /** Broker-reported latest/close price in thousand VND, when available. */
  lastPrice?: number;
  /** Broker-reported position market value in VND, when available. */
  marketValueVnd?: number;
  /** Broker-reported unrealized P&L in VND, when available. */
  unrealizedPnlVnd?: number;
  /** Broker-reported unrealized P&L percentage, when available. */
  unrealizedPnlPct?: number;
  /** Broker sub-account holding this position, when available. */
  subAccountId?: string;
  /** Broker custody account, when available. */
  custodyCode?: string;
}

export interface BrokerSubAccount {
  id: string;
  type?: string;
  cashVnd: number;
  blockedCashVnd?: number;
  totalCashVnd?: number;
  label?: string;
}

export interface BrokerSnapshot {
  broker: string;
  cashVnd: number;
  positions: BrokerPosition[];
  subAccounts?: BrokerSubAccount[];
  /** Optional equity baseline used for loss guardrails. VND. */
  initialCashVnd?: number;
  /** Optional broker-reported margin usage. VND. */
  marginUsedVnd?: number;
}

export interface BrokerAccountHistoryFilter {
  fromDate?: string;
  toDate?: string;
  ticker?: string;
  limit?: number;
}

export interface BrokerHistoryOrder {
  id: string;
  subAccountId?: string;
  ticker: string;
  side: Side;
  type: string;
  status: string;
  orderDate: string | null;
  quantity: number;
  limitPriceThousandVnd: number | null;
  filledQty: number;
  filledPriceThousandVnd: number | null;
  feeVnd?: number;
  taxVnd?: number;
}

export interface BrokerHistoryFill {
  orderId: string;
  subAccountId?: string;
  ticker: string;
  side: Side;
  tradeDate: string | null;
  quantity: number;
  priceThousandVnd: number | null;
  grossValueVnd: number | null;
  feeVnd?: number;
  taxVnd?: number;
}

export interface BrokerCashTransaction {
  id: string;
  subAccountId?: string;
  transactionDate: string | null;
  businessDate: string | null;
  type?: string;
  flow?: string;
  status?: string;
  amountVnd: number;
  title?: string;
  description?: string;
  code?: string;
}

export interface BrokerRightEvent {
  id: string;
  subAccountId?: string;
  ticker: string;
  type?: string;
  status?: string;
  reportDate: string | null;
  startDate?: string | null;
  endDate?: string | null;
  finishDate?: string | null;
  ratio?: string;
  ownedShares?: number;
  waitingShares?: number;
  amountVnd?: number;
  priceVnd?: number;
  maxRegisterQuantity?: number;
  registeredQuantity?: number;
}

export interface BrokerHistoryUnavailable {
  source: string;
  subAccountId?: string;
  error: string;
}

export interface BrokerAccountHistory {
  broker: string;
  fromDate: string;
  toDate: string;
  subAccounts: BrokerSubAccount[];
  orders: BrokerHistoryOrder[];
  fills: BrokerHistoryFill[];
  transactions: BrokerCashTransaction[];
  rights: BrokerRightEvent[];
  unavailable?: BrokerHistoryUnavailable[];
}

export interface Broker {
  readonly name: string;

  placeOrder(input: PlaceOrderInput): Promise<Order>;
  recordRejectedOrder?(input: PlaceOrderInput, reason: string): Promise<Order>;
  cancelOrder(id: string): Promise<Order>;
  listOrders(filter?: {
    ticker?: string;
    status?: OrderStatus;
    limit?: number;
  }): Promise<Order[]>;

  snapshot(): Promise<BrokerSnapshot>;
  accountHistory?(filter?: BrokerAccountHistoryFilter): Promise<BrokerAccountHistory>;
}
