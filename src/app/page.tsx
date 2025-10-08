"use client";
import React, { useEffect, useLayoutEffect, useMemo, useState, useContext } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import Modal from '@/components/Modal';
import { toast } from 'react-toastify';
import { AppContext } from '@/context/AppContextProvider';
import { payWithPi } from '@/config/payment';
import { OrderTypeEnum, PaymentDataType } from '@/types';
import { createOrder, confirmRequestOrder } from '@/services/orderApi';

function Splash() {
  return (
    <div className="flex flex-col items-center justify-start h-screen pt-24">
      <Image src="/escrow-pi-splash-logo.png" alt="EscrowPi" width={180} height={180} priority />
    </div>
  );
}

export default function HomePage() {
  // Always start as loading on server and first client render to avoid hydration mismatch
  const { currentUser, setIsSaveLoading, isSigningInUser } = useContext(AppContext);
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

  // No longer manipulating body attributes; Navbar listens for 'escrowpi:ready'

  const fees = useMemo(() => {
    const base = typeof modalAmount === 'number' ? modalAmount : 0;
    const completionStake = Math.max(base * 0.1, 1);
    const networkFees = 0.03; // static for mock
    const escrowFee = Math.max(base * 0.03, 0.1);
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

  const reset = () => {
    setShowSend(false);
    setShowRequest(false);
    setModalAmount('');
  }

  const handleConfirm = (type: OrderTypeEnum) => {
    // TODO: Integrate with backend to create EscrowPi transaction
    toast.info(`Demo: ${type === OrderTypeEnum.Send ? 'Sending' : 'Requesting'} ${fees.amt || 0} Pi via EscrowPi (backend pending)`);
    reset();
  };

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

    const order_no = await createOrder(
      { 
        username: counterparty,
        comment: desc,
        orderType: orderType,
        amount: n
      }
    )
    
    if (order_no) {
      setModalAmount(n);
      setOrderNo(order_no);
      toast.success(`Order created successfully. New order with ${order_no}.`);
      if (orderType === OrderTypeEnum.Send) setShowSend(true);
      else setShowRequest(true);

    } else {
      toast.error('order creation failed')
    };
  }

  const onPaymentComplete = async (data:any) => {
    setIsSaveLoading(false);  
    toast.success("Payment successfull")
    reset();
  }
  
  const onPaymentError = (error: Error) => {
    toast.error('Payment error');
    setIsSaveLoading(false);
  }
  
  const handleSend = async (orderType: OrderTypeEnum) => {
    if (!currentUser?.pi_uid || !orderNo) {
      toast.error('SCREEN.MEMBERSHIP.VALIDATION.USER_NOT_LOGGED_IN_PAYMENT_MESSAGE')
      return 
    }
    setIsSaveLoading(true)
  
    const paymentData: PaymentDataType = {
      amount: 5,
      memo: `Escrow payment to ${counterparty}`,
      metadata: { 
        orderType: orderType,
        order_no: orderNo
      },        
    };
    await payWithPi(paymentData, onPaymentComplete, onPaymentError);
  }

  const handleRequest = async () => {
   if (!currentUser || !orderNo) return
   const newOrderNo = await confirmRequestOrder(orderNo);
   if (newOrderNo) {
    setIsSaveLoading(false);  
    toast.success("Payment Request successfull")
    reset();
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
              placeholder="@pioneername"
              rows={2}
              className="mt-1 w-full rounded-xl border border-gray-300 bg-white px-3 py-2 shadow-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[var(--default-primary-color)] focus:border-[var(--default-primary-color)]"
            />
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
            <div className="mt-12 md:mt-6 text-center relative">
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
            <div className="mt-auto grid gap-3 max-w-sm mx-auto w-full pb-6">
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
                  className="w-full h-11 object-contain pointer-events-none select-none outline-none border-0"
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
                  className="w-full h-11 object-contain pointer-events-none select-none outline-none border-0"
                />
              </button>

              <Link href="/history" className="block w-full rounded-xl overflow-hidden appearance-none border-0 shadow-none outline-none focus:outline-none focus:ring-0 active:ring-0" aria-label="My EscrowPi" style={{ WebkitTapHighlightColor: 'transparent' }}>
                <Image
                  src="/my-escrow-pi-button.png"
                  alt="My EscrowPi"
                  width={800}
                  height={160}
                  className="w-full h-11 object-contain pointer-events-none select-none outline-none"
                />
              </Link>
            </div>
          </div>

        {/* Send Popup (screenshot design) */}
        <Modal
          open={showSend}
          onClose={() => setShowSend(false)}
          onConfirm={() => handleSend(OrderTypeEnum.Send)}
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

              <div>Order id:</div>
              <div className="text-right">{orderNo}</div>
            </div>
          </div>
        </Modal>

        {/* Request Popup (screenshot design) */}
        <Modal
          open={showRequest}
          onClose={() => setShowRequest(false)}
          onConfirm={() => handleRequest()}
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

              <div>Order id:</div>
              <div className="text-right">{orderNo}</div>
            </div>
          </div>
        </Modal>
      </>
    </div>
  );
}
