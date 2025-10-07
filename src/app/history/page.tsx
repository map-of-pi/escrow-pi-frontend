"use client";
import React, { useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { IOrder } from "@/types";
import { fetchUserOrders } from "@/services/orderApi";
import { AppContext } from "@/context/AppContextProvider";
import { mapOrdersToTxItems, TxItem, TxStatus } from "@/lib";

const statusClasses: Record<TxStatus, string> = {
  initiated: "bg-slate-50 text-slate-700 border-slate-200",
  requested: "bg-amber-50 text-amber-800 border-amber-200",
  paid: "bg-blue-50 text-blue-800 border-blue-200",
  cancelled: "bg-gray-50 text-gray-700 border-gray-200",
  expired: "bg-gray-50 text-gray-700 border-gray-300",
  declined: "bg-gray-50 text-gray-700 border-gray-200",
  disputed: "bg-red-50 text-red-800 border-red-200",
  fulfilled: "bg-emerald-50 text-emerald-800 border-emerald-200",
  released: "bg-green-50 text-green-800 border-green-200",
};

const statusLabel: Record<TxStatus, string> = {
  requested: "Requested",
  paid: "Paid",
  cancelled: "Cancelled",
  declined: "Declined",
  disputed: "Disputed",
  fulfilled: "Fulfilled",
  released: "Released",
  initiated: "Initiated",
  expired: "Expired",
};

export default function HistoryPage() {
  const { currentUser } = useContext(AppContext);
  const router = useRouter();
  const [orders, setOrders] = useState<TxItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadOrders = async () => {
      try {
        if (!currentUser?.pi_username) return;
        const fetchedOrders: IOrder[] = await fetchUserOrders();
        const txItems = mapOrdersToTxItems(fetchedOrders, currentUser.pi_username);
        setOrders(txItems);
      } catch (error) {
        console.error("Error loading orders:", error);
      } finally {
        setLoading(false);
      }
    };
    loadOrders();
  }, [currentUser]);

  if (loading) {
    return (
      <div className="text-center text-sm text-gray-600 py-10">
        Loading your transactions...
      </div>
    );
  }

  if (!orders.length) {
    return (
      <div className="text-center text-sm text-gray-600 py-10">
        No transactions yet.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1
        className="text-xl font-bold text-center"
        style={{ color: "var(--default-primary-color)" }}
      >
        My EscrowPi
      </h1>

      <ul className="space-y-3">
        {orders.map((tx) => {
          const arrow = tx.myRole === "payer" ? "You →" : "You ←";
          const localDate = new Date(tx.date).toLocaleString(undefined, {
            dateStyle: "medium",
            timeStyle: "short",
          });

          return (
            <li
              key={tx.id}
              className="rounded-xl border bg-white shadow-sm overflow-hidden"
            >
              <button
                className="w-full p-4 text-left"
                onClick={() => router.push(`/history/${tx.id}`)}
              >
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold">
                    <span className="mr-2">{arrow}</span>
                    <span>{tx.counterparty}</span>
                  </div>
                  <div
                    className={`text-xs px-2 py-1 rounded border ${statusClasses[tx.status]}`}
                  >
                    {statusLabel[tx.status]}
                  </div>
                </div>
                <div className="mt-1 flex items-end justify-between">
                  <div>
                    <div className="text-2xl font-bold">
                      {tx.amount.toFixed(2)}{" "}
                      <span className="text-lg align-top">Pi</span>
                    </div>
                  </div>
                  <div className="text-xs text-gray-500">{localDate}</div>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
