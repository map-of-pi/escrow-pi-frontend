import axiosClient from "@/config/client";
import { TxStatus } from "@/lib";
import { IComment, IOrder, OrderTypeEnum } from "@/types";

export const createOrder = async (
  payload: {
    username:string, 
    orderType:OrderTypeEnum, 
    comment:string, 
    amount:number
  }
):Promise<string | null> => {
  try {
    const res = await axiosClient.post('/orders/', payload)
    if (res.status===200) {
      return res.data
    } else {
      return null
    }

  } catch (error:any) {
    return null
  }
}

export const fetchUserOrders = async ():Promise<IOrder[]> => {
  try {
    const res = await axiosClient.get('/orders/');
    if (res.status===200) {
      return res.data;

    } else {
      return []
    }

  } catch (error:any) {
    return []
  }
}

export const fetchSingleUserOrder = async (orderNo:string):Promise<{order:IOrder, comments: IComment[]} | null> => {
  try {
    const res = await axiosClient.get(`/orders/${orderNo}`);
    if (res.status===200) {
      return res.data;

    } else {
      return null
    }

  } catch (error:any) {
    return null
  }
}

export const confirmRequestOrder = async (orderNo:string):Promise<string | null> => {
  try {
    const res = await axiosClient.put(`/orders/confirm-request/${orderNo}`);
    if (res.status===200) {
      return res.data;
    } else {
      return null
    }

  } catch (error:any) {
    return null
  }
}

export const updateOrderStatus = async (orderNo:string, status: TxStatus):Promise<{order:IOrder, comment: IComment} | null> => {
  try {
    const res = await axiosClient.put(`/orders/update-status/${orderNo}`, {status});
    if (res.status===200) {
      return res.data;
    } else {
      return null
    }

  } catch (error:any) {
    return null
  }
}

export const proposeDispute = async (
  orderNo: string,
  payload: { percent?: number; amount?: number; note?: string }
): Promise<IOrder | null> => {
  try {
    const res = await axiosClient.post(`/orders/${orderNo}/disputes/propose`, payload);
    if (res.status === 200) {
      return res.data;
    }
    return null;
  } catch (error: any) {
    return null;
  }
};

export const acceptDispute = async (
  orderNo: string,
  payload: { note?: string } = {}
): Promise<IOrder | null> => {
  try {
    const res = await axiosClient.post(`/orders/${orderNo}/disputes/accept`, payload);
    if (res.status === 200) {
      return res.data;
    }
    return null;
  } catch (error: any) {
    return null;
  }
};

export const declineDispute = async (
  orderNo: string,
  payload: { note?: string } = {}
): Promise<IOrder | null> => {
  try {
    const res = await axiosClient.post(`/orders/${orderNo}/disputes/decline`, payload);
    if (res.status === 200) {
      return res.data;
    }
    return null;
  } catch (error: any) {
    return null;
  }
};