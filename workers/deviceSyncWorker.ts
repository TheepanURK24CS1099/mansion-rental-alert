/**
 * Mansion Device Sync Worker — Foundation
 *
 * This is a foundation file only.  It is NOT started automatically by any
 * package script or PM2 config.
 *
 * Purpose:
 *   Provide the entry‐point that will eventually be run by a process manager
 *   (e.g. PM2) once the real biometric device SDK is integrated.
 *
 * Current behaviour:
 *   - Logs that the mansion device sync worker foundation has started.
 *   - Calls runDeviceHeartbeat() and syncDeviceLogs() once.
 *   - Prints their results and exits safely.
 *   - Does NOT poll, loop, or connect to real hardware.
 *   - Does NOT touch the hostel project or hostel PM2.
 */

import {
  runDeviceHeartbeat,
  syncDeviceLogs,
} from "@/lib/device/deviceService";

async function main(): Promise<void> {
  console.log("[Mansion DeviceSyncWorker] Foundation started.");
  console.log("[Mansion DeviceSyncWorker] This is a foundation-only run. No real hardware will be contacted.");

  try {
    const heartbeat = await runDeviceHeartbeat();
    console.log("[Mansion DeviceSyncWorker] Heartbeat result:", JSON.stringify(heartbeat));

    const sync = await syncDeviceLogs();
    console.log("[Mansion DeviceSyncWorker] Sync result:", JSON.stringify(sync));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Mansion DeviceSyncWorker] Error during foundation run:", message);
  }

  console.log("[Mansion DeviceSyncWorker] Foundation run complete. Exiting safely.");
}

// Only run when executed directly — not when imported.
main().catch((err: unknown) => {
  console.error("[Mansion DeviceSyncWorker] Unhandled error:", err);
  process.exit(1);
});
