export interface IUser {
  pi_uid: string;
  pi_username: string;
  user_name: string;
};

export type PaymentDataType = {
  amount: number | string;
  memo: string;
  metadata: {
    [key: string]: any;
  }
};

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