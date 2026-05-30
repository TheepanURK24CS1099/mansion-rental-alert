import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  buildWorkerFingerMappings,
  normalizeWorkerRequestBody,
} from "@/lib/workers";

async function assertDeviceIdsAreAvailable(deviceUserIds: number[], workerId: string) {
  if (deviceUserIds.length === 0) {
    return null;
  }

  const existingMappings = await prisma.workerFingerMapping.findMany({
    where: {
      deviceUserId: {
        in: deviceUserIds,
      },
      workerId: {
        not: workerId,
      },
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

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const existingWorker = await prisma.worker.findUnique({
      where: { id },
      include: {
        fingerMappings: true,
      },
    });

    if (!existingWorker) {
      return NextResponse.json(
        { success: false, error: "Worker not found." },
        { status: 404 },
      );
    }

    const body: unknown = await request.json();
    const parsed = normalizeWorkerRequestBody(body);

    if (!parsed.ok) {
      return NextResponse.json(
        { success: false, error: parsed.message },
        { status: 400 },
      );
    }

    const deviceUserIds = collectProvidedDeviceUserIds(parsed.data.fingerIds);

    const duplicateError = await assertDeviceIdsAreAvailable(deviceUserIds, id);

    if (duplicateError) {
      return NextResponse.json(
        { success: false, error: duplicateError },
        { status: 400 },
      );
    }

    const worker = await prisma.$transaction(async (transaction) => {
      const updatedWorker = await transaction.worker.update({
        where: { id },
        data: {
          name: parsed.data.name,
          phone: parsed.data.phone,
          personType: parsed.data.personType,
          isActive: parsed.data.isActive,
        },
      });

      await transaction.workerFingerMapping.deleteMany({
        where: { workerId: id },
      });

      const mappings = buildWorkerFingerMappings({
        workerId: id,
        personType: parsed.data.personType,
        ids: parsed.data.fingerIds,
      });

      await transaction.workerFingerMapping.createMany({
        data: mappings,
      });

      return transaction.worker.findUnique({
        where: { id: updatedWorker.id },
        include: {
          fingerMappings: {
            orderBy: { createdAt: "asc" },
          },
        },
      });
    });

    return NextResponse.json({ success: true, data: worker });
  } catch {
    return NextResponse.json(
      { success: false, error: "Unable to update worker." },
      { status: 500 },
    );
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    await prisma.worker.delete({
      where: { id },
    });

    return NextResponse.json({ success: true, deleted: true });
  } catch {
    return NextResponse.json(
      { success: false, error: "Unable to delete worker." },
      { status: 500 },
    );
  }
}
