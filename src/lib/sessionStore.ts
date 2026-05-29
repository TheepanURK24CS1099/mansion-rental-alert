const SESSION_KEY = "mansion-rental-alert-session";
const EMPTY_SESSION = null;

let sessionValue: string | null = null;
let sessionInitialized = false;
const sessionListeners = new Set<() => void>();

function readSessionFromStorage(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage.getItem(SESSION_KEY);
}

function persistSessionValue(value: string | null): void {
  if (typeof window === "undefined") {
    return;
  }

  if (value === null) {
    window.localStorage.removeItem(SESSION_KEY);
    return;
  }

  window.localStorage.setItem(SESSION_KEY, value);
}

function initializeSessionValue(): void {
  if (sessionInitialized || typeof window === "undefined") {
    return;
  }

  sessionValue = readSessionFromStorage();
  sessionInitialized = true;
}

export function getSessionSnapshot(): string | null {
  initializeSessionValue();
  return sessionValue;
}

export function getSessionServerSnapshot(): string | null {
  return EMPTY_SESSION;
}

export function subscribeToSessionStore(listener: () => void): () => void {
  sessionListeners.add(listener);

  return () => {
    sessionListeners.delete(listener);
  };
}

function notifySessionListeners(): void {
  for (const listener of sessionListeners) {
    listener();
  }
}

export function setSessionValue(value: string): void {
  sessionValue = value;
  sessionInitialized = true;
  persistSessionValue(value);
  notifySessionListeners();
}

export function clearSessionValue(): void {
  sessionValue = null;
  sessionInitialized = true;
  persistSessionValue(null);
  notifySessionListeners();
}

export function isLoggedInSession(value: string | null): boolean {
  return value === "logged-in";
}

export { SESSION_KEY };
