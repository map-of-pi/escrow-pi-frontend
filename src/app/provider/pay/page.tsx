"use client";

import { useCallback, useEffect, useMemo, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "react-toastify";

import axiosClient, { setAuthToken } from "@/config/client";
import { onIncompletePaymentFound } from "@/config/payment";
import {
  ProviderContextResponse,
  ProviderRedirectParams,
  cancelProviderPayRequest,
  failProviderPayRequest,
  fetchProviderPayContext,
  submitProviderPayRequest,
} from "@/services/providerApi";

type PiWindow = Window & {
  Pi?: any;
};

const PI_SDK_SCRIPT_ID = "escrowpi-pi-sdk";

const loadPiSdk = (): Promise<any> => {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Pi SDK is only available in the browser"));
  }
  const current = (window as PiWindow).Pi;
  if (current) {
    return Promise.resolve(current);
  }
  const existing = document.getElementById(PI_SDK_SCRIPT_ID) as HTMLScriptElement | null;
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener("load", () => resolve((window as PiWindow).Pi));
      existing.addEventListener("error", () => reject(new Error("Failed to load Pi SDK")));
    });
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://sdk.minepi.com/pi-sdk.js";
    script.async = true;
    script.id = PI_SDK_SCRIPT_ID;
    script.onload = () => resolve((window as PiWindow).Pi);
    script.onerror = () => reject(new Error("Failed to load Pi SDK"));
    document.head.appendChild(script);
  });
};

const formatPi = (value?: number | null) => {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "—";
  }
  const rounded = Number(value.toFixed(6));
  return `${rounded.toString()} π`;
};

const formatCountdown = (milliseconds: number) => {
  if (milliseconds <= 0) {
    return "00:00";
  }

  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (totalSeconds % 60)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${seconds}`;
};

const sanitizeParam = (value: string | null): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

const useProviderPayload = (): ProviderRedirectParams | null => {
  const params = useSearchParams();
  return useMemo(() => {
    if (!params) return null;
    const invocationId = params.get("invocationId");
    const developerAppId = params.get("developerAppId");
    const returnUrl = params.get("returnUrl");
    const signature = params.get("signature");
    const state = params.get("state");
    const amount = sanitizeParam(params.get("amount"));
    const receiverPiUsername = sanitizeParam(params.get("receiverPiUsername"));
    const memo = sanitizeParam(params.get("memo"));
    const developerFeePercent = sanitizeParam(params.get("developerFeePercent"));
    const developerPiUid = sanitizeParam(params.get("developerPiUid"));
    if (!invocationId || !developerAppId || !returnUrl || !signature) {
      return null;
    }
    return {
      invocationId,
      developerAppId,
      returnUrl,
      signature,
      state: state ?? undefined,
      amount,
      receiverPiUsername,
      memo,
      developerFeePercent,
      developerPiUid,
    };
  }, [params]);
};

const describeError = (err: any) => {
  const message = err?.response?.data?.message ?? err?.message;
  if (typeof message === "string" && message.trim().length) {
    return message;
  }
  return "Something went wrong. Please try again.";
};

type PiFlowResult = {
  status: "success" | "cancelled" | "error";
  message?: string;
  errorCode?: string;
};

const ProviderPayPage = () => {
  const redirectPayload = useProviderPayload();
  const [piToken, setPiToken] = useState<string | null>(null);
  const [context, setContext] = useState<ProviderContextResponse | null>(null);
  const [phase, setPhase] = useState<"initial" | "auth" | "loading" | "ready" | "error">("initial");
  const [error, setError] = useState<string | null>(null);
  const [submitState, setSubmitState] = useState<"idle" | "confirming" | "cancelling">("idle");
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => window.clearInterval(interval);
  }, []);

  const authenticateWithPi = useCallback(async (): Promise<string> => {
    setPhase("auth");
    const Pi = await loadPiSdk();
    if (typeof Pi?.init === "function") {
      try {
        Pi.init({ version: "2.0", sandbox: process.env.NODE_ENV !== "production" });
      } catch (err) {
        // Pi SDK throws if already initialized; ignore.
      }
    }
    const pioneerAuth = await Pi.authenticate(
      ["username", "payments", "wallet_address"],
      onIncompletePaymentFound
    );
    if (!pioneerAuth?.accessToken) {
      throw new Error("Unable to acquire Pi access token");
    }
    setPiToken(pioneerAuth.accessToken);
    return pioneerAuth.accessToken;
  }, []);

  useEffect(() => {
    if (!redirectPayload) {
      setError("Missing or invalid redirect payload. Ask the merchant for a new checkout link.");
      setPhase("error");
      return;
    }

    let cancelled = false;

    const bootstrap = async () => {
      try {
        const token = await authenticateWithPi();
        if (cancelled) return;
        setPhase("loading");
        const data = await fetchProviderPayContext(redirectPayload, token);
        if (cancelled) return;
        setContext(data);
        setPhase("ready");
        setError(null);
      } catch (err: any) {
        if (cancelled) return;
        const message = describeError(err);
        setError(message);
        setPhase("error");
      }
    };

    bootstrap();

    return () => {
      cancelled = true;
    };
  }, [redirectPayload, authenticateWithPi]);

  const handleSubmit = async () => {
    if (!redirectPayload || !piToken || !context) return;
    setSubmitState("confirming");
    try {
      const amountToPay =
        typeof context.fees?.totalAmount === "number"
          ? context.fees.totalAmount
          : typeof context.fees?.baseAmount === "number"
          ? context.fees.baseAmount
          : typeof context.issuedFor?.amount === "number"
          ? context.issuedFor.amount
          : undefined;

      if (!amountToPay || amountToPay <= 0) {
        throw new Error("Unable to determine Pi payment amount");
      }

      const submitResponse = await submitProviderPayRequest(redirectPayload, piToken, {
        totalAmount: amountToPay,
      });

      if (!submitResponse?.orderNo) {
        throw new Error("Order number missing from provider submit response");
      }

      const authResponse = await axiosClient.post(
        "/users/authenticate",
        {},
        {
          headers: {
            Authorization: `Bearer ${piToken}`,
          },
        }
      );

      const backendToken = authResponse?.data?.token;
      if (typeof backendToken === "string" && backendToken.length) {
        setAuthToken(backendToken);
      }

      const paymentMemo =
        (typeof context.issuedFor?.memo === "string" && context.issuedFor.memo.trim()) ||
        `EscrowPi order ${submitResponse.orderNo}`;

      // Clear any incomplete server payments before creating a new one
      try {
        console.log("Checking for incomplete server payments before creating new payment...");
        const incompleteResponse = await axiosClient.get("/payments/incomplete");
        const incompletePayments = incompleteResponse.data?.incomplete_server_payments || [];
        
        if (incompletePayments.length > 0) {
          console.log(`Found ${incompletePayments.length} incomplete server payments, attempting to complete/cancel them...`);
          await axiosClient.post("/payments/incomplete", { payments: incompletePayments });
          console.log("Incomplete server payments processed");
        } else {
          console.log("No incomplete server payments found");
        }
      } catch (err) {
        console.warn("Failed to process incomplete server payments, continuing with payment creation", err);
      }

      const Pi = await loadPiSdk();
      const paymentResult = await new Promise<PiFlowResult>((resolve) => {
        let settled = false;
        const settle = (result: PiFlowResult) => {
          if (settled) return;
          settled = true;
          resolve(result);
        };

        const callbacks = {
          onReadyForServerApproval: async (paymentId: string) => {
            try {
              await axiosClient.post("/payments/approve", { paymentId });
            } catch (err) {
              settle({
                status: "error",
                message: describeError(err),
                errorCode: "pi_payment_approval_failed",
              });
            }
          },
          onReadyForServerCompletion: async (paymentId: string, txid: string) => {
            try {
              await axiosClient.post("/payments/complete", { paymentId, txid });
              settle({ status: "success" });
            } catch (err) {
              settle({
                status: "error",
                message: describeError(err),
                errorCode: "pi_payment_completion_failed",
              });
            }
          },
          onIncompletePaymentFound,
          onCancel: async (paymentId: string) => {
            try {
              await axiosClient.post("/payments/cancelled-payment", { paymentId });
            } catch {
            } finally {
              settle({
                status: "cancelled",
                message: "Payment cancelled in Pi wallet",
                errorCode: "pi_payment_cancelled",
              });
            }
          },
          onError: async (error: Error, paymentDTO?: unknown) => {
            try {
              if (paymentDTO) {
                await axiosClient.post("/payments/error", { paymentDTO, error: error?.message });
              }
            } catch {
            } finally {
              settle({
                status: "error",
                message: error?.message ?? "Pi payment failed",
                errorCode: "pi_payment_error",
              });
            }
          },
        };

        Pi.createPayment(
          {
            amount: amountToPay,
            memo: paymentMemo,
            metadata: {
              order_no: submitResponse.orderNo,
              invocationId: redirectPayload.invocationId,
              source: "provider_pay",
            },
          },
          callbacks
        );
        // Pi.createPayment does not return a Promise; callbacks handle the result
        return;
      });

      if (paymentResult.status === "success") {
        window.location.assign(submitResponse.redirectUrl);
        return;
      }

      if (paymentResult.status === "cancelled") {
        const cancelResponse = await cancelProviderPayRequest(
          {
            ...redirectPayload,
            message: paymentResult.message,
          },
          piToken
        );
        window.location.assign(cancelResponse.redirectUrl);
        return;
      }

      const failResponse = await failProviderPayRequest(
        {
          ...redirectPayload,
          message: paymentResult.message,
          errorCode: paymentResult.errorCode,
        },
        piToken
      );
      window.location.assign(failResponse.redirectUrl);
    } catch (err: any) {
      toast.error(describeError(err));
      setSubmitState("idle");
    }
  };

  const handleCancel = async () => {
    if (!redirectPayload || !piToken) return;
    setSubmitState("cancelling");
    try {
      const response = await cancelProviderPayRequest(redirectPayload, piToken);
      window.location.assign(response.redirectUrl);
    } catch (err: any) {
      toast.error(describeError(err));
      setSubmitState("idle");
    }
  };

  const issued = context?.issuedFor ?? {};
  const fallbackAmount = useMemo(() => {
    if (typeof issued.amount === "number" && Number.isFinite(issued.amount)) {
      return issued.amount;
    }
    if (redirectPayload?.amount) {
      const parsed = Number(redirectPayload.amount);
      return Number.isFinite(parsed) ? parsed : undefined;
    }
    return undefined;
  }, [issued.amount, redirectPayload?.amount]);
  const receiver =
    issued.recipientPiUsername ??
    issued.receiverPiUsername ??
    issued.payeePiUsername ??
    issued.sellerPiUsername ??
    issued.counterparty ??
    redirectPayload?.receiverPiUsername ??
    null;
  const memo = issued.memo ?? issued.description ?? issued.note ?? redirectPayload?.memo ?? "";
  const baseAmount = typeof issued.amount === "number"
    ? issued.amount
    : context?.fees?.baseAmount ?? fallbackAmount;
  const expiresIn = useMemo(() => {
    if (!context?.expiresAt) return null;
    const diff = new Date(context.expiresAt).getTime() - now;
    return formatCountdown(diff);
  }, [context?.expiresAt, now]);

  const isExpired = useMemo(() => {
    if (!context?.expiresAt) return false;
    return new Date(context.expiresAt).getTime() <= now;
  }, [context?.expiresAt, now]);

  const steps = [
    { label: "Authenticate with Pi", done: Boolean(piToken) },
    { label: "Review escrow details", done: Boolean(context) },
    { label: "Confirm payment", done: submitState === "confirming" },
  ];

  return (
    <div className="space-y-6 pb-10">
      <header className="rounded-3xl bg-gradient-to-br from-[#1b1a55] via-[#3d2c8d] to-[#9163cb] text-white p-6 shadow-xl">
        <p className="uppercase text-xs tracking-[0.4em] text-white/80">EscrowPi Provider</p>
        <h1 className="mt-3 text-3xl font-black leading-tight">Complete your Pi payment</h1>
        <p className="mt-3 text-sm text-white/85">
          You will confirm this payment directly inside EscrowPi. After completion we will securely redirect
          you back to the merchant&apos;s app with a signed receipt.
        </p>
        {context?.developerApp && (
          <div className="mt-6 rounded-2xl bg-white/10 px-4 py-3 text-sm">
            <div className="text-white/70">Merchant</div>
            <div className="text-lg font-semibold">{context.developerApp.name}</div>
          </div>
        )}
      </header>

      <section className="grid gap-4 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between text-sm font-medium text-gray-600">
          <span>Progress</span>
          <span className="text-xs uppercase tracking-wide text-gray-400">{phase.toUpperCase()}</span>
        </div>
        <ol className="space-y-3">
          {steps.map((step, index) => (
            <li key={step.label} className="flex items-center gap-3">
              <span
                className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold ${
                  step.done ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"
                }`}
              >
                {index + 1}
              </span>
              <div>
                <p className="text-sm font-semibold text-gray-900">{step.label}</p>
                {index === 0 && <p className="text-xs text-gray-500">Pi Browser will confirm your identity.</p>}
                {index === 1 && <p className="text-xs text-gray-500">Verify recipient, memo, and fees.</p>}
                {index === 2 && <p className="text-xs text-gray-500">EscrowPi will lock funds securely.</p>}
              </div>
            </li>
          ))}
        </ol>
      </section>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <p className="font-semibold">We can&apos;t continue this checkout</p>
          <p className="mt-2">{error}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-full border border-red-200 px-4 py-2 text-xs font-semibold text-red-700"
              onClick={() => window.location.reload()}
            >
              Retry
            </button>
            {redirectPayload?.returnUrl && (
              <button
                type="button"
                className="rounded-full border border-red-200 px-4 py-2 text-xs font-semibold text-red-700"
                onClick={() => window.location.assign(redirectPayload.returnUrl)}
              >
                Back to merchant
              </button>
            )}
          </div>
        </div>
      )}

      {!error && !context && (
        <div className="rounded-2xl border border-gray-100 bg-white p-6 text-center text-sm text-gray-600">
          <p className="font-semibold">Preparing your checkout…</p>
          <p className="mt-2 text-gray-500">
            {phase === "auth" && "Authenticating with Pi SDK"}
            {phase === "loading" && "Loading EscrowPi payment details"}
            {phase === "initial" && "Initializing"}
          </p>
        </div>
      )}

      {context && !error && (
        <section className="space-y-5">
          <div className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-500">You</p>
                <p className="text-lg font-semibold">@{context.payer.piUsername}</p>
              </div>
              <div className="text-right">
                <p className="text-xs uppercase tracking-wide text-gray-500">Expires in</p>
                <p className={`text-sm font-semibold ${isExpired ? "text-red-600" : "text-gray-900"}`}>
                  {context?.expiresAt ? (isExpired ? "Expired" : expiresIn ?? "—") : "Unknown"}
                </p>
              </div>
            </div>
            <div className="mt-6 grid gap-4 rounded-2xl bg-gray-50 p-4 text-sm">
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-500">Paying</p>
                <p className="text-lg font-bold text-gray-900">{receiver ? `@${receiver}` : "Merchant defined"}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-500">Memo</p>
                <p className="text-base text-gray-900">{memo || "—"}</p>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
            <div className="flex items-baseline justify-between">
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-500">Total Amount</p>
                <p className="text-4xl font-black text-gray-900">{formatPi(context.fees?.totalAmount ?? baseAmount)}</p>
              </div>
              <div className="text-right text-sm text-gray-500">
                <p>Payee receives</p>
                <p className="text-base font-semibold text-gray-900">{formatPi(context.fees?.payeeAmount ?? baseAmount)}</p>
              </div>
            </div>
            <div className="mt-6 space-y-3 text-sm text-gray-700">
              <div className="flex items-center justify-between">
                <span>Escrow fee</span>
                <span>{formatPi(context.fees?.escrowFee)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Network fee</span>
                <span>{formatPi(context.fees?.networkFee)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Completion stake</span>
                <span>{formatPi(context.fees?.completionStake)}</span>
              </div>
              {context.developerFee?.enabled && (
                <div className="flex items-center justify-between">
                  <span>Developer fee</span>
                  <span>{formatPi(context.fees?.developerFee?.amount)}</span>
                </div>
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
            <p className="text-sm text-gray-600">
              By confirming you authorize EscrowPi to debit your Pi wallet for the total above and lock it in escrow until the merchant marks the order complete or a dispute is resolved.
            </p>
            {context?.expiresAt && (
              <p className={`mt-4 text-center text-sm font-medium ${isExpired ? "text-red-600" : "text-gray-600"}`}>
                {isExpired ? "Payment window expired. Fetch a new link." : `Payment window expires in ${expiresIn ?? "—"}`}
              </p>
            )}
            <div className="mt-5 grid gap-3">
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitState !== "idle"}
                className="rounded-2xl bg-[#3d2c8d] py-3 text-center text-base font-semibold text-white shadow-lg transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitState === "confirming" ? "Confirming…" : "Confirm payment"}
              </button>
              <button
                type="button"
                onClick={handleCancel}
                disabled={submitState !== "idle"}
                className="rounded-2xl border border-gray-200 py-3 text-center text-base font-semibold text-gray-700 transition hover:border-gray-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitState === "cancelling" ? "Cancelling…" : "Cancel and go back"}
              </button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
};

const ProviderPayPageWithSuspense = () => (
  <Suspense fallback={<div className="p-6 text-center text-gray-600">Loading...</div>}>
    <ProviderPayPage />
  </Suspense>
);

export default ProviderPayPageWithSuspense;
