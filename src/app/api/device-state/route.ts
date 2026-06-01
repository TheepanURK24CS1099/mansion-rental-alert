import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const DEFAULT_DEVICE_STATE = {
  status: "online",
  lastSyncAt: null as string | null,
  deviceMode: "MOCK",
  deviceModel: "Not configured",
  deviceIp: null as string | null,
  devicePort: 4370,
  deviceLocation: null as string | null,
  realDeviceEnabled: false,
  connectionStatus: "MOCK_OFFLINE",
};

interface DeviceStatePayload {
  status?: unknown;
  lastSyncAt?: unknown;
  deviceMode?: unknown;
  deviceModel?: unknown;
  deviceIp?: unknown;
  devicePort?: unknown;
  deviceLocation?: unknown;
  realDeviceEnabled?: unknown;
  connectionStatus?: unknown;
}

function isDeviceStatus(value: unknown): value is string {
  return value === "online" || value === "offline";
}

function isDeviceMode(value: unknown): value is string {
  return value === "MOCK" || value === "REAL";
}

function isConnectionStatus(value: unknown): value is string {
  return (
    value === "MOCK_ONLINE" ||
    value === "MOCK_OFFLINE" ||
    value === "REAL_ONLINE" ||
    value === "REAL_OFFLINE" ||
    value === "UNKNOWN"
  );
}

function parseDeviceStatePayload(body: unknown):
  | { ok: true; data: Partial<typeof DEFAULT_DEVICE_STATE> }
  | { ok: false; message: string } {
  if (typeof body !== "object" || body === null) {
    return { ok: false, message: "Invalid request body." };
  }

  const payload = body as DeviceStatePayload;

  // Optional: Validate status if provided (for backward compatibility)
  if (payload.status !== undefined && !isDeviceStatus(payload.status)) {
    return { ok: false, message: 'status must be "online" or "offline".' };
  }

  // Optional: Validate lastSyncAt if provided
  if (payload.lastSyncAt !== undefined && payload.lastSyncAt !== null && typeof payload.lastSyncAt !== "string") {
    return { ok: false, message: "lastSyncAt must be a string or null." };
  }

  // Optional: Validate deviceMode if provided
  if (payload.deviceMode !== undefined && !isDeviceMode(payload.deviceMode)) {
    return { ok: false, message: 'deviceMode must be "MOCK" or "REAL".' };
  }

  // Optional: Validate deviceModel if provided
  if (payload.deviceModel !== undefined && typeof payload.deviceModel !== "string") {
    return { ok: false, message: "deviceModel must be a string." };
  }

  // Optional: Validate deviceIp if provided
  if (payload.deviceIp !== undefined && payload.deviceIp !== null && typeof payload.deviceIp !== "string") {
    return { ok: false, message: "deviceIp must be a string or null." };
  }

  // Optional: Validate devicePort if provided
  if (payload.devicePort !== undefined && typeof payload.devicePort !== "number") {
    return { ok: false, message: "devicePort must be a number." };
  }

  // Optional: Validate deviceLocation if provided
  if (payload.deviceLocation !== undefined && payload.deviceLocation !== null && typeof payload.deviceLocation !== "string") {
    return { ok: false, message: "deviceLocation must be a string or null." };
  }

  // Optional: Validate realDeviceEnabled if provided
  if (payload.realDeviceEnabled !== undefined && typeof payload.realDeviceEnabled !== "boolean") {
    return { ok: false, message: "realDeviceEnabled must be a boolean." };
  }

  // Validate: deviceIp is required if deviceMode is REAL or realDeviceEnabled is true
  const deviceMode = payload.deviceMode ?? DEFAULT_DEVICE_STATE.deviceMode;
  const realDeviceEnabled = payload.realDeviceEnabled ?? DEFAULT_DEVICE_STATE.realDeviceEnabled;
  const deviceIp = payload.deviceIp ?? null;

  if ((deviceMode === "REAL" || realDeviceEnabled) && !deviceIp) {
    return { ok: false, message: "deviceIp is required when deviceMode is REAL or realDeviceEnabled is true." };
  }

  const data: Partial<typeof DEFAULT_DEVICE_STATE> = {};

  if (payload.status !== undefined) data.status = payload.status;
  if (payload.lastSyncAt !== undefined) data.lastSyncAt = payload.lastSyncAt;
  if (payload.deviceMode !== undefined) data.deviceMode = payload.deviceMode;
  if (payload.deviceModel !== undefined) data.deviceModel = payload.deviceModel;
  if (payload.deviceIp !== undefined) data.deviceIp = payload.deviceIp;
  if (payload.devicePort !== undefined) data.devicePort = payload.devicePort;
  if (payload.deviceLocation !== undefined) data.deviceLocation = payload.deviceLocation;
  if (payload.realDeviceEnabled !== undefined) data.realDeviceEnabled = payload.realDeviceEnabled;
  if (payload.connectionStatus !== undefined && isConnectionStatus(payload.connectionStatus)) {
    data.connectionStatus = payload.connectionStatus;
  }

  return {
    ok: true,
    data,
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
