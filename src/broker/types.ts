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
}

export interface BrokerSnapshot {
  broker: string;
  cashVnd: number;
  positions: BrokerPosition[];
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
}
