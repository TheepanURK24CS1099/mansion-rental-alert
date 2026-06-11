import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { getWhatsAppConfig, isRealWhatsAppEnabled } from "@/lib/whatsappConfig";
import {
  sendRentalAlertWhatsApp,
  sendStaffAttendanceWhatsApp,
} from "@/lib/fast2smsWhatsAppService";

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
  dutyStatus?: string;
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
  const dutyStatusLine = `Duty Status: ${input.dutyStatus ?? "Outside Scheduled Time"}`;

  return [
    "Dear Owner,",
    "",
    "This is an automatic staff attendance update from SKC Mansion.",
    "",
    `Staff: ${input.workerName}`,
    `Time: ${input.attendanceTime}`,
    `Attendance: ${input.status}`,
    dutyStatusLine,
    "",
    `Attendance date: ${input.attendanceDate}`,
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

function isConfiguredRecipient(recipient: string): boolean {
  return recipient.trim().length > 0 && recipient !== "Not configured";
}

async function createRentalAlertMessageLog(
  input: CreateMockRentalAlertMessageLogInput,
) {
  const config = getWhatsAppConfig();
  const realModeEnabled = isRealWhatsAppEnabled();
  const recipient = isConfiguredRecipient(input.recipient)
    ? input.recipient
    : "Not configured";
  const messageBody = buildRentalAlertMessage({
    roomType: input.roomType,
    alertDate: input.alertDate,
    alertTime: input.alertTime,
    updatedBy: input.updatedBy,
  });

  const templateVariables = {
    roomType: input.roomType,
    alertDate: input.alertDate,
    alertTime: input.alertTime,
    updatedBy: input.updatedBy,
  };

  // In MOCK mode no real WhatsApp is sent.
  if (!realModeEnabled) {
    const logStatus = input.status ?? "MOCK_SENT";

    return prisma.messageLog.create({
      data: buildMessageLogPayload({
        messageType: "RENTAL_ALERT",
        recipient,
        templateName: config.rentalTemplateName || "mansion_rental_alert",
        templateVariables,
        messageBody,
        status: logStatus,
        provider: "MOCK",
        relatedRentalAlertId: input.relatedRentalAlertId ?? null,
        errorMessage: input.errorMessage ?? null,
        sentAt: logStatus === "FAILED" ? null : new Date(),
      }),
    });
  }

  // In REAL mode Fast2SMS is used.
  if (!isConfiguredRecipient(recipient)) {
    return prisma.messageLog.create({
      data: buildMessageLogPayload({
        messageType: "RENTAL_ALERT",
        recipient: "Not configured",
        templateName: config.rentalTemplateName || "mansion_rental_alert",
        templateVariables,
        messageBody,
        status: "FAILED",
        provider: "FAST2SMS",
        relatedRentalAlertId: input.relatedRentalAlertId ?? null,
        errorMessage: "Owner WhatsApp number not configured.",
        sentAt: null,
      }),
    });
  }

  const sendResult = await sendRentalAlertWhatsApp({
    recipient,
    roomType: input.roomType,
    alertDate: input.alertDate,
    alertTime: input.alertTime,
    updatedBy: input.updatedBy,
  });

  return prisma.messageLog.create({
    data: buildMessageLogPayload({
      messageType: "RENTAL_ALERT",
      recipient,
      templateName: config.rentalTemplateName || "mansion_rental_alert",
      templateVariables,
      messageBody,
      status: sendResult.success ? "SENT" : "FAILED",
      provider: "FAST2SMS",
      relatedRentalAlertId: input.relatedRentalAlertId ?? null,
      errorMessage: sendResult.success
        ? null
        : sendResult.errorMessage ?? "Unable to send Fast2SMS WhatsApp message.",
      sentAt: sendResult.success ? new Date() : null,
    }),
  });
}

async function createStaffAttendanceMessageLog(
  input: CreateMockStaffAttendanceMessageLogInput,
) {
  const config = getWhatsAppConfig();
  const realModeEnabled = isRealWhatsAppEnabled();
  const recipient = isConfiguredRecipient(input.recipient)
    ? input.recipient
    : "Not configured";
  const messageBody = buildStaffAttendanceMessage({
    workerName: input.workerName,
    status: input.status,
    attendanceDate: input.attendanceDate,
    attendanceTime: input.attendanceTime,
    dutyStatus: input.dutyStatus,
  });

  const templateVariables = {
    workerName: input.workerName,
    status: input.status,
    attendanceDate: input.attendanceDate,
    attendanceTime: input.attendanceTime,
    dutyStatus: input.dutyStatus ?? "Outside Scheduled Time",
  };

  // In MOCK mode no real WhatsApp is sent.
  if (!realModeEnabled) {
    const logStatus = input.messageStatus ?? "MOCK_SENT";

    return prisma.messageLog.create({
      data: buildMessageLogPayload({
        messageType: "STAFF_ATTENDANCE",
        recipient,
        templateName: config.attendanceTemplateName || "mansion_staff_attendance_alert",
        templateVariables,
        messageBody,
        status: logStatus,
        provider: "MOCK",
        relatedAttendanceId: input.relatedAttendanceId ?? null,
        errorMessage: input.errorMessage ?? null,
        sentAt: logStatus === "FAILED" ? null : new Date(),
      }),
    });
  }

  // In REAL mode Fast2SMS is used.
  if (!isConfiguredRecipient(recipient)) {
    return prisma.messageLog.create({
      data: buildMessageLogPayload({
        messageType: "STAFF_ATTENDANCE",
        recipient: "Not configured",
        templateName: config.attendanceTemplateName || "mansion_staff_attendance_alert",
        templateVariables,
        messageBody,
        status: "FAILED",
        provider: "FAST2SMS",
        relatedAttendanceId: input.relatedAttendanceId ?? null,
        errorMessage: "Owner WhatsApp number not configured.",
        sentAt: null,
      }),
    });
  }

  const sendResult = await sendStaffAttendanceWhatsApp({
    recipient,
    workerName: input.workerName,
    status: input.status,
    attendanceDate: input.attendanceDate,
    attendanceTime: input.attendanceTime,
  });

  return prisma.messageLog.create({
    data: buildMessageLogPayload({
      messageType: "STAFF_ATTENDANCE",
      recipient,
      templateName: config.attendanceTemplateName || "mansion_staff_attendance_alert",
      templateVariables,
      messageBody,
      status: sendResult.success ? "SENT" : "FAILED",
      provider: "FAST2SMS",
      relatedAttendanceId: input.relatedAttendanceId ?? null,
      errorMessage: sendResult.success
        ? null
        : sendResult.errorMessage ?? "Unable to send Fast2SMS WhatsApp message.",
      sentAt: sendResult.success ? new Date() : null,
    }),
  });
}

export async function createMockRentalAlertMessageLog(
  input: CreateMockRentalAlertMessageLogInput,
) {
  return createRentalAlertMessageLog(input);
}

export async function createMockStaffAttendanceMessageLog(
  input: CreateMockStaffAttendanceMessageLogInput,
) {
  return createStaffAttendanceMessageLog(input);
}
