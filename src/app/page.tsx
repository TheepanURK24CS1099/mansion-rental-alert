"use client";

import { useMemo, useState, useSyncExternalStore } from "react";

type RoomType =
  | "Single Room"
  | "Double Room"
  | "Monthly Room"
  | "Family Room";

type DeviceUserId = 101 | 102 | 103 | 104;

type AlertStatus = "Mock Sent";

interface RentalAlertRecord {
  id: string;
  roomType: RoomType;
  actionLabel: string;
  date: string;
  time: string;
  updatedBy: string;
  messageStatus: AlertStatus;
  deviceUserId: DeviceUserId;
  createdAtMs: number;
}

interface RoomAction {
  roomType: RoomType;
  actionLabel: string;
  deviceUserId: DeviceUserId;
  accent: string;
}

const ROOM_ACTIONS: RoomAction[] = [
  {
    roomType: "Single Room",
    actionLabel: "Single Room Rented",
    deviceUserId: 101,
    accent: "from-emerald-500 to-teal-500",
  },
  {
    roomType: "Double Room",
    actionLabel: "Double Room Rented",
    deviceUserId: 102,
    accent: "from-sky-500 to-cyan-500",
  },
  {
    roomType: "Monthly Room",
    actionLabel: "Monthly Room Rented",
    deviceUserId: 103,
    accent: "from-violet-500 to-fuchsia-500",
  },
  {
    roomType: "Family Room",
    actionLabel: "Family Room Rented",
    deviceUserId: 104,
    accent: "from-amber-500 to-orange-500",
  },
];

const DUPLICATE_WINDOW_MS = 30_000;
const STORAGE_KEY = "mansion-rental-alert-history";

let rentalAlertStore: RentalAlertRecord[] = [];
let rentalAlertStoreInitialized = false;
const rentalAlertStoreListeners = new Set<() => void>();

function isRoomType(value: string): value is RoomType {
  return (
    value === "Single Room" ||
    value === "Double Room" ||
    value === "Monthly Room" ||
    value === "Family Room"
  );
}

function isDeviceUserId(value: number): value is DeviceUserId {
  return value === 101 || value === 102 || value === 103 || value === 104;
}

function isAlertStatus(value: string): value is AlertStatus {
  return value === "Mock Sent";
}

function parseStoredAlerts(rawValue: string | null): RentalAlertRecord[] {
  if (!rawValue) {
    return [];
  }

  try {
    const parsedValue: unknown = JSON.parse(rawValue);

    if (!Array.isArray(parsedValue)) {
      return [];
    }

    return parsedValue.flatMap((item) => {
      if (typeof item !== "object" || item === null) {
        return [];
      }

      const record = item as Record<string, unknown>;
      const roomType = record.roomType;
      const actionLabel = record.actionLabel;
      const date = record.date;
      const time = record.time;
      const updatedBy = record.updatedBy;
      const messageStatus = record.messageStatus;
      const deviceUserId = record.deviceUserId;
      const createdAtMs = record.createdAtMs;

      if (
        typeof roomType !== "string" ||
        !isRoomType(roomType) ||
        typeof actionLabel !== "string" ||
        typeof date !== "string" ||
        typeof time !== "string" ||
        typeof updatedBy !== "string" ||
        typeof messageStatus !== "string" ||
        !isAlertStatus(messageStatus) ||
        typeof deviceUserId !== "number" ||
        !isDeviceUserId(deviceUserId) ||
        typeof createdAtMs !== "number"
      ) {
        return [];
      }

      return [
        {
          id:
            typeof record.id === "string" && record.id.length > 0
              ? record.id
              : crypto.randomUUID(),
          roomType,
          actionLabel,
          date,
          time,
          updatedBy,
          messageStatus,
          deviceUserId,
          createdAtMs,
        },
      ];
    });
  } catch {
    return [];
  }
}

function readStoredAlerts(): RentalAlertRecord[] {
  if (typeof window === "undefined") {
    return [];
  }

  return parseStoredAlerts(window.localStorage.getItem(STORAGE_KEY));
}

function persistAlerts(alerts: RentalAlertRecord[]): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(alerts));
}

function removeStoredAlerts(): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(STORAGE_KEY);
}

function initializeRentalAlertStore(): void {
  if (rentalAlertStoreInitialized || typeof window === "undefined") {
    return;
  }

  rentalAlertStore = readStoredAlerts();
  rentalAlertStoreInitialized = true;
}

function getRentalAlertSnapshot(): RentalAlertRecord[] {
  initializeRentalAlertStore();
  return rentalAlertStore;
}

function subscribeToRentalAlertStore(listener: () => void): () => void {
  rentalAlertStoreListeners.add(listener);

  return () => {
    rentalAlertStoreListeners.delete(listener);
  };
}

function notifyRentalAlertStoreListeners(): void {
  for (const listener of rentalAlertStoreListeners) {
    listener();
  }
}

function replaceRentalAlertStore(alerts: RentalAlertRecord[]): void {
  rentalAlertStore = alerts;
  rentalAlertStoreInitialized = true;
  persistAlerts(alerts);
  notifyRentalAlertStoreListeners();
}

function clearRentalAlertStore(): void {
  rentalAlertStore = [];
  rentalAlertStoreInitialized = true;
  removeStoredAlerts();
  notifyRentalAlertStoreListeners();
}

function formatDateParts(timestamp: number): { date: string; time: string } {
  const dateObject = new Date(timestamp);

  return {
    date: dateObject.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    }),
    time: dateObject.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
    }),
  };
}

function createAlertRecord(action: RoomAction): RentalAlertRecord {
  const createdAtMs = Date.now();
  const parts = formatDateParts(createdAtMs);

  return {
    id: crypto.randomUUID(),
    roomType: action.roomType,
    actionLabel: action.actionLabel,
    date: parts.date,
    time: parts.time,
    updatedBy: "Caretaker",
    messageStatus: "Mock Sent",
    deviceUserId: action.deviceUserId,
    createdAtMs,
  };
}

function getNextRoomActionResult(
  alerts: RentalAlertRecord[],
  action: RoomAction,
): { duplicateWarning: string | null; record: RentalAlertRecord | null } {
  const nowMs = Date.now();
  const mostRecentSameRoom = alerts.find(
    (alert) => alert.roomType === action.roomType,
  );

  if (
    mostRecentSameRoom &&
    nowMs - mostRecentSameRoom.createdAtMs < DUPLICATE_WINDOW_MS
  ) {
    return {
      duplicateWarning:
        "Duplicate ignored: same room type was already recorded within 30 seconds.",
      record: null,
    };
  }

  return {
    duplicateWarning: null,
    record: createAlertRecord(action),
  };
}

function serializeAlerts(alerts: RentalAlertRecord[]): Omit<
  RentalAlertRecord,
  "createdAtMs"
>[] {
  return alerts.map((alert) => {
    const { createdAtMs: _createdAtMs, ...rest } = alert;
    void _createdAtMs;
    return rest;
  });
}

function getPreviewMessage(alert: RentalAlertRecord | undefined): string {
  if (!alert) {
    return "No rental alert selected yet. Click a room type to preview the owner message.";
  }

  return `Mansion Rental Alert

${alert.roomType} rented.

Date: ${alert.date}
Time: ${alert.time}

Updated by: ${alert.updatedBy}`;
}

export default function Home() {
  const [warning, setWarning] = useState<string | null>(null);
  const alerts = useSyncExternalStore(
    subscribeToRentalAlertStore,
    getRentalAlertSnapshot,
    () => [],
  );

  const latestAlert = alerts[0];

  const counts = useMemo(() => {
    return ROOM_ACTIONS.reduce(
      (summary, action) => {
        summary[action.roomType] = alerts.filter(
          (alert) => alert.roomType === action.roomType,
        ).length;
        summary.total += summary[action.roomType];
        return summary;
      },
      {
        "Single Room": 0,
        "Double Room": 0,
        "Monthly Room": 0,
        "Family Room": 0,
        total: 0,
      } as Record<RoomType | "total", number>,
    );
  }, [alerts]);

  const handleRoomAction = (action: RoomAction) => {
    const result = getNextRoomActionResult(alerts, action);
    const nextRecord = result.record;

    if (result.duplicateWarning) {
      setWarning(result.duplicateWarning);
      return;
    }

    if (nextRecord) {
      replaceRentalAlertStore([nextRecord, ...alerts]);
      setWarning(null);
    }
  };

  const clearHistory = () => {
    clearRentalAlertStore();
    setWarning(null);
  };

  const resetLocalStorage = () => {
    removeStoredAlerts();
    setWarning("Local storage reset: mansion-rental-alert-history was removed.");
  };

  const exportHistory = () => {
    const exportPayload = serializeAlerts(alerts);
    const blob = new Blob([JSON.stringify(exportPayload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = "mansion-rental-alert-history.json";
    link.click();

    URL.revokeObjectURL(url);
  };

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.15),_transparent_35%),linear-gradient(180deg,_#0f172a_0%,_#020617_100%)] px-4 py-6 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <section className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl shadow-slate-950/30 backdrop-blur xl:p-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-sm font-medium text-emerald-200">
                <span className="h-2 w-2 rounded-full bg-emerald-300" />
                Local Mock Mode · No real WhatsApp sent
              </div>
              <div className="space-y-2">
                <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                  Mansion Rental Alert System
                </h1>
                <p className="max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
                  Biometric room rental alerts for owner notifications
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4 text-sm text-slate-300">
              <p className="font-medium text-white">Current Mode</p>
              <p className="mt-1">Client-side dashboard only</p>
              <p>No database, no real messaging, no biometric device.</p>
            </div>
          </div>

          {warning ? (
            <div className="mt-6 rounded-2xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
              {warning}
            </div>
          ) : null}
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {ROOM_ACTIONS.map((action) => (
            <button
              key={action.deviceUserId}
              type="button"
              onClick={() => handleRoomAction(action)}
              className="group rounded-3xl border border-white/10 bg-white/5 p-5 text-left shadow-lg shadow-slate-950/20 transition hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-cyan-300"
            >
              <div className={`h-1.5 w-16 rounded-full bg-gradient-to-r ${action.accent}`} />
              <div className="mt-4 flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
                    Finger Action
                  </p>
                  <h2 className="mt-2 text-lg font-semibold text-white">
                    {action.actionLabel}
                  </h2>
                </div>
                <div className="rounded-2xl border border-white/10 bg-slate-950/60 px-3 py-2 text-right text-xs text-slate-300">
                  Device ID
                  <div className="text-base font-semibold text-white">
                    {action.deviceUserId}
                  </div>
                </div>
              </div>
              <p className="mt-4 text-sm leading-6 text-slate-300">
                Tap to create a local mock alert record for {action.roomType}.
              </p>
            </button>
          ))}
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {ROOM_ACTIONS.map((action) => (
            <article
              key={action.roomType}
              className="rounded-3xl border border-white/10 bg-slate-950/60 p-5 shadow-lg shadow-slate-950/20"
            >
              <p className="text-sm text-slate-400">Today Overview</p>
              <h3 className="mt-2 text-xl font-semibold text-white">
                {action.roomType}
              </h3>
              <div className="mt-4 flex items-end justify-between">
                <span className="text-4xl font-bold text-cyan-300">
                  {counts[action.roomType]}
                </span>
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
                  alerts today
                </span>
              </div>
            </article>
          ))}

          <article className="rounded-3xl border border-cyan-400/20 bg-cyan-500/10 p-5 shadow-lg shadow-slate-950/20 xl:col-span-1">
            <p className="text-sm text-cyan-100/80">Today Overview</p>
            <h3 className="mt-2 text-xl font-semibold text-white">Total Alerts</h3>
            <div className="mt-4 flex items-end justify-between">
              <span className="text-4xl font-bold text-cyan-200">{counts.total}</span>
              <span className="rounded-full border border-cyan-200/20 bg-cyan-200/10 px-3 py-1 text-xs text-cyan-100">
                all room types
              </span>
            </div>
          </article>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-lg shadow-slate-950/20">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-2xl font-semibold text-white">
                  Recent Rental Alerts
                </h3>
                <p className="mt-1 text-sm text-slate-400">
                  Latest alerts created in local state only
                </p>
                <p className="mt-1 text-xs text-cyan-200/90">
                  Saved locally in this browser
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={resetLocalStorage}
                  className="rounded-full border border-cyan-300/20 bg-cyan-400/10 px-4 py-2 text-sm font-medium text-cyan-100 transition hover:bg-cyan-400/20"
                >
                  Reset Local Storage
                </button>
                <button
                  type="button"
                  onClick={clearHistory}
                  className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/10"
                >
                  Clear Mock History
                </button>
                <button
                  type="button"
                  onClick={exportHistory}
                  className="rounded-full bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
                >
                  Export Mock History JSON
                </button>
              </div>
            </div>

            <div className="mt-6 overflow-x-auto">
              <table className="min-w-full divide-y divide-white/10 text-left text-sm">
                <thead className="text-slate-400">
                  <tr>
                    <th className="pb-3 pr-4 font-medium">Time</th>
                    <th className="pb-3 pr-4 font-medium">Room Type</th>
                    <th className="pb-3 pr-4 font-medium">Device User ID</th>
                    <th className="pb-3 pr-4 font-medium">Updated By</th>
                    <th className="pb-3 font-medium">Message Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-slate-200">
                  {alerts.length > 0 ? (
                    alerts.map((alert) => (
                      <tr key={alert.id} className="align-top">
                        <td className="py-4 pr-4 font-medium text-white">
                          {alert.time}
                        </td>
                        <td className="py-4 pr-4">{alert.roomType}</td>
                        <td className="py-4 pr-4">{alert.deviceUserId}</td>
                        <td className="py-4 pr-4">{alert.updatedBy}</td>
                        <td className="py-4 text-emerald-300">{alert.messageStatus}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td className="py-6 text-slate-400" colSpan={5}>
                        No mock rental alerts yet. Click a room card to add one.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-6">
            <section className="rounded-3xl border border-white/10 bg-slate-950/60 p-6 shadow-lg shadow-slate-950/20">
              <h3 className="text-2xl font-semibold text-white">
                Device Finger Mapping
              </h3>
              <div className="mt-5 space-y-3 text-sm text-slate-300">
                <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                  <span>Thumb → Device User ID 101 → Single Room Rented</span>
                </div>
                <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                  <span>Index → Device User ID 102 → Double Room Rented</span>
                </div>
                <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                  <span>Middle → Device User ID 103 → Monthly Room Rented</span>
                </div>
                <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                  <span>Ring → Device User ID 104 → Family Room Rented</span>
                </div>
              </div>
            </section>

            <section className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-lg shadow-slate-950/20">
              <h3 className="text-2xl font-semibold text-white">
                WhatsApp Message Preview
              </h3>
              <pre className="mt-5 whitespace-pre-wrap rounded-2xl border border-white/10 bg-slate-950/70 p-4 text-sm leading-6 text-slate-200">
                {getPreviewMessage(latestAlert)}
              </pre>
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}
