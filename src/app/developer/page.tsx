"use client";

import { FormEvent, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'react-toastify';
import { FiChevronDown, FiChevronRight, FiExternalLink, FiLoader, FiRefreshCw } from 'react-icons/fi';
import { MdAppRegistration } from 'react-icons/md';

import { onIncompletePaymentFound } from '@/config/payment';
import { AppContext } from '@/context/AppContextProvider';
import ConfirmDialog from '@/components/ConfirmDialog';
import {
  DeveloperRequestRecord,
  DeveloperRequestStatus,
  DeveloperRequestType,
  fetchDeveloperRequests,
  revealDeveloperCredential,
  submitDeveloperRequest,
} from '@/services/developerRequests';
import { DeveloperAppRecord, fetchDeveloperApps } from '@/services/developerApps';
import {
  formatDateTime,
  formatRequestFieldLabel,
  formatRequestFieldValue,
  recordTimestamp,
  statusStyles,
  summarizeRequest,
} from './requestUtils';

const DOC_ENV = process.env.NEXT_PUBLIC_DOC_ENV ?? 'dev';
const DOC_BASE = `https://escrowpi-doc-${DOC_ENV}.vercel.app`;
const SWAGGER_URL = `${DOC_BASE}/api-docs_`;
const DEVELOPER_GUIDE_URL = `${DOC_BASE}/developer-guide`;
const CONTACT_EMAIL = 'philip@mapofpi.com';

const PRIMARY_COLOR = 'var(--default-primary-color)';
const SECONDARY_COLOR = 'var(--default-secondary-color)';

type AppRequestMode = 'create_app' | 'update_app';
type PiAuthState = 'idle' | 'authenticating' | 'ready' | 'error';

type CredentialRevealState = {
  apiKey?: string;
  revealedAt: string;
};

type PiWindow = Window & {
  Pi?: any;
};

type AppInsight = {
  app: DeveloperAppRecord;
  lastActivityTs: number;
};

const PI_SDK_SCRIPT_ID = 'escrowpi-dev-portal-pi-sdk';
const THIRTY_DAYS_MS = 1000 * 60 * 60 * 24 * 30;

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

const EMAIL_REGEX_PATTERN = "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$";
const EMAIL_REGEX = new RegExp(EMAIL_REGEX_PATTERN);

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
  const [expandedRequestIds, setExpandedRequestIds] = useState<Set<string>>(new Set());
  const [credentialReveals, setCredentialReveals] = useState<Record<string, CredentialRevealState>>({});
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [hideConfirmRequestId, setHideConfirmRequestId] = useState<string | null>(null);
  const [revealLoading, setRevealLoading] = useState<Record<string, boolean>>({});
  const [appsLoading, setAppsLoading] = useState(false);
  const [appsError, setAppsError] = useState<string | null>(null);
  const [createMode, setCreateMode] = useState<AppRequestMode>('create_app');
  const [createForm, setCreateForm] = useState({
    developerAppId: '',
    appName: '',
    description: '',
    contactEmail: '',
    allowedOrigins: '',
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

  const loadRequestHistory = useCallback(
    async (tokenOverride?: string | null) => {
      const token = tokenOverride ?? piToken;
      if (!token) {
        return;
      }
      setHistoryLoading(true);
      setHistoryError(null);
      try {
        const records = await fetchDeveloperRequests({}, token);
        setRequestHistory(records);
      } catch (err) {
        const message = describeError(err);
        setHistoryError(message);
        toast.error(message);
      } finally {
        setHistoryLoading(false);
      }
    },
    [piToken]
  );

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
        setRequestHistory((prev) =>
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
        const message = describeError(err);
        toast.error(message);
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
      loadDeveloperApps();
    }
  }, [piToken, loadDeveloperApps]);

  useEffect(() => {
    if (piToken) {
      loadRequestHistory(piToken);
    }
  }, [piToken, loadRequestHistory]);

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
  const appPreview = useMemo<DeveloperAppRecord[]>(() => appInsights.slice(0, 3).map((entry) => entry.app), [appInsights]);
  const requestPreviewList = useMemo<DeveloperRequestRecord[]>(() => orderedHistory.slice(0, 3), [orderedHistory]);
  const hiddenAppCount = Math.max(appInsights.length - appPreview.length, 0);
  const developerAppOptions = useMemo(
    () =>
      developerApps.map((app) => ({
        appId: app.appId,
        label: app.name ? `${app.name} (${app.appId})` : app.appId,
      })),
    [developerApps]
  );

  const appSummaryText = useMemo(() => {
    if (appInsights.length === 0) {
      return 'No developer apps yet.';
    }
    if (hiddenAppCount === 0) {
      return `Showing all ${appInsights.length} apps.`;
    }
    return `Showing ${appPreview.length} of ${appInsights.length} apps.`;
  }, [appInsights.length, hiddenAppCount, appPreview.length]);

  const totalRequestCount = orderedHistory.length;
  const hasRequestData = totalRequestCount > 0;
  const requestSummaryText = useMemo(() => {
    if (totalRequestCount === 0) {
      return 'No developer requests yet.';
    }
    if (totalRequestCount <= 3) {
      return `Showing all ${totalRequestCount} requests.`;
    }
    return `Showing the latest 3 of ${totalRequestCount} total requests.`;
  }, [totalRequestCount]);
  const isFormDisabled = !currentUser;

  const handleRefreshStats = useCallback(() => {
    if (!piToken) {
      authenticateWithPi().catch(() => {});
      return;
    }
    loadRequestHistory(piToken);
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

  const handleSubmitAppRequest = async (event: FormEvent) => {
    event.preventDefault();
    if (isFormDisabled) {
      toast.error('Sign in with EscrowPi (top right) before submitting a request.');
      return;
    }

    const isCreateFlow = createMode === 'create_app';
    const trimmedAppName = createForm.appName.trim();
    const trimmedDescription = createForm.description.trim();
    const trimmedContactEmail = createForm.contactEmail.trim();
    const trimmedNotes = createForm.notes.trim();
    const trimmedDeveloperAppId = createForm.developerAppId.trim();

    if (isCreateFlow && !trimmedAppName) {
      toast.error('App name is required to create a new developer app.');
      return;
    }

    if (isCreateFlow && !trimmedContactEmail) {
      toast.error('Contact email is required to create a new developer app.');
      return;
    }

    if (trimmedContactEmail && !EMAIL_REGEX.test(trimmedContactEmail)) {
      toast.error('Enter a valid contact email (example: founder@merchant.com).');
      return;
    }

    if (!isCreateFlow && !trimmedDeveloperAppId) {
      toast.error('Select the developer app you want to update.');
      return;
    }
    try {
      setSubmitting((prev) => ({ ...prev, app: true }));
      const token = await ensurePiToken();
      const payload: { requestType: DeveloperRequestType; developerAppId?: string; formData: Record<string, any> } = {
        requestType: createMode,
        formData: {
          appName: trimmedAppName || undefined,
          description: trimmedDescription || undefined,
          contactEmail: trimmedContactEmail || undefined,
          notes: trimmedNotes || undefined,
        },
      };

      if (createMode === 'update_app') {
        payload.developerAppId = trimmedDeveloperAppId;
      }

      const allowedOrigins = parseListInput(createForm.allowedOrigins);
      if (allowedOrigins.length) {
        payload.formData.allowedOrigins = allowedOrigins;
      }

      await submitDeveloperRequest(payload, token);
      toast.success('Request submitted. Our team will review this request shortly.');
      setCreateForm({
        developerAppId: '',
        appName: '',
        description: '',
        contactEmail: '',
        allowedOrigins: '',
        notes: '',
      });
      loadRequestHistory(token);
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
      toast.success('Rotation request submitted. Our team will review this request shortly.');
      setRotateForm({ developerAppId: '', reason: '', urgency: '' });
      loadRequestHistory(token);
      loadDeveloperApps();
    } catch (err) {
      const message = describeError(err);
      toast.error(message);
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
        <div className="mt-4 space-y-3">
          {appPreview.map((app) => {
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
        <div className="mt-4 flex items-center justify-between text-xs text-gray-500">
          <span>{appSummaryText}</span>
          <Link
            href="/developer/apps"
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
            <p className="text-xs uppercase tracking-widest text-gray-500">Developer App requests</p>
            <h2 className="text-xl font-semibold text-gray-900">Recent EscrowPi requests</h2>
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
        <p className="mt-2 text-sm text-gray-600">Monitor the latest submissions tied to your Pi identity.</p>
        <div className="mt-3 space-y-3">
          {piAuthState === 'error' && <p className="text-sm text-red-600">{piAuthError ?? 'Unable to sync Pi session. Reload to try again.'}</p>}
          {piAuthState !== 'error' && !piToken && <p className="text-sm text-gray-500">Syncing your Pi session…</p>}
          {piAuthState !== 'error' && piToken && historyLoading && (
            <p className="text-sm text-gray-500">Refreshing activity…</p>
          )}
          {piAuthState !== 'error' && piToken && !historyLoading && historyError && (
            <p className="text-sm text-red-600">{historyError}</p>
          )}
          {piAuthState !== 'error' && piToken && !historyLoading && !historyError && !hasRequestData && (
            <p className="text-sm text-gray-600">No requests yet. Submit a form below to get started.</p>
          )}
          {piAuthState !== 'error' && piToken && !historyError && hasRequestData &&
            requestPreviewList.map((request: DeveloperRequestRecord, index: number) => {
              const status = statusStyles[request.status] ?? statusStyles.requested;
              const fallbackId = `${request.requestType}-${request.developerAppId ?? 'unknown'}-${request.createdAt ?? index}`;
              const requestId = request.id ?? fallbackId;
              const isExpanded = requestId ? expandedRequestIds.has(requestId) : false;
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
                    onClick={() => toggleRequestExpansion(requestId)}
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
        <div className="mt-4 flex items-center justify-between text-xs text-gray-500">
          <span>{requestSummaryText}</span>
          <Link
            href="/developer/requests"
            className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--default-primary-color)]"
          >
            View all requests
            <FiChevronRight className="h-4 w-4" />
          </Link>
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
                <label className="text-sm font-medium text-gray-700">Developer App *</label>
                {developerAppOptions.length > 0 ? (
                  <select
                    value={createForm.developerAppId}
                    onChange={(event) => setCreateForm((prev) => ({ ...prev, developerAppId: event.target.value }))}
                    className="mt-2 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-[var(--default-primary-color)] focus:outline-none"
                    disabled={isFormDisabled}
                  >
                    <option value="">Select a developer app</option>
                    {developerAppOptions.map((option) => (
                      <option key={option.appId} value={option.appId}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="mt-2 rounded-xl border border-dashed border-gray-300 px-3 py-2 text-sm text-gray-500">
                    No developer apps found. Create an app first, then submit an update.
                  </p>
                )}
              </div>
            )}

            <div>
              <label className="text-sm font-medium text-gray-700">
                App name
                {createMode === 'create_app' && <span className="ml-1 text-red-600">*</span>}
              </label>
              <input
                type="text"
                value={createForm.appName}
                onChange={(event) => setCreateForm((prev) => ({ ...prev, appName: event.target.value }))}
                placeholder="Pi Commerce"
                className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-[var(--default-primary-color)] focus:outline-none"
                disabled={isFormDisabled}
                required={createMode === 'create_app'}
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

            <div>
              <label className="text-sm font-medium text-gray-700">
                Contact email
                {createMode === 'create_app' && <span className="ml-1 text-red-600">*</span>}
              </label>
              <input
                type="email"
                value={createForm.contactEmail}
                onChange={(event) => setCreateForm((prev) => ({ ...prev, contactEmail: event.target.value }))}
                placeholder="you@pi.com"
                className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-[var(--default-primary-color)] focus:outline-none"
                disabled={isFormDisabled}
                required={createMode === 'create_app'}
                pattern={EMAIL_REGEX_PATTERN}
                title="Enter a valid email (example: founder@merchant.com)"
              />
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
              <label className="text-sm font-medium text-gray-700">Notes for EscrowPi</label>
              <textarea
                value={createForm.notes}
                onChange={(event) => setCreateForm((prev) => ({ ...prev, notes: event.target.value }))}
                rows={3}
                className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-[var(--default-primary-color)] focus:outline-none"
                placeholder="Timeline, test accounts, environments, or compliance context."
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
              <label className="text-sm font-medium text-gray-700">Developer App *</label>
              {developerAppOptions.length > 0 ? (
                <select
                  value={rotateForm.developerAppId}
                  onChange={(event) =>
                    setRotateForm((prev) => ({ ...prev, developerAppId: event.target.value }))
                  }
                  className="mt-2 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-[var(--default-primary-color)] focus:outline-none"
                  disabled={isFormDisabled}
                >
                  <option value="">Select a developer app</option>
                  {developerAppOptions.map((option) => (
                    <option key={option.appId} value={option.appId}>
                      {option.label}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="mt-2 rounded-xl border border-dashed border-gray-300 px-3 py-2 text-sm text-gray-500">
                  No developer apps found. Create an app first to request a rotation.
                </p>
              )}
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
