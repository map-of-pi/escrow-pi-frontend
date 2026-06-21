import { IOrder, IComment } from "./types";

const PI_DECIMAL_PLACES = 8;
const COMPLETION_STAKE_PERCENT = 0.1;
const COMPLETION_STAKE_MIN = 1;
const ESCROW_FEE_PERCENT = 0.01;
const ESCROW_FEE_MIN = 0.1;
const DEFAULT_NETWORK_FEE = 0.02;
const NETWORK_FEE_WITH_DEVELOPER = 0.03;

const roundPi = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Number(value.toFixed(PI_DECIMAL_PLACES));
};

const deriveBaseFromTotal = (params: {
  totalAmount: number;
  networkFee: number;
  developerEnabled: boolean;
  developerPercent?: number;
}): number => {
  const { totalAmount, networkFee, developerEnabled, developerPercent } = params;
  if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
    return 0;
  }

  let low = 0;
  let high = Math.max(totalAmount, 1);

  for (let i = 0; i < 60; i++) {
    const mid = (low + high) / 2;
    const completionStake = Math.max(
      mid * COMPLETION_STAKE_PERCENT,
      COMPLETION_STAKE_MIN
    );
    const escrowFee = Math.max(mid * ESCROW_FEE_PERCENT, ESCROW_FEE_MIN);
    const developerFee =
      developerEnabled && typeof developerPercent === "number"
        ? (mid * developerPercent) / 100
        : 0;
    const candidateTotal =
      mid + completionStake + escrowFee + developerFee + networkFee;

    if (candidateTotal > totalAmount) {
      high = mid;
    } else {
      low = mid;
    }
  }

  return roundPi(low);
};

export type TxFeeBreakdown = {
  baseAmount: number;
  completionStake: number;
  networkFee: number;
  escrowFee: number;
  developerFee: number;
  total: number;
};

export const computeOrderBreakdown = (order: IOrder): TxFeeBreakdown => {
  const developerPercent =
    typeof order?.developer_fee?.percent === "number"
      ? order.developer_fee.percent
      : undefined;
  const developerEnabled = Boolean(
    order?.developer_fee?.enabled && developerPercent
  );
  const networkFee = developerEnabled
    ? NETWORK_FEE_WITH_DEVELOPER
    : DEFAULT_NETWORK_FEE;

  const totalAmount = Number(order?.amount ?? 0);

  let baseAmount: number;
  if (Number.isFinite(totalAmount) && totalAmount > 0) {
    baseAmount = deriveBaseFromTotal({
      totalAmount,
      networkFee,
      developerEnabled,
      developerPercent,
    });
  } else if (typeof order?.base_amount === "number" && order.base_amount > 0) {
    baseAmount = roundPi(order.base_amount);
  } else {
    baseAmount = 0;
  }

  const completionStake = roundPi(
    Math.max(baseAmount * COMPLETION_STAKE_PERCENT, COMPLETION_STAKE_MIN)
  );
  const escrowFee = roundPi(
    Math.max(baseAmount * ESCROW_FEE_PERCENT, ESCROW_FEE_MIN)
  );
  const developerFee =
    developerEnabled && typeof developerPercent === "number"
      ? roundPi((baseAmount * developerPercent) / 100)
      : 0;
  const total = roundPi(
    baseAmount + completionStake + escrowFee + networkFee + developerFee
  );

  return {
    baseAmount,
    completionStake,
    networkFee,
    escrowFee,
    developerFee,
    total,
  };
};

export type TxStatus =
  | 'initiated'
  | 'requested'
  | 'paid'
  | 'cancelled'
  | 'declined'
  | 'disputed'
  | 'fulfilled'
  | 'expired'
  | 'released';
export type Direction = 'send' | 'receive';

export type TxItem = {
  id: string;
  direction: Direction; // kept for potential backend mapping
  myRole: 'payer' | 'payee';
  counterparty: string;
  amount: number;
  status: TxStatus;
  date: string; // ISO
  auditLog?: string;
  needsPayerResponse?: boolean; // show popup when true and this is a receive where I am payer
  developerAppName: string;
  breakdown: TxFeeBreakdown;
};

export const statusClasses: Record<TxStatus, string> = {
  initiated: "bg-slate-50 text-slate-700 border-slate-200",
  requested: "bg-amber-50 text-amber-800 border-amber-200",
  paid: "bg-blue-50 text-blue-800 border-blue-200",
  cancelled: "bg-gray-50 text-gray-700 border-gray-200",
  expired: "bg-gray-50 text-gray-700 border-gray-300",
  declined: "bg-gray-50 text-gray-700 border-gray-200",
  disputed: "bg-red-50 text-red-800 border-red-200",
  fulfilled: "bg-emerald-50 text-emerald-800 border-emerald-200",
  released: "bg-green-50 text-green-800 border-green-200",
};

export const statusLabel: Record<TxStatus, string> = {
  requested: "Requested",
  paid: "Paid",
  cancelled: "Cancelled",
  declined: "Declined",
  disputed: "Disputed",
  fulfilled: "Fulfilled",
  released: "Released",
  initiated: "Initiated",
  expired: "Expired",
};

const resolveRole = (senderUsername: string, authUsername: string) => {
  return senderUsername === authUsername ? "payer" : "payee";
};

const resolveDirection = (myRole: "payer" | "payee"): Direction =>
  myRole === "payer" ? "send" : "receive";


export const mapOrdersToTxItems = (orders: IOrder[], authUsername: string): TxItem[] => {
  return orders.map((order) => {
    const myRole = resolveRole(order.sender_username, authUsername);
    const direction = resolveDirection(myRole);
    const developerAppName =
      typeof order.developer_app_name === "string" && order.developer_app_name.trim().length
        ? order.developer_app_name.trim()
        : "EscrowPi";

    const counterparty =
      myRole === "payer" ? order.receiver_username : order.sender_username;

    return {
      id: order.order_no,
      direction,
      myRole,
      counterparty,
      amount: order.amount,
      status: order.status as TxStatus,
      date: new Date(order.createdAt).toISOString(),
      developerAppName,
      breakdown: computeOrderBreakdown(order),
    };
  });
};

type Comment = { author: string; text: string; ts: string };

/**
 * Convert a single IComment object from backend to frontend Comment type
 */
export function mapCommentToFrontend(comment: IComment, authUsername: string): Comment {
  return {
    author: authUsername === comment.author ? "You" : comment.author,
    text: comment.description ?? "", // safeguard against undefined
    ts: new Date(comment.createdAt).toLocaleString(), // readable local time
  };
}

/**
 * Convert an array of IComment objects
 */
export function mapCommentsToFrontend(comments: IComment[], authUsername: string): Comment[] {
  return comments.map((comment) => mapCommentToFrontend(comment, authUsername));
}

