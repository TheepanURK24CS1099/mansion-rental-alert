import { formatIstDate, formatTimeIST } from "@/lib/mansionDutyStatus";

export interface AttendanceScheduleWindow {
  inStart: string;
  inEnd: string;
  outStart: string;
  outEnd: string;
}

export interface EvaluatedAttendanceResult {
  workerName: string;
  attendanceDate: string;
  attendanceTime: string;
  status: "No Finger Placed" | "Late" | "Leave" | "OUT Finger Not Placed";
  dutyStatus: string;
  reason: string;
}

const IST_TIME_ZONE = "Asia/Kolkata";

const ATTENDANCE_SCHEDULES: Record<string, AttendanceScheduleWindow> = {
  ananthi: {
    inStart: "09:30",
    inEnd: "12:30",
    outStart: "16:30",
    outEnd: "21:00",
  },
  "suresh kumar": {
    inStart: "09:30",
    inEnd: "12:30",
    outStart: "18:30",
    outEnd: "21:00",
  },
  periyaanna: {
    inStart: "20:00",
    inEnd: "23:00",
    outStart: "06:30",
    outEnd: "09:00",
  },
};

function normalizeWorkerName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function parseTimeToMinutes(value: string): number {
  const trimmed = value.trim();

  if (/^\d{1,2}:\d{2}$/.test(trimmed)) {
    const [hourText, minuteText] = trimmed.split(":");
    return Number(hourText) * 60 + Number(minuteText);
  }

  const match = trimmed.match(/^(\d{1,2}):(\d{2})\s*([AP]M)$/i);

  if (!match) {
    return 0;
  }

  let hour = Number(match[1]);
  const minute = Number(match[2]);

  if (match[3].toUpperCase() === "PM" && hour < 12) {
    hour += 12;
  }

  if (match[3].toUpperCase() === "AM" && hour === 12) {
    hour = 0;
  }

  return hour * 60 + minute;
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

function getScanMinutes(attendanceDate: string, attendanceTime: string): number {
  const normalizedDate = attendanceDate.trim();
  const normalizedTime = attendanceTime.trim();

  if (!normalizedDate || !normalizedTime) {
    return 0;
  }

  const baseDate = new Date(normalizedDate);

  if (Number.isNaN(baseDate.getTime())) {
    return 0;
  }

  const hours = parseTimeToMinutes(normalizedTime);
  baseDate.setHours(Math.floor(hours / 60), hours % 60, 0, 0);

  return getIstMinutes(baseDate);
}

export function getTodayAttendanceDate(forDate?: Date): string {
  return formatIstDate(forDate ?? new Date());
}

export function getCurrentAttendanceTime(forDate?: Date): string {
  return formatTimeIST(forDate ?? new Date());
}

export function getAttendanceSchedule(workerName: string): AttendanceScheduleWindow | null {
  return ATTENDANCE_SCHEDULES[normalizeWorkerName(workerName)] ?? null;
}

export function evaluateAttendanceStatus(
  workerName: string,
  attendanceLogs: Array<{ status: string; attendanceDate: string; attendanceTime: string }>,
  now: Date = new Date(),
): EvaluatedAttendanceResult | null {
  const schedule = getAttendanceSchedule(workerName);

  if (!schedule) {
    return null;
  }

  const attendanceDate = getTodayAttendanceDate(now);
  const currentMinutes = getIstMinutes(now);
  const todayLogs = attendanceLogs.filter((log) => log.attendanceDate === attendanceDate);
  const inScans = todayLogs.filter((log) => log.status === "IN");
  const outScans = todayLogs.filter((log) => log.status === "OUT");
  const firstInScan = inScans.sort((left, right) =>
    getScanMinutes(left.attendanceDate, left.attendanceTime) -
      getScanMinutes(right.attendanceDate, right.attendanceTime),
  )[0];
  const firstOutScan = outScans.sort((left, right) =>
    getScanMinutes(left.attendanceDate, left.attendanceTime) -
      getScanMinutes(right.attendanceDate, right.attendanceTime),
  )[0];
  const inEndMinutes = parseTimeToMinutes(schedule.inEnd);
  const outEndMinutes = parseTimeToMinutes(schedule.outEnd);
  const hasAnyScan = todayLogs.length > 0;

  if (!hasAnyScan) {
    if (currentMinutes >= outEndMinutes) {
      return {
        workerName,
        attendanceDate,
        attendanceTime: formatTimeIST(now),
        status: "Leave",
        dutyStatus: "No scan found for the full day",
        reason: "No scans were recorded for the full day.",
      };
    }

    return {
      workerName,
      attendanceDate,
      attendanceTime: formatTimeIST(now),
      status: "No Finger Placed",
      dutyStatus: "No IN scan was recorded within the scheduled window.",
      reason: "No finger placed during the expected duty timing.",
    };
  }

  if (!firstInScan) {
    return {
      workerName,
      attendanceDate,
      attendanceTime: formatTimeIST(now),
      status: "No Finger Placed",
      dutyStatus: "No IN scan was recorded within the scheduled window.",
      reason: "No finger placed during the expected duty timing.",
    };
  }

  const firstInMinutes = getScanMinutes(firstInScan.attendanceDate, firstInScan.attendanceTime);

  if (firstInMinutes > inEndMinutes) {
    return {
      workerName,
      attendanceDate,
      attendanceTime: firstInScan.attendanceTime,
      status: "Late",
      dutyStatus: "IN finger placed after the scheduled window ended.",
      reason: `IN scan was recorded at ${firstInScan.attendanceTime}, which is after the ${schedule.inStart} to ${schedule.inEnd} window.`,
    };
  }

  if (currentMinutes >= outEndMinutes && !firstOutScan) {
    return {
      workerName,
      attendanceDate,
      attendanceTime: formatTimeIST(now),
      status: "OUT Finger Not Placed",
      dutyStatus: "OUT finger was not placed after the scheduled OUT window ended.",
      reason: "No OUT scan was recorded after the scheduled OUT window closed.",
    };
  }

  return null;
}
