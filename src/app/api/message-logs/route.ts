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
  const fromDate = url.searchParams.get("from");
  const toDate = url.searchParams.get("to");

  const where: {
    createdAt?: {
      gte?: Date;
      lte?: Date;
    };
  } = {};

  if (fromDate && /^\d{4}-\d{2}-\d{2}$/.test(fromDate)) {
    where.createdAt = where.createdAt || {};
    where.createdAt.gte = new Date(`${fromDate}T00:00:00Z`);
  }

  if (toDate && /^\d{4}-\d{2}-\d{2}$/.test(toDate)) {
    where.createdAt = where.createdAt || {};
    where.createdAt.lte = new Date(`${toDate}T23:59:59Z`);
  }

  try {
    const logs = await prisma.messageLog.findMany({
      where: Object.keys(where).length > 0 ? where : undefined,
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return NextResponse.json({ success: true, data: logs });
  } catch (error) {
    console.error("GET /api/message-logs error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch message logs" },
      { status: 500 },
    );
  }
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
