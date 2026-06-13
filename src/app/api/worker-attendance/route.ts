import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { formatIstDate, getMansionDutyStatus } from "@/lib/mansionDutyStatus";

interface WorkerAttendancePayload {
  workerId?: unknown;
  deviceUserId?: unknown;
  status?: unknown;
  attendanceDate?: unknown;
  attendanceTime?: unknown;
  source?: unknown;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isDeviceUserId(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

function isAttendanceStatus(value: unknown): value is "IN" | "OUT" {
  return value === "IN" || value === "OUT";
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    // support both `from`/`to` (existing UI) and `fromDate`/`toDate` (external callers)
    const fromDate = searchParams.get("fromDate") ?? searchParams.get("from");
    const toDate = searchParams.get("toDate") ?? searchParams.get("to");

    const where: {
      attendanceDate?: { in: string[] };
    } = {};

    if (
      fromDate &&
      toDate &&
      /^\d{4}-\d{2}-\d{2}$/.test(fromDate) &&
      /^\d{4}-\d{2}-\d{2}$/.test(toDate)
    ) {
      const fromParts = fromDate.split("-").map(Number);
      const toParts = toDate.split("-").map(Number);
      const from = new Date(Date.UTC(fromParts[0], fromParts[1] - 1, fromParts[2]));
      const to = new Date(Date.UTC(toParts[0], toParts[1] - 1, toParts[2]));

      if (!Number.isNaN(from.getTime()) && !Number.isNaN(to.getTime()) && from <= to) {
        const dates: string[] = [];
        let current = from;

        while (current <= to) {
          dates.push(formatIstDate(current));
          current = new Date(current.getTime() + 24 * 60 * 60 * 1000);
        }

        where.attendanceDate = { in: dates };
      }
    }

    const logs = await prisma.workerAttendance.findMany({
      where: Object.keys(where).length > 0 ? where : undefined,
      orderBy: { createdAt: "desc" },
      include: {
        worker: {
          select: {
            name: true,
          },
        },
      },
    });

    // Augment each log with rawStatus, displayStatus and dutyStatus
    function parseTimeToMinutes(timeText: unknown): number | null {
      if (typeof timeText !== "string") return null;
      const m = timeText.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
      if (!m) return null;
      let hour = Number(m[1]);
      const minute = Number(m[2]);
      const period = m[3].toUpperCase();
      if (period === "PM" && hour !== 12) hour += 12;
      if (period === "AM" && hour === 12) hour = 0;
      return hour * 60 + minute;
    }

    function parseAttendanceDateTimeToDate(attDate: unknown, attTime: unknown): Date | null {
      if (typeof attDate !== "string" || typeof attTime !== "string") return null;
      // reuse same parsing logic as client: "MonthName D, YYYY" and "hh:mm AM/PM"
      const dateMatch = attDate.trim().match(/^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})$/);
      const timeMatch = attTime.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
      if (!dateMatch || !timeMatch) return null;
      const [, monthName, dayText, yearText] = dateMatch;
      const [, hourText, minuteText, period] = timeMatch;
      const monthNames = [
        "January","February","March","April","May","June","July","August","September","October","November","December",
      ];
      const month = monthNames.indexOf(monthName);
      const day = Number(dayText);
      const year = Number(yearText);
      let hour = Number(hourText);
      const minute = Number(minuteText);
      if (period.toUpperCase() === "PM" && hour !== 12) hour += 12;
      else if (period.toUpperCase() === "AM" && hour === 12) hour = 0;
      // convert to UTC ms by subtracting IST offset (5.5 hours)
      const utcMs = Date.UTC(year, month, day, hour, minute) - 5.5 * 60 * 60 * 1000;
      return new Date(utcMs);
    }

    const augmented = logs.map((log) => {
      const rawStatus = log.status;
      let displayStatus = String(rawStatus);
      // compute dutyStatus using getMansionDutyStatus if possible
      const scanDate = parseAttendanceDateTimeToDate(log.attendanceDate, log.attendanceTime) ?? log.createdAt;
      const dutyStatus = getMansionDutyStatus(log.worker?.name ?? "", scanDate instanceof Date ? scanDate : new Date());

      if (rawStatus === "IN") {
        const minutes = parseTimeToMinutes(log.attendanceTime);
        const name = (log.worker?.name ?? "").toString().trim().toLowerCase();
        let inEnd = 0;
        if (name === "ananthi" || name === "suresh kumar") {
          inEnd = 12 * 60 + 30; // 12:30
        } else if (name === "periyaanna") {
          inEnd = 23 * 60; // 23:00
        }

        if (inEnd > 0 && minutes !== null && minutes > inEnd) {
          displayStatus = "IN (Late)";
        } else {
          displayStatus = "IN";
        }
      } else {
        displayStatus = String(rawStatus);
      }

      const effectiveDutyStatus = displayStatus === "IN (Late)" ? "Late Check-in" : dutyStatus;

      return {
        ...log,
        rawStatus,
        displayStatus,
        dutyStatus: effectiveDutyStatus,
      };
    });

    return NextResponse.json({ success: true, data: augmented });
  } catch (error) {
    console.error("GET /api/worker-attendance error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch worker attendance" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();

    if (typeof body !== "object" || body === null) {
      return NextResponse.json(
        { success: false, error: "Invalid request body." },
        { status: 400 },
      );
    }

    const payload = body as WorkerAttendancePayload;

    if (
      !isNonEmptyString(payload.workerId) ||
      !isDeviceUserId(payload.deviceUserId) ||
      !isAttendanceStatus(payload.status) ||
      !isNonEmptyString(payload.attendanceDate) ||
      !isNonEmptyString(payload.attendanceTime) ||
      !isNonEmptyString(payload.source)
    ) {
      return NextResponse.json(
        { success: false, error: "Invalid attendance payload." },
        { status: 400 },
      );
    }

    const worker = await prisma.worker.findUnique({
      where: { id: payload.workerId },
      select: { id: true, name: true },
    });

    if (!worker) {
      return NextResponse.json(
        { success: false, error: "Worker not found." },
        { status: 404 },
      );
    }

    const attendance = await prisma.workerAttendance.create({
      data: {
        workerId: worker.id,
        deviceUserId: payload.deviceUserId,
        status: payload.status,
        attendanceDate: payload.attendanceDate,
        attendanceTime: payload.attendanceTime,
        source: payload.source,
      },
      include: {
        worker: {
          select: {
            name: true,
          },
        },
      },
    });

    return NextResponse.json({ success: true, data: attendance }, { status: 201 });
  } catch {
    return NextResponse.json(
      { success: false, error: "Unable to save attendance." },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const fromDate = searchParams.get("from");
    const toDate = searchParams.get("to");

    if (
      !fromDate ||
      !toDate ||
      !/^\d{4}-\d{2}-\d{2}$/.test(fromDate) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(toDate)
    ) {
      return NextResponse.json(
        { success: false, error: "Date range is required for delete." },
        { status: 400 },
      );
    }

    const result = await prisma.workerAttendance.deleteMany({
      where: {
        createdAt: {
          gte: new Date(`${fromDate}T00:00:00Z`),
          lte: new Date(`${toDate}T23:59:59Z`),
        },
      },
    });

    return NextResponse.json({
      success: true,
      deletedCount: result.count,
    });
  } catch {
    return NextResponse.json(
      { success: false, error: "Unable to clear staff attendance logs." },
      { status: 500 },
    );
  }
}
