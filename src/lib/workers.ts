export const PERSON_TYPES = ["ATTENDANCE_AND_ROOM", "ROOM_ONLY"] as const;
export type WorkerPersonType = (typeof PERSON_TYPES)[number];

export const WORKER_ACTION_TYPES = [
  "ATTENDANCE",
  "SINGLE_ROOM",
  "DOUBLE_ROOM",
  "MONTHLY_ROOM",
  "FAMILY_ROOM",
] as const;
export type WorkerActionType = (typeof WORKER_ACTION_TYPES)[number];

export const ROOM_ACTION_TYPES = WORKER_ACTION_TYPES.slice(1) as ReadonlyArray<
  Exclude<WorkerActionType, "ATTENDANCE">
>;

export const PERSON_TYPE_LABELS: Record<WorkerPersonType, string> = {
  ATTENDANCE_AND_ROOM: "Attendance + Room Rental",
  ROOM_ONLY: "Room Rental Only",
};

export const ACTION_TYPE_LABELS: Record<WorkerActionType, string> = {
  ATTENDANCE: "Attendance IN/OUT",
  SINGLE_ROOM: "Single Room Rented",
  DOUBLE_ROOM: "Double Room Rented",
  MONTHLY_ROOM: "Monthly Room Rented",
  FAMILY_ROOM: "Family Room Rented",
};

export const ACTION_TYPE_ROOM_TYPES: Record<
  Exclude<WorkerActionType, "ATTENDANCE">,
  string
> = {
  SINGLE_ROOM: "Single Room",
  DOUBLE_ROOM: "Double Room",
  MONTHLY_ROOM: "Monthly Room",
  FAMILY_ROOM: "Family Room",
};

export interface WorkerFingerIdInput {
  attendanceDeviceUserId?: unknown;
  singleRoomDeviceUserId: unknown;
  doubleRoomDeviceUserId: unknown;
  monthlyRoomDeviceUserId: unknown;
  familyRoomDeviceUserId: unknown;
}

export interface WorkerRequestBody extends WorkerFingerIdInput {
  name?: unknown;
  phone?: unknown;
  personType?: unknown;
  isActive?: unknown;
}

export interface NormalizedWorkerFingerIds {
  attendanceDeviceUserId: number | null;
  singleRoomDeviceUserId: number;
  doubleRoomDeviceUserId: number;
  monthlyRoomDeviceUserId: number;
  familyRoomDeviceUserId: number;
}

export interface NormalizedWorkerRequest {
  name: string;
  phone: string | null;
  personType: WorkerPersonType;
  isActive: boolean;
  fingerIds: NormalizedWorkerFingerIds;
}

export function isWorkerPersonType(value: unknown): value is WorkerPersonType {
  return value === "ATTENDANCE_AND_ROOM" || value === "ROOM_ONLY";
}

export function isWorkerActionType(value: unknown): value is WorkerActionType {
  return WORKER_ACTION_TYPES.includes(value as WorkerActionType);
}

export function isRoomActionType(
  value: unknown,
): value is Exclude<WorkerActionType, "ATTENDANCE"> {
  return value === "SINGLE_ROOM" || value === "DOUBLE_ROOM" || value === "MONTHLY_ROOM" || value === "FAMILY_ROOM";
}

export function formatWorkerPersonType(personType: string): string {
  if (personType === "ATTENDANCE_AND_ROOM") {
    return PERSON_TYPE_LABELS.ATTENDANCE_AND_ROOM;
  }

  if (personType === "ROOM_ONLY") {
    return PERSON_TYPE_LABELS.ROOM_ONLY;
  }

  return personType;
}

export function formatWorkerActionType(actionType: string): string {
  if (actionType === "ATTENDANCE") {
    return ACTION_TYPE_LABELS.ATTENDANCE;
  }

  if (isRoomActionType(actionType)) {
    return ACTION_TYPE_LABELS[actionType];
  }

  return actionType;
}

export function actionTypeToRoomType(
  actionType: WorkerActionType,
): string | null {
  if (actionType === "ATTENDANCE") {
    return null;
  }

  return ACTION_TYPE_ROOM_TYPES[actionType];
}

function parseNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}

function parseOptionalString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseOptionalBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export function normalizeWorkerRequestBody(
  body: unknown,
): { ok: true; data: NormalizedWorkerRequest } | { ok: false; message: string } {
  if (typeof body !== "object" || body === null) {
    return { ok: false, message: "Invalid request body." };
  }

  const record = body as WorkerRequestBody;

  const name = parseOptionalString(record.name);

  if (!name) {
    return { ok: false, message: "name is required." };
  }

  if (!isWorkerPersonType(record.personType)) {
    return {
      ok: false,
      message: "personType must be ATTENDANCE_AND_ROOM or ROOM_ONLY.",
    };
  }

  const normalizedIdsResult = normalizeWorkerFingerIds(record, record.personType);

  if (!normalizedIdsResult.ok) {
    return normalizedIdsResult;
  }

  return {
    ok: true,
    data: {
      name,
      phone: parseOptionalString(record.phone),
      personType: record.personType,
      isActive: parseOptionalBoolean(record.isActive, true),
      fingerIds: normalizedIdsResult.data,
    },
  };
}

export function normalizeWorkerFingerIds(
  input: WorkerFingerIdInput,
  personType: WorkerPersonType,
): { ok: true; data: NormalizedWorkerFingerIds } | { ok: false; message: string } {
  const singleRoomDeviceUserId = parseNumber(input.singleRoomDeviceUserId);
  const doubleRoomDeviceUserId = parseNumber(input.doubleRoomDeviceUserId);
  const monthlyRoomDeviceUserId = parseNumber(input.monthlyRoomDeviceUserId);
  const familyRoomDeviceUserId = parseNumber(input.familyRoomDeviceUserId);

  if (
    singleRoomDeviceUserId === null ||
    doubleRoomDeviceUserId === null ||
    monthlyRoomDeviceUserId === null ||
    familyRoomDeviceUserId === null
  ) {
    return { ok: false, message: "All provided device IDs must be numbers." };
  }

  const attendanceDeviceUserId =
    personType === "ATTENDANCE_AND_ROOM"
      ? parseNumber(input.attendanceDeviceUserId)
      : parseNumber(input.attendanceDeviceUserId);

  if (personType === "ATTENDANCE_AND_ROOM" && attendanceDeviceUserId === null) {
    return { ok: false, message: "attendanceDeviceUserId is required for attendance workers." };
  }

  const uniqueValues = [
    attendanceDeviceUserId,
    singleRoomDeviceUserId,
    doubleRoomDeviceUserId,
    monthlyRoomDeviceUserId,
    familyRoomDeviceUserId,
  ].filter((value): value is number => value !== null);

  if (new Set(uniqueValues).size !== uniqueValues.length) {
    return { ok: false, message: "Device User IDs must be unique within the worker." };
  }

  return {
    ok: true,
    data: {
      attendanceDeviceUserId: attendanceDeviceUserId,
      singleRoomDeviceUserId,
      doubleRoomDeviceUserId,
      monthlyRoomDeviceUserId,
      familyRoomDeviceUserId,
    },
  };
}

export function buildWorkerFingerMappings(params: {
  workerId: string;
  personType: WorkerPersonType;
  ids: NormalizedWorkerFingerIds;
}): Array<{ workerId: string; deviceUserId: number; actionType: WorkerActionType }> {
  const mappings: Array<{ workerId: string; deviceUserId: number; actionType: WorkerActionType }> = [
    {
      workerId: params.workerId,
      deviceUserId: params.ids.singleRoomDeviceUserId,
      actionType: "SINGLE_ROOM",
    },
    {
      workerId: params.workerId,
      deviceUserId: params.ids.doubleRoomDeviceUserId,
      actionType: "DOUBLE_ROOM",
    },
    {
      workerId: params.workerId,
      deviceUserId: params.ids.monthlyRoomDeviceUserId,
      actionType: "MONTHLY_ROOM",
    },
    {
      workerId: params.workerId,
      deviceUserId: params.ids.familyRoomDeviceUserId,
      actionType: "FAMILY_ROOM",
    },
  ];

  if (params.personType === "ATTENDANCE_AND_ROOM" && params.ids.attendanceDeviceUserId !== null) {
    mappings.unshift({
      workerId: params.workerId,
      deviceUserId: params.ids.attendanceDeviceUserId,
      actionType: "ATTENDANCE",
    });
  }

  return mappings;
}
