"use client";
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useContext } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import Modal from '@/components/Modal';
import { toast } from 'react-toastify';
import NotificationDialog from '@/components/NotificationDialog';
import { AppContext } from '@/context/AppContextProvider';
import { payWithPi } from '@/config/payment';
import { ActivationInitiationPayload, IUserLookup, OrderTypeEnum, PaymentDataType } from '@/types';
import { createOrder, confirmRequestOrder } from '@/services/orderApi';
import { getNotifications } from '@/services/notificationApi';
import { initiateActivationPayment } from '@/services/activationApi';
import { lookupUserByUsername } from '@/services/userApi';

const describeError = (err: any): string => {
  const message = err?.response?.data?.message ?? err?.message;
  if (typeof message === 'string' && message.trim().length) {
    return message.trim();
  }
  return 'Something went wrong. Please try again.';
};

const normalizePiUsername = (value: string): string => value.trim();
const normalizeUsernameForComparison = (value: string): string => {
  return normalizePiUsername(value).replace(/^@+/, '').toLowerCase();
};

type CounterpartyLookupState =
  | { state: 'idle'; user: null; message?: string }
  | { state: 'checking'; user: null; message?: string }
  | { state: 'found'; user: IUserLookup; message?: string }
  | { state: 'not_found'; user: null; message?: string }
  | { state: 'error'; user: null; message: string };

type CounterpartyStatusTone = 'muted' | 'info' | 'success' | 'warning' | 'error';

type CounterpartyStatusDescriptor = {
  text: string;
  tone: CounterpartyStatusTone;
};

const COUNTERPARTY_TONE_CLASSES: Record<CounterpartyStatusTone, string> = {
  muted: 'text-gray-500',
  info: 'text-sky-600',
  success: 'text-emerald-600',
  warning: 'text-amber-600',
  error: 'text-rose-600',
};

function Splash() {
  return (
    <div className="flex flex-col items-center justify-start h-screen pt-24">
      <Image src="/escrow-pi-splash-logo.png" alt="EscrowPi" width={180} height={180} priority />
    </div>
  );
}

export default function HomePage() {
  // Always start as loading on server and first client render to avoid hydration mismatch
  const { currentUser, setIsSaveLoading, isSaveLoading, isSigningInUser, autoLoginUser } = useContext(AppContext);
  const [loading, setLoading] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    try {
      const url = new URL(window.location.href);
      const skipSplash = url.searchParams.get('skipSplash') === '1';
      const visited = window.sessionStorage.getItem('visitedHome');
      return !(skipSplash || visited);
    } catch {
      return true;
    }
  });
  const [counterparty, setCounterparty] = useState('');
  const [details, setDetails] = useState('');
  const [amount, setAmount] = useState<number | ''>(66);
  const [amountInput, setAmountInput] = useState<string>('1.0');
  const [modalAmount, setModalAmount] = useState<number | ''>('');
  const [showSend, setShowSend] = useState(false);
  const [showRequest, setShowRequest] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [orderNo, setOrderNo] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [showNotificationPopup, setShowNotificationPopup] = useState(false);
  const [activationModalOpen, setActivationModalOpen] = useState(false);
  const [activationPayload, setActivationPayload] = useState<ActivationInitiationPayload | null>(null);
  const [activationLoading, setActivationLoading] = useState(false);
  const [activationSubmitting, setActivationSubmitting] = useState(false);
  const [counterpartyLookup, setCounterpartyLookup] = useState<CounterpartyLookupState>({ state: 'idle', user: null });
  const counterpartyLookupTimeout = useRef<number | null>(null);
  const lastKnownActivationStatusRef = useRef<boolean | null>(currentUser?.isActive ?? null);
  const normalizedCounterparty = useMemo(() => normalizePiUsername(counterparty).replace(/^@/, ''), [counterparty]);
  const normalizedCounterpartyForComparison = useMemo(
    () => normalizeUsernameForComparison(counterparty),
    [counterparty]
  );
  const normalizedCurrentUserUsername = useMemo(
    () => normalizeUsernameForComparison(currentUser?.pi_username ?? ''),
    [currentUser?.pi_username]
  );
  const counterpartyStatus = useMemo<CounterpartyStatusDescriptor>(() => {
    if (!normalizedCounterparty) {
      return { text: 'Enter an active payer/payee Pi username', tone: 'muted' };
    }
    if (
      normalizedCounterpartyForComparison &&
      normalizedCurrentUserUsername &&
      normalizedCounterpartyForComparison === normalizedCurrentUserUsername
    ) {
      return { text: 'You cannot create an EscrowPi transaction with yourself.', tone: 'warning' };
    }
    switch (counterpartyLookup.state) {
      case 'checking':
        return { text: 'Checking status of Pi username…', tone: 'info' };
      case 'not_found':
        return { text: 'User not registred with EscrowPi yet.', tone: 'warning' };
      case 'error':
        return { text: counterpartyLookup.message ?? 'Unable to verify Pioneer.', tone: 'error' };
      case 'found':
        return counterpartyLookup.user?.isActive
          ? { text: `@${counterpartyLookup.user.pi_username} is ready for EscrowPi transaction.`, tone: 'success' }
          : { text: `@${counterpartyLookup.user.pi_username} must activate their EscrowPi account.`, tone: 'warning' };
      default:
        return { text: 'Enter an active payer/payee Pi username', tone: 'muted' };
    }
  }, [normalizedCounterparty, counterpartyLookup, normalizedCounterpartyForComparison, normalizedCurrentUserUsername]);

  const counterpartyStatusIcon = useMemo(() => {
    switch (counterpartyStatus.tone) {
      case 'success':
        return '✅';
      case 'info':
        return 'ℹ️';
      case 'warning':
        return '⚠️';
      case 'error':
        return '⛔';
      default:
        return '👤';
    }
  }, [counterpartyStatus]);

  // Decide splash behavior before paint to minimize flash and keep SSR/CSR consistent
  useLayoutEffect(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    const skipSplash = url.searchParams.get('skipSplash') === '1';
    const visited = window.sessionStorage.getItem('visitedHome');
    if (visited || skipSplash) {
      setLoading(false);
      try { window.sessionStorage.setItem('visitedHome', '1'); } catch {}
      // Notify navbar/app that we're ready immediately
      try { window.dispatchEvent(new Event('escrowpi:ready')); } catch {}
      // If skipSplash param is present, remove it from the URL without reloading
      if (skipSplash && typeof window.history?.replaceState === 'function') {
        url.searchParams.delete('skipSplash');
        window.history.replaceState({}, '', url.pathname + (url.search ? '?' + url.search : '') + url.hash);
      }
      return;
    }
    const t = window.setTimeout(() => {
      setLoading(false);
      try { window.sessionStorage.setItem('visitedHome', '1'); } catch {}
      // Notify navbar/app that splash is done
      try { window.dispatchEvent(new Event('escrowpi:ready')); } catch {}
    }, 1200);
    return () => window.clearTimeout(t);
  }, []);

  // Ensure client-only rendering to avoid any SSR/CSR tree mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const previousStatus = lastKnownActivationStatusRef.current;
    const currentStatus = currentUser?.isActive ?? null;

    if (previousStatus === false && currentStatus === true) {
      toast.success('Account activation completed. You can now use EscrowPi.');
    }

    lastKnownActivationStatusRef.current = currentStatus;
  }, [currentUser?.isActive]);

  // Check for uncleared notifications and show dialog once per session
  useEffect(() => {
    const checkUncleared = async () => {
      try {
        if (!currentUser?.pi_uid) { setShowNotificationPopup(false); return; }
        // If user navigated back to home from internal pages, do not show popup
        const cameFromInternal = typeof window !== 'undefined' && window.sessionStorage.getItem('escrowpi:cameFromInternalNav') === '1';
        if (cameFromInternal) { setShowNotificationPopup(false); return; }
        // Avoid re-showing within this session
        const hasShown = typeof window !== 'undefined' && window.sessionStorage.getItem('escrowpi:notificationShown') === '1';
        if (hasShown) { setShowNotificationPopup(false); return; }
        const res = await getNotifications({ pi_uid: currentUser.pi_uid, skip: 0, limit: 0, status: 'uncleared' });
        if (Array.isArray(res) && res.length > 0) {
          setShowNotificationPopup(true);
        } else {
          setShowNotificationPopup(false);
        }
      } catch {
        setShowNotificationPopup(false);
      }
    };

    // Only check after splash is gone to avoid stacking overlays
    if (!loading) {
      checkUncleared();
    }
  }, [currentUser?.pi_uid, loading]);

  useEffect(() => {
    if (counterpartyLookupTimeout.current) {
      clearTimeout(counterpartyLookupTimeout.current);
      counterpartyLookupTimeout.current = null;
    }

    if (!normalizedCounterparty) {
      setCounterpartyLookup({ state: 'idle', user: null });
      return;
    }

    setCounterpartyLookup({ state: 'checking', user: null });
    counterpartyLookupTimeout.current = window.setTimeout(async () => {
      try {
        const user = await lookupUserByUsername(normalizedCounterparty);
        setCounterpartyLookup({ state: 'found', user });
      } catch (err: any) {
        if (err?.response?.status === 404) {
          setCounterpartyLookup({ state: 'not_found', user: null });
          return;
        }
        setCounterpartyLookup({ state: 'error', user: null, message: describeError(err) });
      }
    }, 450);

    return () => {
      if (counterpartyLookupTimeout.current) {
        clearTimeout(counterpartyLookupTimeout.current);
        counterpartyLookupTimeout.current = null;
      }
    };
  }, [counterparty, normalizedCounterparty]);

  // No longer manipulating body attributes; Navbar listens for 'escrowpi:ready'

  const fees = useMemo(() => {
    const base = typeof modalAmount === 'number' ? modalAmount : 0;
    const completionStake = Math.max(base * 0.1, 1);
    const networkFees = 0.02; // As per updated requirement
    const escrowFee = Math.max(base * 0.01, 0.1);
    // Screenshot behavior: total includes completion stake
    const total = base + completionStake + networkFees + escrowFee;
    return { amt: base, completionStake, networkFees, escrowFee, total };
  }, [modalAmount]);

  // Format with up to 7 decimals (round if >7), no trailing zeros
  const fmt = (n: number) => {
    if (!Number.isFinite(n)) return '';
    let s = n.toFixed(7); // ensures rounding to 7 dp max
    if (s.includes('.')) {
      s = s.replace(/0+$/g, ''); // strip trailing zeros
      s = s.replace(/\.$/, ''); // strip trailing dot
    }
    return s;
  };

  // Adaptive font-size for the big amount input so long numbers don't overflow
  const amountFontSize = useMemo(() => {
    const s = String(amountInput ?? '');
    const len = s.length || 1;
    if (len <= 6) return '64px'; // ~text-6xl
    if (len <= 8) return '56px';
    if (len <= 10) return '48px'; // ~text-4xl/5xl
    if (len <= 12) return '40px';
    if (len <= 16) return '32px';
    return '28px';
  }, [amountInput]);

  const isCurrentUserActive = Boolean(currentUser?.isActive);

  const ensureActivationPayload = useCallback(async () => {
    try {
      setActivationLoading(true);
      const payload = await initiateActivationPayment();
      setActivationPayload(payload);
      setActivationModalOpen(true);
    } catch (err: any) {
      toast.error(describeError(err));
    } finally {
      setActivationLoading(false);
    }
  }, []);

  const handleOpenActivationModal = () => {
    if (isCurrentUserActive) {
      toast.info('Your account is already activated.');
      return;
    }
    if (activationPayload) {
      setActivationModalOpen(true);
      return;
    }
    ensureActivationPayload();
  };

  const ensureActivationEligibility = (orderType: OrderTypeEnum): boolean => {
    if (!isCurrentUserActive) {
      toast.error('Activate your EscrowPi account before continuing.');
      return false;
    }

    const normalizedInput = normalizePiUsername(counterparty);
    if (!normalizedInput) {
      toast.error(orderType === OrderTypeEnum.Send ? 'Please enter Payee Pioneer Name' : 'Please enter Payer Pioneer Name');
      return false;
    }

    if (
      normalizedCounterpartyForComparison &&
      normalizedCurrentUserUsername &&
      normalizedCounterpartyForComparison === normalizedCurrentUserUsername
    ) {
      toast.error('You cannot create an EscrowPi transaction with your own Pioneer name. Please choose a different payee/payer.');
      return false;
    }

    if (counterpartyLookup.state === 'checking') {
      toast.info('Hang on while we verify the counterparty.');
      return false;
    }

    if (counterpartyLookup.state === 'error') {
      toast.error(counterpartyLookup.message || 'Unable to verify counterparty.');
      return false;
    }

    if (counterpartyLookup.state === 'not_found' || counterpartyLookup.state === 'idle') {
      toast.error('We couldn’t find that Pioneer on EscrowPi yet.');
      return false;
    }

    if (counterpartyLookup.state !== 'found' || !counterpartyLookup.user) {
      toast.error('Please verify the Pioneer username before continuing.');
      return false;
    }

    if (!counterpartyLookup.user.isActive) {
      toast.error(`@${counterpartyLookup.user.pi_username} must activate their EscrowPi account before you can continue.`);
      return false;
    }

    return true;
  };

  const reset = () => {
    setIsSaveLoading(false)
    setShowSend(false);
    setShowRequest(false);
    setModalAmount('');
    setCounterparty('');
    setAmountInput('1.0');
    setModalAmount('');
    setDetails('');
    setOrderNo('')
  }

  // Validate inputs and open the appropriate modal
  const handleOpen = async (orderType: OrderTypeEnum) => {
    const name = counterparty.trim();
    const desc = details.trim();
    const n = parseFloat((amountInput || '').replace(',', '.'));

    if (!name) {
      toast.error(orderType === OrderTypeEnum.Send ? 'Please enter Payee Pioneer Name' : 'Please enter Payer Pioneer Name');
      return;
    }
    if (!desc) {
      toast.error('Please enter EscrowPi Details');
      return;
    }
    if (!Number.isFinite(n) || n <= 0) {
      toast.error('Please enter a Pi amount greater than 0');
      return;
    }

    if (!ensureActivationEligibility(orderType)) {
      return;
    }

    // Only open the modal; create order on confirm
    setModalAmount(n);
    setOrderNo("");
    if (orderType === OrderTypeEnum.Send) setShowSend(true);
    else setShowRequest(true);
  }

  const onPaymentComplete = async (data:any) => {
    toast.success("Payment successfull");
    reset();
  }
  
  const onPaymentError = (error: Error) => {
    toast.error('Payment error');
    setIsSaveLoading(false);
  }
  
  const handleSend = async (orderType: OrderTypeEnum) => {
    if (!currentUser?.pi_uid) {
      toast.error('SCREEN.MEMBERSHIP.VALIDATION.USER_NOT_LOGGED_IN_PAYMENT_MESSAGE')
      return 
    }
    if (!ensureActivationEligibility(orderType)) {
      return;
    }
    setIsSaveLoading(true)

    // Create order with status initiated; store total amount
    const total = fees.total;
    const order_no = await createOrder({ 
      username: counterparty,
      comment: details.trim(),
      orderType: orderType,
      amount: total
    });
    if (!order_no) {
      setIsSaveLoading(false);
      toast.error('order creation failed')
      return;
    }
    setOrderNo(order_no);

    const paymentData: PaymentDataType = {
      amount: total,
      memo: `Escrow payment between ${currentUser.pi_username} and ${counterparty}`,
      metadata: { 
        orderType: orderType,
        order_no: order_no
      },        
    };
    await payWithPi(paymentData, onPaymentComplete, onPaymentError);
  }

  const handleRequest = async () => {
    if (!currentUser) return
    if (!ensureActivationEligibility(OrderTypeEnum.Request)) {
      return;
    }
    setIsSaveLoading(true)
    // Create order with status initiated; store total amount
    const total = fees.total;
    const order_no = await createOrder({ 
      username: counterparty,
      comment: details.trim(),
      orderType: OrderTypeEnum.Request,
      amount: total
    });
    if (!order_no) {
      setIsSaveLoading(false);
      toast.error('order creation failed')
      return;
    }
    setOrderNo(order_no);
    // Mark as requested
    const newOrderNo = await confirmRequestOrder(order_no);
    if (newOrderNo) { 
      toast.success("Payment Request successfull")
      reset();
    } else {
      setIsSaveLoading(false);
      toast.error('failed to confirm request');
    }
  }

  if (!mounted || isSigningInUser) {
    // Render a minimal stable wrapper on SSR and first client paint
    return (
    <div className="fixed inset-0 z-[999] flex flex-col items-center justify-start pt-24 bg-white">
      <Image src="/escrow-pi-splash-logo.png" alt="EscrowPi" width={180} height={180} priority />
    </div>);
  }

  return (
    <div className="space-y-6 px-4">
      <>
          <div className="max-w-md mx-auto flex flex-col min-h-[calc(100vh-140px)]">
            <label className="block text-lg font-black text-gray-900 text-center">Payer/Payee Pioneer Name</label>
            <textarea
              value={counterparty}
              onChange={(e) => setCounterparty(e.target.value)}
              placeholder="@Pioneername (case-sensitive)"
              rows={2}
              className="mt-1 w-full rounded-xl border border-gray-300 bg-white px-3 py-2 shadow-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[var(--default-primary-color)] focus:border-[var(--default-primary-color)]"
            />
            <div className={`mt-2 flex items-center gap-2 text-xs font-medium ${COUNTERPARTY_TONE_CLASSES[counterpartyStatus.tone]}`}>
              <span>{counterpartyStatusIcon}</span>
              <span>{counterpartyStatus.text}</span>
            </div>
            <div className="mt-4">
              <label className="block text-lg font-black text-gray-900 text-center">Add Comment</label>
              <textarea
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                placeholder={"Order of xxx items\nOrder ref 1111111111"}
                rows={4}
                className="mt-1 w-full rounded-xl border border-gray-300 bg-white px-3 py-2 shadow-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[var(--default-primary-color)] focus:border-[var(--default-primary-color)]"
              />
            </div>
            {/* Spacer to evenly distribute space above amount */}
            <div className="flex-1" aria-hidden></div>
            <div className="text-center relative">
              {(showSend || showRequest) && (
                <div className="absolute inset-0 z-10 rounded-xl bg-white/80 backdrop-blur-sm"></div>
              )}
              <div className="flex items-center justify-center w-full" style={{ height: '80px' }}>
                <input
                  type="text"
                  inputMode="decimal"
                  pattern="[0-9]*[.,]?[0-9]*"
                  value={amountInput}
                  onChange={(e) => {
                    const raw = e.target.value;
                    const val = raw.replace(',', '.');
                    // allow only digits with at most one decimal point
                    if (!/^\d*(?:\.\d*)?$/.test(val)) return;
                    // enforce integer (<=11) and decimal (<=7) limits
                    const parts = val.split('.');
                    const intPart = parts[0] ?? '';
                    const fracPart = parts[1] ?? '';
                    if (intPart.length > 11) return; // reject if integer part too long
                    if (fracPart.length > 7) return; // reject if decimal part too long
                    setAmountInput(val);
                  }}
                  onBlur={() => {
                    let normalized = (amountInput || '').replace(',', '.').trim();
                    if (normalized === '' || normalized === '.') {
                      // When no value, default to 0.0
                      setAmount(0);
                      setAmountInput('0.0');
                      return;
                    }

                    // Ensure leading zero if starting with '.'
                    if (normalized.startsWith('.')) normalized = `0${normalized}`;
                    // Match integer and fractional parts
                    const m = normalized.match(/^(\d+)(?:\.(\d*))?$/);
                    if (!m) {
                      setAmount('');
                      setAmountInput('');
                      return;
                    }
                    let intPart = m[1] || '0';
                    let fracPart = m[2] ?? '';

                    // Remove extra leading zeros in integer part (keep one zero if all zeros)
                    intPart = intPart.replace(/^0+(?=\d)/, '');
                    if (intPart === '') intPart = '0';
                  // Remove extra leading zeros in integer part (keep one zero if all zeros)
                  intPart = intPart.replace(/^0+(?=\d)/, '');
                  if (intPart === '') intPart = '0';

                  // Compute numeric value
                  const n = parseFloat(intPart + (fracPart !== '' ? `.${fracPart}` : ''));
                  if (Number.isNaN(n)) {
                    setAmount('');
                    setAmountInput('');
                    return;
                  }

                  // If more than 7 decimals, round to 7
                  if (fracPart.length > 7) {
                    const rounded = n.toFixed(7);
                    // Strip trailing zeros and trailing dot
                    let cleaned = rounded.replace(/0+$/g, '').replace(/\.$/, '');
                    // Keep at least one decimal place
                    if (!cleaned.includes('.')) cleaned = cleaned + '.0';
                    setAmount(parseFloat(rounded));
                    setAmountInput(cleaned);
                    return;
                  }

                  // For 0..7 decimals, strip trailing zeros in fractional part
                  fracPart = fracPart.replace(/0+$/g, '');
                  const out = fracPart ? `${intPart}.${fracPart}` : `${intPart}.0`;
                  setAmount(n);
                  setAmountInput(out);
                }}
                  className="font-black tracking-tight text-center bg-transparent border-none outline-none focus:outline-none focus:ring-0 focus:border-transparent w-full"
                  style={{ fontSize: amountFontSize, lineHeight: 1 }}
                  aria-label="Amount in Pi"
                />
              </div>
              <div className="text-2xl text-gray-800 -mt-1">Pi</div>
            </div>
            {/* Spacer to evenly distribute space below amount */}
            <div className="flex-1" aria-hidden></div>
            <div className="grid gap-3 max-w-sm mx-auto w-full pb-6">
              <button
                onClick={() => handleOpen(OrderTypeEnum.Send)}
                className="w-full rounded-xl overflow-hidden appearance-none border-0 shadow-none outline-none focus:outline-none focus:ring-0 active:ring-0"
                style={{ WebkitTapHighlightColor: 'transparent' }}
                aria-label="Pay With EscrowPi"
              >
                <Image
                  src="/pay-with-escrow-pi-button.png"
                  alt="Pay With EscrowPi"
                  width={800}
                  height={160}
                  className="w-full h-10 object-contain pointer-events-none select-none outline-none border-0"
                  priority
                />
              </button>

              <button
                onClick={() => handleOpen(OrderTypeEnum.Request)}
                className="w-full rounded-xl overflow-hidden appearance-none border-0 shadow-none outline-none focus:outline-none focus:ring-0 active:ring-0"
                style={{ WebkitTapHighlightColor: 'transparent' }}
                aria-label="Receive With EscrowPi"
              >
                <Image
                  src="/receive-with-escrow-pi-button.png"
                  alt="Receive With EscrowPi"
                  width={800}
                  height={160}
                  className="w-full h-10 object-contain pointer-events-none select-none outline-none border-0"
                  priority
                />
              </button>

              <Link href="/history" className="block w-full rounded-xl overflow-hidden appearance-none border-0 shadow-none outline-none focus:outline-none focus:ring-0 active:ring-0" aria-label="My EscrowPi" style={{ WebkitTapHighlightColor: 'transparent' }}>
                <Image
                  src="/my-escrow-pi-button.png"
                  alt="My EscrowPi"
                  width={800}
                  height={160}
                  className="w-full h-10 object-contain pointer-events-none select-none outline-none"
                />
              </Link>
            </div>
            {!isCurrentUserActive && (
              <div className="mt-4 text-center text-base text-rose-600">
                <button
                  type="button"
                  onClick={handleOpenActivationModal}
                  className="font-semibold text-base"
                >
                  Activate your account
                </button>
              </div>
            )}
          </div>

        <Modal
          open={activationModalOpen}
          onClose={() => setActivationModalOpen(false)}
          onConfirm={async () => {
            if (!activationPayload || !currentUser) return;
            try {
              setActivationSubmitting(true);
              const paymentData: PaymentDataType = {
                amount: activationPayload.amount,
                memo: activationPayload.memo,
                metadata: activationPayload.metadata,
              };
              await payWithPi(paymentData, async () => {
                setActivationModalOpen(false);
                setActivationPayload(null);
                await autoLoginUser();
              }, (err: Error) => {
                toast.error(err.message || 'Activation payment failed');
              });
            } finally {
              setActivationSubmitting(false);
            }
          }}
          confirmText="Pay 1 Pi"
          confirmLoading={activationSubmitting}
          title={<div className="space-y-2 text-center">
            <div className="text-sm uppercase tracking-wide text-rose-500">Account activation</div>
            <div className="text-3xl font-semibold text-gray-900">1 Pi deposit</div>
          </div>}
        >
          {activationPayload ? (
            <div className="space-y-3 text-sm text-gray-700">
              <p>We'll redirect you to Pi payment to deposit 1 Pi into EscrowPi. This unlocks both Pay and Receive buttons for your account.</p>
              <ul className="list-disc space-y-1 pl-5 text-xs text-gray-600">
                <li>No orders are created for activation.</li>
                <li>We store your Pi wallet address to enable escrow payouts.</li>
                <li>You only need to do this once per account.</li>
              </ul>
            </div>
          ) : (
            <div className="text-center text-sm text-gray-500">Preparing activation details…</div>
          )}
        </Modal>

        {/* Send Popup (screenshot design) */}
        <Modal
          open={showSend}
          onClose={() => setShowSend(false)}
          onConfirm={() => handleSend(OrderTypeEnum.Send)}
          confirmLoading={isSaveLoading}
          confirmText="Confirm Send"
          title={(
            <div className="space-y-2">
              <div className="text-center">You are about to send pi<br />from your wallet</div>
              <div className="text-center text-3xl font-semibold">{fmt(fees.total)} pi</div>
            </div>
          )}
        >
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-y-2">
              <div>Payee gets:</div>
              <div className="text-right">{fmt(fees.amt || 0)} pi</div>

              <div className="whitespace-nowrap">{"Transaction completion\u00A0stake:"}</div>
              <div className="text-right">{fmt(fees.completionStake)} pi</div>

              <div className="text-xs text-gray-600 col-span-2 -mt-1">(refunded to you at end)</div>

              <div>Pi Network gas fees:</div>
              <div className="text-right">{fmt(fees.networkFees)} pi</div>

              <div>EscrowPi fee:</div>
              <div className="text-right">{fmt(fees.escrowFee)} pi</div>

            </div>
          </div>
        </Modal>

        {/* Request Popup (screenshot design) */}
        <Modal
          open={showRequest}
          onClose={() => setShowRequest(false)}
          onConfirm={() => handleRequest()}
          confirmLoading={isSaveLoading}
          confirmText="Confirm Request"
          title={(
            <div className="space-y-2">
              <div className="text-center">You are about to request<br />pi from a payer</div>
              <div className="text-center text-3xl font-semibold">{fmt(fees.total)} pi</div>
            </div>
          )}
        >
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-y-2">
              <div>You get:</div>
              <div className="text-right">{fmt(fees.amt || 0)} pi</div>

              <div className="whitespace-nowrap">{"Transaction completion\u00A0stake:"}</div>
              <div className="text-right">{fmt(fees.completionStake)} pi</div>

              <div className="text-xs text-gray-600 col-span-2 -mt-1">(refunded to payer at end)</div>

              <div>Pi Network gas fees:</div>
              <div className="text-right">{fmt(fees.networkFees)} pi</div>

              <div>EscrowPi fee:</div>
              <div className="text-right">{fmt(fees.escrowFee)}</div>
            </div>
          </div>
        </Modal>

        {/* Notification popup like Map-of-Pi */}
        {!loading && showNotificationPopup && (
          <NotificationDialog
            message="You have notifications"
            url="/notifications"
            onClose={() => setShowNotificationPopup(false)}
            setShowDialog={setShowNotificationPopup}
          />
        )}
      </>
    </div>
  );
}
