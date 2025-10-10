"use client";
import React, { useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { IOrder } from "@/types";
import { fetchUserOrders } from "@/services/orderApi";
import { AppContext } from "@/context/AppContextProvider";
import { mapOrdersToTxItems, TxItem, TxStatus, statusLabel, statusClasses } from "@/lib";

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
                    {tx.auditLog && (
                      <div className="text-xs text-gray-500">{tx.auditLog}</div>
                    )}
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
