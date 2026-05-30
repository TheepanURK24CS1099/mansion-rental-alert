import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  buildWorkerFingerMappings,
  normalizeWorkerRequestBody,
} from "@/lib/workers";

function hasDuplicateMappedDeviceUserIds(deviceUserIds: number[]): boolean {
  return new Set(deviceUserIds).size !== deviceUserIds.length;
}

async function assertDeviceIdsAreAvailable(deviceUserIds: number[], workerId?: string) {
  if (deviceUserIds.length === 0) {
    return null;
  }

  const existingMappings = await prisma.workerFingerMapping.findMany({
    where: {
      deviceUserId: {
        in: deviceUserIds,
      },
      ...(workerId ? { workerId: { not: workerId } } : {}),
    },
    select: {
      deviceUserId: true,
    },
  });

  return existingMappings.length > 0 ? "Device User ID already mapped." : null;
}

function collectProvidedDeviceUserIds(fingerIds: {
  attendanceDeviceUserId: number | null;
  singleRoomDeviceUserId: number;
  doubleRoomDeviceUserId: number;
  monthlyRoomDeviceUserId: number;
  familyRoomDeviceUserId: number;
}): number[] {
  return [
    fingerIds.attendanceDeviceUserId,
    fingerIds.singleRoomDeviceUserId,
    fingerIds.doubleRoomDeviceUserId,
    fingerIds.monthlyRoomDeviceUserId,
    fingerIds.familyRoomDeviceUserId,
  ].filter((value): value is number => value !== null);
}

export async function GET() {
  const workers = await prisma.worker.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      fingerMappings: {
        orderBy: { createdAt: "asc" },
      },
    },
  });

  return NextResponse.json({ success: true, data: workers });
}

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    const parsed = normalizeWorkerRequestBody(body);

    if (!parsed.ok) {
      return NextResponse.json(
        { success: false, error: parsed.message },
        { status: 400 },
      );
    }

    const deviceUserIds = collectProvidedDeviceUserIds(parsed.data.fingerIds);

    if (hasDuplicateMappedDeviceUserIds(deviceUserIds)) {
      return NextResponse.json(
        { success: false, error: "Device User ID already mapped." },
        { status: 400 },
      );
    }

    const duplicateError = await assertDeviceIdsAreAvailable(deviceUserIds);

    if (duplicateError) {
      return NextResponse.json(
        { success: false, error: duplicateError },
        { status: 400 },
      );
    }

    const worker = await prisma.$transaction(async (transaction) => {
      const createdWorker = await transaction.worker.create({
        data: {
          name: parsed.data.name,
          phone: parsed.data.phone,
          personType: parsed.data.personType,
          isActive: parsed.data.isActive,
        },
      });

      const mappings = buildWorkerFingerMappings({
        workerId: createdWorker.id,
        personType: parsed.data.personType,
        ids: parsed.data.fingerIds,
      });

      await transaction.workerFingerMapping.createMany({
        data: mappings,
      });

      return transaction.worker.findUnique({
        where: { id: createdWorker.id },
        include: {
          fingerMappings: {
            orderBy: { createdAt: "asc" },
          },
        },
      });
    });

    return NextResponse.json({ success: true, data: worker }, { status: 201 });
  } catch {
    return NextResponse.json(
      { success: false, error: "Unable to create worker." },
      { status: 500 },
    );
  }
}
