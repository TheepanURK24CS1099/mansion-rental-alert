const IST_TIME_ZONE = "Asia/Kolkata";

type DutyStatus = "On Duty" | "Half Day" | "Off Duty" | "Outside Scheduled Time";

interface DutyWindow {
  start: string; // HH:mm
  end: string;   // HH:mm
  status: DutyStatus;
}

const DUTY_WINDOWS: Record<string, DutyWindow[]> = {
  ananthi: [
    { start: "09:30", end: "12:30", status: "On Duty" },
    { start: "12:30", end: "14:00", status: "Half Day" },
    { start: "16:30", end: "21:00", status: "Off Duty" },
  ],
  "suresh kumar": [
    { start: "09:30", end: "12:30", status: "On Duty" },
    { start: "12:30", end: "14:00", status: "Half Day" },
    { start: "18:30", end: "21:00", status: "Off Duty" },
  ],
  periyaanna: [
    { start: "06:30", end: "09:00", status: "Off Duty" },
    { start: "20:00", end: "23:00", status: "On Duty" },
  ],
};

function normalizeWorkerName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function parseHmToMinutes(hhmm: string): number {
  const [hourText, minuteText] = hhmm.split(":");
  const hour = Number(hourText);
  const minute = Number(minuteText);
  return (hour * 60) + minute;
}

function getIstMinutes(scanTime: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: IST_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(scanTime);

  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");

  return (hour * 60) + minute;
}

function isWithinWindow(minutes: number, start: string, end: string): boolean {
  const startMinutes = parseHmToMinutes(start);
  const endMinutes = parseHmToMinutes(end);
  return minutes >= startMinutes && minutes < endMinutes;
}

export function getMansionDutyStatus(workerName: string, scanTime: Date): DutyStatus {
  const normalizedName = normalizeWorkerName(workerName);
  const windows = DUTY_WINDOWS[normalizedName];

  if (!windows) {
    return "Outside Scheduled Time";
  }

  const istMinutes = getIstMinutes(scanTime);
  const matched = windows.find((window) =>
    isWithinWindow(istMinutes, window.start, window.end),
  );

  return matched?.status ?? "Outside Scheduled Time";
}

export function formatIstDate(scanTime: Date): string {
  return scanTime.toLocaleDateString("en-US", {
    timeZone: IST_TIME_ZONE,
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function formatTimeIST(scanTime: Date): string {
  return scanTime.toLocaleTimeString("en-US", {
    timeZone: IST_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

export const formatIstTime = formatTimeIST;
