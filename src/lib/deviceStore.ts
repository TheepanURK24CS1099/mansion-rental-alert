const DEVICE_STATE_KEY = "mansion-rental-alert-device-state";

export type MockDeviceStatus = "online" | "offline";

export interface MockDeviceState {
  status: MockDeviceStatus;
  lastSyncAt: string | null;
}

const DEFAULT_DEVICE_STATE: MockDeviceState = {
  status: "online",
  lastSyncAt: null,
};

const EMPTY_DEVICE_STATE = DEFAULT_DEVICE_STATE;

let deviceState: MockDeviceState = DEFAULT_DEVICE_STATE;
let deviceStateInitialized = false;
const deviceStateListeners = new Set<() => void>();

function isMockDeviceStatus(value: string): value is MockDeviceStatus {
  return value === "online" || value === "offline";
}

function parseStoredDeviceState(rawValue: string | null): MockDeviceState {
  if (!rawValue) {
    return DEFAULT_DEVICE_STATE;
  }

  try {
    const parsedValue: unknown = JSON.parse(rawValue);

    if (typeof parsedValue !== "object" || parsedValue === null) {
      return DEFAULT_DEVICE_STATE;
    }

    const record = parsedValue as Record<string, unknown>;
    const status = record.status;
    const lastSyncAt = record.lastSyncAt;

    return {
      status: typeof status === "string" && isMockDeviceStatus(status) ? status : DEFAULT_DEVICE_STATE.status,
      lastSyncAt: typeof lastSyncAt === "string" ? lastSyncAt : null,
    };
  } catch {
    return DEFAULT_DEVICE_STATE;
  }
}

function readStoredDeviceState(): MockDeviceState {
  if (typeof window === "undefined") {
    return DEFAULT_DEVICE_STATE;
  }

  return parseStoredDeviceState(window.localStorage.getItem(DEVICE_STATE_KEY));
}

function persistDeviceState(state: MockDeviceState): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(DEVICE_STATE_KEY, JSON.stringify(state));
}

function removeStoredDeviceState(): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(DEVICE_STATE_KEY);
}

function initializeDeviceState(): void {
  if (deviceStateInitialized || typeof window === "undefined") {
    return;
  }

  deviceState = readStoredDeviceState();
  deviceStateInitialized = true;
}

export function getDeviceStateSnapshot(): MockDeviceState {
  initializeDeviceState();
  return deviceState;
}

export function getDeviceStateServerSnapshot(): MockDeviceState {
  return EMPTY_DEVICE_STATE;
}

export function subscribeToDeviceState(listener: () => void): () => void {
  deviceStateListeners.add(listener);

  return () => {
    deviceStateListeners.delete(listener);
  };
}

function notifyDeviceStateListeners(): void {
  for (const listener of deviceStateListeners) {
    listener();
  }
}

export function setDeviceState(nextState: MockDeviceState): void {
  deviceState = nextState;
  deviceStateInitialized = true;
  persistDeviceState(nextState);
  notifyDeviceStateListeners();
}

export function resetDeviceState(): void {
  deviceState = DEFAULT_DEVICE_STATE;
  deviceStateInitialized = true;
  removeStoredDeviceState();
  notifyDeviceStateListeners();
}

export function formatDeviceSyncTime(timestamp: string | null): string {
  if (!timestamp) {
    return "Not synced yet";
  }

  return new Date(timestamp).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export { DEVICE_STATE_KEY, DEFAULT_DEVICE_STATE };
