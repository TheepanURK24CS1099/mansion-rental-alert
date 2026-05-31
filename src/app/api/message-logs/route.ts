import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function parseLimit(searchParams: URLSearchParams): number {
  const limitValue = Number(searchParams.get("limit") ?? "50");

  if (!Number.isInteger(limitValue) || limitValue <= 0) {
    return 50;
  }

  return Math.min(limitValue, 50);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = parseLimit(url.searchParams);

  const logs = await prisma.messageLog.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return NextResponse.json({ success: true, data: logs });
}

export async function DELETE() {
  try {
    const result = await prisma.messageLog.deleteMany();

    return NextResponse.json({
      success: true,
      deletedCount: result.count,
    });
  } catch {
    return NextResponse.json(
      { success: false, error: "Unable to clear message logs." },
      { status: 500 },
    );
  }
}
