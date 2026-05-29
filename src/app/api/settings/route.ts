import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const DEFAULT_SETTINGS = {
  mansionName: "Mansion Rental Alert System",
  ownerName: "Owner",
  ownerWhatsAppNumber: "",
  caretakerName: "Caretaker",
};

interface SettingsPayload {
  mansionName?: unknown;
  ownerName?: unknown;
  ownerWhatsAppNumber?: unknown;
  caretakerName?: unknown;
}

function isStringOrEmpty(value: unknown): value is string {
  return typeof value === "string";
}

function parseSettingsPayload(body: unknown):
  | { ok: true; data: typeof DEFAULT_SETTINGS }
  | { ok: false; message: string } {
  if (typeof body !== "object" || body === null) {
    return { ok: false, message: "Invalid request body." };
  }

  const payload = body as SettingsPayload;

  if (
    !isStringOrEmpty(payload.mansionName) ||
    !isStringOrEmpty(payload.ownerName) ||
    !isStringOrEmpty(payload.ownerWhatsAppNumber) ||
    !isStringOrEmpty(payload.caretakerName)
  ) {
    return { ok: false, message: "All settings fields must be strings." };
  }

  return {
    ok: true,
    data: {
      mansionName: payload.mansionName,
      ownerName: payload.ownerName,
      ownerWhatsAppNumber: payload.ownerWhatsAppNumber,
      caretakerName: payload.caretakerName,
    },
  };
}

export async function GET() {
  const existingSettings = await prisma.appSettings.findFirst({
    orderBy: { createdAt: "asc" },
  });

  if (existingSettings) {
    return NextResponse.json({ success: true, data: existingSettings });
  }

  const createdSettings = await prisma.appSettings.create({
    data: DEFAULT_SETTINGS,
  });

  return NextResponse.json({ success: true, data: createdSettings }, { status: 201 });
}

export async function PUT(request: Request) {
  try {
    const body: unknown = await request.json();
    const parsed = parseSettingsPayload(body);

    if (!parsed.ok) {
      return NextResponse.json(
        { success: false, error: parsed.message },
        { status: 400 },
      );
    }

    const existingSettings = await prisma.appSettings.findFirst({
      orderBy: { createdAt: "asc" },
    });

    const settings = existingSettings
      ? await prisma.appSettings.update({
          where: { id: existingSettings.id },
          data: parsed.data,
        })
      : await prisma.appSettings.create({ data: parsed.data });

    return NextResponse.json({ success: true, data: settings });
  } catch {
    return NextResponse.json(
      { success: false, error: "Unable to save settings." },
      { status: 500 },
    );
  }
}
