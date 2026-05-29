import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

interface RentalAlertPayload {
  roomType?: unknown;
  actionLabel?: unknown;
  deviceUserId?: unknown;
  updatedBy?: unknown;
  source?: unknown;
  messageStatus?: unknown;
  alertDate?: unknown;
  alertTime?: unknown;
}

interface RentalAlertCreateData {
  roomType: string;
  actionLabel: string;
  deviceUserId: number;
  updatedBy: string;
  source: string;
  messageStatus: string;
  alertDate: string;
  alertTime: string;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isDeviceUserId(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

function parseAlertPayload(body: unknown):
  | { ok: true; data: RentalAlertCreateData }
  | { ok: false; message: string } {
  if (typeof body !== "object" || body === null) {
    return { ok: false, message: "Invalid request body." };
  }

  const payload = body as RentalAlertPayload;
  const requiredFields: Array<keyof RentalAlertPayload> = [
    "roomType",
    "actionLabel",
    "deviceUserId",
    "updatedBy",
    "source",
    "messageStatus",
    "alertDate",
    "alertTime",
  ];

  for (const field of requiredFields) {
    if (payload[field] === undefined || payload[field] === null) {
      return { ok: false, message: `Missing required field: ${field}.` };
    }
  }

  if (
    !isNonEmptyString(payload.roomType) ||
    !isNonEmptyString(payload.actionLabel) ||
    !isDeviceUserId(payload.deviceUserId) ||
    !isNonEmptyString(payload.updatedBy) ||
    !isNonEmptyString(payload.source) ||
    !isNonEmptyString(payload.messageStatus) ||
    !isNonEmptyString(payload.alertDate) ||
    !isNonEmptyString(payload.alertTime)
  ) {
    return { ok: false, message: "Invalid field types or empty values." };
  }

  return {
    ok: true,
    data: {
      roomType: payload.roomType,
      actionLabel: payload.actionLabel,
      deviceUserId: payload.deviceUserId,
      updatedBy: payload.updatedBy,
      source: payload.source,
      messageStatus: payload.messageStatus,
      alertDate: payload.alertDate,
      alertTime: payload.alertTime,
    },
  };
}

export async function GET() {
  const alerts = await prisma.rentalAlert.findMany({
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ success: true, data: alerts });
}

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    const parsed = parseAlertPayload(body);

    if (!parsed.ok) {
      return NextResponse.json(
        { success: false, error: parsed.message },
        { status: 400 },
      );
    }

    const alert = await prisma.rentalAlert.create({
      data: parsed.data,
    });

    return NextResponse.json({ success: true, data: alert }, { status: 201 });
  } catch {
    return NextResponse.json(
      { success: false, error: "Unable to create rental alert." },
      { status: 500 },
    );
  }
}
