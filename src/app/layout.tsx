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
