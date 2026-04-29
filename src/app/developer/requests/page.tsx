"use client";

import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'react-toastify';
import { FiChevronDown, FiChevronRight, FiLoader, FiRefreshCw } from 'react-icons/fi';

import { onIncompletePaymentFound } from '@/config/payment';
import { AppContext } from '@/context/AppContextProvider';
import ConfirmDialog from '@/components/ConfirmDialog';
import {
  DeveloperRequestRecord,
  DeveloperRequestType,
  fetchDeveloperRequests,
  revealDeveloperCredential,
} from '@/services/developerRequests';
import {
  formatDateTime,
  formatRequestFieldLabel,
  formatRequestFieldValue,
  isActiveRequestStatus,
  recordTimestamp,
  statusStyles,
  summarizeRequest,
} from '../requestUtils';

const PI_SDK_SCRIPT_ID = 'escrowpi-dev-requests-pi-sdk';

type PiAuthState = 'idle' | 'authenticating' | 'ready' | 'error';

type CredentialRevealState = {
  apiKey?: string;
  revealedAt: string;
};

type PiWindow = Window & {
  Pi?: any;
};

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

const normalizePiSdkError = (message: string) => {
  if (message.toLowerCase().includes('pi network sdk was not initialized')) {
    return 'Pi SDK is still loading or the session expired. Tap refresh to try again.';
  }
  return message;
};

export default function DeveloperRequestsIndex() {
  const { piAccessToken: contextPiToken, setPiAccessToken } = useContext(AppContext);

  const [piToken, setPiToken] = useState<string | null>(contextPiToken ?? null);
  const [piAuthState, setPiAuthState] = useState<PiAuthState>(contextPiToken ? 'ready' : 'idle');
  const [piAuthError, setPiAuthError] = useState<string | null>(null);
  const [requests, setRequests] = useState<DeveloperRequestRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [requestFilterMode, setRequestFilterMode] = useState<'active' | 'all'>('all');
  const [credentialReveals, setCredentialReveals] = useState<Record<string, CredentialRevealState>>({});
  const [hideConfirmRequestId, setHideConfirmRequestId] = useState<string | null>(null);
  const [revealLoading, setRevealLoading] = useState<Record<string, boolean>>({});

  const describePiAuthError = useCallback((err: any) => normalizePiSdkError(describeError(err)), []);

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
      const message = describePiAuthError(err);
      setPiAuthError(message);
      setPiAuthState('error');
      toast.error(message);
      throw err;
    }
  }, [describePiAuthError, setPiAccessToken]);

  const ensurePiToken = useCallback(async () => {
    if (piToken) {
      return piToken;
    }
    if (contextPiToken) {
      setPiToken(contextPiToken);
      setPiAuthState('ready');
      return contextPiToken;
    }
    return authenticateWithPi();
  }, [piToken, contextPiToken, authenticateWithPi]);

  const loadRequests = useCallback(async () => {
    if (!piToken) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await fetchDeveloperRequests({}, piToken);
      setRequests(data);
    } catch (err) {
      const message = describeError(err);
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [piToken]);

  useEffect(() => {
    if (contextPiToken && !piToken) {
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
      loadRequests();
    }
  }, [piToken, loadRequests]);

  const orderedRequests = useMemo(
    () => [...requests].sort((a, b) => recordTimestamp(b) - recordTimestamp(a)),
    [requests]
  );

  const filteredRequests = useMemo(() => {
    if (requestFilterMode === 'active') {
      return orderedRequests.filter((record) => isActiveRequestStatus(record.status));
    }
    return orderedRequests;
  }, [orderedRequests, requestFilterMode]);

  const toggleExpansion = useCallback((requestId: string | null) => {
    if (!requestId) return;
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(requestId)) {
        next.delete(requestId);
      } else {
        next.add(requestId);
      }
      return next;
    });
  }, []);

  const handleRevealCredential = useCallback(
    async (request: DeveloperRequestRecord) => {
      if (!request.id) {
        toast.error('Unable to reveal credentials for this request.');
        return;
      }
      const safeRequestId = request.id;
      try {
        setRevealLoading((prev) => ({ ...prev, [safeRequestId]: true }));
        const token = await ensurePiToken();
        const credential = await revealDeveloperCredential(safeRequestId, token);
        setCredentialReveals((prev) => ({ ...prev, [safeRequestId]: { apiKey: credential.apiKey, revealedAt: credential.revealedAt } }));
        setRequests((prev) =>
          prev.map((record) =>
            record.id === safeRequestId
              ? {
                  ...record,
                  credentialSnapshot: {
                    appId: credential.appId,
                    revealedAt: credential.revealedAt,
                  },
                }
              : record
          )
        );
      } catch (err) {
        toast.error(describeError(err));
      } finally {
        setRevealLoading((prev) => ({ ...prev, [safeRequestId]: false }));
      }
    },
    [ensurePiToken]
  );

  const handleCopyCredential = useCallback(async (requestId: string, apiKey: string) => {
    try {
      await navigator.clipboard.writeText(apiKey);
      toast.success('API key copied to clipboard.');
    } catch (err) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to copy API key', err);
      }
      toast.error('Unable to copy automatically. Please copy manually.');
    }
  }, []);

  const finalizeHideCredential = useCallback((requestId: string) => {
    if (!requestId) {
      return;
    }
    setCredentialReveals((prev) => {
      const next = { ...prev };
      if (next[requestId]) {
        next[requestId] = { revealedAt: next[requestId].revealedAt };
      }
      return next;
    });
  }, []);

  const requestHideCredential = useCallback((requestId: string) => {
    if (!requestId) {
      return;
    }
    setHideConfirmRequestId(requestId);
  }, []);

  const handleConfirmHideCredential = useCallback(() => {
    if (!hideConfirmRequestId) {
      return;
    }
    finalizeHideCredential(hideConfirmRequestId);
    setHideConfirmRequestId(null);
  }, [hideConfirmRequestId, finalizeHideCredential]);

  const handleCancelHideCredential = useCallback(() => {
    setHideConfirmRequestId(null);
  }, []);

  const toggleFilterMode = useCallback(() => {
    setRequestFilterMode((prev) => (prev === 'active' ? 'all' : 'active'));
  }, []);

  const hasRequests = orderedRequests.length > 0;
  const noMatches = hasRequests && filteredRequests.length === 0;
  const requestSummaryText = useMemo(() => {
    const scopeDescriptor = requestFilterMode === 'active' ? 'active requests' : 'requests';
    if (!hasRequests) {
      return `No ${scopeDescriptor} yet.`;
    }
    if (requestFilterMode === 'active') {
      return `Showing ${filteredRequests.length} active requests · ${orderedRequests.length} total.`;
    }
    return `Showing all ${orderedRequests.length} requests.`;
  }, [filteredRequests.length, hasRequests, orderedRequests.length, requestFilterMode]);

  return (
    <section className="flex flex-col gap-6 py-6">
      <header className="space-y-3">
        <p className="text-xs uppercase tracking-[0.3em] text-neutral-500">EscrowPi Developer Portal</p>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="flex-1 text-3xl font-semibold text-gray-900">All developer requests</h1>
          <Link
            href="/developer"
            className="rounded-full border border-gray-200 px-4 py-1.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
          >
            Back to portal
          </Link>
        </div>
        <p className="text-sm text-gray-600">Browse every submission tied to your Pi identity, including completed approvals or rejections.</p>
      </header>
      <article className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <div>
            <p className="text-xs uppercase tracking-widest text-gray-500">Developer app requests</p>
            <h2 className="text-xl font-semibold text-gray-900">Full request log</h2>
          </div>
          <button
            type="button"
            onClick={loadRequests}
            disabled={piAuthState === 'authenticating' || loading}
            title="Refresh request log"
            className="ml-auto rounded-full border border-gray-200 p-3 text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? <FiLoader className="h-5 w-5 animate-spin" /> : <FiRefreshCw className="h-5 w-5" />}
          </button>
        </div>
        <p className="mt-2 text-sm text-gray-600">Expand a request to review form submissions or retrieve approved API keys.</p>
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={toggleFilterMode}
            className="rounded-full border border-gray-200 px-4 py-1.5 text-xs font-semibold text-[var(--default-primary-color)] transition hover:bg-gray-50"
          >
            {requestFilterMode === 'active' ? 'Show all' : 'Show active'}
          </button>
        </div>
        <div className="mt-3 space-y-3">
          {piAuthState === 'error' && <p className="text-sm text-red-600">{piAuthError ?? 'Pi session failed. Reload to try again.'}</p>}
          {piAuthState !== 'error' && (!piToken || loading) && (
            <p className="text-sm text-gray-500">{!piToken ? 'Syncing your Pi session…' : 'Refreshing activity…'}</p>
          )}
          {piAuthState !== 'error' && piToken && !loading && error && <p className="text-sm text-red-600">{error}</p>}
          {piAuthState !== 'error' && piToken && !loading && !error && !hasRequests && (
            <p className="text-sm text-gray-600">No requests yet. Submit one from the main developer portal.</p>
          )}
          {piAuthState !== 'error' && piToken && !loading && !error && noMatches && (
            <p className="text-sm text-gray-600">No requests match this filter.</p>
          )}
          {piAuthState !== 'error' && piToken && !loading && !error && filteredRequests.length > 0 &&
            filteredRequests.map((request, index) => {
              const status = statusStyles[request.status] ?? statusStyles.requested;
              const fallbackId = `${request.requestType}-${request.developerAppId ?? 'unknown'}-${request.createdAt ?? index}`;
              const requestId = request.id ?? fallbackId;
              const isExpanded = requestId ? expandedIds.has(requestId) : false;
              const formEntries = Object.entries(request.formData ?? {});
              const credentialMeta = request.credentialSnapshot ?? null;
              const revealState = requestId ? credentialReveals[requestId] : undefined;
              const isRevealLoading = requestId ? Boolean(revealLoading[requestId]) : false;
              const canRevealCredential = request.status === 'approved' && Boolean(credentialMeta?.appId);
              const revealedOn = revealState?.revealedAt ?? credentialMeta?.revealedAt ?? null;
              const apiKeyValue = revealState?.apiKey ?? null;
              const alreadyRevealed = Boolean(credentialMeta?.revealedAt) && !apiKeyValue;
              return (
                <div key={requestId} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                  <button
                    type="button"
                    onClick={() => toggleExpansion(requestId)}
                    className="flex w-full items-center gap-3 text-left"
                    disabled={!requestId}
                  >
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-gray-900">{summarizeRequest(request)}</p>
                      <p className="text-xs text-gray-500">{formatDateTime(request.createdAt)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${status.className}`}>{status.label}</span>
                      <span className="text-gray-400">{isExpanded ? <FiChevronDown /> : <FiChevronRight />}</span>
                    </div>
                  </button>
                  {isExpanded && (
                    <div className="mt-3 space-y-3 text-sm text-gray-700">
                      <div className="flex flex-wrap gap-4 text-xs text-gray-500">
                        <span>Request type: {request.requestType.replace('_', ' ')}</span>
                        <span>App ID: {request.developerAppId ?? '—'}</span>
                      </div>
                      {formEntries.length > 0 && (
                        <div className="space-y-2 rounded-xl bg-gray-50 p-3">
                          {formEntries.map(([key, value]) => (
                            <div key={key}>
                              <p className="text-xs uppercase tracking-widest text-gray-500">{formatRequestFieldLabel(key)}</p>
                              <p className="whitespace-pre-wrap break-words text-sm font-medium text-gray-900">{formatRequestFieldValue(value)}</p>
                            </div>
                          ))}
                        </div>
                      )}
                      {canRevealCredential && (
                        <div className="space-y-2 rounded-xl border border-emerald-200 bg-emerald-50/50 p-3">
                          <div className="flex flex-wrap items-center gap-2 text-xs text-emerald-700">
                            <span className="uppercase tracking-[0.3em]">Credentials</span>
                            <span className="text-[0.95em] tracking-normal text-emerald-900">
                              App ID: {credentialMeta?.appId ?? request.developerAppId ?? '—'}
                            </span>
                          </div>
                          {apiKeyValue ? (
                            <div className="flex flex-wrap items-center gap-3">
                              <code className="block max-w-full overflow-x-auto rounded-lg bg-white px-3 py-2 font-mono text-sm text-emerald-900 shadow-inner break-all">
                                {apiKeyValue}
                              </code>
                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={() => requestId && handleCopyCredential(requestId, apiKeyValue)}
                                  className="rounded-full border border-emerald-200 px-3 py-1.5 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-100"
                                >
                                  Copy key
                                </button>
                                <button
                                  type="button"
                                  onClick={() => requestHideCredential(requestId)}
                                  className="rounded-full border border-emerald-200 px-3 py-1.5 text-xs font-semibold text-emerald-600 transition hover:bg-emerald-100"
                                >
                                  Hide key
                                </button>
                              </div>
                            </div>
                          ) : alreadyRevealed ? (
                            <p className="text-sm text-emerald-900">
                              API key was revealed on {formatDateTime(revealedOn)}. Submit a rotation request if you need a new one.
                            </p>
                          ) : (
                            <div className="flex flex-wrap items-center gap-3">
                              <span className="font-mono text-lg tracking-[0.4em] text-emerald-900">••••••••••••••••</span>
                              <button
                                type="button"
                                onClick={() => handleRevealCredential(request)}
                                disabled={!requestId || isRevealLoading}
                                className="rounded-full border border-emerald-200 px-4 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {isRevealLoading ? 'Revealing…' : 'Reveal API key'}
                              </button>
                            </div>
                          )}
                          {apiKeyValue && (
                            <p className="text-xs text-emerald-800">This key disappears once you leave or refresh this page. Save it somewhere safe.</p>
                          )}
                          {!apiKeyValue && !alreadyRevealed && (
                            <p className="text-xs text-emerald-800">This key will be shown once. Copy it immediately after revealing.</p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
        </div>
        <p className="mt-4 text-xs text-gray-500">{requestSummaryText}</p>
      </article>
      <ConfirmDialog
        open={Boolean(hideConfirmRequestId)}
        title="Hide API key?"
        description="Make sure you have copied the API key to a safe place before hiding it."
        confirmLabel="Hide key"
        cancelLabel="Keep it visible"
        onConfirm={handleConfirmHideCredential}
        onCancel={handleCancelHideCredential}
      />
    </section>
  );
}
