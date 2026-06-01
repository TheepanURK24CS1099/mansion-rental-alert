import { NextResponse } from "next/server";
import { processDeviceScan } from "@/lib/deviceScanProcessor";

interface MockFingerprintScanPayload {
  deviceUserId?: unknown;
  source?: unknown;
}

function isDeviceUserId(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
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

    const payload = body as MockFingerprintScanPayload;

    if (!isDeviceUserId(payload.deviceUserId)) {
      return NextResponse.json(
        { success: false, error: "deviceUserId must be a number." },
        { status: 400 },
      );
    }

    const source =
      typeof payload.source === "string" && payload.source.trim().length > 0
        ? payload.source
        : "Mock Device Scan";

    // Delegate all scan‐to‐action logic to the shared processor.
    const result = await processDeviceScan({
      deviceUserId: payload.deviceUserId,
      source,
    });

    if (!result.success) {
      // Map failure types to HTTP status codes matching original behaviour.
      const statusMap: Record<string, number> = {
        UNKNOWN: 404,
        INACTIVE_WORKER: 403,
        INVALID_MAPPING: 400,
        UNSUPPORTED_ACTION: 400,
        ERROR: 500,
      };
      const httpStatus = statusMap[result.type] ?? 500;

      return NextResponse.json(
        { success: false, error: result.error },
        { status: httpStatus },
      );
    }

    // Return the same response shape as before for both attendance and rental.
    if (result.type === "duplicate") {
      return NextResponse.json({
        success: true,
        duplicate: true,
        type: "duplicate",
        message: result.message,
      });
    }

    if (result.type === "attendance") {
      return NextResponse.json({
        success: true,
        type: "attendance",
        status: result.status,
        workerName: result.workerName,
      });
    }

    return NextResponse.json({
      success: true,
      type: "rental",
      roomType: result.roomType,
      workerName: result.workerName,
    });
  } catch {
    return NextResponse.json(
      { success: false, error: "Unable to process mock scan." },
      { status: 500 },
    );
  }
}
