"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
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
import { getMansionDutyStatus } from "@/lib/mansionDutyStatus";

type RoomType =
  | "Single Room"
  | "Double Room"
  | "Monthly Room"
  | "Family Room";

type DeviceUserId = number;

type AlertStatus = "Mock Sent";

type AlertSource = string;

type AttendanceStatus = "IN" | "OUT";

type MessageLogMessageType = "RENTAL_ALERT" | "STAFF_ATTENDANCE";

type MessageLogStatus = "MOCK_SENT" | "PENDING" | "SENT" | "FAILED";

type MessageLogProvider = "MOCK" | "FAST2SMS";

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
  createdAtMs: number;
}

interface MessageLogApiRecord {
  id: string;
  messageType: MessageLogMessageType;
  recipient: string;
  templateName: string;
  templateVariables: unknown;
  messageBody: string;
  status: MessageLogStatus;
  provider: MessageLogProvider;
  relatedRentalAlertId: string | null;
  relatedAttendanceId: string | null;
  errorMessage: string | null;
  sentAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface MessageLogRecord {
  id: string;
  messageType: MessageLogMessageType;
  recipient: string;
  templateName: string;
  status: MessageLogStatus;
  provider: MessageLogProvider;
  related: string;
  errorMessage: string;
  createdAtMs: number;
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
  return typeof value === "number" && Number.isInteger(value);
}

function isAlertStatus(value: string): value is AlertStatus {
  return value === "Mock Sent";
}

function isAlertSource(value: string): value is AlertSource {
  return typeof value === "string" && value.trim().length > 0;
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

function formatDateInputValue(timestamp: number): string {
  const dateObject = new Date(timestamp);
  const year = dateObject.getFullYear();
  const month = String(dateObject.getMonth() + 1).padStart(2, "0");
  const day = String(dateObject.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getTodayDateInputValue(): string {
  return formatDateInputValue(Date.now());
}

function getThisMonthStartDateInputValue(): string {
  const now = new Date();
  return formatDateInputValue(new Date(now.getFullYear(), now.getMonth(), 1).getTime());
}

function formatReportDateTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

function buildReportFileName(fromDate: string, toDate: string): string {
  return `skc-mansion-report-${fromDate}-to-${toDate}.pdf`;
}

function buildDateRangeQuery(params: {
  fromDate: string;
  toDate: string;
  extra?: Record<string, string | number | undefined>;
}): string {
  const searchParams = new URLSearchParams();

  if (params.fromDate.trim().length > 0) {
    searchParams.set("from", params.fromDate);
  }

  if (params.toDate.trim().length > 0) {
    searchParams.set("to", params.toDate);
  }

  for (const [key, value] of Object.entries(params.extra ?? {})) {
    if (value === undefined) {
      continue;
    }

    searchParams.set(key, String(value));
  }

  const query = searchParams.toString();

  return query.length > 0 ? `?${query}` : "";
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
        createdAtMs: Number.isFinite(new Date(item.createdAt).getTime())
          ? new Date(item.createdAt).getTime()
          : 0,
      },
    ];
  });
}

function getAttendanceScanTime(log: WorkerAttendanceRecord): Date {
  if (Number.isFinite(log.createdAtMs) && log.createdAtMs > 0) {
    return new Date(log.createdAtMs);
  }

  const fallback = new Date(`${log.attendanceDate} ${log.attendanceTime}`);
  return Number.isNaN(fallback.getTime()) ? new Date() : fallback;
}

function getAttendanceDutyStatus(log: WorkerAttendanceRecord): string {
  return getMansionDutyStatus(log.workerName, getAttendanceScanTime(log));
}

function isMessageLogApiRecord(value: unknown): value is MessageLogApiRecord {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;

  return (
    typeof record.id === "string" &&
    (record.messageType === "RENTAL_ALERT" || record.messageType === "STAFF_ATTENDANCE") &&
    typeof record.recipient === "string" &&
    typeof record.templateName === "string" &&
    typeof record.messageBody === "string" &&
    (record.status === "MOCK_SENT" || record.status === "PENDING" || record.status === "SENT" || record.status === "FAILED") &&
    (record.provider === "MOCK" || record.provider === "FAST2SMS") &&
    (typeof record.relatedRentalAlertId === "string" || record.relatedRentalAlertId === null) &&
    (typeof record.relatedAttendanceId === "string" || record.relatedAttendanceId === null) &&
    (typeof record.errorMessage === "string" || record.errorMessage === null) &&
    (typeof record.sentAt === "string" || record.sentAt === null) &&
    typeof record.createdAt === "string"
  );
}

function parseMessageLogsApiResponse(body: unknown): MessageLogRecord[] {
  if (typeof body !== "object" || body === null) {
    return [];
  }

  const record = body as { success?: unknown; data?: unknown };

  if (!record.success || !Array.isArray(record.data)) {
    return [];
  }

  return record.data.flatMap((item) => {
    if (!isMessageLogApiRecord(item)) {
      return [];
    }

    const related =
      item.relatedRentalAlertId !== null
        ? `Rental Alert: ${item.relatedRentalAlertId}`
        : item.relatedAttendanceId !== null
          ? `Attendance: ${item.relatedAttendanceId}`
          : "-";

    return [
      {
        id: item.id,
        messageType: item.messageType,
        recipient: item.recipient,
        templateName: item.templateName,
        status: item.status,
        provider: item.provider,
        related,
        errorMessage: item.errorMessage ?? "",
        createdAtMs: Number.isFinite(new Date(item.createdAt).getTime())
          ? new Date(item.createdAt).getTime()
          : Date.now(),
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
  const [messageLogsNotice, setMessageLogsNotice] = useState<string | null>(null);
  const [settings, setSettings] = useState<MansionSettings>(DEFAULT_SETTINGS);
  const [deviceState, setDeviceStateState] = useState<MockDeviceState>(
    DEFAULT_DEVICE_STATE,
  );
  const [lastHeartbeatAt, setLastHeartbeatAt] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [activityMessage, setActivityMessage] = useState<string | null>(null);
  const [isDeveloperToolsOpen, setIsDeveloperToolsOpen] = useState(false);
  const [mappedScanDeviceUserId, setMappedScanDeviceUserId] = useState("");
  const [attendanceLogs, setAttendanceLogs] = useState<WorkerAttendanceRecord[]>([]);
  const [isLoadingAttendance, setIsLoadingAttendance] = useState(true);
  const [messageLogs, setMessageLogs] = useState<MessageLogRecord[]>([]);
  const [isLoadingMessageLogs, setIsLoadingMessageLogs] = useState(true);
  const [draftFromDate, setDraftFromDate] = useState(getTodayDateInputValue());
  const [draftToDate, setDraftToDate] = useState(getTodayDateInputValue());
  const [appliedFromDate, setAppliedFromDate] = useState(getTodayDateInputValue());
  const [appliedToDate, setAppliedToDate] = useState(getTodayDateInputValue());
  const [hasLoadedDashboardData, setHasLoadedDashboardData] = useState(false);
  const alerts = useSyncExternalStore(
    subscribeToRentalAlertStore,
    getRentalAlertSnapshot,
    getRentalAlertServerSnapshot,
  );
  const router = useRouter();

  const latestAlert = alerts[0];
  const mansionName = "SKC Mansion Alert System";
  const caretakerName =
    settings.caretakerName.trim().length > 0
      ? settings.caretakerName
      : DEFAULT_SETTINGS.caretakerName;
  const ownerWhatsAppLabel = formatOwnerWhatsAppNumber(
    settings.ownerWhatsAppNumber,
  );
  const lastSyncLabel = formatDeviceSyncTime(deviceState.lastSyncAt);

  const isDeviceOnline = (() => {
    if (!lastHeartbeatAt) return false;
    const parsed = Date.parse(lastHeartbeatAt);
    if (Number.isNaN(parsed)) return false;
    return Date.now() - parsed <= 30_000;
  })();

  const deviceStatusLabel = isDeviceOnline ? "Connected" : "Disconnected";
  const todayLabel = TODAY_LABEL;
  const databaseModeLabel =
    databaseMode === "loading"
      ? "Loading"
      : databaseMode === "connected"
        ? "Connected"
        : "Fallback";

  const whatsappModeLabel = messageLogs.some((m) => m.provider && m.provider !== "MOCK")
    ? "Real"
    : "Mock";

  const isLoadingPage =
    !hasLoadedDashboardData &&
    (isLoadingAlerts ||
      isLoadingSettings ||
      isLoadingDeviceState ||
      isLoadingAttendance ||
      isLoadingMessageLogs);

  const reloadRentalAlerts = useCallback(
    async (fromDate: string, toDate: string): Promise<RentalAlertRecord[]> => {
      const response = await fetch(
        `/api/rental-alerts${buildDateRangeQuery({ fromDate, toDate })}`,
        {
          cache: "no-store",
        },
      );

      if (!response.ok) {
        throw new Error(`GET /api/rental-alerts failed (${response.status})`);
      }

      const body: unknown = await response.json();
      return parseRentalAlertApiResponse(body);
    },
    [],
  );

  const reloadWorkerAttendance = useCallback(
    async (fromDate: string, toDate: string): Promise<WorkerAttendanceRecord[]> => {
      const response = await fetch(
        `/api/worker-attendance${buildDateRangeQuery({ fromDate, toDate })}`,
        {
          cache: "no-store",
        },
      );

      if (!response.ok) {
        throw new Error(`GET /api/worker-attendance failed (${response.status})`);
      }

      const body: unknown = await response.json();
      return parseWorkerAttendanceApiResponse(body);
    },
    [],
  );

  const reloadMessageLogs = useCallback(
    async (fromDate: string, toDate: string): Promise<MessageLogRecord[]> => {
      const response = await fetch(
        `/api/message-logs${buildDateRangeQuery({ fromDate, toDate, extra: { limit: 50 } })}`,
        {
          cache: "no-store",
        },
      );

      if (!response.ok) {
        throw new Error(`GET /api/message-logs failed (${response.status})`);
      }

      const body: unknown = await response.json();
      return parseMessageLogsApiResponse(body);
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;

    if (!hasLoadedDashboardData) {
      setIsLoadingAlerts(true);
      setIsLoadingAttendance(true);
      setIsLoadingMessageLogs(true);
    }

    async function loadDashboardData() {
      const loadRentalAlerts = async () => {
        try {
          const loadedAlerts = await reloadRentalAlerts(appliedFromDate, appliedToDate);

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
      };

      const loadAttendanceLogs = async () => {
        try {
          const loadedAttendance = await reloadWorkerAttendance(appliedFromDate, appliedToDate);

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
      };

      const loadLogs = async () => {
        try {
          const loadedMessageLogs = await reloadMessageLogs(appliedFromDate, appliedToDate);

          if (cancelled) {
            return;
          }

          setMessageLogs(loadedMessageLogs);
          setMessageLogsNotice(null);
        } catch {
          if (cancelled) {
            return;
          }

          setMessageLogs([]);
          setMessageLogsNotice("Message logs unavailable. Showing empty state.");
        } finally {
          if (!cancelled) {
            setIsLoadingMessageLogs(false);
          }
        }
      };

      await Promise.all([loadRentalAlerts(), loadAttendanceLogs(), loadLogs()]);

      if (!cancelled && !hasLoadedDashboardData) {
        setHasLoadedDashboardData(true);
      }
    }

    void loadDashboardData();

    return () => {
      cancelled = true;
    };
  }, [appliedFromDate, appliedToDate, hasLoadedDashboardData, reloadMessageLogs, reloadRentalAlerts, reloadWorkerAttendance]);

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

  // Poll device state frequently so the UI reflects real device heartbeat quickly
  useEffect(() => {
    let cancelled = false;

    async function pollDeviceState() {
      try {
        const response = await fetch('/api/device-state', { cache: 'no-store' });
        if (!response.ok) return;
        const body: unknown = await response.json();

        try {
          const raw = body as { data?: Record<string, unknown> };
          if (raw && raw.data) {
            const d = raw.data;
            const hb = d.lastHeartbeatAt && typeof d.lastHeartbeatAt === 'string' ? d.lastHeartbeatAt : null;
            const conn = d.connectionStatus && typeof d.connectionStatus === 'string' ? d.connectionStatus : null;
            if (!cancelled) {
              setLastHeartbeatAt(hb);
              setConnectionStatus(conn);
            }
          }
        } catch {
          // ignore parse errors during polling
        }
      } catch {
        // ignore network errors during polling
      }
    }

    // initial poll and then every 5 seconds
    void pollDeviceState();
    const id = setInterval(() => void pollDeviceState(), 5000);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadAttendanceLogs() {
      try {
        const loadedAttendance = await reloadWorkerAttendance(appliedFromDate, appliedToDate);

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

    async function loadMessageLogs() {
      try {
        const loadedMessageLogs = await reloadMessageLogs(appliedFromDate, appliedToDate);

        if (cancelled) {
          return;
        }

        setMessageLogs(loadedMessageLogs);
        setMessageLogsNotice(null);
      } catch {
        if (cancelled) {
          return;
        }

        setMessageLogs([]);
        setMessageLogsNotice("Message logs unavailable. Showing empty state.");
      } finally {
        if (!cancelled) {
          setIsLoadingMessageLogs(false);
        }
      }
    }

    void loadMessageLogs();

    return () => {
      cancelled = true;
    };
  }, [reloadMessageLogs]);

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

        // Extract heartbeat and connectionStatus from raw API response
        let hb: string | null = null;
        let conn: string | null = null;
        try {
          const raw = body as { data?: Record<string, unknown> };
          if (raw && raw.data) {
            const d = raw.data;
            if (d.lastHeartbeatAt && typeof d.lastHeartbeatAt === "string") {
              hb = d.lastHeartbeatAt;
            }
            if (d.connectionStatus && typeof d.connectionStatus === "string") {
              conn = d.connectionStatus;
            }
          }
        } catch {
          hb = null;
          conn = null;
        }

        if (cancelled) {
          return;
        }

        setDeviceStateState(loadedDeviceState);
        setLastHeartbeatAt(hb);
        setConnectionStatus(conn);
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
    const normalizedCounts = ROOM_ACTIONS.reduce(
      (summary, action) => {
        summary[action.roomType] = 0;
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

    const normalizedTypes = new Map<string, RoomType>(
      ROOM_ACTIONS.map((action) => [action.roomType.toLowerCase(), action.roomType]),
    );

    for (const alert of alerts) {
      normalizedCounts.total += 1;

      const roomTypeKey = alert.roomType.trim().toLowerCase();
      const normalizedRoomType = normalizedTypes.get(roomTypeKey);

      if (normalizedRoomType) {
        normalizedCounts[normalizedRoomType] += 1;
      }
    }

    return normalizedCounts;
  }, [alerts]);

  const attendanceLogsWithDutyStatus = useMemo(
    () =>
      attendanceLogs.map((log) => ({
        ...log,
        dutyStatus: getAttendanceDutyStatus(log),
      })),
    [attendanceLogs],
  );

  const reportSummary = useMemo(
    () => ({
      singleRoomAlerts: counts["Single Room"],
      doubleRoomAlerts: counts["Double Room"],
      monthlyRoomAlerts: counts["Monthly Room"],
      familyRoomAlerts: counts["Family Room"],
      totalRentalAlerts: counts.total,
      staffAttendanceLogs: attendanceLogs.length,
      messageLogs: messageLogs.length,
    }),
    [attendanceLogs.length, counts, messageLogs.length],
  );

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
      void reloadMessageLogs(appliedFromDate, appliedToDate)
        .then((loadedMessageLogs) => {
          setMessageLogs(loadedMessageLogs);
          setMessageLogsNotice(null);
        })
        .catch(() => undefined);
      return;
    } catch {
      replaceRentalAlertStore(nextAlerts, { persist: true });
      setDatabaseMode("fallback");
      setDatabaseNotice("Database unavailable. Showing local fallback history.");
      setWarning("Database save failed. Alert saved locally as fallback.");
    }
  };

  const handleClearDatabaseHistory = async () => {
    if (appliedFromDate.trim().length === 0 || appliedToDate.trim().length === 0) {
      setDatabaseNotice("Date range is required for delete.");
      return;
    }

    const confirmed = window.confirm(
      `This will delete rental alert logs only from the selected date range: ${appliedFromDate} to ${appliedToDate}. Continue?`,
    );

    if (!confirmed) {
      return;
    }

    try {
      const query = buildDateRangeQuery({ fromDate: appliedFromDate, toDate: appliedToDate });
      const response = await fetch(`/api/rental-alerts${query}`, {
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

      const refreshedAlerts = await reloadRentalAlerts(appliedFromDate, appliedToDate).catch(() => []);
      replaceRentalAlertStore(refreshedAlerts);
      setDatabaseMode("connected");
      setDatabaseNotice("Rental alert logs deleted for selected date range.");
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

  const handleRefreshMessageLogs = () => {
    void reloadMessageLogs(appliedFromDate, appliedToDate)
      .then((loadedMessageLogs) => {
        setMessageLogs(loadedMessageLogs);
        setMessageLogsNotice(null);
      })
      .catch(() => {
        setMessageLogs([]);
        setMessageLogsNotice("Message logs unavailable. Showing empty state.");
      });
  };

  const handleClearAttendanceLogs = async () => {
    if (appliedFromDate.trim().length === 0 || appliedToDate.trim().length === 0) {
      setAttendanceNotice("Date range is required for delete.");
      return;
    }

    const confirmed = window.confirm(
      `This will delete staff attendance logs only from the selected date range: ${appliedFromDate} to ${appliedToDate}. Continue?`,
    );

    if (!confirmed) {
      return;
    }

    try {
      const query = buildDateRangeQuery({ fromDate: appliedFromDate, toDate: appliedToDate });
      const response = await fetch(`/api/worker-attendance${query}`, {
        method: "DELETE",
      });
      const body: unknown = await response.json();

      if (
        !response.ok ||
        typeof body !== "object" ||
        body === null ||
        !("success" in body) ||
        !(body as { success?: unknown }).success
      ) {
        throw new Error(
          typeof body === "object" && body !== null && "error" in body
            ? String((body as { error?: unknown }).error ?? "")
            : `DELETE /api/worker-attendance failed (${response.status})`,
        );
      }

      const refreshedAttendance = await reloadWorkerAttendance(appliedFromDate, appliedToDate).catch(() => []);
      setAttendanceLogs(refreshedAttendance);
      setAttendanceNotice("Attendance logs deleted for selected date range.");
    } catch {
      setAttendanceNotice("Unable to clear staff attendance logs.");
    }
  };

  const handleClearMessageLogs = async () => {
    if (appliedFromDate.trim().length === 0 || appliedToDate.trim().length === 0) {
      setMessageLogsNotice("Date range is required for delete.");
      return;
    }

    const confirmed = window.confirm(
      `This will delete message logs only from the selected date range: ${appliedFromDate} to ${appliedToDate}. Continue?`,
    );

    if (!confirmed) {
      return;
    }

    try {
      const query = buildDateRangeQuery({ fromDate: appliedFromDate, toDate: appliedToDate });
      const response = await fetch(`/api/message-logs${query}`, {
        method: "DELETE",
      });
      const body: unknown = await response.json();

      if (
        !response.ok ||
        typeof body !== "object" ||
        body === null ||
        !("success" in body) ||
        !(body as { success?: unknown }).success
      ) {
        throw new Error(
          typeof body === "object" && body !== null && "error" in body
            ? String((body as { error?: unknown }).error ?? "")
            : `DELETE /api/message-logs failed (${response.status})`,
        );
      }

      setMessageLogs([]);
      setMessageLogsNotice("Message logs deleted for selected date range.");
    } catch {
      setMessageLogsNotice("Unable to clear message logs.");
    }
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
        const refreshedAttendance = await reloadWorkerAttendance(appliedFromDate, appliedToDate).catch(() => []);
        setAttendanceLogs(refreshedAttendance);
        const refreshedMessageLogs = await reloadMessageLogs(appliedFromDate, appliedToDate).catch(() => []);
        setMessageLogs(refreshedMessageLogs);
        return;
      }

      if (result.type === "rental") {
        setWarning(null);
        setActivityMessage(
          `Rental alert created: ${String(result.roomType ?? "Room")} by ${String(result.workerName ?? "Worker")}`,
        );
        setMappedScanDeviceUserId("");
        const refreshedAlerts = await reloadRentalAlerts(appliedFromDate, appliedToDate).catch(() => []);
        replaceRentalAlertStore(refreshedAlerts);
        const refreshedMessageLogs = await reloadMessageLogs(appliedFromDate, appliedToDate).catch(() => []);
        setMessageLogs(refreshedMessageLogs);
        return;
      }
    }

    setActivityMessage(null);
    setWarning("Unable to process mock scan.");
  };

  const handleSetToday = () => {
    const todayDate = getTodayDateInputValue();
    setDraftFromDate(todayDate);
    setDraftToDate(todayDate);
  };

  const handleSetThisMonth = () => {
    setDraftFromDate(getThisMonthStartDateInputValue());
    setDraftToDate(getTodayDateInputValue());
  };

  const handleApplyDateFilter = async () => {
    setAppliedFromDate(draftFromDate);
    setAppliedToDate(draftToDate);
    setActivityMessage(null);
    setWarning(null);

    try {
      const refreshedAlerts = await reloadRentalAlerts(draftFromDate, draftToDate).catch(() => []);
      replaceRentalAlertStore(refreshedAlerts);

      const refreshedAttendance = await reloadWorkerAttendance(draftFromDate, draftToDate).catch(() => []);
      setAttendanceLogs(refreshedAttendance);

      const refreshedMessageLogs = await reloadMessageLogs(draftFromDate, draftToDate).catch(() => []);
      setMessageLogs(refreshedMessageLogs);
    } catch (err) {
      setWarning(`Error applying date filter: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const handleDownloadPdfReport = async () => {
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const leftMargin = 40;
    const rightMargin = 40;
    const contentWidth = pageWidth - leftMargin - rightMargin;
    const titleColor: [number, number, number] = [11, 31, 58];
    const accentColor: [number, number, number] = [212, 175, 55];

    const noRecords =
      alerts.length === 0 && attendanceLogs.length === 0 && messageLogs.length === 0;

    doc.setTextColor(...titleColor);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.text("SKC Mansion Report", leftMargin, 48);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.text(`Date Range: ${appliedFromDate} to ${appliedToDate}`, leftMargin, 72);

    doc.setDrawColor(...accentColor);
    doc.setLineWidth(1);
    doc.line(leftMargin, 82, pageWidth - rightMargin, 82);

    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text("Summary", leftMargin, 104);

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    const summaryLines = [
      `Single Room alerts count: ${reportSummary.singleRoomAlerts}`,
      `Double Room alerts count: ${reportSummary.doubleRoomAlerts}`,
      `Monthly Room alerts count: ${reportSummary.monthlyRoomAlerts}`,
      `Family Room alerts count: ${reportSummary.familyRoomAlerts}`,
      `Total rental alerts: ${reportSummary.totalRentalAlerts}`,
      `Staff attendance logs count: ${reportSummary.staffAttendanceLogs}`,
      `Message logs count: ${reportSummary.messageLogs}`,
    ];

    let summaryY = 122;
    for (const line of summaryLines) {
      doc.text(line, leftMargin, summaryY);
      summaryY += 16;
    }

    if (noRecords) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text("No records for selected date range.", leftMargin, summaryY + 10);
    }

    const renderSectionTitle = (title: string) => {
      const nextY = (doc as jsPDF & { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? summaryY;
      const y = Math.max(nextY + 28, summaryY + 28);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.text(title, leftMargin, y);
      return y + 10;
    };

    const renderTable = (
      title: string,
      columns: string[],
      rows: string[][],
    ) => {
      const startY = renderSectionTitle(title);
      autoTable(doc, {
        startY,
        head: [columns],
        body:
          rows.length > 0
            ? rows
            : [
                [
                  {
                    content: "No records for selected date range.",
                    colSpan: columns.length,
                    styles: { halign: "center", fontStyle: "italic" },
                  } as any,
                ],
              ],
        styles: {
          fontSize: 9,
          cellPadding: 4,
          textColor: [11, 31, 58],
        },
        headStyles: {
          fillColor: [11, 31, 58],
          textColor: [255, 255, 255],
          fontStyle: "bold",
        },
        alternateRowStyles: {
          fillColor: [248, 250, 252],
        },
        margin: { left: leftMargin, right: rightMargin },
        tableWidth: contentWidth,
      });
    };

    renderTable(
      "Room Rental Details",
      ["Time", "Room Type", "Device User ID", "Updated By", "Message Status"],
      alerts.map((alert) => [
        alert.time,
        alert.roomType,
        String(alert.deviceUserId),
        alert.updatedBy,
        alert.messageStatus,
      ]),
    );

    renderTable(
      "Staff Attendance Details",
      ["Time", "Worker", "Device User ID", "Status", "Duty Status", "Source"],
      attendanceLogsWithDutyStatus.map((log) => [
        log.attendanceTime,
        log.workerName,
        String(log.deviceUserId),
        log.status,
        log.dutyStatus,
        log.source,
      ]),
    );

    renderTable(
      "Message Logs",
      ["Time", "Type", "Recipient", "Status"],
      messageLogs.map((log) => [
        formatReportDateTime(log.createdAtMs),
        log.messageType,
        log.recipient,
        log.status,
      ]),
    );

    doc.save(buildReportFileName(appliedFromDate, appliedToDate));
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
    <main className="min-h-screen bg-[#F8FAFC] px-4 py-6 text-[#64748B] sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <section className="rounded-3xl border border-[#D4AF37]/30 bg-gradient-to-r from-[#07162A] to-[#0B1F3A] p-6 shadow-xl xl:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-3">
              <h1 className="text-3xl font-semibold tracking-tight text-[#FFFFFF] sm:text-4xl">
                {mansionName}
              </h1>
              <p className="text-sm text-[#F5E6A8] sm:text-base">
                Room rental and staff attendance dashboard
              </p>
              <div className="flex flex-wrap gap-2 text-xs font-medium">
                <span className="inline-flex items-center gap-2 rounded-full border border-[#D4AF37]/70 bg-[#FFFFFF]/10 px-3 py-1 text-[#FFFFFF]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#D4AF37]" />
                  Database: {databaseModeLabel}
                </span>
                <span className="inline-flex items-center gap-2 rounded-full border border-[#D4AF37]/70 bg-[#FFFFFF]/10 px-3 py-1 text-[#FFFFFF]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#D4AF37]" />
                  Biometric Device: {deviceStatusLabel}
                </span>
                <span className="inline-flex items-center gap-2 rounded-full border border-[#D4AF37]/70 bg-[#FFFFFF]/10 px-3 py-1 text-[#FFFFFF]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#D4AF37]" />
                  WhatsApp Mode: {whatsappModeLabel}
                </span>
                <span className="inline-flex items-center gap-2 rounded-full border border-[#D4AF37]/70 bg-[#FFFFFF]/10 px-3 py-1 text-[#FFFFFF]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#D4AF37]" />
                  Owner WhatsApp: {ownerWhatsAppLabel}
                </span>
              </div>
            </div>

            <div className="w-full max-w-xl space-y-4 rounded-2xl border border-[#D4AF37]/40 bg-[#FFFFFF]/10 p-4 text-sm text-[#FFFFFF]">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-full border border-[#F5E6A8]/60 bg-[#F5E6A8]/20 px-3 py-1 font-medium text-[#FFFFFF]">
                  Database Mode: {databaseModeLabel}
                </span>
                <span className="rounded-full border border-[#FFFFFF]/40 bg-[#FFFFFF]/10 px-3 py-1 font-medium text-[#FFFFFF]">
                  Secure Mock Environment
                </span>
              </div>

              <p className="text-xs text-[#F8FAFC]" data-testid="owner-whatsapp-label">
                {ownerWhatsAppLabel}
              </p>

              <nav className="flex flex-wrap gap-2">
                <Link
                  href="/dashboard"
                  className="rounded-full border border-[#D4AF37] bg-[#0B1F3A] px-4 py-2 text-sm font-semibold text-[#FFFFFF]"
                >
                  Dashboard
                </Link>
                <Link
                  href="/settings"
                  className="rounded-full border border-[#FFFFFF]/40 bg-[#FFFFFF]/10 px-4 py-2 text-sm font-medium text-[#FFFFFF] transition hover:bg-[#FFFFFF]/20"
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
                  onClick={handleLogout}
                  className="rounded-full border border-[#FFFFFF]/40 bg-[#FFFFFF]/10 px-4 py-2 text-sm font-medium text-[#FFFFFF] transition hover:bg-[#FFFFFF]/20"
                >
                  Logout
                </button>
              </nav>
            </div>
          </div>

          {warning ? (
            <div className="mt-6 rounded-2xl border border-[#D4AF37]/60 bg-[#F5E6A8]/20 px-4 py-3 text-sm text-[#FFFFFF]">
              {warning}
            </div>
          ) : null}
          {activityMessage ? (
            <div className="mt-3 rounded-2xl border border-[#F5E6A8]/60 bg-[#FFFFFF]/10 px-4 py-3 text-sm text-[#FFFFFF]">
              {activityMessage}
            </div>
          ) : null}
          {databaseNotice ? (
            <div className="mt-3 rounded-2xl border border-[#D4AF37]/60 bg-[#FFFFFF]/10 px-4 py-3 text-sm text-[#FFFFFF]">
              {databaseNotice}
            </div>
          ) : null}
          {settingsNotice ? (
            <div className="mt-3 rounded-2xl border border-[#D4AF37]/60 bg-[#FFFFFF]/10 px-4 py-3 text-sm text-[#FFFFFF]">
              {settingsNotice}
            </div>
          ) : null}
          {deviceNotice ? (
            <div className="mt-3 rounded-2xl border border-[#D4AF37]/60 bg-[#FFFFFF]/10 px-4 py-3 text-sm text-[#FFFFFF]">
              {deviceNotice}
            </div>
          ) : null}
          {messageLogsNotice ? (
            <div className="mt-3 rounded-2xl border border-[#D4AF37]/60 bg-[#FFFFFF]/10 px-4 py-3 text-sm text-[#FFFFFF]">
              {messageLogsNotice}
            </div>
          ) : null}
        </section>

        <section className="rounded-3xl border border-[#D4AF37]/30 bg-[#FFFFFF] p-6 shadow-sm">
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-[#0B1F3A]">Date Range Filter</h3>
              <p className="mt-1 text-sm text-[#64748B]">Filter rental alerts, attendance logs, and messages by date</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="from-date" className="block text-sm font-medium text-[#0B1F3A]">
                  From Date
                </label>
                <input
                  id="from-date"
                  type="date"
                  value={draftFromDate}
                  onChange={(e) => setDraftFromDate(e.target.value)}
                  className="mt-2 w-full rounded-lg border border-[#D4AF37]/60 bg-[#F8FAFC] px-3 py-2 text-sm text-[#0B1F3A] transition focus:border-[#D4AF37] focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/20"
                />
              </div>
              <div>
                <label htmlFor="to-date" className="block text-sm font-medium text-[#0B1F3A]">
                  To Date
                </label>
                <input
                  id="to-date"
                  type="date"
                  value={draftToDate}
                  onChange={(e) => setDraftToDate(e.target.value)}
                  className="mt-2 w-full rounded-lg border border-[#D4AF37]/60 bg-[#F8FAFC] px-3 py-2 text-sm text-[#0B1F3A] transition focus:border-[#D4AF37] focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/20"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleSetToday}
                className="rounded-lg border border-[#D4AF37]/60 bg-[#F8FAFC] px-4 py-2 text-sm font-medium text-[#0B1F3A] transition hover:bg-[#F5E6A8]/30"
              >
                Today
              </button>
              <button
                type="button"
                onClick={handleSetThisMonth}
                className="rounded-lg border border-[#D4AF37]/60 bg-[#F8FAFC] px-4 py-2 text-sm font-medium text-[#0B1F3A] transition hover:bg-[#F5E6A8]/30"
              >
                This Month
              </button>
              <button
                type="button"
                onClick={handleApplyDateFilter}
                className="rounded-lg border border-[#0B1F3A] bg-[#0B1F3A] px-4 py-2 text-sm font-semibold text-[#FFFFFF] transition hover:bg-[#07162A]"
              >
                Apply Filter
              </button>
              <button
                type="button"
                onClick={handleDownloadPdfReport}
                className="rounded-lg border border-[#D4AF37]/60 bg-[#FFFFFF] px-4 py-2 text-sm font-semibold text-[#0B1F3A] transition hover:bg-[#F5E6A8]/30"
              >
                Download PDF Report
              </button>
            </div>

            <div className="rounded-lg border border-[#D4AF37]/40 bg-[#F5E6A8]/10 px-3 py-2 text-xs text-[#0B1F3A]">
              <span className="font-medium">Applied Range:</span> {appliedFromDate} to {appliedToDate}
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {ROOM_ACTIONS.map((action) => (
            <article
              key={action.roomType}
              className="rounded-3xl border border-[#D4AF37]/30 bg-[#FFFFFF] p-5 shadow-sm"
            >
              <p className="text-sm text-[#64748B]">{appliedFromDate === appliedToDate ? 'Single Day' : 'Date Range'} View</p>
              <h3 className="mt-2 text-xl font-semibold text-[#0B1F3A]">{action.roomType}</h3>
              <div className="mt-4 flex items-end justify-between">
                <span className="text-4xl font-bold text-[#0B1F3A]">{counts[action.roomType]}</span>
                <span className="rounded-full border border-[#D4AF37]/40 bg-[#F5E6A8]/30 px-3 py-1 text-xs text-[#0B1F3A]">
                  {appliedFromDate === appliedToDate ? 'alerts' : 'in range'}
                </span>
              </div>
            </article>
          ))}

          <article className="rounded-3xl border border-[#D4AF37]/60 bg-[#FFFFFF] p-5 shadow-sm xl:col-span-1">
            <p className="text-sm text-[#64748B]">{appliedFromDate === appliedToDate ? 'Single Day' : 'Date Range'} View</p>
            <h3 className="mt-2 text-xl font-semibold text-[#0B1F3A]">Total Alerts</h3>
            <div className="mt-4 flex items-end justify-between">
              <span className="text-4xl font-bold text-[#0B1F3A]" data-testid="total-alerts-count">
                {counts.total}
              </span>
              <span className="rounded-full border border-[#D4AF37]/40 bg-[#F5E6A8]/30 px-3 py-1 text-xs text-[#0B1F3A]">
                all room types
              </span>
            </div>
          </article>
        </section>

        <section className="rounded-3xl border border-[#D4AF37]/30 bg-[#FFFFFF] p-6 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-2xl font-semibold text-[#0B1F3A]">Recent Rental Alerts</h3>
              <p className="mt-1 text-sm text-[#64748B]">Latest alerts saved in PostgreSQL database</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleClearDatabaseHistory}
                className="rounded-full border border-[#D4AF37]/60 bg-[#FFFFFF] px-4 py-2 text-sm font-medium text-[#0B1F3A] transition hover:bg-[#F5E6A8]/30"
              >
                Delete Rental Logs for Selected Date
              </button>
              <button
                type="button"
                onClick={exportHistory}
                className="rounded-full border border-[#0B1F3A] bg-[#0B1F3A] px-4 py-2 text-sm font-semibold text-[#FFFFFF] transition hover:bg-[#07162A]"
              >
                Export Alert History JSON
              </button>
            </div>
          </div>

          <div className="mt-6 overflow-x-auto">
            <table className="min-w-full divide-y divide-[#E2E8F0] text-left text-sm">
              <thead className="text-[#64748B]">
                <tr>
                  <th className="pb-3 pr-4 font-medium">Time</th>
                  <th className="pb-3 pr-4 font-medium">Room Type</th>
                  <th className="pb-3 pr-4 font-medium">Device User ID</th>
                  <th className="pb-3 pr-4 font-medium">Updated By</th>
                  <th className="pb-3 pr-4 font-medium">Source</th>
                  <th className="pb-3 font-medium">Message Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F5F9] text-[#0B1F3A]">
                {alerts.length > 0 ? (
                  alerts.map((alert) => (
                    <tr key={alert.id} className="align-top">
                      <td className="py-4 pr-4 font-medium">{alert.time}</td>
                      <td className="py-4 pr-4">{alert.roomType}</td>
                      <td className="py-4 pr-4">{alert.deviceUserId}</td>
                      <td className="py-4 pr-4">{alert.updatedBy}</td>
                      <td className="py-4 pr-4">{alert.source}</td>
                      <td className="py-4 text-[#0B1F3A]">{alert.messageStatus}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="py-6 text-[#64748B]" colSpan={6} data-testid="recent-alerts-empty">
                      No rental alerts yet. Use a room action or mapped fingerprint scan to create one.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-3xl border border-[#D4AF37]/30 bg-[#FFFFFF] p-6 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 className="text-2xl font-semibold text-[#0B1F3A]">Staff Attendance</h3>
              <p className="mt-1 text-sm text-[#64748B]">
                Latest attendance logs from the worker attendance database.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:items-end">
              <div className="rounded-2xl border border-[#D4AF37]/30 bg-[#F8FAFC] px-4 py-3 text-sm text-[#64748B]">
                <p className="text-xs uppercase tracking-[0.25em] text-[#64748B]">Latest Logs</p>
                <p className="mt-1 font-semibold text-[#0B1F3A]">{attendanceLogs.length}</p>
              </div>
              <button
                type="button"
                onClick={handleClearAttendanceLogs}
                className="rounded-full border border-[#D4AF37]/60 bg-[#FFFFFF] px-4 py-2 text-sm font-medium text-[#0B1F3A] transition hover:bg-[#F5E6A8]/30"
              >
                Delete Attendance Logs for Selected Date
              </button>
            </div>
          </div>

          {attendanceNotice ? (
            <div className="mt-4 rounded-2xl border border-[#D4AF37]/60 bg-[#F5E6A8]/30 px-4 py-3 text-sm text-[#0B1F3A]">
              {attendanceNotice}
            </div>
          ) : null}

          <div className="mt-6 overflow-x-auto">
            <table className="min-w-full divide-y divide-[#E2E8F0] text-left text-sm" data-testid="staff-attendance-table">
              <thead className="text-[#64748B]">
                <tr>
                  <th className="pb-3 pr-4 font-medium">Time</th>
                  <th className="pb-3 pr-4 font-medium">Worker</th>
                  <th className="pb-3 pr-4 font-medium">Device User ID</th>
                  <th className="pb-3 pr-4 font-medium">Status</th>
                  <th className="pb-3 pr-4 font-medium">Duty Status</th>
                  <th className="pb-3 font-medium">Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F5F9] text-[#0B1F3A]">
                {attendanceLogsWithDutyStatus.length > 0 ? (
                  attendanceLogsWithDutyStatus.map((log) => (
                    <tr key={log.id} className="align-top">
                      <td className="py-4 pr-4 font-medium">{log.attendanceTime}</td>
                      <td className="py-4 pr-4">{log.workerName}</td>
                      <td className="py-4 pr-4">{log.deviceUserId}</td>
                      <td className="py-4 pr-4">{log.status}</td>
                      <td className="py-4 pr-4">{log.dutyStatus}</td>
                      <td className="py-4">{log.source}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="py-6 text-[#64748B]" colSpan={5} data-testid="attendance-empty">
                      No attendance logs yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-3xl border border-[#D4AF37]/30 bg-[#FFFFFF] p-6 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 className="text-2xl font-semibold text-[#0B1F3A]">Message Logs</h3>
              <p className="mt-1 text-sm text-[#64748B]" data-testid="message-logs-subtitle">
                Mock WhatsApp message history. No real WhatsApp is sent in this version.
              </p>
            </div>
            <div className="rounded-2xl border border-[#D4AF37]/30 bg-[#F8FAFC] px-4 py-3 text-sm text-[#64748B]">
              <p className="text-xs uppercase tracking-[0.25em] text-[#64748B]">Total Logs</p>
              <p className="mt-1 font-semibold text-[#0B1F3A]" data-testid="message-logs-count">
                {messageLogs.length}
              </p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleClearMessageLogs}
              className="rounded-full border border-[#D4AF37]/60 bg-[#FFFFFF] px-4 py-2 text-sm font-medium text-[#0B1F3A] transition hover:bg-[#F5E6A8]/30"
            >
              Delete Message Logs for Selected Date
            </button>
            <button
              type="button"
              onClick={handleRefreshMessageLogs}
              className="rounded-full border border-[#0B1F3A] bg-[#0B1F3A] px-4 py-2 text-sm font-semibold text-[#FFFFFF] transition hover:bg-[#07162A]"
            >
              Refresh Message Logs
            </button>
          </div>

          <div className="mt-6 overflow-x-auto">
            <table className="min-w-full divide-y divide-[#E2E8F0] text-left text-sm" data-testid="message-logs-table">
              <thead className="text-[#64748B]">
                <tr>
                  <th className="pb-3 pr-4 font-medium">Time</th>
                  <th className="pb-3 pr-4 font-medium">Type</th>
                  <th className="pb-3 pr-4 font-medium">Recipient</th>
                  <th className="pb-3 pr-4 font-medium">Template</th>
                  <th className="pb-3 pr-4 font-medium">Status</th>
                  <th className="pb-3 pr-4 font-medium">Provider</th>
                  <th className="pb-3 pr-4 font-medium">Related</th>
                  <th className="pb-3 font-medium">Error</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F5F9] text-[#0B1F3A]">
                {messageLogs.length > 0 ? (
                  messageLogs.map((log) => (
                    <tr key={log.id} className="align-top">
                      <td className="py-4 pr-4 font-medium">
                        {new Date(log.createdAtMs).toLocaleTimeString("en-US", {
                          hour: "numeric",
                          minute: "2-digit",
                          second: "2-digit",
                        })}
                      </td>
                      <td className="py-4 pr-4">{log.messageType}</td>
                      <td className="py-4 pr-4">{log.recipient}</td>
                      <td className="py-4 pr-4">{log.templateName}</td>
                      <td className="py-4 pr-4">{log.status}</td>
                      <td className="py-4 pr-4">{log.provider}</td>
                      <td className="py-4 pr-4">{log.related}</td>
                      <td className="py-4">{log.errorMessage || "-"}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="py-6 text-[#64748B]" colSpan={8} data-testid="message-logs-empty">
                      No mock message logs yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
