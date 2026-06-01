import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const logs = await prisma.deviceScanLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return NextResponse.json({ success: true, data: logs });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unable to fetch device scan logs.";
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  try {
    const result = await prisma.deviceScanLog.deleteMany();
    return NextResponse.json({
      success: true,
      deletedCount: result.count,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unable to clear device scan logs.";
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
