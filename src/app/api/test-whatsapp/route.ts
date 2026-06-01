import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildRentalAlertMessage } from "@/lib/messageService";
import {
  getWhatsAppConfig,
  isRealWhatsAppEnabled,
} from "@/lib/whatsappConfig";
import { sendRentalAlertWhatsApp } from "@/lib/fast2smsWhatsAppService";

function formatDateParts(timestamp: number): { date: string; time: string } {
  const dateObject = new Date(timestamp);

  return {
    date: dateObject.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    }),
    time: dateObject.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
    }),
  };
}

export async function POST() {
  try {
    if (!isRealWhatsAppEnabled()) {
      return NextResponse.json(
        { success: false, error: "Real WhatsApp mode is not enabled." },
        { status: 400 },
      );
    }

    const settings = await prisma.appSettings.findFirst({
      orderBy: { createdAt: "asc" },
    });
    const ownerWhatsAppNumber = settings?.ownerWhatsAppNumber?.trim() ?? "";

    if (ownerWhatsAppNumber.length === 0) {
      return NextResponse.json(
        { success: false, error: "Owner WhatsApp number not configured." },
        { status: 400 },
      );
    }

    const config = getWhatsAppConfig();
    const parts = formatDateParts(Date.now());
    const testPayload = {
      roomType: "Single Room",
      alertDate: parts.date,
      alertTime: parts.time,
      updatedBy: "System Test",
    };
    const messageBody = buildRentalAlertMessage(testPayload);

    const sendResult = await sendRentalAlertWhatsApp({
      recipient: ownerWhatsAppNumber,
      ...testPayload,
    });

    const messageLog = await prisma.messageLog.create({
      data: {
        messageType: "RENTAL_ALERT",
        recipient: ownerWhatsAppNumber,
        templateName: config.rentalTemplateName || "mansion_rental_alert",
        templateVariables: testPayload,
        messageBody,
        status: sendResult.success ? "SENT" : "FAILED",
        provider: "FAST2SMS",
        relatedRentalAlertId: null,
        relatedAttendanceId: null,
        errorMessage: sendResult.success
          ? null
          : sendResult.errorMessage ?? "Unable to send Fast2SMS WhatsApp message.",
        sentAt: sendResult.success ? new Date() : null,
      },
    });

    return NextResponse.json({
      success: sendResult.success,
      status: sendResult.status,
      provider: sendResult.provider,
      messageLogId: messageLog.id,
      errorMessage: sendResult.success ? undefined : sendResult.errorMessage,
    });
  } catch {
    return NextResponse.json(
      { success: false, error: "Unable to send test WhatsApp message." },
      { status: 500 },
    );
  }
}
