'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useContext, useEffect, useState } from 'react';
import { FiHelpCircle, FiMenu } from 'react-icons/fi';
import { IoMdArrowBack, IoMdClose } from 'react-icons/io';
import { MdHome } from 'react-icons/md';
import styles from './Navbar.module.css';
import { AppContext } from '@/context/AppContextProvider';
import { getNotifications } from '@/services/notificationApi';

export default function Navbar() {
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // Initialize from pathname immediately to avoid a frame where non-home looks like home
  const [isHomePage, setIsHomePage] = useState(() => (pathname ?? '/') === '/');
  // Local readiness (controls header title + hamburger via CSS [data-ready])
  // Initialize to ready for any non-home route to avoid a flash of "Loading ..." on route changes
  const [ready, setReady] = useState(() => (pathname ?? '/') !== '/');
  const { currentUser } = useContext(AppContext);
  const [hasUnread, setHasUnread] = useState(false);

  useEffect(() => {
    setIsHomePage((pathname ?? '/') === '/');
  }, [pathname]);

  // Detect transaction details and history list to alter back behavior
  const isTxDetails = !!pathname && pathname.startsWith('/history/');
  const isHistoryList = (pathname ?? '') === '/history';
  const backHref = isTxDetails ? '/history' : isHistoryList ? '/?skipSplash=1' : '/?skipSplash=1';

  // Determine readiness without touching <body> attributes
  useEffect(() => {
    // Default: not ready => show Loading, hamburger disabled
    const onReady = () => setReady(true);
    if ((pathname ?? '/') !== '/') {
      setReady(true); // non-home: header should be ready immediately
    } else {
      try {
        const url = new URL(window.location.href);
        const skip = url.searchParams.get('skipSplash') === '1';
        const visited = window.sessionStorage.getItem('visitedHome');
        if (skip || visited) setReady(true);
      } catch {}
      window.addEventListener('escrowpi:ready', onReady);
    }
    return () => {
      window.removeEventListener('escrowpi:ready', onReady);
    };
  }, [pathname]);

  // Prefetch history route to make back navigation instant
  useEffect(() => {
    try { router.prefetch && router.prefetch('/history'); } catch {}
  }, [router]);

  // No reading/writing of data-loading here. Home page controls it; CSS responds.

  const disabled = isHomePage;

  // Check for uncleared notifications to show an indicator on the hamburger
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        if (!currentUser?.pi_uid) { setHasUnread(false); return; }
        const res = await getNotifications({ pi_uid: currentUser.pi_uid, skip: 0, limit: 0, status: 'uncleared' });
        if (!cancelled) setHasUnread(Array.isArray(res) && res.length > 0);
      } catch {
        if (!cancelled) setHasUnread(false);
      }
    };
    check();
    // also re-check when sidebar is opened (user might have read some)
    if (typeof window !== 'undefined') {
      const onFocus = () => check();
      window.addEventListener('focus', onFocus);
      return () => { cancelled = true; window.removeEventListener('focus', onFocus); };
    }
    return () => { cancelled = true; };
  }, [currentUser?.pi_uid, sidebarOpen]);

  const isNonHome = (pathname ?? '/') !== '/';
  return (
    <div
      className="w-full z-[500] fixed top-0 left-0 right-0"
      style={{ background: 'var(--default-primary-color)' }}
      data-ready={(isNonHome || ready) ? 'true' : undefined}
    >
      <div className="w-full h-[76.19px] px-[16px] py-[5px]">
        {/* Center title row */}
        <div className="w-full flex justify-between items-center">
          <div className="flex-1"></div>
          <div className="text-center text-[1.3rem] whitespace-nowrap flex-1" style={{ color: 'var(--default-secondary-color)' }}>
            <span className="title-loading">Loading ...</span>
            <span className="title-loaded">EscrowPi Wallet</span>
          </div>
          <div className="flex-1" />
        </div>

        {/* Nav row */}
        <div className="flex justify-between items-center">
          <div className={`${styles.nav_item}`}>
            {isHomePage ? (
              <span aria-disabled className="w-full h-full flex items-center justify-center cursor-not-allowed">
                <IoMdArrowBack size={26} className={`text-[var(--default-tertiary-color)]`} />
              </span>
            ) : (
              <Link
                href={backHref}
                aria-label="Back"
                className="w-full h-full flex items-center justify-center"
                onClick={(e) => {
                  try {
                    e.preventDefault();
                    router.push(backHref);
                  } catch {
                    // As a last resort, hard navigate
                    window.location.href = backHref;
                  }
                }}
              >
                <IoMdArrowBack size={26} className={`text-[var(--default-secondary-color)]`} />
              </Link>
            )}
          </div>

          <div className={`${styles.nav_item} ${disabled ? 'disabled' : ''}`}>
            <Link
              href="/?skipSplash=1"
              aria-label="Go Home"
              className="w-full h-full flex items-center justify-center"
              onClick={(e) => { e.preventDefault(); if (!disabled) router.push('/?skipSplash=1'); }}
            >
              <MdHome size={24} className={`${disabled ? 'text-[var(--default-tertiary-color)]' : 'text-[var(--default-secondary-color)]'}`} />
            </Link>
          </div>

          <div className={`${styles.nav_item} disabled`}>
            <Link href="/?skipSplash=1" aria-label="Home" onClick={(e) => { e.preventDefault(); if (!disabled) router.push('/?skipSplash=1'); }}>
              <Image src="/escrow-pi-logo.png" alt="EscrowPi" width={34} height={34} />
            </Link>
          </div>

          <div className={`${styles.nav_item}`}>
            <a href="https://mapofpi.zapier.app/" target="_blank" rel="noopener noreferrer">
              <FiHelpCircle size={24} className={'text-[var(--default-secondary-color)]'} />
            </a>
          </div>

          <div className={`${styles.nav_item} hamburger-btn relative`}>
            <button
              onClick={() => { setSidebarOpen((s) => !s); }}
              className={"outline-none"}
            >
              {sidebarOpen ? (
                <IoMdClose size={24} className={"hamburger-icon"} />
              ) : (
                <div className="relative">
                  <FiMenu size={24} className={"hamburger-icon"} />
                  {hasUnread && (
                    <span className={styles.badge_dot} aria-label="Unread notifications" />
                  )}
                </div>
              )}
            </button>
          </div>
        </div>
      </div>

      {sidebarOpen && (
        <div className="w-full h-[calc(100vh-76.19px)] fixed bottom-0 right-0 z-[70]">
          {/* Backdrop */}
          <div
            className="absolute w-full h-full bg-[#82828284]"
            onClick={() => setSidebarOpen(false)}
          />
          {/* Right drawer */}
          <div
            className="absolute bg-white right-0 top-0 z-50 p-[1.2rem] h-[calc(100vh-76.19px)] sm:w-[350px] w-[250px] overflow-y-auto shadow-xl border-l"
            role="dialog"
            aria-modal="true"
          >
            <div className="mb-3 text-center">
              <h2 className="text-lg font-semibold">Menu</h2>
            </div>

            <div className="mb-3">
              <button
                onClick={() => { router.push('/notifications'); setSidebarOpen(false); }}
                className="w-full px-4 py-3 rounded-md text-base"
                style={{ background: 'var(--default-primary-color)', color: 'var(--default-secondary-color)' }}
              >
                See Notifications
              </button>
            </div>

            {/* Additional menu items can be added here, matching Map-of-Pi's pattern over time */}
          </div>
        </div>
      )}
    </div>
  );
}
