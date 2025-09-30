import type { Metadata } from 'next';
import './global.css';
import React from 'react';
import 'react-toastify/dist/ReactToastify.css';
import { ToastContainer } from 'react-toastify';
import Navbar from '@/components/Navbar';
import { Lato } from 'next/font/google';
import AppContextProvider from '@/context/AppContextProvider';

export const metadata: Metadata = {
  title: 'EscrowPi Wallet',
  description: 'EscrowPi Wallet – frontend',
};

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
        {/* Google tag (gtag.js) */}
        <script async src="https://www.googletagmanager.com/gtag/js?id=G-0T7BSEVRN9"></script>
        <script dangerouslySetInnerHTML={{
          __html: `
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-0T7BSEVRN9');
          `,
        }} />
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
