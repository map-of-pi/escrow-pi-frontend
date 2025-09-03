"use client";
import React, { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import Modal from '@/components/Modal';
import { toast } from 'react-toastify';

function Splash() {
  return (
    <div className="flex flex-col items-center justify-start h-screen pt-24">
      <Image src="/escrow-pi-splash-logo.png" alt="EscrowPi" width={180} height={180} priority />
    </div>
  );
}

export default function HomePage() {
  // Always start as loading on server and first client render to avoid hydration mismatch
  const [loading, setLoading] = useState<boolean>(true);
  const [counterparty, setCounterparty] = useState('');
  const [details, setDetails] = useState('');
  const [amount, setAmount] = useState<number | ''>(66);
  const [amountInput, setAmountInput] = useState<string>('1.0');
  const [modalAmount, setModalAmount] = useState<number | ''>('');
  const [showSend, setShowSend] = useState(false);
  const [showRequest, setShowRequest] = useState(false);

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

  // Format with up to 5 decimals (round if >5), no trailing zeros
  const fmt = (n: number) => {
    if (!Number.isFinite(n)) return '';
    let s = n.toFixed(5); // ensures rounding to 5 dp max
    if (s.includes('.')) {
      s = s.replace(/0+$/g, ''); // strip trailing zeros
      s = s.replace(/\.$/, ''); // strip trailing dot
    }
    return s;
  };

  const handleConfirm = (type: 'send' | 'request') => {
    // TODO: Integrate with backend to create EscrowPi transaction
    toast.info(`Demo: ${type === 'send' ? 'Sending' : 'Requesting'} ${fees.amt || 0} Pi via EscrowPi (backend pending)`);
    setShowSend(false);
    setShowRequest(false);
    setModalAmount('');
  };

  // Validate inputs and open the appropriate modal
  const handleOpen = (type: 'send' | 'request') => {
    const name = counterparty.trim();
    const desc = details.trim();
    const n = parseFloat((amountInput || '').replace(',', '.'));

    if (!name) {
      toast.error(type === 'send' ? 'Please enter Payee Pioneer Name' : 'Please enter Payer Pioneer Name');
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

    setModalAmount(n);
    if (type === 'send') setShowSend(true);
    else setShowRequest(true);
  };

  if (loading) return <Splash />;

  return (
    <div className="space-y-6 px-4">
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
          <label className="block text-lg font-black text-gray-900 text-center">EscrowPi Details</label>
          <textarea
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            placeholder={"Order of xxx items\nOrder ref 1111111111"}
            rows={4}
            className="mt-1 w-full rounded-xl border border-gray-300 bg-white px-3 py-2 shadow-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[var(--default-primary-color)] focus:border-[var(--default-primary-color)]"
          />
        </div>
        <div className="mt-16 md:mt-6 text-center">
          <input
            type="text"
            inputMode="decimal"
            pattern="[0-9]*[.,]?[0-9]*"
            value={amountInput}
            onChange={(e) => {
              const raw = e.target.value;
              const val = raw.replace(',', '.');
              // allow only digits with at most one decimal point
              if (/^\d*(?:\.\d*)?$/.test(val)) {
                setAmountInput(val);
              }
            }}
            onBlur={() => {
              let normalized = (amountInput || '').replace(',', '.').trim();
              if (normalized === '' || normalized === '.') {
                setAmount('');
                setAmountInput('');
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

              // Compute numeric value
              const n = parseFloat(intPart + (fracPart !== '' ? `.${fracPart}` : ''));
              if (Number.isNaN(n)) {
                setAmount('');
                setAmountInput('');
                return;
              }

              // If more than 5 decimals, round to 5
              if (fracPart.length > 5) {
                const rounded = n.toFixed(5);
                // Strip trailing zeros and trailing dot
                let cleaned = rounded.replace(/0+$/g, '').replace(/\.$/, '');
                // Keep at least one decimal place
                if (!cleaned.includes('.')) cleaned = cleaned + '.0';
                setAmount(parseFloat(rounded));
                setAmountInput(cleaned);
                return;
              }

              // For 0..5 decimals, strip trailing zeros in fractional part
              fracPart = fracPart.replace(/0+$/g, '');
              const out = fracPart ? `${intPart}.${fracPart}` : `${intPart}.0`;
              setAmount(n);
              setAmountInput(out);
            }}
            className="text-6xl font-black leading-tight tracking-tight text-center bg-transparent border-none outline-none focus:outline-none focus:ring-0 focus:border-transparent w-full"
            aria-label="Amount in Pi"
          />
          <div className="text-2xl text-gray-800 -mt-1">Pi</div>
        </div>
        <div className="mt-auto grid gap-3 max-w-sm mx-auto w-full pb-6">
          <button
            className="w-full py-3 rounded-xl font-semibold shadow-sm bg-[var(--default-primary-color)] text-[var(--default-secondary-color)]"
            onClick={() => handleOpen('send')}
          >
            Pay With EscrowPi
          </button>
          <button
            className="w-full py-3 rounded-xl font-semibold shadow-sm bg-[var(--default-primary-color)] text-[var(--default-secondary-color)]"
            onClick={() => handleOpen('request')}
          >
            Receive With EscrowPi
          </button>
          <a
            href="/history"
            className="block w-full text-center py-3 rounded-xl font-semibold shadow-sm bg-[var(--default-primary-color)] text-[var(--default-secondary-color)]"
          >
            My EscrowPi
          </a>
        </div>
      </div>


      {/* Send Popup (screenshot design) */}
      <Modal
        open={showSend}
        onClose={() => setShowSend(false)}
        onConfirm={() => handleConfirm('send')}
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
        onConfirm={() => handleConfirm('request')}
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
            <div className="text-right">{fmt(fees.escrowFee)} pi</div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
