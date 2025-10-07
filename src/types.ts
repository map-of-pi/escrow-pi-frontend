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
  updatedAt: Date
}

export interface IComment {
  _id?: string
  author: string;
  description: string;
  order_no: string
  createdAt: Date;
  updatedAt: Date
}