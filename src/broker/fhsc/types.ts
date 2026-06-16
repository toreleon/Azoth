export interface FhscEnvelope<T = unknown> {
  error_code?: string | number;
  message?: string;
  data?: T;
  result?: T;
  [key: string]: unknown;
}

export interface FhscSubAccount {
  balance?: number;
  cash?: number;
  cash_balance?: number;
  buying_power?: number;
  margin_used?: number;
  marginUsed?: number;
  sub_account_id?: string | number;
  sub_account_ext?: string;
  [key: string]: unknown;
}

export interface FhscPortfolioItem {
  sub_account_id?: string | number;
  symbol?: string;
  ticker?: string;
  total?: number;
  trade?: number;
  quantity?: number;
  close_price?: number;
  basic_price?: number;
  pnl_amount?: number;
  pnl_rate?: number;
  basic_price_amount?: number;
  custodycd?: string;
  cost_price?: number;
  avg_cost?: number;
  average_cost?: number;
  [key: string]: unknown;
}

export interface FhscPaymentSubAccount {
  customer_id?: string;
  sub_account_id?: string | number;
  balance?: number;
  total_balance?: number;
  blocked_balance?: number;
  type?: string;
  sub_account_ext?: string;
  [key: string]: unknown;
}

export interface FhscAssetSummary {
  net_asset_value?: number;
  money?: {
    total?: number;
    [key: string]: unknown;
  };
  products?: {
    stock?: number;
    fund?: number;
    bond?: number;
    hay0?: number;
    child_savings?: number;
    [key: string]: unknown;
  };
  debt?: {
    total?: number;
    advance_amt?: number;
    cidepo_fee?: number;
    cidepo_fee_acr?: number;
    owe_deposit?: number;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface FhscOrderItem {
  order_id?: string | number;
  id?: string | number;
  symbol?: string;
  side?: string;
  orderType?: string;
  order_type?: string;
  order_qtty?: number;
  quantity?: number;
  price?: number;
  order_price?: number;
  status?: string;
  reject_reason?: string;
  tx_date?: string;
  created_at?: string;
  exec_price?: number;
  exec_qtty?: number;
  fee_amt?: number;
  tax_amt?: number;
  [key: string]: unknown;
}

export interface FhscCashTransactionItem {
  id?: string | number;
  sub_account_id?: string | number;
  transaction_date?: string;
  bus_date?: string;
  transaction_number?: string;
  transaction_type?: string;
  transaction_flow?: string;
  transaction_status?: string;
  amount?: number;
  title?: string;
  description?: string;
  code?: string;
  tr_desc?: string;
  [key: string]: unknown;
}

export interface FhscRightItem {
  caMastId?: string | number;
  id?: string | number;
  symbol?: string;
  type?: string;
  catType?: string;
  userRightRegisterStatus?: string;
  status?: string;
  reportDate?: string;
  startDate?: string;
  endDate?: string;
  finishDate?: string;
  lastRegisterDate?: string;
  ratio?: string;
  ownNumberOfShare?: number;
  numberOfWaitingStock?: number;
  amount?: number;
  price?: number;
  maxRegisterQuantity?: number;
  registeredQuantity?: number;
  [key: string]: unknown;
}

