import './global.css';

import type { Metadata } from 'next';
import { Lato } from 'next/font/google';
import Script from 'next/script';
import React from 'react';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

import Navbar from '@/components/Navbar';
import AppContextProvider from '@/context/AppContextProvider';
import * as Sentry from '@sentry/nextjs';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'EscrowPi Wallet',
    description: 'EscrowPi Wallet brings safe and secure escrow payments to the Pi Network community.',
    metadataBase: new URL('https://escrowpiwallet.com'),
    alternates: { canonical: 'https://escrowpiwallet.com'},
    openGraph: {
      title: 'EscrowPi Wallet',
      description: 'EscrowPi Wallet brings safe and secure escrow payments to the Pi Network community.',
      url: 'https://escrowpiwallet.com',
      siteName: 'EscrowPi Wallet',
      type: 'website',
      locale: 'en_US',
      images: [
        {
          url: '/escrow-pi-logo.png',
          width: 1200,
          height: 630,
          alt: 'EscrowPi Wallet Logo',
        },
      ],
    },
    other: {
      ...Sentry.getTraceData(), // <- this attaches Sentry tracing info
    },
  };
}

const lato = Lato({ weight: '400', subsets: ['latin'], display: 'swap' });

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <title>EscrowPi Wallet</title>
        <base href="/" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"
        />
        <meta
          property="og:title"
          content="EscrowPi Wallet, Secure escrow payments with Pi"
        />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://escrowpiwallet.com" />
        <meta
          name="description"
          content="EscrowPi Wallet is a secure payment solution designed to help Pi community members safely complete transactions using Pi through an escrow process"
        />
        <meta name="keywords" content="escrow, pi, wallet, business, app" />
        <meta name="author" content="Map of Pi Team" />
        <meta
          httpEquiv="Content-Security-Policy"
          content="font-src 'self' https://cdnjs.cloudflare.com/ajax/libs/font-awesome/https://fonts.gstatic.com/;"
        />

        {/* Favicons */}
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />
        <link rel="icon" href="/favicon.ico" />
        <link rel="manifest" href="/site.webmanifest" />

        {/* Google tag (gtag.js) using Next.js Script */}
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-0T7BSEVRN9"
          strategy="afterInteractive"
        />
        <Script id="gtag-init" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-0T7BSEVRN9');
          `}
        </Script>
      </head>
      <body className={lato.className}>
        <div className="min-h-screen flex flex-col">
          <AppContextProvider>
            <Navbar />
            <main className="flex-1 pt-[80px]">
              <div className="max-w-md mx-auto w-full p-4">{children}</div>
            </main>
            <ToastContainer position="top-center" autoClose={2500} />
          </AppContextProvider>
        </div>
      </body>
    </html>
  );
}
