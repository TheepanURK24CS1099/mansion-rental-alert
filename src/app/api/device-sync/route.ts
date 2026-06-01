import { NextResponse } from "next/server";
import {
  getDeviceRuntimeStatus,
  syncDeviceLogs,
} from "@/lib/device/deviceService";

/**
 * POST /api/device-sync
 *
 * Triggers a device log sync.
 * - In MOCK mode: returns immediately with zero logs processed.
 * - In REAL mode (before SDK integration): returns a clear not-connected message.
 * - No real hardware is contacted.
 */
export async function POST() {
  try {
    const status = await getDeviceRuntimeStatus();
    const syncResult = await syncDeviceLogs();

    return NextResponse.json({
      success: true,
      deviceMode: status.deviceMode,
      realDeviceConnected: status.realDeviceConnected,
      sync: {
        logsProcessed: syncResult.logsProcessed,
        message: syncResult.message,
      },
    });
  } catch {
    return NextResponse.json(
      { success: false, error: "Unable to sync device logs." },
      { status: 500 },
    );
  }
}

/**
 * GET /api/device-sync
 *
 * Returns the current device runtime status.
 */
export async function GET() {
  try {
    const status = await getDeviceRuntimeStatus();

    return NextResponse.json({
      success: true,
      data: status,
    });
  } catch {
    return NextResponse.json(
      { success: false, error: "Unable to retrieve device status." },
      { status: 500 },
    );
  }
}
