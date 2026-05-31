import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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

export async function GET() {
  const logs = await prisma.workerAttendance.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      worker: {
        select: {
          name: true,
        },
      },
    },
  });

  return NextResponse.json({ success: true, data: logs });
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

export async function DELETE() {
  try {
    const result = await prisma.workerAttendance.deleteMany({});

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
