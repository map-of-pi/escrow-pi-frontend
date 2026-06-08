"use client";

import Link from 'next/link';
import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import { FiChevronDown, FiChevronRight, FiLoader, FiRefreshCw, FiShield } from 'react-icons/fi';

import { AppContext } from '@/context/AppContextProvider';
import { fetchAdminDeveloperRequests, updateAdminDeveloperRequest } from '@/services/adminApi';
import { DeveloperRequestRecord, DeveloperRequestStatus } from '@/services/developerRequests';
import {
  formatDateTime,
  formatFieldLabel,
  formatFieldValue,
  REQUEST_ACTION_CONFIG,
  REQUEST_STATUS_ACTIONS,
  REQUEST_STATUS_STYLES,
  summarizeRequest,
  recordTimestamp,
} from '../requestUtils';
import { ADMIN_ACCENT_COLOR, ADMIN_PAGE_BACKGROUND, ADMIN_PRIMARY_COLOR, ADMIN_SURFACE_STYLE } from '../theme';

type PiAuthState = 'idle' | 'authenticating' | 'ready' | 'error';

const describeError = (err: any) => {
  const message = err?.response?.data?.message ?? err?.message;
  if (typeof message === 'string' && message.trim().length) {
    return message.trim();
  }
  return 'Something went wrong. Please retry.';
};

export default function AdminSecurityRequestsPage() {
  const {
    currentUser,
    piAccessToken: contextPiToken,
    setPiAccessToken,
    authenticateWithPi: contextAuthenticateWithPi,
  } = useContext(AppContext);

  const [piToken, setPiToken] = useState<string | null>(contextPiToken ?? null);
  const [piAuthState, setPiAuthState] = useState<PiAuthState>(contextPiToken ? 'ready' : 'idle');
  const [piAuthError, setPiAuthError] = useState<string | null>(null);

  const [requests, setRequests] = useState<DeveloperRequestRecord[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [requestsError, setRequestsError] = useState<string | null>(null);
  const [requestActionLoading, setRequestActionLoading] = useState<string | null>(null);
  const [expandedRequestIds, setExpandedRequestIds] = useState<Set<string>>(new Set());
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [requestFilterMode, setRequestFilterMode] = useState<'active' | 'all'>('all');

  const isAdmin = currentUser?.isAdmin === true;

  const authenticateWithPi = useCallback(async (): Promise<string> => {
    setPiAuthState('authenticating');
    setPiAuthError(null);
    try {
      const pioneerAuth = await contextAuthenticateWithPi();
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
  }, [contextAuthenticateWithPi, setPiAccessToken]);

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

  const refreshSecurityRequests = useCallback(
    async (mode: 'active' | 'all') => {
      setRequestsLoading(true);
      setRequestsError(null);
      try {
        const token = await ensurePiToken();
        if (!token) {
          return;
        }
        const params: { limit: number; status?: string; requestType: 'rotate_api_key' } = { limit: 200, requestType: 'rotate_api_key' };
        if (mode === 'active') {
          params.status = 'requested,in_progress';
        }
        const records = await fetchAdminDeveloperRequests(params, token);
        const sorted = [...records].sort((a, b) => recordTimestamp(b) - recordTimestamp(a));
        setRequests(sorted);
        setNoteDrafts((prev) => {
          const next: Record<string, string> = {};
          sorted.forEach((request) => {
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
    },
    [ensurePiToken]
  );

  const handleRefreshRequests = useCallback(() => {
    refreshSecurityRequests(requestFilterMode);
  }, [refreshSecurityRequests, requestFilterMode]);

  const toggleRequestFilterMode = useCallback(() => {
    const nextMode: 'active' | 'all' = requestFilterMode === 'active' ? 'all' : 'active';
    setRequestFilterMode(nextMode);
    refreshSecurityRequests(nextMode);
  }, [requestFilterMode, refreshSecurityRequests]);

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
      refreshSecurityRequests(requestFilterMode);
    }
  }, [piToken, requestFilterMode, refreshSecurityRequests]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const { body, documentElement } = document;
    const previousBodyBackground = body.style.background;
    const previousHtmlBackground = documentElement.style.background;
    body.style.background = ADMIN_PAGE_BACKGROUND;
    documentElement.style.background = ADMIN_PAGE_BACKGROUND;
    return () => {
      body.style.background = previousBodyBackground;
      documentElement.style.background = previousHtmlBackground;
    };
  }, []);

  const toggleExpansion = useCallback((requestId: string | null) => {
    if (!requestId) return;
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
        setRequests((prev) => prev.map((req) => (req.id === updated.id ? updated : req)));
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
        setRequests((prev) => prev.map((req) => (req.id === updated.id ? updated : req)));
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

  const requestSummaryText = useMemo(() => {
    const scopeDescriptor = requestFilterMode === 'active' ? 'active security requests' : 'security requests';
    if (requests.length === 0) {
      return `No ${scopeDescriptor} yet.`;
    }
    return `Showing ${requests.length} ${scopeDescriptor}.`;
  }, [requestFilterMode, requests.length]);

  const renderRequestCard = useCallback(
    (request: DeveloperRequestRecord, index: number) => {
      const requestId = request.id ?? null;
      const isExpanded = requestId ? expandedRequestIds.has(requestId) : false;
      const statusStyle = REQUEST_STATUS_STYLES[request.status];
      const noteDraft = requestId ? noteDrafts[requestId] ?? request.adminNotes ?? '' : request.adminNotes ?? '';
      const actionLoading = requestActionLoading === requestId;
      const key = request.id ?? `${request.requestType}-${index}`;
      const requestActions = REQUEST_STATUS_ACTIONS[request.status] ?? [];

      const formEntries = Object.entries(request.formData ?? {}).filter(([key]) => key !== 'callbackUrls');

      return (
        <div key={key} className="rounded-2xl border p-4 shadow-sm" style={ADMIN_SURFACE_STYLE}>
          <button
            type="button"
            onClick={() => toggleExpansion(requestId)}
            className="flex w-full flex-wrap items-center gap-3 text-left sm:flex-nowrap"
            disabled={!requestId}
          >
            <div className="min-w-0 flex-1">
              <p className="break-words text-sm font-semibold text-gray-900">{summarizeRequest(request)}</p>
              <p className="text-xs text-gray-500">
                {request.piUsername ?? 'Unknown pioneer'} · Created {formatDateTime(request.createdAt)}
              </p>
            </div>
            <span className={`inline-flex shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${statusStyle.className}`}>
              {statusStyle.label}
            </span>
            <span className="text-gray-400">{isExpanded ? <FiChevronDown /> : <FiChevronRight />}</span>
          </button>
          {isExpanded && (
            <div className="mt-4 space-y-4 text-sm text-gray-700">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-xs uppercase tracking-widest text-gray-500">Pi UID</p>
                  <p className="break-all font-medium text-gray-900">{request.piUid ?? '—'}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-widest text-gray-500">App ID</p>
                  <p className="break-all font-medium text-gray-900">{request.developerAppId ?? '—'}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-widest text-gray-500">Updated</p>
                  <p className="font-medium text-gray-900">{formatDateTime(request.updatedAt)}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-widest text-gray-500">Handled by</p>
                  <p className="break-words font-medium text-gray-900">{request.handledBy ?? 'Unassigned'}</p>
                </div>
              </div>
              {formEntries.length > 0 && (
                <div className="space-y-2 rounded-xl bg-gray-50 p-3">
                  {formEntries.map(([entryKey, value]) => (
                    <div key={entryKey}>
                      <p className="text-xs uppercase tracking-widest text-gray-500">{formatFieldLabel(entryKey)}</p>
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
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-[#1f3c88] focus:outline-none focus:ring-2 focus:ring-[#1f3c88]/20"
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
                    {requestActions.map((target) => {
                      const config = REQUEST_ACTION_CONFIG[target];
                      return (
                        <button
                          key={target}
                          type="button"
                          onClick={() => handleSetRequestStatus(requestId, target)}
                          disabled={actionLoading}
                          className={`rounded-full px-3 py-1.5 font-semibold disabled:cursor-not-allowed disabled:opacity-60 ${config.className}`}
                        >
                          {config.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      );
    },
    [expandedRequestIds, handleNoteChange, handleSaveNotes, handleSetRequestStatus, noteDrafts, requestActionLoading, toggleExpansion]
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
    <div className="min-h-screen" style={{ background: ADMIN_PAGE_BACKGROUND }}>
      <section className="mx-auto flex w-full max-w-5xl flex-col gap-6 py-6">
        <header className="space-y-3">
          <p className="text-xs uppercase tracking-[0.3em]" style={{ color: ADMIN_ACCENT_COLOR }}>EscrowPi Admin Console</p>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="flex-1 text-3xl font-semibold text-gray-900">API key security requests</h1>
            <Link
              href="/admin"
              className="rounded-full border border-gray-200 bg-white px-4 py-1.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
            >
              Back to dashboard
            </Link>
          </div>
          <p className="text-sm text-gray-600">Browse every rotation request, leave notes, and approve or reject credentials.</p>
        </header>

        <article className="rounded-2xl border p-5 shadow-sm" style={ADMIN_SURFACE_STYLE}>
          <div className="flex items-center gap-3">
            <div>
              <p className="text-xs uppercase tracking-widest" style={{ color: ADMIN_PRIMARY_COLOR }}>API key rotations</p>
              <h2 className="text-xl font-semibold text-gray-900">Full security log</h2>
            </div>
            <button
              type="button"
              onClick={handleRefreshRequests}
              disabled={requestsLoading}
              title="Refresh security requests"
              className="ml-auto rounded-full border border-gray-200 p-3 text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {requestsLoading ? <FiLoader className="h-5 w-5 animate-spin" /> : <FiRefreshCw className="h-5 w-5" />}
            </button>
          </div>
          <p className="mt-2 text-sm text-gray-600">Expand any request to review Pi IDs, reason for rotation, and admin notes.</p>
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={toggleRequestFilterMode}
              className="rounded-full border border-gray-200 px-4 py-1.5 text-xs font-semibold text-[var(--default-primary-color)] transition hover:bg-gray-50"
            >
              {requestFilterMode === 'active' ? 'Show all' : 'Show active'}
            </button>
          </div>
          {requestsError && <p className="mt-3 text-sm text-red-600">{requestsError}</p>}
          {!requestsError && requests.length === 0 && !requestsLoading && (
            <p className="mt-4 text-sm text-gray-500">No security requests yet.</p>
          )}
          {requestsLoading && (
            <p className="mt-4 text-sm text-gray-500">Refreshing security requests…</p>
          )}
          <div className="mt-4 space-y-3">
            {requests.map((request, index) => renderRequestCard(request, index))}
          </div>
          <p className="mt-4 text-xs text-gray-500">{requestSummaryText}</p>
        </article>
      </section>
    </div>
  );
}
