import axiosClient from '@/config/client';
import { ActivationInitiationPayload } from '@/types';

export const initiateActivationPayment = async (): Promise<ActivationInitiationPayload> => {
  const { data } = await axiosClient.post('/activation/initiate');
  return data as ActivationInitiationPayload;
};
