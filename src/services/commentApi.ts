import axiosClient from "@/config/client";
import { IComment, IOrder, OrderTypeEnum } from "@/types";
import { toast } from "react-toastify";

export const addComment = async (
  payload: {
    description:string, 
    order_no:string, 
  }
):Promise<IComment | null> => {
  try {
    const res = await axiosClient.post('/comments/', payload)
    if (res.status===200) {
      toast.success(`Comment added successfully. New comment with ${res.data}.`);
      return res.data
    } else {
      toast.error('Error adding comment. Please try again.');
      return null
    }

  } catch (error:any) {
    toast.error('Error adding comment. Please try again.');
    return null
  }
}

export const getOrderComments = async (orderNo:string):Promise<IComment[]> => {
  try {
    const res = await axiosClient.get(`/comments/${orderNo}`);
    if (res.status===200) {
      toast.success(`User comments fetched successfully.`);
      return res.data;

    } else {
      toast.error('No order comment.');
      return []
    }

  } catch (error:any) {
    toast.error('Error fetching order comment. Please try again.');
    return []
  }
}