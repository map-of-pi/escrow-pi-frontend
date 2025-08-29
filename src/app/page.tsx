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
  const [amount, setAmount] = useState<number | ''>('');
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

  const handleConfirm = (type: 'send' | 'request') => {
    // TODO: Integrate with backend to create EscrowPi transaction
    toast.info(`Demo: ${type === 'send' ? 'Sending' : 'Requesting'} ${fees.amt || 0} Pi via EscrowPi (backend pending)`);
    setShowSend(false);
    setShowRequest(false);
    setModalAmount('');
  };

  if (loading) return <Splash />;

  return (
    <div className="space-y-6 px-4">
      <div className="max-w-md mx-auto flex flex-col min-h-[calc(100vh-140px)]">
        <label className="block text-lg font-black text-gray-900 text-center">Counterparty Pioneer Name</label>
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
        <div className="mt-16 md:mt-10 text-center">
          <div className="text-6xl font-black leading-tight tracking-tight">66.0</div>
          <div className="text-2xl text-gray-800 -mt-1">Pi</div>
        </div>
        <div className="mt-auto grid gap-3 max-w-sm mx-auto w-full pb-6">
          <button
            className="w-full py-3 rounded-xl font-semibold shadow-sm bg-[var(--default-primary-color)] text-[var(--default-secondary-color)]"
            onClick={() => { setShowSend(true); setModalAmount(66); }}
          >
            Pay With EscrowPi
          </button>
          <button
            className="w-full py-3 rounded-xl font-semibold shadow-sm bg-[var(--default-primary-color)] text-[var(--default-secondary-color)]"
            onClick={() => { setShowRequest(true); setModalAmount(66); }}
          >
            Receive With EscrowPi
          </button>
          <a
            href="/history"
            className="block w-full text-center py-3 rounded-xl font-semibold shadow-sm bg-[var(--default-primary-color)] text-[var(--default-secondary-color)]"
          >
            My EscrowPi History
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
            <div className="text-center text-3xl font-semibold">{fees.total.toFixed(2)} pi</div>
          </div>
        )}
      >
        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-y-2">
            <div>Counterparty gets:</div>
            <div className="text-right">{(fees.amt || 0).toFixed(1)} pi</div>

            <div>Transaction completion stake:</div>
            <div className="text-right">{fees.completionStake.toFixed(1)} pi</div>

            <div className="text-xs text-gray-600 col-span-2">(refunded at end)</div>

            <div>Pi Network gas fees:</div>
            <div className="text-right">{fees.networkFees.toFixed(2)} pi</div>

            <div>EscrowPi fee:</div>
            <div className="text-right">{fees.escrowFee.toFixed(2)} pi</div>
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
            <div className="text-center">You are about to request<br />pi from a counterparty</div>
            <div className="text-center text-3xl font-semibold">{fees.total.toFixed(2)} pi</div>
          </div>
        )}
      >
        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-y-2">
            <div>You get:</div>
            <div className="text-right">{(fees.amt || 0).toFixed(1)} pi</div>

            <div>Transaction completion stake:</div>
            <div className="text-right">{fees.completionStake.toFixed(1)} pi</div>

            <div className="text-xs text-gray-600 col-span-2">(refunded at end)</div>

            <div>Pi Network gas fees:</div>
            <div className="text-right">{fees.networkFees.toFixed(2)} pi</div>

            <div>EscrowPi fee:</div>
            <div className="text-right">{fees.escrowFee.toFixed(2)} pi</div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
