export interface IUser {
  pi_uid: string;
  pi_username: string;
  user_name: string;
};

export type PaymentDataType = {
  amount: number;
  memo: string;
  metadata: {
    [key: string]: any;
  }
};

export enum OrderTypeEnum {
  Send= 'send',
  Request='request'
}

export type IOrder = {
  sender_username: string;
  receiver_username: string;
  amount: number;
  order_no: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  dispute?: {
    is_disputed?: boolean;
    status?: 'none' | 'proposed' | 'accepted' | 'declined' | 'cancelled';
    proposal_percent?: number;
    proposal_amount?: number;
    proposed_by?: string;
    proposed_at?: string | Date;
    accepted_by?: string;
    accepted_at?: string | Date;
    declined_by?: string;
    declined_at?: string | Date;
    history?: Array<{
      action: 'proposed' | 'accepted' | 'declined' | 'cancelled';
      by: string;
      at: string | Date;
      percent?: number;
      amount?: number;
      note?: string;
    }>;
  };
}

export interface IComment {
  _id?: string
  author: string;
  description: string;
  order_no: string
  createdAt: Date;
  updatedAt: Date
}

// ========================
// NOTIFICATION MODELS
// ========================
export type NotificationType = {
  _id: string;
  pi_uid: string;
  is_cleared: boolean;
  reason: string;
  createdAt: string | Date;
  updatedAt: string | Date;
};

export interface INotification {
  is_cleared?: boolean;
  reason: string;
};