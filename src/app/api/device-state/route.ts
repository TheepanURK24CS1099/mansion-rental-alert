import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const DEFAULT_DEVICE_STATE = {
  status: "online",
  lastSyncAt: null as string | null,
};

interface DeviceStatePayload {
  status?: unknown;
  lastSyncAt?: unknown;
}

function isDeviceStatus(value: unknown): value is string {
  return value === "online" || value === "offline";
}

function parseDeviceStatePayload(body: unknown):
  | { ok: true; data: typeof DEFAULT_DEVICE_STATE }
  | { ok: false; message: string } {
  if (typeof body !== "object" || body === null) {
    return { ok: false, message: "Invalid request body." };
  }

  const payload = body as DeviceStatePayload;

  if (!isDeviceStatus(payload.status)) {
    return { ok: false, message: 'status must be "online" or "offline".' };
  }

  if (payload.lastSyncAt !== null && typeof payload.lastSyncAt !== "string") {
    return { ok: false, message: "lastSyncAt must be a string or null." };
  }

  return {
    ok: true,
    data: {
      status: payload.status,
      lastSyncAt: payload.lastSyncAt,
    },
  };
}

export async function GET() {
  const existingDeviceState = await prisma.deviceState.findFirst({
    orderBy: { createdAt: "asc" },
  });

  if (existingDeviceState) {
    return NextResponse.json({ success: true, data: existingDeviceState });
  }

  const createdDeviceState = await prisma.deviceState.create({
    data: DEFAULT_DEVICE_STATE,
  });

  return NextResponse.json({ success: true, data: createdDeviceState }, { status: 201 });
}

export async function PUT(request: Request) {
  try {
    const body: unknown = await request.json();
    const parsed = parseDeviceStatePayload(body);

    if (!parsed.ok) {
      return NextResponse.json(
        { success: false, error: parsed.message },
        { status: 400 },
      );
    }

    const existingDeviceState = await prisma.deviceState.findFirst({
      orderBy: { createdAt: "asc" },
    });

    const deviceState = existingDeviceState
      ? await prisma.deviceState.update({
          where: { id: existingDeviceState.id },
          data: parsed.data,
        })
      : await prisma.deviceState.create({ data: parsed.data });

    return NextResponse.json({ success: true, data: deviceState });
  } catch {
    return NextResponse.json(
      { success: false, error: "Unable to save device state." },
      { status: 500 },
    );
  }
}
