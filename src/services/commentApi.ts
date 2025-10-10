import axiosClient from "@/config/client";
import { IComment } from "@/types";

export const addComment = async (
  payload: {
    description:string, 
    order_no:string, 
  }
):Promise<IComment | null> => {
  try {
    const res = await axiosClient.post('/comments/', payload)
    if (res.status===200) {

      return res.data
    } else {
      return null
    }

  } catch (error:any) {
    return null
  }
}

export const getOrderComments = async (orderNo:string):Promise<IComment[]> => {
  try {
    const res = await axiosClient.get(`/comments/${orderNo}`);
    if (res.status===200) {
      return res.data;

    } else {
      return []
    }

  } catch (error:any) {
    return []
  }
}