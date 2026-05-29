"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import RentalDashboard from "@/components/RentalDashboard";
import {
  getSessionServerSnapshot,
  getSessionSnapshot,
  isLoggedInSession,
  subscribeToSessionStore,
} from "@/lib/sessionStore";

export default function DashboardPage() {
  const router = useRouter();
  const session = useSyncExternalStore(
    subscribeToSessionStore,
    getSessionSnapshot,
    getSessionServerSnapshot,
  );

  useEffect(() => {
    if (!isLoggedInSession(session)) {
      router.replace("/login");
    }
  }, [router, session]);

  if (!isLoggedInSession(session)) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-slate-100">
        <div className="rounded-3xl border border-white/10 bg-white/5 px-6 py-8 text-sm text-slate-300 shadow-2xl shadow-slate-950/30">
          Loading dashboard...
        </div>
      </main>
    );
  }

  return <RentalDashboard />;
}
