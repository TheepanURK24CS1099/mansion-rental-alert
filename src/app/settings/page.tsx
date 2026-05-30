"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import {
  DEFAULT_SETTINGS,
  getSettingsSnapshot,
  resetSettingsValue as resetFallbackSettings,
  setSettingsValue as persistFallbackSettings,
  type MansionSettings,
} from "@/lib/settingsStore";
import {
  clearSessionValue,
  getSessionServerSnapshot,
  getSessionSnapshot,
  isLoggedInSession,
  subscribeToSessionStore,
} from "@/lib/sessionStore";

function sanitizeSettingsRecord(record: Record<string, unknown>): MansionSettings {
  return {
    mansionName:
        typeof record.mansionName === "string" && record.mansionName.trim().length > 0
          ? record.mansionName
          : DEFAULT_SETTINGS.mansionName,
      ownerName:
        typeof record.ownerName === "string" && record.ownerName.trim().length > 0
          ? record.ownerName
          : DEFAULT_SETTINGS.ownerName,
      ownerWhatsAppNumber:
        typeof record.ownerWhatsAppNumber === "string"
          ? record.ownerWhatsAppNumber
          : DEFAULT_SETTINGS.ownerWhatsAppNumber,
      caretakerName:
        typeof record.caretakerName === "string" && record.caretakerName.trim().length > 0
          ? record.caretakerName
          : DEFAULT_SETTINGS.caretakerName,
    };
  }

  function parseSettingsApiResponse(body: unknown): MansionSettings | null {
    if (typeof body !== "object" || body === null) {
      return null;
    }

    const record = body as { success?: unknown; data?: unknown };

    if (!record.success || typeof record.data !== "object" || record.data === null) {
      return null;
    }

    return sanitizeSettingsRecord(record.data as Record<string, unknown>);
  }

  export default function SettingsPage() {
    const router = useRouter();
    const session = useSyncExternalStore(
      subscribeToSessionStore,
      getSessionSnapshot,
      getSessionServerSnapshot,
    );
    const [form, setForm] = useState<MansionSettings>(DEFAULT_SETTINGS);
    const [message, setMessage] = useState<string | null>(null);
    const [databaseNotice, setDatabaseNotice] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
      if (!isLoggedInSession(session)) {
        router.replace("/login");
      }
    }, [router, session]);

    useEffect(() => {
      let cancelled = false;

      async function loadSettings() {
        try {
          const response = await fetch("/api/settings", {
            cache: "no-store",
          });

          if (!response.ok) {
            throw new Error(`GET /api/settings failed (${response.status})`);
          }

          const body: unknown = await response.json();
          const loadedSettings = parseSettingsApiResponse(body);

          if (!loadedSettings) {
            throw new Error("Invalid settings response from API.");
          }

          if (cancelled) {
            return;
          }

          setForm(loadedSettings);
          setDatabaseNotice(null);
        } catch {
          const fallbackSettings = getSettingsSnapshot();

          if (cancelled) {
            return;
          }

          setForm(fallbackSettings);
          setDatabaseNotice("Database unavailable. Settings fallback is active.");
        } finally {
          if (!cancelled) {
            setIsLoading(false);
          }
        }
      }

      void loadSettings();

      return () => {
        cancelled = true;
      };
    }, []);

    const saveSettingsToDatabase = async (nextSettings: MansionSettings) => {
      try {
        const response = await fetch("/api/settings", {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(nextSettings),
        });

        const body: unknown = await response.json();

        if (!response.ok) {
          throw new Error(
            typeof body === "object" && body !== null && "error" in body
              ? String((body as { error?: unknown }).error ?? "")
              : `PUT /api/settings failed (${response.status})`,
          );
        }

        const savedSettings = parseSettingsApiResponse(body);

        if (!savedSettings) {
          throw new Error("Invalid settings response from API.");
        }

        setForm(savedSettings);
        setMessage("Settings saved to database.");
        setDatabaseNotice(null);
      } catch {
        persistFallbackSettings(nextSettings);
        setForm(nextSettings);
        setMessage(null);
        setDatabaseNotice("Database unavailable. Settings fallback is active.");
      }
    };

    const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      void saveSettingsToDatabase(form);
    };

    const handleReset = () => {
      resetFallbackSettings();
      setForm(DEFAULT_SETTINGS);
      void saveSettingsToDatabase(DEFAULT_SETTINGS);
    };

    if (!isLoggedInSession(session) || isLoading) {
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
                  Settings are saved in the mansion PostgreSQL database.
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
            {databaseNotice ? (
              <div className="mt-3 rounded-2xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
                {databaseNotice}
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
