import { IOrder, IComment } from "./types";

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

