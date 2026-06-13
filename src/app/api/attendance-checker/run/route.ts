import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createMockStaffAttendanceMessageLog } from "@/lib/messageService";
import {
  evaluateAttendanceStatus,
  getCurrentAttendanceTime,
  getTodayAttendanceDate,
  getAttendanceSchedule,
} from "@/lib/attendanceChecker";

function normalizeWorkerName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export async function POST(req: Request) {
  try {
    // Secret header enforcement (optional)
    const requiredSecret = process.env.ATTENDANCE_CHECKER_SECRET;
    if (requiredSecret) {
      const provided = req.headers.get("x-attendance-checker-secret")?.trim() ?? "";
      if (!provided || provided !== requiredSecret) {
        return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
      }
    }

    const url = new URL(req.url);
    const dateParam = url.searchParams.get("date"); // YYYY-MM-DD
    const timeParam = url.searchParams.get("time"); // HH:mm
    const modeParam = (url.searchParams.get("mode") ?? "all").toLowerCase();

    // Build IST-based checkedAt
    let checkedAt: Date;
    if (dateParam || timeParam) {
      const istTodayIso = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
      const datePart = dateParam ?? istTodayIso;
      const istNowTime = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Kolkata",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(new Date());
      const timePart = timeParam ?? istNowTime;
      checkedAt = new Date(`${datePart}T${timePart}:00+05:30`);
    } else {
      checkedAt = new Date();
    }

    const attendanceDate = getTodayAttendanceDate(checkedAt);

    const datePartForRange = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(checkedAt);
    const startOfTodayIst = new Date(`${datePartForRange}T00:00:00+05:30`);
    const endOfTodayIst = new Date(`${datePartForRange}T23:59:59.999+05:30`);

    const [workers, attendanceLogs, settings] = await Promise.all([
      prisma.worker.findMany({ where: { isActive: true }, select: { id: true, name: true } }),
      prisma.workerAttendance.findMany({
        where: { attendanceDate },
        include: { worker: { select: { name: true } } },
        orderBy: { createdAt: "asc" },
      }),
      prisma.appSettings.findFirst(),
    ]);

    const dayShiftNames = new Set(["ananthi", "suresh kumar"]);
    const nightShiftNames = new Set(["periyaanna"]);

    let scheduleNames = new Set<string>();

    switch (modeParam) {
      case "day-in":
      case "day-out":
        scheduleNames = new Set(dayShiftNames);
        break;
      case "night-in":
      case "night-out":
        scheduleNames = new Set(nightShiftNames);
        break;
      case "all":
      default:
        scheduleNames = new Set([...dayShiftNames, ...nightShiftNames]);
        break;
    }

    const results: Array<{
      workerName: string;
      status: string; // display status for messages/UI (e.g. "IN (Late)")
      rawStatus: string; // internal evaluator status (e.g. "Late")
      attendanceDate: string;
      attendanceTime: string;
      dutyStatus: string;
      reason: string;
      duplicate: boolean;
    }> = [];

    const ownerWhatsAppNumber = settings?.ownerWhatsAppNumber?.trim() ?? "";

    // Explicit handling for mode=night-in using deviceUserId 221
    if (modeParam === "night-in") {
      const targetDeviceUserId = 221;

      const mapping = await prisma.workerFingerMapping.findFirst({
        where: { deviceUserId: targetDeviceUserId },
        include: { worker: true },
      });

      const matchedWorkerName = mapping?.worker?.name ?? "Periyaanna";

      // IN scans for deviceUserId 221 on this attendanceDate
      const inScans = attendanceLogs.filter((r) => r.deviceUserId === targetDeviceUserId && r.status === "IN");

      const schedule = getAttendanceSchedule(matchedWorkerName) ?? {
        inStart: "20:00",
        inEnd: "23:00",
        outStart: "06:30",
        outEnd: "09:00",
      };

      const dateIso = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(checkedAt);
      const inEndIso = `${dateIso}T${schedule.inEnd}:00+05:30`;
      const inEndDate = new Date(inEndIso);

      const afterInWindowEnd = checkedAt >= inEndDate;

      // Debug object
      const debug = {
        targetDeviceUserId,
        matchedWorkerName,
        inScanCount: inScans.length,
        afterInWindowEnd,
      };

      if (!afterInWindowEnd) {
        return NextResponse.json({
          success: true,
          attendanceDate,
          checkedAt: checkedAt.toISOString(),
          currentAttendanceTime: getCurrentAttendanceTime(checkedAt),
          results: [],
          createdCount: 0,
          debugNightIn: debug,
        } as any);
      }

      // If there are IN scans and we have a mapping, run evaluator for IN-related statuses
      if (inScans.length > 0 && mapping?.worker) {
        const workerAttendance = attendanceLogs.filter((r) => r.workerId === mapping.workerId);
        const evaluation = evaluateAttendanceStatus(matchedWorkerName, workerAttendance, checkedAt);

        if (!evaluation || (evaluation.status !== "No Finger Placed" && evaluation.status !== "Late")) {
          return NextResponse.json({
            success: true,
            attendanceDate,
            checkedAt: checkedAt.toISOString(),
            currentAttendanceTime: getCurrentAttendanceTime(checkedAt),
            results: [],
            createdCount: 0,
            debugNightIn: debug,
          } as any);
        }

        const displayStatus = evaluation.status === "Late" ? "IN (Late)" : evaluation.status;
        const dutyStatus = evaluation.status === "Late" ? "Late Check-in" : evaluation.dutyStatus;

        const existing = await prisma.messageLog.findFirst({
          where: {
            messageType: "STAFF_ATTENDANCE",
            AND: [
              { templateVariables: { path: ["workerName"], equals: matchedWorkerName } },
              { templateVariables: { path: ["attendanceDate"], equals: attendanceDate } },
              { templateVariables: { path: ["status"], equals: displayStatus } },
            ],
          },
        });

        const duplicate = !!existing;

        const out = [
          {
            workerName: matchedWorkerName,
            status: displayStatus,
            rawStatus: evaluation.status,
            attendanceDate: evaluation.attendanceDate,
            attendanceTime: evaluation.attendanceTime,
            dutyStatus,
            reason: evaluation.reason,
            duplicate,
          },
        ];

        if (!duplicate) {
          await createMockStaffAttendanceMessageLog({
            recipient: ownerWhatsAppNumber,
            workerName: matchedWorkerName,
            status: displayStatus,
            attendanceDate: evaluation.attendanceDate,
            attendanceTime: evaluation.attendanceTime,
            dutyStatus,
            messageStatus: "MOCK_SENT",
          });
        }

        return NextResponse.json({
          success: true,
          attendanceDate,
          checkedAt: checkedAt.toISOString(),
          currentAttendanceTime: getCurrentAttendanceTime(checkedAt),
          results: out,
          createdCount: out.filter((r) => !r.duplicate).length,
          debugNightIn: debug,
        } as any);
      }

      // No IN scans -> synthesize No Finger Placed
      const synthesized = {
        workerName: matchedWorkerName,
        status: "No Finger Placed",
        attendanceDate,
        attendanceTime: getCurrentAttendanceTime(checkedAt),
        dutyStatus: "No IN scan was recorded within the scheduled window.",
        reason: "No finger placed during the expected duty timing.",
      } as const;

      const existingSynth = await prisma.messageLog.findFirst({
        where: {
          messageType: "STAFF_ATTENDANCE",
          AND: [
            { templateVariables: { path: ["workerName"], equals: synthesized.workerName } },
            { templateVariables: { path: ["attendanceDate"], equals: synthesized.attendanceDate } },
            { templateVariables: { path: ["status"], equals: synthesized.status } },
          ],
        },
      });

      const dup = !!existingSynth;

      const out = [
        {
          workerName: synthesized.workerName,
          status: synthesized.status,
          rawStatus: synthesized.status,
          attendanceDate: synthesized.attendanceDate,
          attendanceTime: synthesized.attendanceTime,
          dutyStatus: synthesized.dutyStatus,
          reason: synthesized.reason,
          duplicate: dup,
        },
      ];

      if (!dup) {
        await createMockStaffAttendanceMessageLog({
          recipient: ownerWhatsAppNumber,
          workerName: synthesized.workerName,
          status: synthesized.status,
          attendanceDate: synthesized.attendanceDate,
          attendanceTime: synthesized.attendanceTime,
          dutyStatus: synthesized.dutyStatus,
          messageStatus: "MOCK_SENT",
        });
      }

      return NextResponse.json({
        success: true,
        attendanceDate,
        checkedAt: checkedAt.toISOString(),
        currentAttendanceTime: getCurrentAttendanceTime(checkedAt),
        results: out,
        createdCount: out.filter((r) => !r.duplicate).length,
        debugNightIn: debug,
      } as any);
    }

    // General flow for other modes
    for (const worker of workers) {
      if (!scheduleNames.has(normalizeWorkerName(worker.name))) {
        continue;
      }

      const workerAttendance = attendanceLogs.filter((record) => record.workerId === worker.id);
      const evaluation = evaluateAttendanceStatus(worker.name, workerAttendance, checkedAt);

      if (!evaluation) {
        continue;
      }

      // In `night-in` mode, a `Leave` returned by the evaluator for a
      // night shift with no scans should be considered an IN-missed
      // (No Finger Placed) alert rather than Leave so the night-in
      // check can surface it. Adjust the status and descriptive fields
      // without changing DB records.
      if (modeParam === "night-in" && evaluation.status === "Leave") {
        evaluation.status = "No Finger Placed";
        evaluation.attendanceTime = getCurrentAttendanceTime(checkedAt);
        evaluation.dutyStatus = "No IN scan was recorded within the scheduled window.";
        evaluation.reason = "No finger placed during the expected duty timing.";
      }

      // Mode-specific filtering: restrict to IN-only or OUT-only statuses
      const inStatuses = new Set(["No Finger Placed", "Late"]);
      const outStatuses = new Set(["OUT Finger Not Placed", "Leave"]);

      const mode = modeParam; // already lowercased
      if (mode === "day-in" || mode === "night-in") {
        if (!inStatuses.has(evaluation.status)) {
          continue;
        }
      } else if (mode === "day-out" || mode === "night-out") {
        if (!outStatuses.has(evaluation.status)) {
          continue;
        }
      }

      // Map evaluator status to display status (keep rawStatus for internal use)
      const displayStatus = evaluation.status === "Late" ? "IN (Late)" : evaluation.status;
      const dutyStatus = evaluation.status === "Late" ? "Late Check-in" : evaluation.dutyStatus;

      // Ensure there is no existing message for same worker + attendanceDate + display status
      const existing = await prisma.messageLog.findFirst({
        where: {
          messageType: "STAFF_ATTENDANCE",
          AND: [
            { templateVariables: { path: ["workerName"], equals: worker.name } },
            { templateVariables: { path: ["attendanceDate"], equals: evaluation.attendanceDate } },
            { templateVariables: { path: ["status"], equals: displayStatus } },
          ],
        },
      });

      const duplicate = !!existing;

      results.push({
        workerName: worker.name,
        status: displayStatus,
        rawStatus: evaluation.status,
        attendanceDate: evaluation.attendanceDate,
        attendanceTime: evaluation.attendanceTime,
        dutyStatus,
        reason: evaluation.reason,
        duplicate,
      });

      if (!duplicate) {
        await createMockStaffAttendanceMessageLog({
          recipient: ownerWhatsAppNumber,
          workerName: worker.name,
          status: displayStatus,
          attendanceDate: evaluation.attendanceDate,
          attendanceTime: evaluation.attendanceTime,
          dutyStatus,
          messageStatus: "MOCK_SENT",
        });
      }
    }

    return NextResponse.json({
      success: true,
      attendanceDate,
      checkedAt: checkedAt.toISOString(),
      currentAttendanceTime: getCurrentAttendanceTime(checkedAt),
      results,
      createdCount: results.filter((result) => !result.duplicate).length,
    });
  } catch (error) {
    console.error("POST /api/attendance-checker/run error:", error);
    return NextResponse.json(
      { success: false, error: "Unable to run attendance checker." },
      { status: 500 },
    );
  }
}
    