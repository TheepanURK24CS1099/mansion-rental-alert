import { getWhatsAppConfig, isRealWhatsAppEnabled } from "@/lib/whatsappConfig";

export interface Fast2SmsTemplateMessageInput {
  recipient: string;
  messageId: string;
  variables: string[];
  templateName?: string;
}

export interface Fast2SmsNormalizedResult {
  success: boolean;
  provider: "FAST2SMS";
  status: "SENT" | "FAILED" | "SKIPPED";
  response?: unknown;
  errorMessage?: string;
  skipped?: boolean;
  reason?: string;
}

export interface RentalAlertWhatsAppInput {
  recipient: string;
  roomType: string;
  alertDate: string;
  alertTime: string;
  updatedBy: string;
}

export interface StaffAttendanceWhatsAppInput {
  recipient: string;
  workerName: string;
  status: string;
  attendanceDate: string;
  attendanceTime: string;
}

const FAST2SMS_WHATSAPP_BASE_URL = "https://www.fast2sms.com/dev/whatsapp";

// Connected to real app flow in Version 11C/11D after manual test.

export async function sendFast2SmsTemplateMessage(
  input: Fast2SmsTemplateMessageInput,
): Promise<Fast2SmsNormalizedResult> {
  const config = getWhatsAppConfig();

  if (!isRealWhatsAppEnabled()) {
    return {
      success: false,
      provider: "FAST2SMS",
      status: "SKIPPED",
      response: {
        skipped: true,
        reason: "Real WhatsApp mode is not enabled.",
      },
      errorMessage: "Real WhatsApp mode is not enabled.",
    };
  }

  const templateName =
    input.templateName ??
    (input.messageId === config.rentalMessageId
      ? config.rentalTemplateName
      : input.messageId === config.attendanceMessageId
        ? config.attendanceTemplateName
        : input.messageId);

  const endpoint = `${FAST2SMS_WHATSAPP_BASE_URL}/${config.whatsappVersion}/${config.phoneNumberId}/messages`;

  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: input.recipient,
    type: "template",
    template: {
      name: templateName,
      language: { code: "en" },
      components: [
        {
          type: "body",
          parameters: input.variables.map((text) => ({
            type: "text",
            text,
          })),
        },
      ],
    },
  };

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: config.apiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
    });

    const responseBody: unknown = await response.json().catch(() => null);

    if (!response.ok) {
      return {
        success: false,
        provider: "FAST2SMS",
        status: "FAILED",
        response: responseBody,
        errorMessage:
          typeof responseBody === "object" &&
          responseBody !== null &&
          "message" in responseBody
            ? String((responseBody as { message?: unknown }).message ?? "Fast2SMS request failed.")
            : `Fast2SMS request failed (${response.status})`,
      };
    }

    return {
      success: true,
      provider: "FAST2SMS",
      status: "SENT",
      response: responseBody,
    };
  } catch (error) {
    return {
      success: false,
      provider: "FAST2SMS",
      status: "FAILED",
      errorMessage: error instanceof Error ? error.message : "Unable to send Fast2SMS WhatsApp message.",
    };
  }
}

export async function sendRentalAlertWhatsApp(
  input: RentalAlertWhatsAppInput,
): Promise<Fast2SmsNormalizedResult> {
  const config = getWhatsAppConfig();

  return sendFast2SmsTemplateMessage({
    recipient: input.recipient,
    messageId: config.rentalMessageId,
    templateName: config.rentalTemplateName,
    variables: [input.roomType, input.alertDate, input.alertTime, input.updatedBy],
  });
}

export async function sendStaffAttendanceWhatsApp(
  input: StaffAttendanceWhatsAppInput,
): Promise<Fast2SmsNormalizedResult> {
  const config = getWhatsAppConfig();

  return sendFast2SmsTemplateMessage({
    recipient: input.recipient,
    messageId: config.attendanceMessageId,
    templateName: config.attendanceTemplateName,
    variables: [input.workerName, input.status, input.attendanceDate, input.attendanceTime],
  });
}
