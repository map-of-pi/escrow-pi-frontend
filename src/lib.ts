import { IOrder } from "./types";

export type TxStatus =
  | 'initiated'
  | 'requested'
  | 'paid'
  | 'cancelled'
  | 'declined'
  | 'disputed'
  | 'fulfilled'
  | 'expired'
  | 'completed';
export type Direction = 'send' | 'receive';

export type TxItem = {
  id: string;
  direction: Direction; // kept for potential backend mapping
  myRole: 'payer' | 'payee';
  counterparty: string;
  amount: number;
  status: TxStatus;
  date: string; // ISO
  notes?: string;
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
      notes: `${order.order_no}`,
    };
  });
};
