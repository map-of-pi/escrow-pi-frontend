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