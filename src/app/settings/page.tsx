"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import {
  DEFAULT_SETTINGS,
  getSettingsServerSnapshot,
  getSettingsSnapshot,
  resetSettingsValue,
  setSettingsValue,
  subscribeToSettingsStore,
  type MansionSettings,
} from "@/lib/settingsStore";
import {
  getSessionServerSnapshot,
  getSessionSnapshot,
  isLoggedInSession,
  clearSessionValue,
  subscribeToSessionStore,
} from "@/lib/sessionStore";

export default function SettingsPage() {
  const router = useRouter();
  const session = useSyncExternalStore(
    subscribeToSessionStore,
    getSessionSnapshot,
    getSessionServerSnapshot,
  );
  const settings = useSyncExternalStore(
    subscribeToSettingsStore,
    getSettingsSnapshot,
    getSettingsServerSnapshot,
  );
  const [form, setForm] = useState<MansionSettings>(settings);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoggedInSession(session)) {
      router.replace("/login");
    }
  }, [router, session]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSettingsValue(form);
    setMessage("Settings saved locally.");
  };

  const handleReset = () => {
    resetSettingsValue();
    setForm(DEFAULT_SETTINGS);
    setMessage("Settings saved locally.");
  };

  if (!isLoggedInSession(session)) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-slate-100">
        <div className="rounded-3xl border border-white/10 bg-white/5 px-6 py-8 text-sm text-slate-300 shadow-2xl shadow-slate-950/30">
          Loading settings...
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.15),_transparent_35%),linear-gradient(180deg,_#0f172a_0%,_#020617_100%)] px-4 py-6 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <section className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl shadow-slate-950/30 backdrop-blur xl:p-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-400/10 px-3 py-1 text-xs font-medium text-cyan-100">
                Local settings saved in this browser
              </div>
              <h1 className="mt-4 text-3xl font-semibold tracking-tight text-white">
                Mansion Rental Alert System
              </h1>
              <p className="mt-2 text-sm text-slate-300">Owner settings</p>
            </div>
            <nav className="flex flex-wrap gap-3">
              <Link
                href="/dashboard"
                className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/10"
              >
                Dashboard
              </Link>
              <Link
                href="/settings"
                className="rounded-full border border-cyan-300/20 bg-cyan-400/10 px-4 py-2 text-sm font-medium text-cyan-100"
              >
                Settings
              </Link>
              <button
                type="button"
                onClick={() => {
                  clearSessionValue();
                  router.replace("/login");
                }}
                className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/10"
              >
                Logout
              </button>
            </nav>
          </div>

          {message ? (
            <div className="mt-6 rounded-2xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
              {message}
            </div>
          ) : null}
        </section>

        <section className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-lg shadow-slate-950/20">
          <form onSubmit={handleSubmit} className="grid gap-4">
            <label className="grid gap-2 text-sm text-slate-200">
              <span>Mansion / PG Name</span>
              <input
                value={form.mansionName}
                onChange={(event) =>
                  setForm((current) => ({ ...current, mansionName: event.target.value }))
                }
                className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/30"
              />
            </label>

            <label className="grid gap-2 text-sm text-slate-200">
              <span>Owner Name</span>
              <input
                value={form.ownerName}
                onChange={(event) =>
                  setForm((current) => ({ ...current, ownerName: event.target.value }))
                }
                className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/30"
              />
            </label>

            <label className="grid gap-2 text-sm text-slate-200">
              <span>Owner WhatsApp Number</span>
              <input
                value={form.ownerWhatsAppNumber}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    ownerWhatsAppNumber: event.target.value,
                  }))
                }
                className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/30"
                placeholder="+91XXXXXXXXXX"
              />
            </label>

            <label className="grid gap-2 text-sm text-slate-200">
              <span>Caretaker Name</span>
              <input
                value={form.caretakerName}
                onChange={(event) =>
                  setForm((current) => ({ ...current, caretakerName: event.target.value }))
                }
                className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/30"
              />
            </label>

            <div className="flex flex-wrap gap-3 pt-2">
              <button
                type="submit"
                className="rounded-full bg-cyan-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
              >
                Save
              </button>
              <button
                type="button"
                onClick={handleReset}
                className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm font-medium text-white transition hover:bg-white/10"
              >
                Reset Settings
              </button>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}
