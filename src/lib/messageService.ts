import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";

export type MessageType = "RENTAL_ALERT" | "STAFF_ATTENDANCE";
export type MessageStatus = "MOCK_SENT" | "PENDING" | "SENT" | "FAILED";
export type MessageProvider = "MOCK" | "FAST2SMS";

export interface RentalAlertMessageInput {
  roomType: string;
  alertDate: string;
  alertTime: string;
  updatedBy: string;
}

export interface CreateMockRentalAlertMessageLogInput extends RentalAlertMessageInput {
  recipient: string;
  relatedRentalAlertId?: string | null;
  status?: MessageStatus;
  errorMessage?: string | null;
}

export interface StaffAttendanceMessageInput {
  workerName: string;
  status: string;
  attendanceDate: string;
  attendanceTime: string;
}

export interface CreateMockStaffAttendanceMessageLogInput extends Omit<StaffAttendanceMessageInput, "status"> {
  recipient: string;
  status: string;
  messageStatus?: MessageStatus;
  relatedAttendanceId?: string | null;
  errorMessage?: string | null;
}

export function buildRentalAlertMessage(input: RentalAlertMessageInput): string {
  return [
    "Dear Owner,",
    "",
    "This is an automatic room rental update from SKC Mansion.",
    "",
    `Room type: ${input.roomType}`,
    "Rental status: Rented",
    "",
    `Rental date: ${input.alertDate}`,
    `Rental time: ${input.alertTime}`,
    "",
    `Updated by staff member: ${input.updatedBy}`,
    "",
    "This message is for your information. Please check the SKC Mansion dashboard for full rental history.",
  ].join("\n");
}

export function buildStaffAttendanceMessage(input: StaffAttendanceMessageInput): string {
  return [
    "Dear Owner,",
    "",
    "This is an automatic staff attendance update from SKC Mansion.",
    "",
    `Staff name: ${input.workerName}`,
    `Attendance status: ${input.status}`,
    "",
    `Attendance date: ${input.attendanceDate}`,
    `Attendance time: ${input.attendanceTime}`,
    "",
    "This message is for your information. Please check the SKC Mansion dashboard for full attendance records.",
  ].join("\n");
}

function buildMessageLogPayload(params: {
  messageType: MessageType;
  recipient: string;
  templateName: string;
  templateVariables: Prisma.InputJsonValue;
  messageBody: string;
  status: MessageStatus;
  provider: MessageProvider;
  relatedRentalAlertId?: string | null;
  relatedAttendanceId?: string | null;
  errorMessage?: string | null;
  sentAt?: Date | null;
}) {
  return {
    messageType: params.messageType,
    recipient: params.recipient,
    templateName: params.templateName,
    templateVariables: params.templateVariables,
    messageBody: params.messageBody,
    status: params.status,
    provider: params.provider,
    relatedRentalAlertId: params.relatedRentalAlertId ?? null,
    relatedAttendanceId: params.relatedAttendanceId ?? null,
    errorMessage: params.errorMessage ?? null,
    sentAt: params.sentAt ?? null,
  };
}

export async function createMockRentalAlertMessageLog(
  input: CreateMockRentalAlertMessageLogInput,
) {
  const logStatus = input.status ?? "MOCK_SENT";
  const messageBody = buildRentalAlertMessage({
    roomType: input.roomType,
    alertDate: input.alertDate,
    alertTime: input.alertTime,
    updatedBy: input.updatedBy,
  });

  return prisma.messageLog.create({
    data: buildMessageLogPayload({
      messageType: "RENTAL_ALERT",
      recipient: input.recipient,
      templateName: "mansion_rental_alert",
      templateVariables: {
        roomType: input.roomType,
        alertDate: input.alertDate,
        alertTime: input.alertTime,
        updatedBy: input.updatedBy,
      },
      messageBody,
      status: logStatus,
      provider: "MOCK",
      relatedRentalAlertId: input.relatedRentalAlertId ?? null,
      errorMessage: input.errorMessage ?? null,
      sentAt: logStatus === "FAILED" ? null : new Date(),
    }),
  });
}

export async function createMockStaffAttendanceMessageLog(
  input: CreateMockStaffAttendanceMessageLogInput,
) {
  const logStatus = input.messageStatus ?? "MOCK_SENT";
  const messageBody = buildStaffAttendanceMessage({
    workerName: input.workerName,
    status: input.status,
    attendanceDate: input.attendanceDate,
    attendanceTime: input.attendanceTime,
  });

  return prisma.messageLog.create({
    data: buildMessageLogPayload({
      messageType: "STAFF_ATTENDANCE",
      recipient: input.recipient,
      templateName: "mansion_staff_attendance_alert",
      templateVariables: {
        workerName: input.workerName,
        status: input.status,
        attendanceDate: input.attendanceDate,
        attendanceTime: input.attendanceTime,
      },
      messageBody,
      status: logStatus,
      provider: "MOCK",
      relatedAttendanceId: input.relatedAttendanceId ?? null,
      errorMessage: input.errorMessage ?? null,
      sentAt: logStatus === "FAILED" ? null : new Date(),
    }),
  });
}
