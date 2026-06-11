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

interface DeviceSettings {
  connectionStatus: string;
  lastHeartbeatAt: string | null;
  deviceLocation: string | null;
}

const REAL_DEVICE_MODEL = "eSSL K30 Pro";
const REAL_DEVICE_SERIAL = "NFZ8254900277";
const REAL_DEVICE_LOCATION = "SKC Mansion Reception";

function formatHeartbeatLabel(lastHeartbeatAt: string | null): string {
  if (!lastHeartbeatAt) {
    return "No heartbeat yet";
  }

  const parsed = Date.parse(lastHeartbeatAt);
  if (Number.isNaN(parsed)) {
    return "No heartbeat yet";
  }

  return new Date(lastHeartbeatAt).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "medium",
  });
}

function isHeartbeatOnline(lastHeartbeatAt: string | null): boolean {
  if (!lastHeartbeatAt) {
    return false;
  }

  const parsed = Date.parse(lastHeartbeatAt);
  if (Number.isNaN(parsed)) {
    return false;
  }

  return Date.now() - parsed <= 30_000;
}

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

  function parseDeviceStateResponse(body: unknown): DeviceSettings | null {
    if (typeof body !== "object" || body === null) {
      return null;
    }

    const record = body as { success?: unknown; data?: unknown };

    if (!record.success || typeof record.data !== "object" || record.data === null) {
      return null;
    }

    const data = record.data as Record<string, unknown>;

    return {
      connectionStatus: typeof data.connectionStatus === "string" ? data.connectionStatus : "MOCK_OFFLINE",
      lastHeartbeatAt: typeof data.lastHeartbeatAt === "string" ? data.lastHeartbeatAt : null,
      deviceLocation: typeof data.deviceLocation === "string" ? data.deviceLocation : null,
    };
  }

  export default function SettingsPage() {
    const router = useRouter();
    const session = useSyncExternalStore(
      subscribeToSessionStore,
      getSessionSnapshot,
      getSessionServerSnapshot,
    );
    const [form, setForm] = useState<MansionSettings>(DEFAULT_SETTINGS);
    const [deviceSettings, setDeviceSettings] = useState<DeviceSettings>({
      deviceLocation: null,
      connectionStatus: "MOCK_OFFLINE",
      lastHeartbeatAt: null,
    });
    const [message, setMessage] = useState<string | null>(null);
    const [deviceMessage, setDeviceMessage] = useState<string | null>(null);
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
          const [settingsResponse, deviceStateResponse] = await Promise.all([
            fetch("/api/settings", { cache: "no-store" }),
            fetch("/api/device-state", { cache: "no-store" }),
          ]);

          if (!settingsResponse.ok) {
            throw new Error(`GET /api/settings failed (${settingsResponse.status})`);
          }

          const settingsBody: unknown = await settingsResponse.json();
          const loadedSettings = parseSettingsApiResponse(settingsBody);

          if (!loadedSettings) {
            throw new Error("Invalid settings response from API.");
          }

          if (cancelled) {
            return;
          }

          setForm(loadedSettings);
          setDatabaseNotice(null);

          // Load device state
          if (deviceStateResponse.ok) {
            const deviceStateBody: unknown = await deviceStateResponse.json();
            const loadedDeviceSettings = parseDeviceStateResponse(deviceStateBody);
            if (loadedDeviceSettings) {
              setDeviceSettings(loadedDeviceSettings);
            }
          }
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
        <main className="flex min-h-screen items-center justify-center bg-[#F8FAFC] px-4 text-[#64748B]">
          <div className="rounded-3xl border border-[#D4AF37]/35 bg-[#FFFFFF] px-6 py-8 text-sm text-[#64748B] shadow-sm">
            Loading settings...
          </div>
        </main>
      );
    }

    return (
      <main className="min-h-screen bg-[#F8FAFC] px-4 py-6 text-[#64748B] sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-4xl flex-col gap-6">
          <section className="rounded-3xl border border-[#D4AF37]/35 bg-gradient-to-r from-[#07162A] to-[#0B1F3A] p-6 shadow-xl xl:p-8">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-[#D4AF37]/65 bg-[#FFFFFF]/10 px-3 py-1 text-xs font-medium text-[#FFFFFF]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#D4AF37]" />
                  Settings are saved in the mansion PostgreSQL database.
                </div>
                <h1 className="mt-4 text-3xl font-semibold tracking-tight text-[#FFFFFF]">
                  Mansion Rental Alert System
                </h1>
                <p className="mt-2 text-sm text-[#F5E6A8]">Owner and device settings</p>
              </div>
              <nav className="flex flex-wrap gap-3">
                <Link
                  href="/dashboard"
                  className="rounded-full border border-[#FFFFFF]/40 bg-[#FFFFFF]/10 px-4 py-2 text-sm font-medium text-[#FFFFFF] transition hover:bg-[#FFFFFF]/20"
                >
                  Dashboard
                </Link>
                <Link
                  href="/settings"
                  className="rounded-full border border-[#D4AF37] bg-[#0B1F3A] px-4 py-2 text-sm font-semibold text-[#FFFFFF]"
                >
                  Settings
                </Link>
                <Link
                  href="/workers"
                  className="rounded-full border border-[#FFFFFF]/40 bg-[#FFFFFF]/10 px-4 py-2 text-sm font-medium text-[#FFFFFF] transition hover:bg-[#FFFFFF]/20"
                >
                  Workers
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    clearSessionValue();
                    router.replace("/login");
                  }}
                  className="rounded-full border border-[#FFFFFF]/40 bg-[#FFFFFF]/10 px-4 py-2 text-sm font-medium text-[#FFFFFF] transition hover:bg-[#FFFFFF]/20"
                >
                  Logout
                </button>
              </nav>
            </div>

            {message ? (
              <div className="mt-6 rounded-2xl border border-[#D4AF37]/60 bg-[#FFFFFF]/10 px-4 py-3 text-sm text-[#FFFFFF]">
                {message}
              </div>
            ) : null}
            {databaseNotice ? (
              <div className="mt-3 rounded-2xl border border-[#D4AF37]/60 bg-[#FFFFFF]/10 px-4 py-3 text-sm text-[#FFFFFF]">
                {databaseNotice}
              </div>
            ) : null}
          </section>

          <section className="rounded-3xl border border-[#D4AF37]/35 bg-[#FFFFFF] p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold text-[#0B1F3A]">Owner Settings</h2>
            <form onSubmit={handleSubmit} className="grid gap-4">
              <label className="grid gap-2 text-sm text-[#0B1F3A]">
                <span>Mansion / PG Name</span>
                <input
                  value={form.mansionName}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, mansionName: event.target.value }))
                  }
                  className="rounded-2xl border border-[#D4AF37]/35 bg-[#FFFFFF] px-4 py-3 text-[#0B1F3A] outline-none transition focus:border-[#0B1F3A] focus:ring-2 focus:ring-[#0B1F3A]/20"
                />
              </label>

              <label className="grid gap-2 text-sm text-[#0B1F3A]">
                <span>Owner Name</span>
                <input
                  value={form.ownerName}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, ownerName: event.target.value }))
                  }
                  className="rounded-2xl border border-[#D4AF37]/35 bg-[#FFFFFF] px-4 py-3 text-[#0B1F3A] outline-none transition focus:border-[#0B1F3A] focus:ring-2 focus:ring-[#0B1F3A]/20"
                />
              </label>

              <label className="grid gap-2 text-sm text-[#0B1F3A]">
                <span>Owner WhatsApp Number</span>
                <input
                  value={form.ownerWhatsAppNumber}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      ownerWhatsAppNumber: event.target.value,
                    }))
                  }
                  className="rounded-2xl border border-[#D4AF37]/35 bg-[#FFFFFF] px-4 py-3 text-[#0B1F3A] outline-none transition focus:border-[#0B1F3A] focus:ring-2 focus:ring-[#0B1F3A]/20"
                  placeholder="+91XXXXXXXXXX"
                />
              </label>

              <label className="grid gap-2 text-sm text-[#0B1F3A]">
                <span>Caretaker Name</span>
                <input
                  value={form.caretakerName}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, caretakerName: event.target.value }))
                  }
                  className="rounded-2xl border border-[#D4AF37]/35 bg-[#FFFFFF] px-4 py-3 text-[#0B1F3A] outline-none transition focus:border-[#0B1F3A] focus:ring-2 focus:ring-[#0B1F3A]/20"
                />
              </label>

              <div className="flex flex-wrap gap-3 pt-2">
                <button
                  type="submit"
                  className="rounded-full border border-[#0B1F3A] bg-[#0B1F3A] px-5 py-3 text-sm font-semibold text-[#FFFFFF] transition hover:border-[#D4AF37] hover:bg-[#07162A]"
                >
                  Save Owner Settings
                </button>
                <button
                  type="button"
                  onClick={handleReset}
                  className="rounded-full border border-[#D4AF37]/55 bg-[#FFFFFF] px-5 py-3 text-sm font-medium text-[#0B1F3A] transition hover:bg-[#F5E6A8]/35"
                >
                  Reset Settings
                </button>
              </div>
            </form>
          </section>

          <section className="rounded-3xl border border-[#D4AF37]/35 bg-[#FFFFFF] p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold text-[#0B1F3A]">Biometric Device Settings</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-[#D4AF37]/20 bg-[#F8FAFC] p-4">
                <p className="text-xs uppercase tracking-wide text-[#64748B]">Device Name / Model</p>
                <p className="mt-1 text-base font-semibold text-[#0B1F3A]">{REAL_DEVICE_MODEL}</p>
              </div>
              <div className="rounded-2xl border border-[#D4AF37]/20 bg-[#F8FAFC] p-4">
                <p className="text-xs uppercase tracking-wide text-[#64748B]">Device Serial</p>
                <p className="mt-1 text-base font-semibold text-[#0B1F3A]">{REAL_DEVICE_SERIAL}</p>
              </div>
              <div className="rounded-2xl border border-[#D4AF37]/20 bg-[#F8FAFC] p-4">
                <p className="text-xs uppercase tracking-wide text-[#64748B]">Connection Status</p>
                <p className="mt-1 text-base font-semibold text-[#0B1F3A]">
                  {isHeartbeatOnline(deviceSettings.lastHeartbeatAt) ? "Online" : "Offline"}
                </p>
              </div>
              <div className="rounded-2xl border border-[#D4AF37]/20 bg-[#F8FAFC] p-4">
                <p className="text-xs uppercase tracking-wide text-[#64748B]">Last Heartbeat</p>
                <p className="mt-1 text-base font-semibold text-[#0B1F3A]">
                  {formatHeartbeatLabel(deviceSettings.lastHeartbeatAt)}
                </p>
              </div>
              <div className="rounded-2xl border border-[#D4AF37]/20 bg-[#F8FAFC] p-4 sm:col-span-2">
                <p className="text-xs uppercase tracking-wide text-[#64748B]">Device Location</p>
                <p className="mt-1 text-base font-semibold text-[#0B1F3A]">
                  {deviceSettings.deviceLocation?.trim() || REAL_DEVICE_LOCATION}
                </p>
              </div>
            </div>
          </section>
        </div>
      </main>
    );
  }
