import axiosClient from "@/config/client";

export type ProviderRedirectParams = {
  invocationId: string;
  developerAppId: string;
  returnUrl: string;
  signature: string;
  state?: string | null;
  amount?: string | null;
  receiverPiUsername?: string | null;
  memo?: string | null;
  developerFeePercent?: string | null;
  developerPiUid?: string | null;
};

export type ProviderDeveloperApp = {
  appId: string;
  name: string;
  contactEmail?: string;
};

export type ProviderDeveloperFee = {
  enabled: boolean;
  amount: number;
  percent?: number;
  developerPiUid?: string;
  developerAppId?: string;
};

export type ProviderFeePolicy = {
  completionStakePercent: number;
  completionStakeMin: number;
  escrowFeePercent: number;
  escrowFeeMin: number;
  networkFee: number;
  developerFeeMaxPercent: number;
};

export type ProviderFeeBreakdown = {
  baseAmount: number;
  completionStake: number;
  escrowFee: number;
  networkFee: number;
  developerFee: ProviderDeveloperFee;
  totalAmount: number;
  payeeAmount: number;
};

export type ProviderContextResponse = {
  invocationId: string;
  expiresAt: string | null;
  issuedFor?: Record<string, any> | null;
  developerApp: ProviderDeveloperApp;
  developerFee: ProviderDeveloperFee;
  fees: ProviderFeeBreakdown | null;
  feePolicy: ProviderFeePolicy;
  providerPayload: {
    returnUrl: string;
    state: string | null;
    signature: string;
  };
  payer: {
    piUid: string;
    piUsername: string;
  };
};

export type ProviderSubmitResponse = {
  status: string;
  orderNo?: string;
  fees?: ProviderFeeBreakdown | null;
  developerFee?: ProviderDeveloperFee;
  redirectUrl: string;
  returnPayload: Record<string, string | undefined | null> & { signature?: string | null };
};

const buildQueryString = (payload: ProviderRedirectParams) => {
  const params = new URLSearchParams();
  params.set("invocationId", payload.invocationId);
  params.set("developerAppId", payload.developerAppId);
  params.set("returnUrl", payload.returnUrl);
  params.set("signature", payload.signature);
  if (payload.state) {
    params.set("state", payload.state);
  }
  if (payload.amount) {
    params.set("amount", payload.amount);
  }
  if (payload.receiverPiUsername) {
    params.set("receiverPiUsername", payload.receiverPiUsername);
  }
  if (payload.memo) {
    params.set("memo", payload.memo);
  }
  if (payload.developerFeePercent) {
    params.set("developerFeePercent", payload.developerFeePercent);
  }
  if (payload.developerPiUid) {
    params.set("developerPiUid", payload.developerPiUid);
  }
  return params.toString();
};

export const fetchProviderPayContext = async (
  payload: ProviderRedirectParams,
  piAccessToken: string
): Promise<ProviderContextResponse> => {
  const query = buildQueryString(payload);
  const { data } = await axiosClient.get(`/developer/provider/pay/context?${query}`, {
    headers: {
      Authorization: `Bearer ${piAccessToken}`,
    },
  });
  return data;
};

export const submitProviderPayRequest = async (
  payload: ProviderRedirectParams,
  piAccessToken: string,
  options?: { totalAmount?: number }
): Promise<ProviderSubmitResponse> => {
  const requestBody: Record<string, unknown> = {
    ...payload,
    piAccessToken,
  };

  if (typeof options?.totalAmount === "number") {
    requestBody.totalAmount = options.totalAmount;
  }

  const { data } = await axiosClient.post(
    "/developer/provider/pay/submit",
    requestBody,
    {
      headers: {
        Authorization: `Bearer ${piAccessToken}`,
      },
    }
  );
  return data;
};

export const failProviderPayRequest = async (
  payload: ProviderRedirectParams & { message?: string; errorCode?: string },
  piAccessToken: string
): Promise<ProviderSubmitResponse> => {
  const { data } = await axiosClient.post(
    "/developer/provider/pay/error",
    {
      ...payload,
      piAccessToken,
    },
    {
      headers: {
        Authorization: `Bearer ${piAccessToken}`,
      },
    }
  );
  return data;
};

export const cancelProviderPayRequest = async (
  payload: ProviderRedirectParams & { message?: string },
  piAccessToken: string
): Promise<ProviderSubmitResponse> => {
  const { data } = await axiosClient.post(
    "/developer/provider/pay/cancel",
    {
      ...payload,
      piAccessToken,
    },
    {
      headers: {
        Authorization: `Bearer ${piAccessToken}`,
      },
    }
  );
  return data;
};
