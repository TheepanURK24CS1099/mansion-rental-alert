import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { formatIstDate } from "@/lib/mansionDutyStatus";
import {
  createMockRentalAlertMessageLog,
} from "@/lib/messageService";

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

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const fromDate = searchParams.get("from");
    const toDate = searchParams.get("to");

    const where: { alertDate?: { in: string[] } } = {};

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
          // produce IST ISO date (YYYY-MM-DD)
          dates.push(current.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }));
          current = new Date(current.getTime() + 24 * 60 * 60 * 1000);
        }

        where.alertDate = { in: dates };
      }
    }

    const alerts = await prisma.rentalAlert.findMany({
      where: Object.keys(where).length > 0 ? where : undefined,
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ success: true, data: alerts });
  } catch (error) {
    console.error("GET /api/rental-alerts error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch rental alerts" },
      { status: 500 },
    );
  }
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

    try {
      const settings = await prisma.appSettings.findFirst({
        orderBy: { createdAt: "asc" },
      });
      const ownerWhatsAppNumber = settings?.ownerWhatsAppNumber?.trim() ?? "";

      if (ownerWhatsAppNumber.length > 0) {
        await createMockRentalAlertMessageLog({
          recipient: ownerWhatsAppNumber,
          roomType: alert.roomType,
          alertDate: alert.alertDate,
          alertTime: alert.alertTime,
          updatedBy: alert.updatedBy,
          relatedRentalAlertId: alert.id,
        });
      } else {
        await createMockRentalAlertMessageLog({
          recipient: "Not configured",
          roomType: alert.roomType,
          alertDate: alert.alertDate,
          alertTime: alert.alertTime,
          updatedBy: alert.updatedBy,
          relatedRentalAlertId: alert.id,
          status: "FAILED",
          errorMessage: "Owner WhatsApp number not configured.",
        });
      }
    } catch {
      // Message logging must never block rental alert creation.
    }

    return NextResponse.json({ success: true, data: alert }, { status: 201 });
  } catch {
    return NextResponse.json(
      { success: false, error: "Unable to create rental alert." },
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

    // Delete by scan-derived alertDate (IST YYYY-MM-DD) rather than createdAt
    const fromParts = fromDate.split("-").map(Number);
    const toParts = toDate.split("-").map(Number);
    const from = new Date(Date.UTC(fromParts[0], fromParts[1] - 1, fromParts[2]));
    const to = new Date(Date.UTC(toParts[0], toParts[1] - 1, toParts[2]));

    let result;
    if (!Number.isNaN(from.getTime()) && !Number.isNaN(to.getTime()) && from <= to) {
      const dates: string[] = [];
      let current = from;

      while (current <= to) {
        dates.push(current.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }));
        current = new Date(current.getTime() + 24 * 60 * 60 * 1000);
      }

      result = await prisma.rentalAlert.deleteMany({
        where: {
          alertDate: {
            in: dates,
          },
        },
      });
    } else {
      result = await prisma.rentalAlert.deleteMany({ where: {} });
    }

    return NextResponse.json({
      success: true,
      deletedCount: result.count,
    });
  } catch {
    return NextResponse.json(
      { success: false, error: "Unable to clear rental alert history." },
      { status: 500 },
    );
  }
}
