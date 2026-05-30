"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { clearSessionValue } from "@/lib/sessionStore";
import {
  DEFAULT_SETTINGS,
  formatOwnerWhatsAppNumber,
  getSettingsSnapshot,
  type MansionSettings,
} from "@/lib/settingsStore";
import {
  DEFAULT_DEVICE_STATE,
  formatDeviceSyncTime,
  getDeviceStateSnapshot,
  setDeviceState as persistFallbackDeviceState,
  type MockDeviceState,
} from "@/lib/deviceStore";

type RoomType =
  | "Single Room"
  | "Double Room"
  | "Monthly Room"
  | "Family Room";

type DeviceUserId = 101 | 102 | 103 | 104;

type AlertStatus = "Mock Sent";

type AlertSource = "Dashboard Button" | "Mock Device Scan";

type AttendanceStatus = "IN" | "OUT";

type DatabaseMode = "loading" | "connected" | "fallback";

interface RentalAlertApiRecord {
  id: string;
  roomType: string;
  actionLabel: string;
  deviceUserId: number;
  updatedBy: string;
  source: string;
  messageStatus: string;
  alertDate: string;
  alertTime: string;
  createdAt: string;
}

interface RentalAlertCreateBody {
  roomType: string;
  actionLabel: string;
  deviceUserId: number;
  updatedBy: string;
  source: string;
  messageStatus: string;
  alertDate: string;
  alertTime: string;
}

interface RentalAlertRecord {
  id: string;
  roomType: RoomType;
  actionLabel: string;
  date: string;
  time: string;
  alertDate: string;
  alertTime: string;
  updatedBy: string;
  messageStatus: AlertStatus;
  deviceUserId: DeviceUserId;
  source: AlertSource;
  createdAtMs: number;
}

interface RoomAction {
  roomType: RoomType;
  actionLabel: string;
  deviceUserId: DeviceUserId;
  accent: string;
}

interface DeviceScanAction {
  deviceUserId: DeviceUserId;
  label: string;
}

interface WorkerAttendanceApiRecord {
  id: string;
  deviceUserId: number;
  status: AttendanceStatus;
  attendanceDate: string;
  attendanceTime: string;
  source: string;
  createdAt: string;
  worker: {
    name: string;
  };
}

interface WorkerAttendanceRecord {
  id: string;
  deviceUserId: number;
  status: AttendanceStatus;
  attendanceDate: string;
  attendanceTime: string;
  source: string;
  workerName: string;
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

const DEVICE_SCAN_ACTIONS: DeviceScanAction[] = [
  { deviceUserId: 101, label: "Simulate Device ID 101 Scan" },
  { deviceUserId: 102, label: "Simulate Device ID 102 Scan" },
  { deviceUserId: 103, label: "Simulate Device ID 103 Scan" },
  { deviceUserId: 104, label: "Simulate Device ID 104 Scan" },
];

const DUPLICATE_WINDOW_MS = 30_000;
const STORAGE_KEY = "mansion-rental-alert-history";
const EMPTY_ALERTS: RentalAlertRecord[] = [];
const TODAY_LABEL = formatDateParts(Date.now()).date;

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

function isAlertSource(value: string): value is AlertSource {
  return value === "Dashboard Button" || value === "Mock Device Scan";
}

function isRentalAlertApiRecord(value: unknown): value is RentalAlertApiRecord {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;

  return (
    typeof record.id === "string" &&
    typeof record.roomType === "string" &&
    typeof record.actionLabel === "string" &&
    typeof record.deviceUserId === "number" &&
    typeof record.updatedBy === "string" &&
    typeof record.source === "string" &&
    typeof record.messageStatus === "string" &&
    typeof record.alertDate === "string" &&
    typeof record.alertTime === "string" &&
    typeof record.createdAt === "string"
  );
}

function mapApiAlertToRecord(apiAlert: RentalAlertApiRecord): RentalAlertRecord {
  const createdAtMs = new Date(apiAlert.createdAt).getTime();
  const safeSource = isAlertSource(apiAlert.source)
    ? apiAlert.source
    : "Dashboard Button";
  const safeMessageStatus = isAlertStatus(apiAlert.messageStatus)
    ? apiAlert.messageStatus
    : "Mock Sent";
  const roomType = isRoomType(apiAlert.roomType)
    ? apiAlert.roomType
    : "Single Room";
  const deviceUserId = isDeviceUserId(apiAlert.deviceUserId)
    ? apiAlert.deviceUserId
    : 101;

  return {
    id: apiAlert.id,
    roomType,
    actionLabel: apiAlert.actionLabel,
    date: apiAlert.alertDate,
    time: apiAlert.alertTime,
    alertDate: apiAlert.alertDate,
    alertTime: apiAlert.alertTime,
    updatedBy: apiAlert.updatedBy,
    messageStatus: safeMessageStatus,
    deviceUserId,
    source: safeSource,
    createdAtMs: Number.isFinite(createdAtMs) ? createdAtMs : Date.now(),
  };
}

function toRentalAlertCreateBody(
  alert: RentalAlertRecord,
): RentalAlertCreateBody {
  return {
    roomType: alert.roomType,
    actionLabel: alert.actionLabel,
    deviceUserId: alert.deviceUserId,
    updatedBy: alert.updatedBy,
    source: alert.source,
    messageStatus: alert.messageStatus,
    alertDate: alert.alertDate,
    alertTime: alert.alertTime,
  };
}

function parseRentalAlertApiResponse(body: unknown): RentalAlertRecord[] {
  if (typeof body !== "object" || body === null) {
    return [];
  }

  const record = body as { success?: unknown; data?: unknown };

  if (!record.success || !Array.isArray(record.data)) {
    return [];
  }

  return record.data.flatMap((item) => {
    if (!isRentalAlertApiRecord(item)) {
      return [];
    }

    return [mapApiAlertToRecord(item)];
  });
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
      const source = record.source;
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
          alertDate: typeof record.alertDate === "string" ? record.alertDate : date,
          alertTime: typeof record.alertTime === "string" ? record.alertTime : time,
          updatedBy,
          messageStatus,
          deviceUserId,
          source:
            typeof source === "string" &&
            (source === "Dashboard Button" || source === "Mock Device Scan")
              ? source
              : "Dashboard Button",
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

function getRentalAlertServerSnapshot(): RentalAlertRecord[] {
  return EMPTY_ALERTS;
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

function replaceRentalAlertStore(
  alerts: RentalAlertRecord[],
  options: { persist?: boolean } = {},
): void {
  rentalAlertStore = alerts;
  rentalAlertStoreInitialized = true;
  if (options.persist) {
    persistAlerts(alerts);
  } else {
    removeStoredAlerts();
  }
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

function createAlertRecord(
  action: RoomAction,
  caretakerName: string,
  source: AlertSource,
): RentalAlertRecord {
  const createdAtMs = Date.now();
  const parts = formatDateParts(createdAtMs);

  return {
    id: crypto.randomUUID(),
    roomType: action.roomType,
    actionLabel: action.actionLabel,
    date: parts.date,
    time: parts.time,
    alertDate: parts.date,
    alertTime: parts.time,
    updatedBy: caretakerName,
    messageStatus: "Mock Sent",
    deviceUserId: action.deviceUserId,
    source,
    createdAtMs,
  };
}

function getNextRoomActionResult(
  alerts: RentalAlertRecord[],
  action: RoomAction,
  caretakerName: string,
  source: AlertSource,
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
    record: createAlertRecord(action, caretakerName, source),
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

Updated by: ${alert.updatedBy}
Source: ${alert.source}`;
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

function sanitizeDeviceStateRecord(record: Record<string, unknown>): MockDeviceState {
  const status = record.status;
  const lastSyncAt = record.lastSyncAt;

  return {
    status: status === "online" || status === "offline" ? status : DEFAULT_DEVICE_STATE.status,
    lastSyncAt: typeof lastSyncAt === "string" ? lastSyncAt : null,
  };
}

function parseDeviceStateApiResponse(body: unknown): MockDeviceState | null {
  if (typeof body !== "object" || body === null) {
    return null;
  }

  const record = body as { success?: unknown; data?: unknown };

  if (!record.success || typeof record.data !== "object" || record.data === null) {
    return null;
  }

  return sanitizeDeviceStateRecord(record.data as Record<string, unknown>);
}

function isWorkerAttendanceApiRecord(value: unknown): value is WorkerAttendanceApiRecord {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;

  return (
    typeof record.id === "string" &&
    typeof record.deviceUserId === "number" &&
    (record.status === "IN" || record.status === "OUT") &&
    typeof record.attendanceDate === "string" &&
    typeof record.attendanceTime === "string" &&
    typeof record.source === "string" &&
    typeof record.createdAt === "string" &&
    typeof record.worker === "object" &&
    record.worker !== null &&
    typeof (record.worker as Record<string, unknown>).name === "string"
  );
}

function parseWorkerAttendanceApiResponse(body: unknown): WorkerAttendanceRecord[] {
  if (typeof body !== "object" || body === null) {
    return [];
  }

  const record = body as { success?: unknown; data?: unknown };

  if (!record.success || !Array.isArray(record.data)) {
    return [];
  }

  return record.data.flatMap((item) => {
    if (!isWorkerAttendanceApiRecord(item)) {
      return [];
    }

    return [
      {
        id: item.id,
        deviceUserId: item.deviceUserId,
        status: item.status,
        attendanceDate: item.attendanceDate,
        attendanceTime: item.attendanceTime,
        source: item.source,
        workerName: item.worker.name,
      },
    ];
  });
}

export default function RentalDashboard() {
  const [isLoadingAlerts, setIsLoadingAlerts] = useState(true);
  const [isLoadingSettings, setIsLoadingSettings] = useState(true);
  const [isLoadingDeviceState, setIsLoadingDeviceState] = useState(true);
  const [databaseMode, setDatabaseMode] = useState<DatabaseMode>("loading");
  const [databaseNotice, setDatabaseNotice] = useState<string | null>(null);
  const [settingsNotice, setSettingsNotice] = useState<string | null>(null);
  const [deviceNotice, setDeviceNotice] = useState<string | null>(null);
  const [attendanceNotice, setAttendanceNotice] = useState<string | null>(null);
  const [settings, setSettings] = useState<MansionSettings>(DEFAULT_SETTINGS);
  const [deviceState, setDeviceStateState] = useState<MockDeviceState>(
    DEFAULT_DEVICE_STATE,
  );
  const [warning, setWarning] = useState<string | null>(null);
  const [activityMessage, setActivityMessage] = useState<string | null>(null);
  const [mappedScanDeviceUserId, setMappedScanDeviceUserId] = useState("");
  const [attendanceLogs, setAttendanceLogs] = useState<WorkerAttendanceRecord[]>([]);
  const [isLoadingAttendance, setIsLoadingAttendance] = useState(true);
  const alerts = useSyncExternalStore(
    subscribeToRentalAlertStore,
    getRentalAlertSnapshot,
    getRentalAlertServerSnapshot,
  );
  const router = useRouter();

  const latestAlert = alerts[0];
  const mansionName =
    settings.mansionName.trim().length > 0
      ? settings.mansionName
      : DEFAULT_SETTINGS.mansionName;
  const caretakerName =
    settings.caretakerName.trim().length > 0
      ? settings.caretakerName
      : DEFAULT_SETTINGS.caretakerName;
  const ownerWhatsAppLabel = formatOwnerWhatsAppNumber(
    settings.ownerWhatsAppNumber,
  );
  const deviceStatusLabel =
    deviceState.status === "online" ? "Mock Online" : "Mock Offline";
  const lastSyncLabel = formatDeviceSyncTime(deviceState.lastSyncAt);
  const todayLabel = TODAY_LABEL;
  const databaseModeLabel =
    databaseMode === "loading"
      ? "Loading"
      : databaseMode === "connected"
        ? "Connected"
        : "Fallback";

  const isLoadingPage =
    isLoadingAlerts || isLoadingSettings || isLoadingDeviceState || isLoadingAttendance;

  const reloadRentalAlerts = useCallback(async (): Promise<RentalAlertRecord[]> => {
    const response = await fetch("/api/rental-alerts", {
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`GET /api/rental-alerts failed (${response.status})`);
    }

    const body: unknown = await response.json();
    return parseRentalAlertApiResponse(body);
  }, []);

  const reloadWorkerAttendance = useCallback(async (): Promise<WorkerAttendanceRecord[]> => {
    const response = await fetch("/api/worker-attendance", {
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`GET /api/worker-attendance failed (${response.status})`);
    }

    const body: unknown = await response.json();
    return parseWorkerAttendanceApiResponse(body);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadRentalAlerts() {
      try {
        const loadedAlerts = await reloadRentalAlerts();

        if (cancelled) {
          return;
        }

        replaceRentalAlertStore(loadedAlerts);
        setDatabaseMode("connected");
        setDatabaseNotice(null);
      } catch {
        const fallbackAlerts = readStoredAlerts();

        if (cancelled) {
          return;
        }

        replaceRentalAlertStore(fallbackAlerts, { persist: true });
        setDatabaseMode("fallback");
        setDatabaseNotice("Database unavailable. Showing local fallback history.");
      } finally {
        if (!cancelled) {
          setIsLoadingAlerts(false);
        }
      }
    }

    void loadRentalAlerts();

    return () => {
      cancelled = true;
    };
  }, [reloadRentalAlerts]);

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

        setSettings(loadedSettings);
        setSettingsNotice(null);
      } catch {
        const fallbackSettings = getSettingsSnapshot();

        if (cancelled) {
          return;
        }

        setSettings(fallbackSettings);
        setSettingsNotice("Database unavailable. Settings fallback is active.");
      } finally {
        if (!cancelled) {
          setIsLoadingSettings(false);
        }
      }
    }

    void loadSettings();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadAttendanceLogs() {
      try {
        const loadedAttendance = await reloadWorkerAttendance();

        if (cancelled) {
          return;
        }

        setAttendanceLogs(loadedAttendance);
        setAttendanceNotice(null);
      } catch {
        if (cancelled) {
          return;
        }

        setAttendanceLogs([]);
        setAttendanceNotice("Database unavailable. Attendance history fallback is active.");
      } finally {
        if (!cancelled) {
          setIsLoadingAttendance(false);
        }
      }
    }

    void loadAttendanceLogs();

    return () => {
      cancelled = true;
    };
  }, [reloadWorkerAttendance]);

  useEffect(() => {
    let cancelled = false;

    async function loadDeviceState() {
      try {
        const response = await fetch("/api/device-state", {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error(`GET /api/device-state failed (${response.status})`);
        }

        const body: unknown = await response.json();
        const loadedDeviceState = parseDeviceStateApiResponse(body);

        if (!loadedDeviceState) {
          throw new Error("Invalid device state response from API.");
        }

        if (cancelled) {
          return;
        }

        setDeviceStateState(loadedDeviceState);
        setDeviceNotice(null);
      } catch {
        const fallbackDeviceState = getDeviceStateSnapshot();

        if (cancelled) {
          return;
        }

        setDeviceStateState(fallbackDeviceState);
        setDeviceNotice("Database unavailable. Device state fallback is active.");
      } finally {
        if (!cancelled) {
          setIsLoadingDeviceState(false);
        }
      }
    }

    void loadDeviceState();

    return () => {
      cancelled = true;
    };
  }, []);

  const counts = useMemo(() => {
    return ROOM_ACTIONS.reduce(
      (summary, action) => {
        summary[action.roomType] = alerts.filter(
          (alert) =>
            alert.roomType === action.roomType && alert.alertDate === todayLabel,
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
  }, [alerts, todayLabel]);

  const saveDeviceStateToDatabase = async (nextState: MockDeviceState) => {
    try {
      const response = await fetch("/api/device-state", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(nextState),
      });

      const body: unknown = await response.json();

      if (!response.ok) {
        throw new Error(
          typeof body === "object" && body !== null && "error" in body
            ? String((body as { error?: unknown }).error ?? "")
            : `PUT /api/device-state failed (${response.status})`,
        );
      }

      const savedDeviceState = parseDeviceStateApiResponse(body);

      if (!savedDeviceState) {
        throw new Error("Invalid device state response from API.");
      }

      setDeviceStateState(savedDeviceState);
      setDeviceNotice(null);
      return;
    } catch {
      persistFallbackDeviceState(nextState);
      setDeviceStateState(nextState);
      setDeviceNotice("Database unavailable. Device state fallback is active.");
    }
  };

  const saveAlertToDatabase = async (alert: RentalAlertRecord) => {
    const nextAlerts = [alert, ...alerts];

    try {
      const response = await fetch("/api/rental-alerts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(toRentalAlertCreateBody(alert)),
      });

      const body: unknown = await response.json();

      if (!response.ok) {
        throw new Error(
          typeof body === "object" && body !== null && "error" in body
            ? String((body as { error?: unknown }).error ?? "")
            : `POST /api/rental-alerts failed (${response.status})`,
        );
      }

      if (
        typeof body !== "object" ||
        body === null ||
        !("success" in body) ||
        !("data" in body) ||
        !body.success ||
        !isRentalAlertApiRecord((body as { data?: unknown }).data)
      ) {
        throw new Error("Invalid alert response from API.");
      }

      const savedAlert = mapApiAlertToRecord(
        (body as { data: RentalAlertApiRecord }).data,
      );

      replaceRentalAlertStore([savedAlert, ...alerts]);
      setDatabaseMode("connected");
      setDatabaseNotice(null);
      setWarning(null);
      return;
    } catch {
      replaceRentalAlertStore(nextAlerts, { persist: true });
      setDatabaseMode("fallback");
      setDatabaseNotice("Database unavailable. Showing local fallback history.");
      setWarning("Database save failed. Alert saved locally as fallback.");
    }
  };

  const handleClearDatabaseHistory = async () => {
    const confirmed = window.confirm(
      "Delete all rental alert records from the mansion database? This cannot be undone.",
    );

    if (!confirmed) {
      return;
    }

    try {
      const response = await fetch("/api/rental-alerts", {
        method: "DELETE",
      });
      const body: unknown = await response.json();

      if (
        !response.ok ||
        typeof body !== "object" ||
        body === null ||
        !("success" in body) ||
        !body.success
      ) {
        throw new Error(
          typeof body === "object" && body !== null && "error" in body
            ? String((body as { error?: unknown }).error ?? "")
            : `DELETE /api/rental-alerts failed (${response.status})`,
        );
      }

      const refreshedAlerts = await reloadRentalAlerts().catch(() => []);
      replaceRentalAlertStore(refreshedAlerts);
      setDatabaseMode("connected");
      setDatabaseNotice("Database rental alert history cleared.");
      setWarning(null);
    } catch {
      setDatabaseMode("fallback");
      setDatabaseNotice("Database unavailable. Showing local fallback history.");
      setWarning("Database clear failed. Alert history not deleted.");
    }
  };

  const handleRoomAction = (action: RoomAction) => {
    const result = getNextRoomActionResult(
      alerts,
      action,
      caretakerName,
      "Dashboard Button",
    );
    const nextRecord = result.record;

    if (result.duplicateWarning) {
      setWarning(result.duplicateWarning);
      return;
    }

    if (nextRecord) {
      void saveAlertToDatabase(nextRecord);
    }
  };

  const handleDeviceScan = (deviceUserId: DeviceUserId) => {
    if (deviceState.status === "offline") {
      setWarning("Mock device is offline. Scan ignored.");
      return;
    }

    const action = ROOM_ACTIONS.find(
      (roomAction) => roomAction.deviceUserId === deviceUserId,
    );

    if (!action) {
      return;
    }

    const result = getNextRoomActionResult(
      alerts,
      action,
      caretakerName,
      "Mock Device Scan",
    );

    if (result.duplicateWarning) {
      setWarning(result.duplicateWarning);
      return;
    }

    if (result.record) {
      void saveAlertToDatabase(result.record);
    }
  };

  const handleDeviceToggle = () => {
    void saveDeviceStateToDatabase({
      ...deviceState,
      status: deviceState.status === "online" ? "offline" : "online",
    });
  };

  const handleManualSync = () => {
    void saveDeviceStateToDatabase({
      ...deviceState,
      lastSyncAt: new Date().toISOString(),
    });
    setWarning("Mock device sync completed.");
  };

  const handleMappedFingerprintScan = async () => {
    if (deviceState.status === "offline") {
      setWarning("Mock device is offline. Scan ignored.");
      return;
    }

    const deviceUserId = Number(mappedScanDeviceUserId);

    if (!Number.isInteger(deviceUserId)) {
      setWarning("deviceUserId must be a number.");
      return;
    }

    const response = await fetch("/api/mock-fingerprint-scan", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        deviceUserId,
        source: "Mock Device Scan",
      }),
    });

    const body: unknown = await response.json();

    if (!response.ok) {
      const errorMessage =
        typeof body === "object" && body !== null && "error" in body
          ? String((body as { error?: unknown }).error ?? "")
          : "Unable to process mock scan.";
      setWarning(errorMessage);
      setActivityMessage(null);
      return;
    }

    if (
      typeof body === "object" &&
      body !== null &&
      "success" in body &&
      (body as { success?: unknown }).success === true &&
      "type" in body
    ) {
      const result = body as {
        type?: unknown;
        workerName?: unknown;
        status?: unknown;
        roomType?: unknown;
      };

      if (result.type === "attendance") {
        setWarning(null);
        setActivityMessage(
          `Attendance marked: ${String(result.workerName ?? "Worker")} ${String(result.status ?? "IN")}`,
        );
        setMappedScanDeviceUserId("");
        const refreshedAttendance = await reloadWorkerAttendance().catch(() => []);
        setAttendanceLogs(refreshedAttendance);
        return;
      }

      if (result.type === "rental") {
        setWarning(null);
        setActivityMessage(
          `Rental alert created: ${String(result.roomType ?? "Room")} by ${String(result.workerName ?? "Worker")}`,
        );
        setMappedScanDeviceUserId("");
        const refreshedAlerts = await reloadRentalAlerts().catch(() => []);
        replaceRentalAlertStore(refreshedAlerts);
        return;
      }
    }

    setActivityMessage(null);
    setWarning("Unable to process mock scan.");
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

  const handleLogout = () => {
    clearSessionValue();
    router.replace("/login");
  };

  if (isLoadingPage) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-slate-100">
        <div className="rounded-3xl border border-white/10 bg-white/5 px-6 py-8 text-sm text-slate-300 shadow-2xl shadow-slate-950/30">
          Loading dashboard data...
        </div>
      </main>
    );
  }

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
                  {mansionName}
                </h1>
                <p className="max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
                  Biometric room rental alerts for owner notifications
                </p>
                <p className="max-w-2xl text-xs leading-5 text-cyan-200/80">
                  PostgreSQL database connected
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4 text-sm text-slate-300">
              <p className="font-medium text-white">Current Mode</p>
              <p className="mt-1">Mock biometric mode active</p>
              <p>No real WhatsApp sent yet</p>
              <p>No real biometric device connected yet</p>
              <div className="mt-3 inline-flex rounded-full border border-cyan-300/20 bg-cyan-400/10 px-3 py-1 text-xs font-medium text-cyan-100">
                Database Mode: {databaseModeLabel}
              </div>
              <p className="mt-3 text-xs text-slate-400" data-testid="owner-whatsapp-label">
                {ownerWhatsAppLabel}
              </p>
              <nav className="mt-4 flex flex-wrap gap-2">
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
                <Link
                  href="/workers"
                  className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/10"
                >
                  Workers
                </Link>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/10"
                >
                  Logout
                </button>
              </nav>
            </div>
          </div>

          {warning ? (
            <div className="mt-6 rounded-2xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
              {warning}
            </div>
          ) : null}
          {activityMessage ? (
            <div className="mt-3 rounded-2xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
              {activityMessage}
            </div>
          ) : null}
          {databaseNotice ? (
            <div className="mt-3 rounded-2xl border border-cyan-300/30 bg-cyan-400/10 px-4 py-3 text-sm text-cyan-100">
              {databaseNotice}
            </div>
          ) : null}
          {settingsNotice ? (
            <div className="mt-3 rounded-2xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
              {settingsNotice}
            </div>
          ) : null}
          {deviceNotice ? (
            <div className="mt-3 rounded-2xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
              {deviceNotice}
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
              <span
                className="text-4xl font-bold text-cyan-200"
                data-testid="total-alerts-count"
              >
                {counts.total}
              </span>
              <span className="rounded-full border border-cyan-200/20 bg-cyan-200/10 px-3 py-1 text-xs text-cyan-100">
                all room types
              </span>
            </div>
          </article>
        </section>

        <section className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-lg shadow-slate-950/20">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 className="text-2xl font-semibold text-white">
                Mock Device Sync Panel
              </h3>
              <p className="mt-1 text-sm text-slate-400">
                Simulate biometric device scans before real hardware integration.
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-slate-300">
              <p className="text-xs uppercase tracking-[0.25em] text-slate-500">
                Device Status
              </p>
              <p className="mt-1 font-semibold text-white" data-testid="device-status-label">
                {deviceStatusLabel}
              </p>
              <p className="mt-2 text-xs text-slate-400">Last Sync Time</p>
              <p className="text-sm text-slate-200" data-testid="last-sync-label">
                {lastSyncLabel}
              </p>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleDeviceToggle}
              className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/10"
            >
              {deviceState.status === "online"
                ? "Set Mock Offline"
                : "Set Mock Online"}
            </button>
            <button
              type="button"
              onClick={handleManualSync}
              className="rounded-full bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
            >
              Manual Sync
            </button>
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-[1fr_1.2fr]">
            <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
              <h4 className="text-lg font-semibold text-white">Mapped FP ID Test Scan</h4>
              <p className="mt-1 text-sm text-slate-400">
                Use the mapped worker finger IDs to test attendance and room rental actions.
              </p>
              <p className="mt-2 text-xs text-cyan-200/80">
                In production, real biometric device sync will trigger this flow automatically. This manual input is only for testing.
              </p>
              <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                <input
                  value={mappedScanDeviceUserId}
                  onChange={(event) => setMappedScanDeviceUserId(event.target.value)}
                  placeholder="Device User ID"
                  data-testid="mapped-scan-input"
                  className="flex-1 rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/30"
                />
                <button
                  type="button"
                  onClick={handleMappedFingerprintScan}
                  data-testid="mapped-scan-button"
                  className="rounded-full bg-cyan-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
                >
                  Simulate Mapped Fingerprint Scan
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
              <h4 className="text-lg font-semibold text-white">Legacy Quick Mock Buttons</h4>
              <p className="mt-1 text-sm text-slate-400">
                These are only for development testing. The correct real-device flow is Workers page FP mapping + Mapped FP ID scan.
              </p>
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {DEVICE_SCAN_ACTIONS.map((scanAction) => (
                  <button
                    key={scanAction.deviceUserId}
                    type="button"
                    onClick={() => handleDeviceScan(scanAction.deviceUserId)}
                    className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-4 text-left text-sm text-white transition hover:bg-slate-900/80"
                  >
                    {scanAction.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-5 rounded-2xl border border-white/10 bg-slate-950/40 p-4 text-sm text-slate-300">
            <p className="font-medium text-white">Device User ID Mapping</p>
            <p className="mt-2">101 = Single Room</p>
            <p>102 = Double Room</p>
            <p>103 = Monthly Room</p>
            <p>104 = Family Room</p>
          </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-lg shadow-slate-950/20">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 className="text-2xl font-semibold text-white">Staff Attendance</h3>
              <p className="mt-1 text-sm text-slate-400">
                Latest attendance logs from the worker attendance database.
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-slate-300">
              <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Latest Logs</p>
              <p className="mt-1 font-semibold text-white">{attendanceLogs.length}</p>
            </div>
          </div>

          {attendanceNotice ? (
            <div className="mt-4 rounded-2xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
              {attendanceNotice}
            </div>
          ) : null}

          <div className="mt-6 overflow-x-auto">
            <table
              className="min-w-full divide-y divide-white/10 text-left text-sm"
              data-testid="staff-attendance-table"
            >
              <thead className="text-slate-400">
                <tr>
                  <th className="pb-3 pr-4 font-medium">Time</th>
                  <th className="pb-3 pr-4 font-medium">Worker</th>
                  <th className="pb-3 pr-4 font-medium">Device User ID</th>
                  <th className="pb-3 pr-4 font-medium">Status</th>
                  <th className="pb-3 font-medium">Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-slate-200">
                {attendanceLogs.length > 0 ? (
                  attendanceLogs.map((log) => (
                    <tr key={log.id} className="align-top">
                      <td className="py-4 pr-4 font-medium text-white">{log.attendanceTime}</td>
                      <td className="py-4 pr-4">{log.workerName}</td>
                      <td className="py-4 pr-4">{log.deviceUserId}</td>
                      <td className="py-4 pr-4">{log.status}</td>
                      <td className="py-4">{log.source}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="py-6 text-slate-400" colSpan={5} data-testid="attendance-empty">
                      No attendance logs yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-lg shadow-slate-950/20">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-2xl font-semibold text-white">
                  Recent Rental Alerts
                </h3>
                <p className="mt-1 text-sm text-slate-400">
                  Latest alerts saved in PostgreSQL database
                </p>
                <p className="mt-1 text-xs text-cyan-200/90">
                  Loaded from mansion PostgreSQL database
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={handleClearDatabaseHistory}
                  className="rounded-full border border-rose-300/20 bg-rose-400/10 px-4 py-2 text-sm font-medium text-rose-100 transition hover:bg-rose-400/20"
                >
                  Clear Database History
                </button>
                <button
                  type="button"
                  onClick={exportHistory}
                  className="rounded-full bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
                >
                  Export Alert History JSON
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
                    <th className="pb-3 pr-4 font-medium">Source</th>
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
                        <td className="py-4 pr-4">{alert.source}</td>
                        <td className="py-4 text-emerald-300">{alert.messageStatus}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td
                        className="py-6 text-slate-400"
                        colSpan={6}
                        data-testid="recent-alerts-empty"
                      >
                        No rental alerts yet. Use a room action or mapped fingerprint scan to create one.
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
