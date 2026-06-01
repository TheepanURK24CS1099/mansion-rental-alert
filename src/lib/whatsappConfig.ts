export type WhatsAppMode = "MOCK" | "REAL";

export interface WhatsAppConfig {
  mode: WhatsAppMode;
  apiKey: string;
  senderNumber: string;
  rentalTemplateName: string;
  rentalTemplateId: string;
  rentalMessageId: string;
  attendanceTemplateName: string;
  attendanceTemplateId: string;
  attendanceMessageId: string;
}

function normalizeMode(value: string | undefined): WhatsAppMode {
  return value === "REAL" ? "REAL" : "MOCK";
}

function readEnvValue(value: string | undefined, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

export function getWhatsAppConfig(): WhatsAppConfig {
  const mode = normalizeMode(process.env.MANSION_WHATSAPP_MODE);

  return {
    mode,
    apiKey: readEnvValue(process.env.FAST2SMS_API_KEY),
    senderNumber: readEnvValue(process.env.MANSION_WHATSAPP_SENDER_NUMBER),
    rentalTemplateName: readEnvValue(process.env.MANSION_RENTAL_TEMPLATE_NAME),
    rentalTemplateId: readEnvValue(process.env.MANSION_RENTAL_TEMPLATE_ID),
    rentalMessageId: readEnvValue(process.env.MANSION_RENTAL_MESSAGE_ID),
    attendanceTemplateName: readEnvValue(process.env.MANSION_ATTENDANCE_TEMPLATE_NAME),
    attendanceTemplateId: readEnvValue(process.env.MANSION_ATTENDANCE_TEMPLATE_ID),
    attendanceMessageId: readEnvValue(process.env.MANSION_ATTENDANCE_MESSAGE_ID),
  };
}

export function isRealWhatsAppEnabled(): boolean {
  const config = getWhatsAppConfig();
  return config.mode === "REAL" && config.apiKey.trim().length > 0;
}
