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
      onFail(error);
    });
  }

  const onCancel = (paymentId: string) => {
    axiosClient
      .post('/payments/cancelled-payment', { paymentId }, config)
      .catch((error) => {
        console.error('Error recording cancelled payment: ', error);
      })
      .finally(() => {
        onFail(new Error('Payment cancelled by user.'));
      });
    return;
  }

  const onError = (error: Error, paymentDTO?: PaymentDTO) => {
    const submission = paymentDTO
      ? axiosClient.post('/payments/error', { paymentDTO, error }, config).catch((submitError) => {
          console.error('Error recording payment failure: ', submitError);
        })
      : Promise.resolve();

    submission.finally(() => {
      onFail(error);
    });
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