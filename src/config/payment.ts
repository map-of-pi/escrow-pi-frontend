import axiosClient from "./client";
import { PaymentDTO } from "@/config/pi";
// import logger from '../../logger.config.mjs';
import { PaymentDataType } from "@/types";

const config = {headers: {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'}};

export const onIncompletePaymentFound = (payment: PaymentDTO) => {
  return axiosClient.post('/payments/incomplete', {payment}, config);
}

export const payWithPi = async (paymentData: PaymentDataType, onComplete:any, onFail:any) => {
  const onReadyForServerApproval = (paymentId: string) => {
    axiosClient.post('/payments/approve', {paymentId}, config);
  }

  const onReadyForServerCompletion = (paymentId: string, txid: string) => {
    axiosClient.post('/payments/complete', { paymentId, txid }, config).then((res) => {
      console.log('Payment completed successfully: ', res.data);
      onComplete(res.data);
    }).catch((error) => {
      console.error('Error completing payment: ', error);
      error(error);
    });
  }

  const onCancel = (paymentId: string) => {
    axiosClient.post('/payments/cancelled-payment', { paymentId }, config).then((res)=>{
      onComplete(res.data);
    }).catch((error) => {
      console.error('Error completing payment: ', error);
      onFail(error);
    });
    
    return 
  }

  const onError = (error: Error, paymentDTO?: PaymentDTO) => {
    if (paymentDTO) {
      axiosClient.post('/payments/error', { paymentDTO, error }, config).then((res)=>{
        onComplete(res.data);
      }).catch((submitError) => {
        console.error('Error completing payment: ', submitError);
        onFail(submitError);
      });
    }
  }

  const callbacks = {    
    onReadyForServerApproval,
    onReadyForServerCompletion,
    onIncompletePaymentFound,
    onCancel,
    onError
  };

  if (typeof window === "undefined" || !window.Pi) {
    throw new Error("Pi SDK is not available. Please open this flow inside Pi Browser.");
  }

  const paymentId = await window.Pi.createPayment(
    paymentData, 
    {...callbacks}    
  );

  console.info('created new payment Id: ', paymentId);

  return paymentId;
}