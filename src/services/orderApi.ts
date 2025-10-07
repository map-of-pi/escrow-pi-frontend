import axiosClient from "@/config/client";
import { TxStatus } from "@/lib";
import { IComment, IOrder, OrderTypeEnum } from "@/types";
import { toast } from "react-toastify";

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
      toast.success(`Order created successfully. New order with ${res.data.order_no}.`);
      return res.data
    } else {
      toast.error('Error creating order. Please try again.');
      return null
    }

  } catch (error:any) {
    toast.error('Error creating order. Please try again.');
    return null
  }
}

export const fetchUserOrders = async ():Promise<IOrder[]> => {
  try {
    const res = await axiosClient.get('/orders/');
    if (res.status===200) {
      toast.success(`User Orders fetched successfully.`);
      return res.data;

    } else {
      toast.error('No user order.');
      return []
    }

  } catch (error:any) {
    toast.error('Error fetching user orders. Please try again.');
    return []
  }
}

export const fetchSingleUserOrder = async (orderNo:string):Promise<{order:IOrder, comments: IComment[]} | null> => {
  try {
    const res = await axiosClient.get(`/orders/${orderNo}`);
    if (res.status===200) {
      toast.success(`User Order fetched successfully.`);
      return res.data;

    } else {
      toast.error('No user order.');
      return null
    }

  } catch (error:any) {
    toast.error('Error fetching user order. Please try again.');
    return null
  }
}

export const confirmRequestOrder = async (orderNo:string):Promise<string | null> => {
  try {
    const res = await axiosClient.put(`/orders/confirm-request/${orderNo}`);
    if (res.status===200) {
      toast.success(`User Order updated successfully.`);
      return res.data;
    } else {
      toast.error('No user order.');
      return null
    }

  } catch (error:any) {
    toast.error('Error updating user order. Please try again.');
    return null
  }
}

export const updateOrderStatus = async (orderNo:string, status: TxStatus):Promise<{order:IOrder, comment: IComment} | null> => {
  try {
    const res = await axiosClient.put(`/orders/update-status/${orderNo}`, {status});
    if (res.status===200) {
      toast.success(`User Order updated successfully.`);
      return res.data;
    } else {
      toast.error('No user order.');
      return null
    }

  } catch (error:any) {
    toast.error('Error updating user order. Please try again.');
    return null
  }
}