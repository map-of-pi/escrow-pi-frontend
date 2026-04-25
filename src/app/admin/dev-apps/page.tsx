"use client";

import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { FiChevronDown, FiChevronRight, FiLoader, FiRefreshCw, FiShield } from "react-icons/fi";

import { onIncompletePaymentFound } from "@/config/payment";
import { AppContext } from "@/context/AppContextProvider";
import { fetchAdminDeveloperApps } from "@/services/adminApi";
import { DeveloperAppRecord } from "@/services/developerApps";

const PI_SDK_SCRIPT_ID = "escrowpi-admin-pi-sdk";

type PiAuthState = "idle" | "authenticating" | "ready" | "error";

type PiWindow = Window & {
  Pi?: any;
};

const getDeveloperAppStatusStyle = (status?: string) => {
  const normalized = (status ?? "active").toLowerCase();
  if (normalized === "suspended") {
    return { label: "Suspended", className: "bg-amber-100 text-amber-800" };
  }
  if (normalized === "inactive") {
    return { label: "Inactive", className: "bg-gray-100 text-gray-800" };
  }
  if (normalized === "pending") {
    return { label: "Pending", className: "bg-indigo-100 text-indigo-800" };
  }
  return { label: "Active", className: "bg-emerald-100 text-emerald-800" };
};

const describeError = (err: any) => {
  const message = err?.response?.data?.message ?? err?.message;
  if (typeof message === "string" && message.trim().length) {
    return message.trim();
  }
  return "Something went wrong. Please retry.";
};

const loadPiSdk = (): Promise<any> => {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Pi SDK is only available inside Pi Browser."));
  }
  const existing = (window as PiWindow).Pi;
  if (existing) {
    return Promise.resolve(existing);
  }

  const scriptEl = document.getElementById(PI_SDK_SCRIPT_ID) as HTMLScriptElement | null;
  if (scriptEl) {
    return new Promise((resolve, reject) => {
      scriptEl.addEventListener("load", () => resolve((window as PiWindow).Pi));
      scriptEl.addEventListener("error", () => reject(new Error("Failed to load Pi SDK script.")));
    });
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.id = PI_SDK_SCRIPT_ID;
    script.src = "https://sdk.minepi.com/pi-sdk.js";
    script.async = true;
    script.onload = () => resolve((window as PiWindow).Pi);
    script.onerror = () => reject(new Error("Failed to load Pi SDK script."));
    document.head.appendChild(script);
  });
};

export default function AdminDeveloperAppsPage() {
  const { currentUser, piAccessToken: contextPiToken, setPiAccessToken } = useContext(AppContext);

  const [piToken, setPiToken] = useState<string | null>(contextPiToken ?? null);
  const [piAuthState, setPiAuthState] = useState<PiAuthState>(contextPiToken ? "ready" : "idle");
  const [piAuthError, setPiAuthError] = useState<string | null>(null);

  const [developerApps, setDeveloperApps] = useState<DeveloperAppRecord[]>([]);
  const [appsLoading, setAppsLoading] = useState(false);
  const [appsError, setAppsError] = useState<string | null>(null);
  const [expandedAppIds, setExpandedAppIds] = useState<Set<string>>(new Set());

  const isAdmin = currentUser?.isAdmin === true;

  const authenticateWithPi = useCallback(async (): Promise<string> => {
    setPiAuthState("authenticating");
    setPiAuthError(null);
    try {
      const Pi = await loadPiSdk();
      if (!Pi) {
        throw new Error("Pi SDK not detected. Open this page inside Pi Browser.");
      }
      if (!Pi.initialized) {
        Pi.init({ version: "2.0", sandbox: process.env.NODE_ENV !== "production" });
      }
      const pioneerAuth = await Pi.authenticate(["username", "payments", "wallet_address"], onIncompletePaymentFound);
      if (!pioneerAuth?.accessToken) {
        throw new Error("Unable to acquire Pi access token.");
      }
      setPiToken(pioneerAuth.accessToken);
      setPiAccessToken(pioneerAuth.accessToken);
      setPiAuthState("ready");
      return pioneerAuth.accessToken;
    } catch (err) {
      const message = describeError(err);
      setPiAuthState("error");
      setPiAuthError(message);
      throw err;
    }
  }, [setPiAccessToken]);

  const ensurePiToken = useCallback(async () => {
    if (piToken) {
      return piToken;
    }
    if (contextPiToken) {
      setPiToken(contextPiToken);
      setPiAuthState("ready");
      setPiAuthError(null);
      return contextPiToken;
    }
    return authenticateWithPi();
  }, [piToken, contextPiToken, authenticateWithPi]);

  const refreshDeveloperApps = useCallback(async () => {
    setAppsLoading(true);
    setAppsError(null);
    try {
      const token = await ensurePiToken();
      if (!token) {
        return;
      }
      const apps = await fetchAdminDeveloperApps(token);
      setDeveloperApps(apps);
      setExpandedAppIds((prev) => {
        const next = new Set<string>();
        apps.forEach((app) => {
          if (prev.has(app.appId)) {
            next.add(app.appId);
          }
        });
        return next;
      });
    } catch (err) {
      const message = describeError(err);
      setAppsError(message);
    } finally {
      setAppsLoading(false);
    }
  }, [ensurePiToken]);

  useEffect(() => {
    if (contextPiToken && contextPiToken !== piToken) {
      setPiToken(contextPiToken);
      setPiAuthState("ready");
      setPiAuthError(null);
    }
  }, [contextPiToken, piToken]);

  useEffect(() => {
    if (!piToken && !contextPiToken && piAuthState === "idle") {
      authenticateWithPi().catch(() => {});
    }
  }, [piToken, contextPiToken, piAuthState, authenticateWithPi]);

  useEffect(() => {
    if (piToken) {
      refreshDeveloperApps();
    }
  }, [piToken, refreshDeveloperApps]);

  const toggleAppExpansion = useCallback((appId: string) => {
    if (!appId) return;
    setExpandedAppIds((prev) => {
      const next = new Set(prev);
      if (next.has(appId)) {
        next.delete(appId);
      } else {
        next.add(appId);
      }
      return next;
    });
  }, []);

  const piStatusMessage = useMemo(() => {
    if (piAuthState === "authenticating") {
      return "Authenticating with Pi…";
    }
    if (piAuthState === "ready" && piToken) {
      return "Using your current EscrowPi session.";
    }
    if (piAuthState === "error") {
      return piAuthError ?? "Pi authentication required.";
    }
    return "Pi session will sync automatically when needed.";
  }, [piAuthState, piToken, piAuthError]);

  if (!isAdmin) {
    return (
      <section className="flex flex-col items-center gap-4 py-12 text-center">
        <FiShield size={48} className="text-red-500" />
        <h1 className="text-2xl font-semibold text-gray-900">Admin access required</h1>
        <p className="text-gray-600 max-w-sm">
          Your account does not have admin privileges. Ask an existing admin to grant you access from the admin console.
        </p>
        <Link href="/admin" className="text-sm font-semibold text-[var(--default-primary-color)]">
          Back to admin console
        </Link>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-6 py-6">
      <header className="space-y-2 text-center">
        <p className="text-xs uppercase tracking-[0.3em] text-neutral-500">EscrowPi Admin Console</p>
        <h1 className="text-3xl font-semibold text-gray-900">All developer apps</h1>
        <p className="text-gray-600">
          Browse every developer app in EscrowPi, inspect allowed origins, and track ownership details without pagination limits.
        </p>
      </header>

      <article className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <p className="text-xs uppercase tracking-widest text-gray-500">Developer apps roster</p>
            <h2 className="text-xl font-semibold text-gray-900">
              Complete EscrowPi catalog
              <span className="ml-2 text-sm font-normal text-gray-500">({developerApps.length} apps)</span>
            </h2>
          </div>
          <button
            type="button"
            onClick={refreshDeveloperApps}
            disabled={appsLoading || piAuthState === "authenticating"}
            title="Refresh apps"
            className="ml-auto rounded-full border border-gray-200 p-3 text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {appsLoading ? <FiLoader className="h-5 w-5 animate-spin" /> : <FiRefreshCw className="h-5 w-5" />}
          </button>
        </div>
        <p className="mt-2 text-sm text-gray-600">Scroll or filter via your browser to inspect specific integrations.</p>
        <p className="mt-1 text-xs text-gray-500">{piStatusMessage}</p>
        <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
          <span>
            {appsLoading
              ? 'Loading developer apps…'
              : developerApps.length === 0
                ? 'No developer apps yet.'
                : `Showing all ${developerApps.length} apps.`}
          </span>
        </div>
        {appsError && <p className="mt-3 text-sm text-red-600">{appsError}</p>}
        {!appsError && appsLoading && <p className="mt-3 text-sm text-gray-500">Refreshing developer apps…</p>}
        {!appsError && !appsLoading && developerApps.length === 0 && (
          <p className="mt-4 text-sm text-gray-500">No developer apps found yet.</p>
        )}
        <div className="mt-4 flex flex-col gap-3">
          {developerApps.map((app) => {
            const statusStyle = getDeveloperAppStatusStyle(app.status);
            const isExpanded = expandedAppIds.has(app.appId);
            return (
              <div key={app.appId} className="rounded-2xl border border-gray-100 bg-white/90 p-4 shadow-sm">
                <button
                  type="button"
                  onClick={() => toggleAppExpansion(app.appId)}
                  className="flex w-full items-center gap-3 text-left"
                >
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{app.name}</p>
                    <p className="text-xs text-gray-500">App ID: {app.appId}</p>
                  </div>
                  <span className={`ml-auto inline-flex rounded-full px-3 py-1 text-xs font-semibold ${statusStyle.className}`}>
                    {statusStyle.label}
                  </span>
                  <span className="text-gray-400">{isExpanded ? <FiChevronDown /> : <FiChevronRight />}</span>
                </button>
                {isExpanded && (
                  <div className="mt-3 space-y-3 text-sm text-gray-700">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <p className="text-xs uppercase tracking-widest text-gray-500">Developer Pi UID</p>
                        <p className="font-medium text-gray-900">{app.developerPiUid}</p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-widest text-gray-500">Contact email</p>
                        <p className="font-medium text-gray-900">{app.contactEmail ?? "—"}</p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-widest text-gray-500">Allowed origins</p>
                        <p className="font-medium text-gray-900">
                          {app.allowedOrigins && app.allowedOrigins.length ? app.allowedOrigins.join(", ") : "—"}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-widest text-gray-500">Last used</p>
                        <p className="font-medium text-gray-900">{app.lastUsedAt ? new Date(app.lastUsedAt).toLocaleString() : "—"}</p>
                      </div>
                    </div>
                    <div className="text-xs text-gray-500">
                      Created {app.createdAt ? new Date(app.createdAt).toLocaleString() : "—"} · Updated {app.updatedAt ? new Date(app.updatedAt).toLocaleString() : "—"}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="mt-6 text-right">
          <Link href="/admin" className="text-sm font-semibold text-[var(--default-primary-color)]">
            Back to admin overview
          </Link>
        </div>
      </article>
    </section>
  );
}
