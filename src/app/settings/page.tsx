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
  deviceMode: string;
  deviceModel: string;
  deviceIp: string | null;
  devicePort: number;
  deviceLocation: string | null;
  realDeviceEnabled: boolean;
  connectionStatus: string;
  lastHeartbeatAt: string | null;
  lastSyncAt: string | null;
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
      deviceMode: typeof data.deviceMode === "string" ? data.deviceMode : "MOCK",
      deviceModel: typeof data.deviceModel === "string" ? data.deviceModel : "Not configured",
      deviceIp: typeof data.deviceIp === "string" ? data.deviceIp : null,
      devicePort: typeof data.devicePort === "number" ? data.devicePort : 4370,
      deviceLocation: typeof data.deviceLocation === "string" ? data.deviceLocation : null,
      realDeviceEnabled: typeof data.realDeviceEnabled === "boolean" ? data.realDeviceEnabled : false,
      connectionStatus: typeof data.connectionStatus === "string" ? data.connectionStatus : "MOCK_OFFLINE",
      lastHeartbeatAt: typeof data.lastHeartbeatAt === "string" ? data.lastHeartbeatAt : null,
      lastSyncAt: typeof data.lastSyncAt === "string" ? data.lastSyncAt : null,
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
      deviceMode: "MOCK",
      deviceModel: "Not configured",
      deviceIp: null,
      devicePort: 4370,
      deviceLocation: null,
      realDeviceEnabled: false,
      connectionStatus: "MOCK_OFFLINE",
      lastHeartbeatAt: null,
      lastSyncAt: null,
    });
    const [message, setMessage] = useState<string | null>(null);
    const [deviceMessage, setDeviceMessage] = useState<string | null>(null);
    const [databaseNotice, setDatabaseNotice] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [deviceValidationError, setDeviceValidationError] = useState<string | null>(null);

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

    const saveDeviceSettings = async () => {
      setDeviceValidationError(null);

      // Validation: deviceIp required if REAL mode or realDeviceEnabled
      if ((deviceSettings.deviceMode === "REAL" || deviceSettings.realDeviceEnabled) && !deviceSettings.deviceIp?.trim()) {
        setDeviceValidationError("Device IP is required when using REAL mode or enabling real device.");
        return;
      }

      try {
        const response = await fetch("/api/device-state", {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(deviceSettings),
        });

        const body: unknown = await response.json();

        if (!response.ok) {
          throw new Error(
            typeof body === "object" && body !== null && "error" in body
              ? String((body as { error?: unknown }).error ?? "")
              : `PUT /api/device-state failed (${response.status})`,
          );
        }

        const savedDeviceSettings = parseDeviceStateResponse(body);

        if (!savedDeviceSettings) {
          throw new Error("Invalid device state response from API.");
        }

        setDeviceSettings(savedDeviceSettings);
        setDeviceMessage("Device settings saved successfully.");
      } catch (error) {
        setDeviceMessage(null);
        setDeviceValidationError(
          error instanceof Error ? error.message : "Failed to save device settings.",
        );
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
            {deviceMessage ? (
              <div className="mt-6 rounded-2xl border border-[#D4AF37]/60 bg-[#FFFFFF]/10 px-4 py-3 text-sm text-[#FFFFFF]">
                {deviceMessage}
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
            <p className="mb-6 text-xs text-[#64748B]">
              Mock mode is safe for testing. Real mode should be enabled only after the biometric device is purchased and connected.
            </p>

            <div className="grid gap-4">
              <label className="grid gap-2 text-sm text-[#0B1F3A]">
                <span>Device Mode</span>
                <select
                  value={deviceSettings.deviceMode}
                  onChange={(event) =>
                    setDeviceSettings((current) => ({
                      ...current,
                      deviceMode: event.target.value,
                    }))
                  }
                  className="rounded-2xl border border-[#D4AF37]/35 bg-[#FFFFFF] px-4 py-3 text-[#0B1F3A] outline-none transition focus:border-[#0B1F3A] focus:ring-2 focus:ring-[#0B1F3A]/20"
                >
                  <option value="MOCK">MOCK</option>
                  <option value="REAL">REAL</option>
                </select>
              </label>

              <label className="grid gap-2 text-sm text-[#0B1F3A]">
                <span>Device Model</span>
                <input
                  type="text"
                  value={deviceSettings.deviceModel}
                  onChange={(event) =>
                    setDeviceSettings((current) => ({
                      ...current,
                      deviceModel: event.target.value,
                    }))
                  }
                  className="rounded-2xl border border-[#D4AF37]/35 bg-[#FFFFFF] px-4 py-3 text-[#0B1F3A] outline-none transition focus:border-[#0B1F3A] focus:ring-2 focus:ring-[#0B1F3A]/20"
                  placeholder="e.g., ZKTeco MB360"
                />
              </label>

              <label className="grid gap-2 text-sm text-[#0B1F3A]">
                <span>Device IP Address {deviceSettings.deviceMode === "REAL" && <span className="text-red-600">*</span>}</span>
                <input
                  type="text"
                  value={deviceSettings.deviceIp ?? ""}
                  onChange={(event) =>
                    setDeviceSettings((current) => ({
                      ...current,
                      deviceIp: event.target.value || null,
                    }))
                  }
                  className="rounded-2xl border border-[#D4AF37]/35 bg-[#FFFFFF] px-4 py-3 text-[#0B1F3A] outline-none transition focus:border-[#0B1F3A] focus:ring-2 focus:ring-[#0B1F3A]/20"
                  placeholder="e.g., 192.168.1.100"
                  required={deviceSettings.deviceMode === "REAL" || deviceSettings.realDeviceEnabled}
                />
              </label>

              <label className="grid gap-2 text-sm text-[#0B1F3A]">
                <span>Device Port</span>
                <input
                  type="number"
                  value={deviceSettings.devicePort}
                  onChange={(event) =>
                    setDeviceSettings((current) => ({
                      ...current,
                      devicePort: parseInt(event.target.value, 10) || 4370,
                    }))
                  }
                  className="rounded-2xl border border-[#D4AF37]/35 bg-[#FFFFFF] px-4 py-3 text-[#0B1F3A] outline-none transition focus:border-[#0B1F3A] focus:ring-2 focus:ring-[#0B1F3A]/20"
                />
              </label>

              <label className="grid gap-2 text-sm text-[#0B1F3A]">
                <span>Device Location</span>
                <input
                  type="text"
                  value={deviceSettings.deviceLocation ?? ""}
                  onChange={(event) =>
                    setDeviceSettings((current) => ({
                      ...current,
                      deviceLocation: event.target.value || null,
                    }))
                  }
                  className="rounded-2xl border border-[#D4AF37]/35 bg-[#FFFFFF] px-4 py-3 text-[#0B1F3A] outline-none transition focus:border-[#0B1F3A] focus:ring-2 focus:ring-[#0B1F3A]/20"
                  placeholder="e.g., SKC Mansion Reception"
                />
              </label>

              <label className="flex items-center gap-3 text-sm text-[#0B1F3A]">
                <input
                  type="checkbox"
                  checked={deviceSettings.realDeviceEnabled}
                  onChange={(event) =>
                    setDeviceSettings((current) => ({
                      ...current,
                      realDeviceEnabled: event.target.checked,
                    }))
                  }
                  className="h-5 w-5 rounded border border-[#D4AF37]/35 bg-[#FFFFFF] accent-[#0B1F3A]"
                />
                <span>Enable Real Device</span>
              </label>

              {deviceValidationError && (
                <div className="rounded-2xl border border-red-300/60 bg-red-50 px-4 py-3 text-xs text-red-700">
                  {deviceValidationError}
                </div>
              )}

              <div className="border-t border-[#D4AF37]/35 pt-4">
                <h3 className="mb-3 text-sm font-semibold text-[#0B1F3A]">Status</h3>
                <div className="grid gap-3">
                  <div className="flex items-center justify-between rounded-lg border border-[#D4AF37]/20 bg-[#F8FAFC] px-3 py-2 text-xs">
                    <span className="text-[#64748B]">Connection Status:</span>
                    <span className="font-medium text-[#0B1F3A]">{deviceSettings.connectionStatus}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-[#D4AF37]/20 bg-[#F8FAFC] px-3 py-2 text-xs">
                    <span className="text-[#64748B]">Last Heartbeat:</span>
                    <span className="font-medium text-[#0B1F3A]">
                      {deviceSettings.lastHeartbeatAt ? new Date(deviceSettings.lastHeartbeatAt).toLocaleString() : "Never"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-[#D4AF37]/20 bg-[#F8FAFC] px-3 py-2 text-xs">
                    <span className="text-[#64748B]">Last Sync:</span>
                    <span className="font-medium text-[#0B1F3A]">
                      {deviceSettings.lastSyncAt ? deviceSettings.lastSyncAt : "Never"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => void saveDeviceSettings()}
                  className="rounded-full border border-[#0B1F3A] bg-[#0B1F3A] px-5 py-3 text-sm font-semibold text-[#FFFFFF] transition hover:border-[#D4AF37] hover:bg-[#07162A]"
                >
                  Save Device Settings
                </button>
              </div>
            </div>
          </section>
        </div>
      </main>
    );
  }
