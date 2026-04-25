"use client";

import Link from 'next/link';
import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import { FiChevronDown, FiChevronRight, FiLoader, FiRefreshCw, FiShield } from 'react-icons/fi';

import { onIncompletePaymentFound } from '@/config/payment';
import { AppContext } from '@/context/AppContextProvider';
import { fetchAdminDeveloperApps, fetchAdminDeveloperRequests, updateAdminDeveloperRequest } from '@/services/adminApi';
import { DeveloperAppRecord } from '@/services/developerApps';
import { DeveloperRequestRecord, DeveloperRequestStatus } from '@/services/developerRequests';

const PI_SDK_SCRIPT_ID = 'escrowpi-admin-pi-sdk';

type PiAuthState = 'idle' | 'authenticating' | 'ready' | 'error';

type PiWindow = Window & {
  Pi?: any;
};

const REQUEST_TITLES: Record<DeveloperRequestRecord['requestType'], string> = {
  create_app: 'New developer app request',
  update_app: 'Update existing app request',
  rotate_api_key: 'API key rotation request',
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

const REQUEST_STATUS_STYLES: Record<DeveloperRequestStatus, { label: string; className: string }> = {
  requested: { label: 'Requested', className: 'bg-gray-100 text-gray-900' },
  in_progress: { label: 'In review', className: 'bg-indigo-100 text-indigo-800' },
  closed: { label: 'Closed', className: 'bg-emerald-100 text-emerald-800' },
};

const formatDateTime = (value: string | null) => {
  if (!value) return '—';
  return new Date(value).toLocaleString();
};

const formatFieldLabel = (key: string) =>
  key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());

const formatFieldValue = (value: unknown): string => {
  if (value == null) {
    return '—';
  }
  if (Array.isArray(value)) {
    return value.join(', ');
  }
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return '[object]';
    }
  }
  return String(value);
};

const summarizeRequest = (request: DeveloperRequestRecord) => {
  const base = REQUEST_TITLES[request.requestType] ?? 'Developer request';
  return request.developerAppId ? `${base} • ${request.developerAppId}` : base;
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

export default function AdminConsolePage() {
  const { currentUser, piAccessToken: contextPiToken, setPiAccessToken } = useContext(AppContext);
  const [piToken, setPiToken] = useState<string | null>(contextPiToken ?? null);
  const [piAuthState, setPiAuthState] = useState<PiAuthState>(contextPiToken ? 'ready' : 'idle');
  const [piAuthError, setPiAuthError] = useState<string | null>(null);

  const [developerApps, setDeveloperApps] = useState<DeveloperAppRecord[]>([]);
  const [appsLoading, setAppsLoading] = useState(false);
  const [appsError, setAppsError] = useState<string | null>(null);

  const [developerRequests, setDeveloperRequests] = useState<DeveloperRequestRecord[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [requestsError, setRequestsError] = useState<string | null>(null);
  const [requestActionLoading, setRequestActionLoading] = useState<string | null>(null);
  const [expandedRequestIds, setExpandedRequestIds] = useState<Set<string>>(new Set());
  const [expandedAppIds, setExpandedAppIds] = useState<Set<string>>(new Set());
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});

  const isAdmin = currentUser?.isAdmin === true;

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
    } catch (err) {
      const message = describeError(err);
      setPiAuthState('error');
      setPiAuthError(message);
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
    } catch (err) {
      const message = describeError(err);
      setAppsError(message);
      toast.error(message);
    } finally {
      setAppsLoading(false);
    }
  }, [ensurePiToken]);

  const refreshDeveloperRequests = useCallback(async () => {
    setRequestsLoading(true);
    setRequestsError(null);
    try {
      const token = await ensurePiToken();
      if (!token) {
        return;
      }
      const records = await fetchAdminDeveloperRequests({ limit: 100 }, token);
      setDeveloperRequests(records);
      setNoteDrafts((prev) => {
        const next: Record<string, string> = {};
        records.forEach((request) => {
          if (!request.id) return;
          next[request.id] = prev[request.id] ?? request.adminNotes ?? '';
        });
        return next;
      });
    } catch (err) {
      const message = describeError(err);
      setRequestsError(message);
      toast.error(message);
    } finally {
      setRequestsLoading(false);
    }
  }, [ensurePiToken]);

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
      refreshDeveloperApps();
      refreshDeveloperRequests();
    }
  }, [piToken, refreshDeveloperApps, refreshDeveloperRequests]);

  const toggleRequestExpansion = useCallback((requestId: string | null) => {
    if (!requestId) {
      return;
    }
    setExpandedRequestIds((prev) => {
      const next = new Set(prev);
      if (next.has(requestId)) {
        next.delete(requestId);
      } else {
        next.add(requestId);
      }
      return next;
    });
  }, []);

  const toggleAppExpansion = useCallback((appId: string | null) => {
    if (!appId) {
      return;
    }
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

  const handleNoteChange = useCallback((requestId: string, value: string) => {
    if (!requestId) return;
    setNoteDrafts((prev) => ({ ...prev, [requestId]: value }));
  }, []);

  const handleSaveNotes = useCallback(
    async (requestId: string) => {
      if (!requestId) return;
      try {
        setRequestActionLoading(requestId);
        const token = await ensurePiToken();
        if (!token) {
          return;
        }
        const draft = noteDrafts[requestId]?.trim() ?? '';
        const payload = { adminNotes: draft.length ? draft : null };
        const updated = await updateAdminDeveloperRequest(requestId, payload, token);
        setDeveloperRequests((prev) => prev.map((req) => (req.id === updated.id ? updated : req)));
        setNoteDrafts((prev) => ({ ...prev, [requestId]: updated.adminNotes ?? '' }));
        toast.success('Notes saved.');
      } catch (err) {
        toast.error(describeError(err));
      } finally {
        setRequestActionLoading(null);
      }
    },
    [ensurePiToken, noteDrafts]
  );

  const handleSetRequestStatus = useCallback(
    async (requestId: string, status: DeveloperRequestStatus) => {
      if (!requestId) return;
      try {
        setRequestActionLoading(requestId);
        const token = await ensurePiToken();
        if (!token) {
          return;
        }
        const draft = noteDrafts[requestId];
        const payload: { status: DeveloperRequestStatus; adminNotes?: string | null } = { status };
        if (typeof draft === 'string') {
          const trimmed = draft.trim();
          payload.adminNotes = trimmed.length ? trimmed : null;
        }
        const updated = await updateAdminDeveloperRequest(requestId, payload, token);
        setDeveloperRequests((prev) => prev.map((req) => (req.id === updated.id ? updated : req)));
        setNoteDrafts((prev) => ({ ...prev, [requestId]: updated.adminNotes ?? '' }));
        toast.success(`Request marked ${REQUEST_STATUS_STYLES[status].label.toLowerCase()}.`);
      } catch (err) {
        toast.error(describeError(err));
      } finally {
        setRequestActionLoading(null);
      }
    },
    [ensurePiToken, noteDrafts]
  );

  const piStatusMessage = useMemo(() => {
    if (piAuthState === 'authenticating') {
      return 'Authenticating with Pi…';
    }
    if (piAuthState === 'ready' && piToken) {
      return 'Using your current EscrowPi session.';
    }
    if (piAuthState === 'error') {
      return piAuthError ?? 'Pi authentication required.';
    }
    return 'Pi session will sync automatically when needed.';
  }, [piAuthState, piToken, piAuthError]);

  const developerAppRequests = useMemo(
    () => developerRequests.filter((request) => request.requestType !== 'rotate_api_key'),
    [developerRequests]
  );
  const apiKeyRequests = useMemo(
    () => developerRequests.filter((request) => request.requestType === 'rotate_api_key'),
    [developerRequests]
  );
  const visibleDeveloperApps = useMemo(() => developerApps.slice(0, 3), [developerApps]);

  const renderRequestCard = useCallback(
    (request: DeveloperRequestRecord, index: number) => {
      const requestId = request.id ?? null;
      const isExpanded = requestId ? expandedRequestIds.has(requestId) : false;
      const statusStyle = REQUEST_STATUS_STYLES[request.status];
      const noteDraft = requestId ? noteDrafts[requestId] ?? request.adminNotes ?? '' : request.adminNotes ?? '';
      const actionLoading = requestActionLoading === requestId;
      const key = request.id ?? `${request.requestType}-${index}`;

      return (
        <div key={key} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
          <button
            type="button"
            onClick={() => toggleRequestExpansion(requestId)}
            className="flex w-full items-center gap-3 text-left"
            disabled={!requestId}
          >
            <div className="flex-1">
              <p className="text-sm font-semibold text-gray-900">{summarizeRequest(request)}</p>
              <p className="text-xs text-gray-500">
                {request.piUsername ?? 'Unknown pioneer'} · Created {formatDateTime(request.createdAt)}
              </p>
            </div>
            <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${statusStyle.className}`}>
              {statusStyle.label}
            </span>
            <span className="text-gray-400">{isExpanded ? <FiChevronDown /> : <FiChevronRight />}</span>
          </button>
          {isExpanded && (
            <div className="mt-4 space-y-4 text-sm text-gray-700">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-xs uppercase tracking-widest text-gray-500">Pi UID</p>
                  <p className="font-medium text-gray-900">{request.piUid ?? '—'}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-widest text-gray-500">App ID</p>
                  <p className="font-medium text-gray-900">{request.developerAppId ?? '—'}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-widest text-gray-500">Updated</p>
                  <p className="font-medium text-gray-900">{formatDateTime(request.updatedAt)}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-widest text-gray-500">Handled by</p>
                  <p className="font-medium text-gray-900">{request.handledBy ?? 'Unassigned'}</p>
                </div>
              </div>
              {Object.entries(request.formData ?? {}).length > 0 && (
                <div className="space-y-2 rounded-xl bg-gray-50 p-3">
                  {Object.entries(request.formData ?? {}).map(([key, value]) => (
                    <div key={key}>
                      <p className="text-xs uppercase tracking-widest text-gray-500">{formatFieldLabel(key)}</p>
                      <p className="whitespace-pre-wrap break-words text-sm font-medium text-gray-900">{formatFieldValue(value)}</p>
                    </div>
                  ))}
                </div>
              )}
              {requestId && (
                <div className="space-y-2">
                  <label className="text-xs uppercase tracking-widest text-gray-500">Admin notes</label>
                  <textarea
                    value={noteDraft}
                    onChange={(event) => handleNoteChange(requestId, event.target.value)}
                    rows={3}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-[var(--default-primary-color)] focus:outline-none"
                    placeholder="Document context, next steps, or blockers."
                  />
                  <div className="flex flex-wrap gap-3 text-xs">
                    <button
                      type="button"
                      onClick={() => handleSaveNotes(requestId)}
                      disabled={actionLoading}
                      className="rounded-full border border-gray-200 px-3 py-1.5 font-semibold text-gray-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {actionLoading ? 'Saving…' : 'Save note'}
                    </button>
                    {request.status !== 'in_progress' && (
                      <button
                        type="button"
                        onClick={() => handleSetRequestStatus(requestId, 'in_progress')}
                        disabled={actionLoading}
                        className="rounded-full border border-indigo-200 px-3 py-1.5 font-semibold text-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Mark in progress
                      </button>
                    )}
                    {request.status !== 'closed' && (
                      <button
                        type="button"
                        onClick={() => handleSetRequestStatus(requestId, 'closed')}
                        disabled={actionLoading}
                        className="rounded-full border border-emerald-200 px-3 py-1.5 font-semibold text-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Mark as closed
                      </button>
                    )}
                    {request.status !== 'requested' && (
                      <button
                        type="button"
                        onClick={() => handleSetRequestStatus(requestId, 'requested')}
                        disabled={actionLoading}
                        className="rounded-full border border-gray-200 px-3 py-1.5 font-semibold text-gray-700 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Reopen
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      );
    },
    [expandedRequestIds, handleNoteChange, handleSaveNotes, handleSetRequestStatus, noteDrafts, requestActionLoading, toggleRequestExpansion]
  );

  if (!isAdmin) {
    return (
      <section className="flex flex-col items-center gap-4 py-12 text-center">
        <FiShield size={48} className="text-red-500" />
        <h1 className="text-2xl font-semibold text-gray-900">Admin access required</h1>
        <p className="text-gray-600 max-w-sm">
          Your account does not have admin privileges. Ask an existing admin to grant you access from the admin console.
        </p>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-6 py-6">
      <header className="space-y-2 text-center">
        <p className="text-xs uppercase tracking-[0.3em] text-neutral-500">EscrowPi Admin Console</p>
        <h1 className="text-3xl font-semibold text-gray-900">Review developer access</h1>
        <p className="text-gray-600">
          Manage admin permissions, approve developer onboarding, and respond to API key rotation requests without leaving Pi Browser.
        </p>
      </header>

      <article className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <div>
            <p className="text-xs uppercase tracking-widest text-gray-500">Developer apps</p>
            <h2 className="text-xl font-semibold text-gray-900">Current EscrowPi integrations</h2>
          </div>
          <button
            type="button"
            onClick={refreshDeveloperApps}
            disabled={appsLoading}
            title="Refresh apps"
            className="ml-auto rounded-full border border-gray-200 p-3 text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {appsLoading ? <FiLoader className="h-5 w-5 animate-spin" /> : <FiRefreshCw className="h-5 w-5" />}
          </button>
        </div>
        <p className="mt-2 text-sm text-gray-600">Review the apps linked to your pioneers and keep tabs on their status.</p>
        <p className="mt-1 text-xs text-gray-500">{piStatusMessage}</p>
        {appsError && <p className="mt-3 text-sm text-red-600">{appsError}</p>}
        {!appsError && appsLoading && <p className="mt-3 text-sm text-gray-500">Refreshing developer apps…</p>}
        {!appsError && !appsLoading && developerApps.length === 0 && (
          <p className="mt-4 text-sm text-gray-500">No developer apps found yet.</p>
        )}
        <div className="mt-4 space-y-3">
          {visibleDeveloperApps.map((app) => {
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
                        <p className="font-medium text-gray-900">{app.contactEmail ?? '—'}</p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-widest text-gray-500">Allowed origins</p>
                        <p className="font-medium text-gray-900">
                          {app.allowedOrigins && app.allowedOrigins.length
                            ? app.allowedOrigins.join(', ')
                            : '—'}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-widest text-gray-500">Last used</p>
                        <p className="font-medium text-gray-900">{formatDateTime(app.lastUsedAt)}</p>
                      </div>
                    </div>
                    <div className="text-xs text-gray-500">
                      <p>Created {formatDateTime(app.createdAt)} · Updated {formatDateTime(app.updatedAt)}</p>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="mt-4 flex items-center justify-between text-xs text-gray-500">
          <span>
            {developerApps.length === 0
              ? 'No developer apps yet.'
              : developerApps.length <= visibleDeveloperApps.length
                ? `Showing all ${developerApps.length} apps.`
                : `Showing ${visibleDeveloperApps.length} of ${developerApps.length} apps.`}
          </span>
          <Link
            href="/admin/dev-apps"
            className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--default-primary-color)]"
          >
            View all apps
            <FiChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </article>

      <article className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <div>
            <p className="text-xs uppercase tracking-widest text-gray-500">Developer app requests</p>
            <h2 className="text-xl font-semibold text-gray-900">Onboarding & updates</h2>
          </div>
          <button
            type="button"
            onClick={refreshDeveloperRequests}
            disabled={requestsLoading}
            title="Refresh requests"
            className="ml-auto rounded-full border border-gray-200 p-3 text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {requestsLoading ? <FiLoader className="h-5 w-5 animate-spin" /> : <FiRefreshCw className="h-5 w-5" />}
          </button>
        </div>
        <p className="mt-2 text-sm text-gray-600">Expand a request to review details, leave notes, and update status.</p>
        {requestsError && <p className="mt-3 text-sm text-red-600">{requestsError}</p>}
        {!requestsError && developerAppRequests.length === 0 && !requestsLoading && (
          <p className="mt-4 text-sm text-gray-500">No developer onboarding requests yet.</p>
        )}
        {requestsLoading && (
          <p className="mt-4 text-sm text-gray-500">Refreshing requests…</p>
        )}
        <div className="mt-4 space-y-3">
          {developerAppRequests.map((request, index) => renderRequestCard(request, index))}
        </div>
      </article>

      <article className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <div>
            <p className="text-xs uppercase tracking-widest text-gray-500">API key rotations</p>
            <h2 className="text-xl font-semibold text-gray-900">Security requests</h2>
          </div>
          <button
            type="button"
            onClick={refreshDeveloperRequests}
            disabled={requestsLoading}
            title="Refresh rotation requests"
            className="ml-auto rounded-full border border-gray-200 p-3 text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {requestsLoading ? <FiLoader className="h-5 w-5 animate-spin" /> : <FiRefreshCw className="h-5 w-5" />}
          </button>
        </div>
        <p className="mt-2 text-sm text-gray-600">Quickly respond when developers request fresh credentials.</p>
        {!requestsError && apiKeyRequests.length === 0 && !requestsLoading && (
          <p className="mt-4 text-sm text-gray-500">No rotation requests yet.</p>
        )}
        {requestsLoading && apiKeyRequests.length === 0 && (
          <p className="mt-4 text-sm text-gray-500">Refreshing requests…</p>
        )}
        <div className="mt-4 space-y-3">
          {apiKeyRequests.map((request, index) => renderRequestCard(request, index))}
        </div>
      </article>
    </section>
  );
}
