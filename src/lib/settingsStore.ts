const SETTINGS_KEY = "mansion-rental-alert-settings";

export interface MansionSettings {
  mansionName: string;
  ownerName: string;
  ownerWhatsAppNumber: string;
  caretakerName: string;
}

export const DEFAULT_SETTINGS: MansionSettings = {
  mansionName: "Mansion Rental Alert System",
  ownerName: "Owner",
  ownerWhatsAppNumber: "",
  caretakerName: "Caretaker",
};

const EMPTY_SETTINGS = DEFAULT_SETTINGS;

let settingsValue: MansionSettings = DEFAULT_SETTINGS;
let settingsInitialized = false;
const settingsListeners = new Set<() => void>();

function sanitizeString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function parseStoredSettings(rawValue: string | null): MansionSettings {
  if (!rawValue) {
    return DEFAULT_SETTINGS;
  }

  try {
    const parsedValue: unknown = JSON.parse(rawValue);

    if (typeof parsedValue !== "object" || parsedValue === null) {
      return DEFAULT_SETTINGS;
    }

    const record = parsedValue as Record<string, unknown>;

    return {
      mansionName: sanitizeString(record.mansionName, DEFAULT_SETTINGS.mansionName),
      ownerName: sanitizeString(record.ownerName, DEFAULT_SETTINGS.ownerName),
      ownerWhatsAppNumber: sanitizeString(
        record.ownerWhatsAppNumber,
        DEFAULT_SETTINGS.ownerWhatsAppNumber,
      ),
      caretakerName: sanitizeString(record.caretakerName, DEFAULT_SETTINGS.caretakerName),
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function readStoredSettings(): MansionSettings {
  if (typeof window === "undefined") {
    return DEFAULT_SETTINGS;
  }

  return parseStoredSettings(window.localStorage.getItem(SETTINGS_KEY));
}

function persistSettings(settings: MansionSettings): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function removeStoredSettings(): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(SETTINGS_KEY);
}

function initializeSettingsValue(): void {
  if (settingsInitialized || typeof window === "undefined") {
    return;
  }

  settingsValue = readStoredSettings();
  settingsInitialized = true;
}

export function getSettingsSnapshot(): MansionSettings {
  initializeSettingsValue();
  return settingsValue;
}

export function getSettingsServerSnapshot(): MansionSettings {
  return EMPTY_SETTINGS;
}

export function subscribeToSettingsStore(listener: () => void): () => void {
  settingsListeners.add(listener);

  return () => {
    settingsListeners.delete(listener);
  };
}

function notifySettingsListeners(): void {
  for (const listener of settingsListeners) {
    listener();
  }
}

export function setSettingsValue(settings: MansionSettings): void {
  settingsValue = settings;
  settingsInitialized = true;
  persistSettings(settings);
  notifySettingsListeners();
}

export function resetSettingsValue(): void {
  settingsValue = DEFAULT_SETTINGS;
  settingsInitialized = true;
  removeStoredSettings();
  notifySettingsListeners();
}

export function formatOwnerWhatsAppNumber(ownerWhatsAppNumber: string): string {
  return ownerWhatsAppNumber.trim().length > 0
    ? `Owner WhatsApp: ${ownerWhatsAppNumber.trim()}`
    : "Owner WhatsApp: Not configured";
}

export { SETTINGS_KEY };
