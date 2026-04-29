"use client";

import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'react-toastify';
import { FiChevronDown, FiChevronRight, FiLoader, FiRefreshCw } from 'react-icons/fi';

import { onIncompletePaymentFound } from '@/config/payment';
import { AppContext } from '@/context/AppContextProvider';
import { DeveloperAppRecord, fetchDeveloperApps } from '@/services/developerApps';
import { formatDateTime } from '../requestUtils';

type PiAuthState = 'idle' | 'authenticating' | 'ready' | 'error';

type PiWindow = Window & {
  Pi?: any;
};

const PI_SDK_SCRIPT_ID = 'escrowpi-dev-apps-pi-sdk';

const describeError = (err: any) => {
  const message = err?.response?.data?.message ?? err?.message;
  if (typeof message === 'string' && message.trim().length) {
    return message.trim();
  }
  return 'Something went wrong. Please retry.';
};

const loadPiSdk = (): Promise<any> => {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Pi SDK is only available inside Pi Browser.'));
  }
  const existing = (window as PiWindow).Pi;
  if (existing) {
    return Promise.resolve(existing);
  }

  const scriptEl = document.getElementById(PI_SDK_SCRIPT_ID) as HTMLScriptElement | null;
  if (scriptEl) {
    return new Promise((resolve, reject) => {
      scriptEl.addEventListener('load', () => resolve((window as PiWindow).Pi));
      scriptEl.addEventListener('error', () => reject(new Error('Failed to load Pi SDK script.')));
    });
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.id = PI_SDK_SCRIPT_ID;
    script.src = 'https://sdk.minepi.com/pi-sdk.js';
    script.async = true;
    script.onload = () => resolve((window as PiWindow).Pi);
    script.onerror = () => reject(new Error('Failed to load Pi SDK script.'));
    document.head.appendChild(script);
  });
};

const timestampFromDate = (value: string | null | undefined) => {
  if (!value) return 0;
  const ts = new Date(value).getTime();
  return Number.isNaN(ts) ? 0 : ts;
};

const getDeveloperAppStatusStyle = (status?: string) => {
  const normalized = (status ?? 'active').toLowerCase();
  if (normalized === 'suspended') {
    return { label: 'Suspended', className: 'bg-amber-100 text-amber-800' };
  }
  if (normalized === 'inactive') {
    return { label: 'Inactive', className: 'bg-gray-100 text-gray-800' };
  }
  if (normalized === 'pending') {
    return { label: 'Pending', className: 'bg-indigo-100 text-indigo-800' };
  }
  return { label: 'Active', className: 'bg-emerald-100 text-emerald-800' };
};

export default function DeveloperAppsIndex() {
  const { piAccessToken: contextPiToken, setPiAccessToken } = useContext(AppContext);

  const [piToken, setPiToken] = useState<string | null>(contextPiToken ?? null);
  const [piAuthState, setPiAuthState] = useState<PiAuthState>(contextPiToken ? 'ready' : 'idle');
  const [piAuthError, setPiAuthError] = useState<string | null>(null);
  const [apps, setApps] = useState<DeveloperAppRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const authenticateWithPi = useCallback(async (): Promise<string> => {
    setPiAuthState('authenticating');
    setPiAuthError(null);
    try {
      const Pi = await loadPiSdk();
      if (!Pi) {
        throw new Error('Pi SDK not detected. Open this page inside Pi Browser.');
      }
      if (!Pi.initialized) {
        Pi.init({ version: '2.0', sandbox: process.env.NODE_ENV !== 'production' });
      }
      const pioneerAuth = await Pi.authenticate(['username', 'payments', 'wallet_address'], onIncompletePaymentFound);
      if (!pioneerAuth?.accessToken) {
        throw new Error('Unable to acquire Pi access token.');
      }
      setPiToken(pioneerAuth.accessToken);
      setPiAccessToken(pioneerAuth.accessToken);
      setPiAuthState('ready');
      toast.success('Pi authentication complete.');
      return pioneerAuth.accessToken;
    } catch (err: any) {
      const message = describeError(err);
      setPiAuthError(message);
      setPiAuthState('error');
      toast.error(message);
      throw err;
    }
  }, [setPiAccessToken]);

  const ensurePiToken = useCallback(async () => {
    if (piToken) {
      return piToken;
    }
    if (contextPiToken) {
      setPiToken(contextPiToken);
      setPiAuthState('ready');
      setPiAuthError(null);
      return contextPiToken;
    }
    return authenticateWithPi();
  }, [piToken, contextPiToken, authenticateWithPi]);

  const refreshApps = useCallback(async (tokenOverride?: string | null) => {
    const token = tokenOverride ?? piToken;
    if (!token) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await fetchDeveloperApps(token);
      setApps(data);
    } catch (err) {
      const message = describeError(err);
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [piToken]);

  useEffect(() => {
    if (contextPiToken && contextPiToken !== piToken) {
      setPiToken(contextPiToken);
      setPiAuthState('ready');
      setPiAuthError(null);
    }
  }, [contextPiToken, piToken]);

  useEffect(() => {
    if (!piToken && !contextPiToken && piAuthState === 'idle') {
      authenticateWithPi().catch(() => {});
    }
  }, [piToken, contextPiToken, piAuthState, authenticateWithPi]);

  useEffect(() => {
    if (piToken) {
      refreshApps();
    }
  }, [piToken, refreshApps]);

  const sortedApps = useMemo(() => {
    return [...apps].sort((a, b) => {
      const aTs = Math.max(timestampFromDate(a.lastUsedAt), timestampFromDate(a.updatedAt), timestampFromDate(a.createdAt));
      const bTs = Math.max(timestampFromDate(b.lastUsedAt), timestampFromDate(b.updatedAt), timestampFromDate(b.createdAt));
      return bTs - aTs;
    });
  }, [apps]);

  const toggleExpansion = useCallback((appId: string) => {
    if (!appId) return;
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(appId)) {
        next.delete(appId);
      } else {
        next.add(appId);
      }
      return next;
    });
  }, []);

  const appSummaryText = useMemo(() => {
    if (sortedApps.length === 0) {
      return 'No developer apps yet.';
    }
    return `Showing all ${sortedApps.length} apps.`;
  }, [sortedApps.length]);

  return (
    <section className="flex flex-col gap-6 py-6">
      <header className="space-y-3">
        <p className="text-xs uppercase tracking-[0.3em] text-neutral-500">EscrowPi Developer Portal</p>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="flex-1 text-3xl font-semibold text-gray-900">All developer apps</h1>
          <Link
            href="/developer"
            className="rounded-full border border-gray-200 px-4 py-1.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
          >
            Back to portal
          </Link>
        </div>
        <p className="text-sm text-gray-600">Inspect every EscrowPi integration tied to your Pi identity.</p>
      </header>

      <article className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <div>
            <p className="text-xs uppercase tracking-widest text-gray-500">Developer apps</p>
            <h2 className="text-xl font-semibold text-gray-900">Full app catalog</h2>
          </div>
          <button
            type="button"
            onClick={() => ensurePiToken().then((token) => refreshApps(token))}
            disabled={piAuthState === 'authenticating' || loading}
            title="Refresh apps"
            className="ml-auto rounded-full border border-gray-200 p-3 text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? <FiLoader className="h-5 w-5 animate-spin" /> : <FiRefreshCw className="h-5 w-5" />}
          </button>
        </div>
        <p className="mt-2 text-sm text-gray-600">Expand an app to review ownership, allowed origins, and contact details.</p>
        <div className="mt-3 space-y-3">
          {piAuthState === 'error' && <p className="text-sm text-red-600">{piAuthError ?? 'Pi session failed. Reload to try again.'}</p>}
          {piAuthState !== 'error' && (!piToken || loading) && (
            <p className="text-sm text-gray-500">{!piToken ? 'Syncing your Pi session…' : 'Refreshing apps…'}</p>
          )}
          {piAuthState !== 'error' && piToken && !loading && error && <p className="text-sm text-red-600">{error}</p>}
          {piAuthState !== 'error' && piToken && !loading && !error && sortedApps.length === 0 && (
            <p className="text-sm text-gray-600">No developer apps yet. Submit a request from the main portal.</p>
          )}
          {piAuthState !== 'error' && piToken && !loading && !error && sortedApps.length > 0 &&
            sortedApps.map((app) => {
              const statusStyle = getDeveloperAppStatusStyle(app.status);
              const isExpanded = expandedIds.has(app.appId);
              return (
                <div key={app.appId} className="rounded-2xl border border-gray-100 bg-white/90 p-4 shadow-sm">
                  <button
                    type="button"
                    onClick={() => toggleExpansion(app.appId)}
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
                          <p className="font-medium text-gray-900">{app.contactEmail ?? '—'}</p>
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-widest text-gray-500">Allowed origins</p>
                          <p className="font-medium text-gray-900">
                            {app.allowedOrigins && app.allowedOrigins.length ? app.allowedOrigins.join(', ') : '—'}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-widest text-gray-500">Last used</p>
                          <p className="font-medium text-gray-900">{formatDateTime(app.lastUsedAt)}</p>
                        </div>
                      </div>
                      <div className="text-xs text-gray-500">
                        Created {formatDateTime(app.createdAt)} · Updated {formatDateTime(app.updatedAt)}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
        </div>
        <p className="mt-4 text-xs text-gray-500">{appSummaryText}</p>
      </article>
    </section>
  );
}
