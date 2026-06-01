import { prisma } from "@/lib/prisma";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DeviceRuntimeStatus {
  deviceMode: string;
  connectionStatus: string;
  lastHeartbeatAt: string | null;
  realDeviceConnected: boolean;
  message: string;
}

export interface DeviceHeartbeatResult {
  success: boolean;
  deviceMode: string;
  message: string;
}

export interface DeviceSyncLogsResult {
  success: boolean;
  deviceMode: string;
  logsProcessed: number;
  message: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function getDeviceState() {
  const deviceState = await prisma.deviceState.findFirst({
    orderBy: { createdAt: "asc" },
  });

  return deviceState;
}

// ─── Exported Functions ──────────────────────────────────────────────────────

/**
 * Returns the current runtime status of the biometric device.
 *
 * - In MOCK mode a safe mock status is returned.
 * - In REAL mode (before the real SDK is integrated) a clear message
 *   indicates the device is not yet connected.
 *
 * No external hardware is contacted.
 */
export async function getDeviceRuntimeStatus(): Promise<DeviceRuntimeStatus> {
  const state = await getDeviceState();

  if (!state || state.deviceMode === "MOCK") {
    return {
      deviceMode: "MOCK",
      connectionStatus: state?.connectionStatus ?? "MOCK_OFFLINE",
      lastHeartbeatAt: state?.lastHeartbeatAt?.toISOString() ?? null,
      realDeviceConnected: false,
      message: "Device is running in MOCK mode. No real hardware connected.",
    };
  }

  // REAL mode – but no SDK / integration is available yet.
  return {
    deviceMode: "REAL",
    connectionStatus: state.connectionStatus ?? "UNKNOWN",
    lastHeartbeatAt: state.lastHeartbeatAt?.toISOString() ?? null,
    realDeviceConnected: false,
    message:
      "Real biometric device integration is not connected yet. " +
      "The device SDK will be added in a future version.",
  };
}

/**
 * Runs a heartbeat check against the biometric device.
 *
 * - MOCK mode: returns a safe result immediately.
 * - REAL mode: returns a clear "not connected" message.
 *
 * No external calls are made.
 */
export async function runDeviceHeartbeat(): Promise<DeviceHeartbeatResult> {
  const state = await getDeviceState();

  if (!state || state.deviceMode === "MOCK") {
    return {
      success: true,
      deviceMode: "MOCK",
      message: "Mock heartbeat OK. No real device to contact.",
    };
  }

  return {
    success: true,
    deviceMode: "REAL",
    message:
      "Real biometric device integration is not connected yet. " +
      "Heartbeat skipped safely.",
  };
}

/**
 * Syncs attendance / scan logs from the biometric device.
 *
 * - MOCK mode: returns immediately with zero logs processed.
 * - REAL mode: returns a clear "not connected" message.
 *
 * No external calls are made.  No SDK is loaded.
 */
export async function syncDeviceLogs(): Promise<DeviceSyncLogsResult> {
  const state = await getDeviceState();

  if (!state || state.deviceMode === "MOCK") {
    return {
      success: true,
      deviceMode: "MOCK",
      logsProcessed: 0,
      message: "Mock sync complete. No real device logs to process.",
    };
  }

  return {
    success: true,
    deviceMode: "REAL",
    logsProcessed: 0,
    message:
      "Real biometric device integration is not connected yet. " +
      "Log sync skipped safely.",
  };
}
