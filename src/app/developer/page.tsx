"use client";

import { FormEvent, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'react-toastify';
import { FiChevronDown, FiChevronRight, FiExternalLink, FiLoader, FiRefreshCw } from 'react-icons/fi';
import { MdAppRegistration } from 'react-icons/md';

import { onIncompletePaymentFound } from '@/config/payment';
import { AppContext } from '@/context/AppContextProvider';
import {
  DeveloperRequestRecord,
  DeveloperRequestType,
  fetchDeveloperRequests,
  submitDeveloperRequest,
} from '@/services/developerRequests';
import { DeveloperAppRecord, fetchDeveloperApps } from '@/services/developerApps';

const DOC_ENV = process.env.NEXT_PUBLIC_DOC_ENV ?? 'dev';
const DOC_BASE = `https://escrowpi-doc-${DOC_ENV}.vercel.app`;
const SWAGGER_URL = `${DOC_BASE}/api-docs_`;
const DEVELOPER_GUIDE_URL = `${DOC_BASE}/developer-guide`;
const CONTACT_EMAIL = 'philip@mapofpi.com';

const PRIMARY_COLOR = 'var(--default-primary-color)';
const SECONDARY_COLOR = 'var(--default-secondary-color)';

type AppRequestMode = 'create_app' | 'update_app';
type PiAuthState = 'idle' | 'authenticating' | 'ready' | 'error';

type PiWindow = Window & {
  Pi?: any;
};

type AppInsight = {
  app: DeveloperAppRecord;
  lastActivityTs: number;
};

const PI_SDK_SCRIPT_ID = 'escrowpi-dev-portal-pi-sdk';
const THIRTY_DAYS_MS = 1000 * 60 * 60 * 24 * 30;

const statusStyles: Record<string, { label: string; className: string }> = {
  requested: { label: 'Requested', className: 'bg-amber-100 text-amber-800' },
  in_progress: { label: 'In progress', className: 'bg-blue-100 text-blue-800' },
  closed: { label: 'Closed', className: 'bg-emerald-100 text-emerald-800' },
};

const describeError = (err: any) => {
  const message = err?.response?.data?.message ?? err?.message;
  if (typeof message === 'string' && message.trim().length) {
    return message.trim();
  }
  return 'Something went wrong. Please retry.';
};

const parseListInput = (value: string) =>
  value
    .split(/\n|,/)
    .map((entry) => entry.trim())
    .filter(Boolean);

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

const summarizeRequest = (request: DeveloperRequestRecord) => {
  const formData = request.formData || {};
  if (request.requestType === 'create_app') {
    return formData.appName ? `New app: ${formData.appName}` : 'New app onboarding';
  }
  if (request.requestType === 'update_app') {
    if (formData.appName) return `Update ${formData.appName}`;
    if (Array.isArray(formData.allowedOrigins) && formData.allowedOrigins.length) {
      return `Update allowed origins (${formData.allowedOrigins.length})`;
    }
    return 'Update developer app metadata';
  }
  if (request.requestType === 'rotate_api_key') {
    return formData.reason ? `Rotate key (${formData.reason})` : 'Rotate API key';
  }
  return 'Developer request';
};

const formatDateTime = (value: string | null) => {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
};

const recordTimestamp = (record: DeveloperRequestRecord) => {
  const candidates = [record.updatedAt, record.createdAt] as Array<string | null>;
  for (const value of candidates) {
    if (!value) continue;
    const ts = new Date(value).getTime();
    if (!Number.isNaN(ts)) {
      return ts;
    }
  }
  return 0;
};

const timestampFromDate = (value: string | null | undefined) => {
  if (!value) return 0;
  const ts = new Date(value).getTime();
  return Number.isNaN(ts) ? 0 : ts;
};

const normalizePiSdkError = (message: string) => {
  if (message.toLowerCase().includes('pi network sdk was not initialized')) {
    return 'Pi SDK is still loading or the session expired. Tap refresh to try again.';
  }
  return message;
};

export default function DeveloperPortal() {
  const { currentUser, piAccessToken: contextPiToken, setPiAccessToken } = useContext(AppContext);

  const [piToken, setPiToken] = useState<string | null>(contextPiToken ?? null);
  const [piAuthState, setPiAuthState] = useState<PiAuthState>(contextPiToken ? 'ready' : 'idle');
  const [piAuthError, setPiAuthError] = useState<string | null>(null);
  const [requestHistory, setRequestHistory] = useState<DeveloperRequestRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [developerApps, setDeveloperApps] = useState<DeveloperAppRecord[]>([]);
  const [expandedAppIds, setExpandedAppIds] = useState<Set<string>>(new Set());
  const [appsLoading, setAppsLoading] = useState(false);
  const [appsError, setAppsError] = useState<string | null>(null);
  const [createMode, setCreateMode] = useState<AppRequestMode>('create_app');
  const [createForm, setCreateForm] = useState({
    developerAppId: '',
    appName: '',
    description: '',
    contactEmail: '',
    allowedOrigins: '',
    callbackUrls: '',
    notes: '',
  });
  const [rotateForm, setRotateForm] = useState({
    developerAppId: '',
    reason: '',
    urgency: '',
  });
  const [submitting, setSubmitting] = useState({ app: false, rotate: false });

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
      const message = normalizePiSdkError(describeError(err));
      setPiAuthError(message);
      setPiAuthState('error');
      toast.error(message);
      throw err;
    }
  }, []);

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

  const loadRequestHistory = useCallback(async () => {
    if (!piToken) {
      return;
    }
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const records = await fetchDeveloperRequests({}, piToken);
      setRequestHistory(records);
    } catch (err) {
      const message = describeError(err);
      setHistoryError(message);
      toast.error(message);
    } finally {
      setHistoryLoading(false);
    }
  }, [piToken]);

  const loadDeveloperApps = useCallback(async () => {
    if (!piToken) {
      return;
    }
    setAppsLoading(true);
    setAppsError(null);
    try {
      const apps = await fetchDeveloperApps(piToken);
      setDeveloperApps(apps);
    } catch (err) {
      const message = describeError(err);
      setAppsError(message);
      toast.error(message);
    } finally {
      setAppsLoading(false);
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
      loadRequestHistory();
      loadDeveloperApps();
    }
  }, [piToken, loadRequestHistory, loadDeveloperApps]);

  useEffect(() => {
    setExpandedAppIds((prev) => {
      const next = new Set<string>();
      developerApps.forEach((app) => {
        if (prev.has(app.appId)) {
          next.add(app.appId);
        }
      });
      return next;
    });
  }, [developerApps]);

  const orderedHistory = useMemo(
    () => [...requestHistory].sort((a, b) => recordTimestamp(b) - recordTimestamp(a)),
    [requestHistory]
  );

  const appInsights: AppInsight[] = useMemo(() => {
    return developerApps
      .map((app) => {
        const lastActivityTs = Math.max(
          timestampFromDate(app.lastUsedAt),
          timestampFromDate(app.updatedAt),
          timestampFromDate(app.createdAt)
        );
        return { app, lastActivityTs };
      })
      .sort((a, b) => b.lastActivityTs - a.lastActivityTs);
  }, [developerApps]);
  const appListOverflows = appInsights.length > 3;

  const requestPreview = useMemo<DeveloperRequestRecord[]>(() => orderedHistory.slice(0, 6), [orderedHistory]);
  const isFormDisabled = !currentUser;

  const handleRefreshStats = useCallback(() => {
    if (!piToken) {
      authenticateWithPi().catch(() => {});
      return;
    }
    loadRequestHistory();
    loadDeveloperApps();
  }, [piToken, authenticateWithPi, loadRequestHistory, loadDeveloperApps]);

  const toggleAppExpansion = useCallback((appId: string) => {
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

  const handleSubmitAppRequest = async (event: FormEvent) => {
    event.preventDefault();
    if (isFormDisabled) {
      toast.error('Sign in with EscrowPi (top right) before submitting a request.');
      return;
    }
    try {
      setSubmitting((prev) => ({ ...prev, app: true }));
      const token = await ensurePiToken();
      const payload: { requestType: DeveloperRequestType; developerAppId?: string; formData: Record<string, any> } = {
        requestType: createMode,
        formData: {
          appName: createForm.appName.trim() || undefined,
          description: createForm.description.trim() || undefined,
          contactEmail: createForm.contactEmail.trim() || undefined,
          notes: createForm.notes.trim() || undefined,
        },
      };

      if (createMode === 'update_app') {
        payload.developerAppId = createForm.developerAppId.trim();
      }

      const allowedOrigins = parseListInput(createForm.allowedOrigins);
      if (allowedOrigins.length) {
        payload.formData.allowedOrigins = allowedOrigins;
      }

      const callbackUrls = parseListInput(createForm.callbackUrls);
      if (callbackUrls.length) {
        payload.formData.callbackUrls = callbackUrls;
      }

      await submitDeveloperRequest(payload, token);
      toast.success('Request submitted. We will follow up via your Pi account email.');
      setCreateForm({
        developerAppId: '',
        appName: '',
        description: '',
        contactEmail: '',
        allowedOrigins: '',
        callbackUrls: '',
        notes: '',
      });
      loadRequestHistory();
      loadDeveloperApps();
    } catch (err) {
      // errors already surfaced via toast inside ensurePiToken/submit
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to submit developer request', err);
      }
    } finally {
      setSubmitting((prev) => ({ ...prev, app: false }));
    }
  };

  const handleSubmitRotateRequest = async (event: FormEvent) => {
    event.preventDefault();
    if (isFormDisabled) {
      toast.error('Sign in with EscrowPi (top right) before submitting a request.');
      return;
    }
    if (!rotateForm.developerAppId.trim()) {
      toast.error('Developer app ID is required.');
      return;
    }
    if (!rotateForm.reason.trim()) {
      toast.error('Please provide a brief reason for the rotation.');
      return;
    }
    try {
      setSubmitting((prev) => ({ ...prev, rotate: true }));
      const token = await ensurePiToken();
      await submitDeveloperRequest(
        {
          requestType: 'rotate_api_key',
          developerAppId: rotateForm.developerAppId.trim(),
          formData: {
            reason: rotateForm.reason.trim(),
            urgency: rotateForm.urgency.trim() || undefined,
          },
        },
        token
      );
      toast.success('Rotation request submitted. Our team will reach out shortly.');
      setRotateForm({ developerAppId: '', reason: '', urgency: '' });
      loadRequestHistory();
      loadDeveloperApps();
    } catch (err) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to submit rotation request', err);
      }
    } finally {
      setSubmitting((prev) => ({ ...prev, rotate: false }));
    }
  };

  return (
    <section className="flex flex-col gap-8 py-6">
      <header className="space-y-3 text-center">
        <p className="text-xs uppercase tracking-[0.3em] text-neutral-500">EscrowPi Developer Portal</p>
        <h1 className="text-3xl font-semibold text-gray-900">Build with EscrowPi</h1>
        <p className="text-base text-gray-600">
          Submit onboarding requests, rotate credentials, and check the status of prior submissions without leaving Pi Browser.
        </p>
      </header>
      <article className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <div>
            <p className="text-xs uppercase tracking-widest text-gray-500">My developer apps</p>
            <h2 className="text-xl font-semibold text-gray-900">My EscrowPi integrations</h2>
          </div>
          <button
            type="button"
            onClick={handleRefreshStats}
            disabled={piAuthState === 'authenticating' || appsLoading}
            title="Refresh developer apps"
            className="ml-auto rounded-full border border-gray-200 p-3 text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {appsLoading ? <FiLoader className="h-5 w-5 animate-spin" /> : <FiRefreshCw className="h-5 w-5" />}
          </button>
        </div>
        <p className="mt-2 text-sm text-gray-600">These apps are tied to your Pi identity inside EscrowPi.</p>
        <p className="mt-1 text-xs text-gray-500">
          {piAuthState === 'ready' && piToken
            ? 'Using your current EscrowPi session.'
            : piAuthState === 'authenticating'
              ? 'Authenticating with Pi…'
              : piAuthState === 'error'
                ? piAuthError ?? 'Pi session needs attention.'
                : 'Initializing Pi session…'}
        </p>
        {appsError && <p className="mt-3 text-sm text-red-600">{appsError}</p>}
        {!appsError && appsLoading && <p className="mt-3 text-sm text-gray-500">Refreshing developer apps…</p>}
        {!appsError && !appsLoading && appInsights.length === 0 && (
          <p className="mt-4 text-sm text-gray-600">Submit a request to link your first app to this Pi identity.</p>
        )}
        <div className={`mt-4 space-y-3 ${appListOverflows ? 'max-h-80 overflow-y-auto pr-1' : ''}`}>
          {appInsights.map(({ app }) => {
            const normalizedStatus = (app.status ?? 'active').toLowerCase();
            const statusLabel = normalizedStatus.charAt(0).toUpperCase() + normalizedStatus.slice(1);
            const statusClass =
              normalizedStatus === 'suspended'
                ? 'bg-amber-100 text-amber-800'
                : normalizedStatus === 'inactive'
                  ? 'bg-gray-100 text-gray-800'
                  : normalizedStatus === 'pending'
                    ? 'bg-indigo-100 text-indigo-800'
                    : 'bg-emerald-100 text-emerald-800';
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
                  <span className={`ml-auto inline-flex rounded-full px-3 py-1 text-xs font-semibold ${statusClass}`}>{statusLabel}</span>
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
      </article>

      <article className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <div>
            <p className="text-xs uppercase tracking-widest text-gray-500">Request log</p>
            {orderedHistory.length > requestPreview.length && (
              <p className="text-xs text-gray-500">Showing {requestPreview.length} of {orderedHistory.length}</p>
            )}
          </div>
          <button
            type="button"
            onClick={handleRefreshStats}
            disabled={piAuthState === 'authenticating' || historyLoading}
            title="Refresh request log"
            className="ml-auto rounded-full border border-gray-200 p-3 text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {historyLoading ? <FiLoader className="h-5 w-5 animate-spin" /> : <FiRefreshCw className="h-5 w-5" />}
          </button>
        </div>
        <div className="mt-3 space-y-3">
          {piAuthState === 'error' && <p className="text-sm text-red-600">{piAuthError ?? 'Unable to sync Pi session. Reload to try again.'}</p>}
          {piAuthState !== 'error' && (!piToken || historyLoading) && (
            <p className="text-sm text-gray-500">{!piToken ? 'Syncing your Pi session…' : 'Refreshing activity…'}</p>
          )}
          {piAuthState !== 'error' && piToken && !historyLoading && historyError && (
            <p className="text-sm text-red-600">{historyError}</p>
          )}
          {piAuthState !== 'error' && piToken && !historyLoading && !historyError && orderedHistory.length === 0 && (
            <p className="text-sm text-gray-600">No requests yet. Submit a form below to get started.</p>
          )}
          {piAuthState !== 'error' && piToken && !historyLoading && !historyError && orderedHistory.length > 0 &&
            requestPreview.map((request) => {
              const status = statusStyles[request.status] ?? statusStyles.requested;
              return (
                <div key={request.id ?? request.createdAt} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{summarizeRequest(request)}</p>
                      <p className="text-xs text-gray-500">{formatDateTime(request.createdAt)}</p>
                    </div>
                    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${status.className}`}>{status.label}</span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-4 text-xs text-gray-500">
                    <span className="inline-flex items-center gap-1">
                      <FiChevronRight className="h-3 w-3" /> {request.requestType.replace('_', ' ')}
                    </span>
                    <span>App ID: {request.developerAppId ?? '—'}</span>
                  </div>
                </div>
              );
            })}
        </div>
      </article>

      <section className="space-y-6">
        <article className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <span className="mt-1 text-lg" style={{ color: PRIMARY_COLOR }}><MdAppRegistration /></span>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Create or update developer app</h2>
              <p className="mt-1 text-sm text-gray-600">
                Provide the details we need to onboard a new app or update allowed origins, callback URLs, or metadata for an existing one.
              </p>
            </div>
          </div>
          <form className="mt-4 space-y-4" onSubmit={handleSubmitAppRequest}>
            <div className="flex gap-3 text-sm font-medium text-gray-700">
              <label className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  name="app-mode"
                  value="create_app"
                  checked={createMode === 'create_app'}
                  onChange={() => setCreateMode('create_app')}
                  className="text-[var(--default-primary-color)]"
                />
                Create new app
              </label>
              <label className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  name="app-mode"
                  value="update_app"
                  checked={createMode === 'update_app'}
                  onChange={() => setCreateMode('update_app')}
                  className="text-[var(--default-primary-color)]"
                />
                Update existing app
              </label>
            </div>

            {createMode === 'update_app' && (
              <div>
                <label className="text-sm font-medium text-gray-700">Developer App ID *</label>
                <input
                  type="text"
                  value={createForm.developerAppId}
                  onChange={(event) => setCreateForm((prev) => ({ ...prev, developerAppId: event.target.value }))}
                  placeholder="app_123abc"
                  className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-[var(--default-primary-color)] focus:outline-none"
                  disabled={isFormDisabled}
                />
              </div>
            )}

            <div>
              <label className="text-sm font-medium text-gray-700">App name *</label>
              <input
                type="text"
                value={createForm.appName}
                onChange={(event) => setCreateForm((prev) => ({ ...prev, appName: event.target.value }))}
                placeholder="Pi Commerce"
                className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-[var(--default-primary-color)] focus:outline-none"
                disabled={isFormDisabled}
              />
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700">Description / notes</label>
              <textarea
                value={createForm.description}
                onChange={(event) => setCreateForm((prev) => ({ ...prev, description: event.target.value }))}
                rows={3}
                className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-[var(--default-primary-color)] focus:outline-none"
                placeholder="Tell us about the Pi experience you are building."
                disabled={isFormDisabled}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="text-sm font-medium text-gray-700">Contact email</label>
                <input
                  type="email"
                  value={createForm.contactEmail}
                  onChange={(event) => setCreateForm((prev) => ({ ...prev, contactEmail: event.target.value }))}
                  placeholder="you@pi.com"
                  className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-[var(--default-primary-color)] focus:outline-none"
                  disabled={isFormDisabled}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Notes for EscrowPi</label>
                <input
                  type="text"
                  value={createForm.notes}
                  onChange={(event) => setCreateForm((prev) => ({ ...prev, notes: event.target.value }))}
                  placeholder="Timeline, test accounts, etc."
                  className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-[var(--default-primary-color)] focus:outline-none"
                  disabled={isFormDisabled}
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700">Allowed origins (one per line)</label>
              <textarea
                value={createForm.allowedOrigins}
                onChange={(event) => setCreateForm((prev) => ({ ...prev, allowedOrigins: event.target.value }))}
                rows={2}
                className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-[var(--default-primary-color)] focus:outline-none"
                placeholder={'https://merchant.one\nhttps://merchant.two'}
                disabled={isFormDisabled}
              />
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700">Callback URLs (one per line)</label>
              <textarea
                value={createForm.callbackUrls}
                onChange={(event) => setCreateForm((prev) => ({ ...prev, callbackUrls: event.target.value }))}
                rows={2}
                className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-[var(--default-primary-color)] focus:outline-none"
                placeholder={'https://merchant.one/api/escrowpi/return'}
                disabled={isFormDisabled}
              />
            </div>

            <button
              type="submit"
              disabled={isFormDisabled || submitting.app || piAuthState === 'authenticating'}
              className="inline-flex w-full items-center justify-center rounded-full px-4 py-2 text-sm font-semibold text-white shadow-sm focus:outline-none disabled:cursor-not-allowed disabled:opacity-70"
              style={{ backgroundColor: PRIMARY_COLOR }}
            >
              {submitting.app ? 'Submitting…' : 'Submit request'}
            </button>
          </form>
        </article>

        <article className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <span className="mt-1 text-lg" style={{ color: SECONDARY_COLOR }}><FiRefreshCw /></span>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Rotate developer API key</h2>
              <p className="mt-1 text-sm text-gray-600">
                Lost or compromised a key? Submit a rotation request so we can verify ownership and re-issue credentials.
              </p>
            </div>
          </div>
          <form className="mt-4 space-y-4" onSubmit={handleSubmitRotateRequest}>
            <div>
              <label className="text-sm font-medium text-gray-700">Developer App ID *</label>
              <input
                type="text"
                value={rotateForm.developerAppId}
                onChange={(event) => setRotateForm((prev) => ({ ...prev, developerAppId: event.target.value }))}
                placeholder="app_123abc"
                className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-[var(--default-primary-color)] focus:outline-none"
                disabled={isFormDisabled}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Reason *</label>
              <textarea
                value={rotateForm.reason}
                onChange={(event) => setRotateForm((prev) => ({ ...prev, reason: event.target.value }))}
                rows={3}
                className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-[var(--default-primary-color)] focus:outline-none"
                placeholder="Example: suspected leak, rotating as part of quarterly security practice, etc."
                disabled={isFormDisabled}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Urgency</label>
              <input
                type="text"
                value={rotateForm.urgency}
                onChange={(event) => setRotateForm((prev) => ({ ...prev, urgency: event.target.value }))}
                placeholder="Immediate / within 24h / routine"
                className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-[var(--default-primary-color)] focus:outline-none"
                disabled={isFormDisabled}
              />
            </div>
            <button
              type="submit"
              disabled={isFormDisabled || submitting.rotate || piAuthState === 'authenticating'}
              className="inline-flex w-full items-center justify-center rounded-full px-4 py-2 text-sm font-semibold text-white shadow-sm focus:outline-none disabled:cursor-not-allowed disabled:opacity-70"
              style={{ backgroundColor: SECONDARY_COLOR }}
            >
              {submitting.rotate ? 'Submitting…' : 'Request rotation'}
            </button>
          </form>
        </article>
      </section>

      <section
        className="rounded-2xl p-5 border"
        style={{
          borderColor: `${PRIMARY_COLOR}33`,
          background: `linear-gradient(135deg, ${PRIMARY_COLOR}1a 0%, #ffffff 60%)`,
        }}
      >
        <h2 className="text-lg font-semibold text-gray-900">Documentation &amp; Tools</h2>
        <p className="mt-1 text-sm text-gray-600">
          Use these resources to understand the EscrowPi flow, configure pay buttons, and verify payloads.
        </p>
        <div className="mt-4 grid gap-3">
          <Link
            href={DEVELOPER_GUIDE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-900"
            style={{ borderColor: `${PRIMARY_COLOR}33` }}
          >
            <span>Developer Guide</span>
            <FiExternalLink size={18} style={{ color: PRIMARY_COLOR }} />
          </Link>
          <Link
            href={SWAGGER_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-900"
            style={{ borderColor: `${PRIMARY_COLOR}33` }}
          >
            <span>Swagger / OpenAPI</span>
            <FiExternalLink size={18} style={{ color: PRIMARY_COLOR }} />
          </Link>
        </div>
      </section>

      <footer className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-5 text-center text-sm text-gray-600">
        Need something else? Email{' '}
        <a className="font-medium" style={{ color: PRIMARY_COLOR }} href={`mailto:${CONTACT_EMAIL}`}>
          {CONTACT_EMAIL}
        </a>{' '}
        and our team will follow up.
      </footer>
    </section>
  );
}
