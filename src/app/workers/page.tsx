"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useSyncExternalStore, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  formatWorkerPersonType,
  isWorkerPersonType,
  type WorkerActionType,
  type WorkerPersonType,
} from "@/lib/workers";
import {
  clearSessionValue,
  getSessionServerSnapshot,
  getSessionSnapshot,
  isLoggedInSession,
  subscribeToSessionStore,
} from "@/lib/sessionStore";

interface WorkerFingerMappingRecord {
  id: string;
  deviceUserId: number;
  actionType: WorkerActionType;
  createdAt: string;
}

interface WorkerRecord {
  id: string;
  name: string;
  phone: string | null;
  personType: WorkerPersonType;
  isActive: boolean;
  fingerMappings: WorkerFingerMappingRecord[];
}

interface WorkerFormState {
  name: string;
  phone: string;
  personType: WorkerPersonType;
  attendanceDeviceUserId: string;
  singleRoomDeviceUserId: string;
  doubleRoomDeviceUserId: string;
  monthlyRoomDeviceUserId: string;
  familyRoomDeviceUserId: string;
}

const EMPTY_FORM: WorkerFormState = {
  name: "",
  phone: "",
  personType: "ATTENDANCE_AND_ROOM",
  attendanceDeviceUserId: "",
  singleRoomDeviceUserId: "",
  doubleRoomDeviceUserId: "",
  monthlyRoomDeviceUserId: "",
  familyRoomDeviceUserId: "",
};

function isWorkerRecord(value: unknown): value is WorkerRecord {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;

  return (
    typeof record.id === "string" &&
    typeof record.name === "string" &&
    (typeof record.phone === "string" || record.phone === null) &&
    isWorkerPersonType(record.personType) &&
    typeof record.isActive === "boolean" &&
    Array.isArray(record.fingerMappings)
  );
}

function getMappingValue(
  worker: WorkerRecord | null,
  actionType: WorkerActionType,
): string {
  const mapping = worker?.fingerMappings.find((item) => item.actionType === actionType);
  return mapping ? String(mapping.deviceUserId) : "";
}

function workerToForm(worker: WorkerRecord): WorkerFormState {
  return {
    name: worker.name,
    phone: worker.phone ?? "",
    personType: worker.personType,
    attendanceDeviceUserId: getMappingValue(worker, "ATTENDANCE"),
    singleRoomDeviceUserId: getMappingValue(worker, "SINGLE_ROOM"),
    doubleRoomDeviceUserId: getMappingValue(worker, "DOUBLE_ROOM"),
    monthlyRoomDeviceUserId: getMappingValue(worker, "MONTHLY_ROOM"),
    familyRoomDeviceUserId: getMappingValue(worker, "FAMILY_ROOM"),
  };
}

function roomMappingValue(worker: WorkerRecord | null, actionType: WorkerActionType): string {
  return getMappingValue(worker, actionType);
}

export default function WorkersPage() {
  const router = useRouter();
  const session = useSyncExternalStore(
    subscribeToSessionStore,
    getSessionSnapshot,
    getSessionServerSnapshot,
  );
  const [workers, setWorkers] = useState<WorkerRecord[]>([]);
  const [form, setForm] = useState<WorkerFormState>(EMPTY_FORM);
  const [editingWorkerId, setEditingWorkerId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!isLoggedInSession(session)) {
      router.replace("/login");
    }
  }, [router, session]);

  useEffect(() => {
    let cancelled = false;

    async function loadWorkers() {
      try {
        const response = await fetch("/api/workers", { cache: "no-store" });
        const body: unknown = await response.json();

        if (!response.ok || typeof body !== "object" || body === null || !("success" in body)) {
          throw new Error("Unable to load workers.");
        }

        const record = body as { success?: unknown; data?: unknown };

        if (!record.success || !Array.isArray(record.data)) {
          throw new Error("Unable to load workers.");
        }

        const loadedWorkers = record.data.filter(isWorkerRecord);

        if (!cancelled) {
          setWorkers(loadedWorkers);
        }
      } catch {
        if (!cancelled) {
          setWorkers([]);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadWorkers();

    return () => {
      cancelled = true;
    };
  }, []);

  const activeWorkerCount = useMemo(
    () => workers.filter((worker) => worker.isActive).length,
    [workers],
  );

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingWorkerId(null);
  };

  const refreshWorkers = async () => {
    const response = await fetch("/api/workers", { cache: "no-store" });
    const body: unknown = await response.json();

    if (response.ok && typeof body === "object" && body !== null && "success" in body) {
      const record = body as { success?: unknown; data?: unknown };
      if (record.success && Array.isArray(record.data)) {
        setWorkers(record.data.filter(isWorkerRecord));
      }
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setMessage(null);

    const payload = {
      name: form.name,
      phone: form.phone,
      personType: form.personType,
      attendanceDeviceUserId:
        form.personType === "ATTENDANCE_AND_ROOM" ? Number(form.attendanceDeviceUserId) : undefined,
      singleRoomDeviceUserId: Number(form.singleRoomDeviceUserId),
      doubleRoomDeviceUserId: Number(form.doubleRoomDeviceUserId),
      monthlyRoomDeviceUserId: Number(form.monthlyRoomDeviceUserId),
      familyRoomDeviceUserId: Number(form.familyRoomDeviceUserId),
      isActive: true,
    };

    const response = await fetch(editingWorkerId ? `/api/workers/${editingWorkerId}` : "/api/workers", {
      method: editingWorkerId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const body: unknown = await response.json();

    if (!response.ok) {
      const errorMessage =
        typeof body === "object" && body !== null && "error" in body
          ? String((body as { error?: unknown }).error ?? "")
          : "Unable to save worker.";
      setError(errorMessage);
      return;
    }

    setMessage(editingWorkerId ? "Worker updated." : "Worker saved.");
    resetForm();
    await refreshWorkers();
  };

  const handleEdit = (worker: WorkerRecord) => {
    setEditingWorkerId(worker.id);
    setForm(workerToForm(worker));
    setMessage(null);
    setError(null);
  };

  const handleDelete = async (workerId: string) => {
    setError(null);
    setMessage(null);

    const response = await fetch(`/api/workers/${workerId}`, { method: "DELETE" });
    const body: unknown = await response.json();

    if (!response.ok) {
      const errorMessage =
        typeof body === "object" && body !== null && "error" in body
          ? String((body as { error?: unknown }).error ?? "")
          : "Unable to delete worker.";
      setError(errorMessage);
      return;
    }

    if (editingWorkerId === workerId) {
      resetForm();
    }

    setMessage("Worker deleted.");
    await refreshWorkers();
  };

  const handleToggleActive = async (worker: WorkerRecord) => {
    setError(null);
    setMessage(null);

    const payload = {
      name: worker.name,
      phone: worker.phone ?? "",
      personType: worker.personType,
      attendanceDeviceUserId: roomMappingValue(worker, "ATTENDANCE")
        ? Number(roomMappingValue(worker, "ATTENDANCE"))
        : undefined,
      singleRoomDeviceUserId: Number(roomMappingValue(worker, "SINGLE_ROOM")),
      doubleRoomDeviceUserId: Number(roomMappingValue(worker, "DOUBLE_ROOM")),
      monthlyRoomDeviceUserId: Number(roomMappingValue(worker, "MONTHLY_ROOM")),
      familyRoomDeviceUserId: Number(roomMappingValue(worker, "FAMILY_ROOM")),
      isActive: !worker.isActive,
    };

    const response = await fetch(`/api/workers/${worker.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const body: unknown = await response.json();

    if (!response.ok) {
      const errorMessage =
        typeof body === "object" && body !== null && "error" in body
          ? String((body as { error?: unknown }).error ?? "")
          : "Unable to update worker status.";
      setError(errorMessage);
      return;
    }

    setMessage(worker.isActive ? "Worker marked inactive." : "Worker marked active.");
    await refreshWorkers();
  };

  if (!isLoggedInSession(session) || isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#F8FAFC] px-4 text-[#64748B]">
        <div className="rounded-3xl border border-[#D4AF37]/35 bg-[#FFFFFF] px-6 py-8 text-sm text-[#64748B] shadow-sm">
          Loading workers...
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#F8FAFC] px-4 py-6 text-[#64748B] sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <section className="rounded-3xl border border-[#D4AF37]/35 bg-gradient-to-r from-[#07162A] to-[#0B1F3A] p-6 shadow-xl xl:p-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-[#D4AF37]/65 bg-[#FFFFFF]/10 px-3 py-1 text-xs font-medium text-[#FFFFFF]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#D4AF37]" />
                Map biometric Device User IDs to workers and actions.
              </div>
              <h1 className="mt-4 text-3xl font-semibold tracking-tight text-[#FFFFFF]">
                Worker & Finger Mapping
              </h1>
              <p className="mt-2 text-sm text-[#F5E6A8]">
                Map each person’s biometric Device User IDs to attendance and room rental actions.
              </p>
            </div>
            <nav className="flex flex-wrap gap-3">
              <Link
                href="/dashboard"
                className="rounded-full border border-[#FFFFFF]/40 bg-[#FFFFFF]/10 px-4 py-2 text-sm font-medium text-[#FFFFFF] transition hover:bg-[#FFFFFF]/20"
              >
                Dashboard
              </Link>
              <Link
                href="/settings"
                className="rounded-full border border-[#FFFFFF]/40 bg-[#FFFFFF]/10 px-4 py-2 text-sm font-medium text-[#FFFFFF] transition hover:bg-[#FFFFFF]/20"
              >
                Settings
              </Link>
              <Link
                href="/workers"
                className="rounded-full border border-[#D4AF37] bg-[#0B1F3A] px-4 py-2 text-sm font-semibold text-[#FFFFFF]"
              >
                Workers
              </Link>
              <button
                type="button"
                onClick={() => {
                  clearSessionValue();
                  router.replace("/login");
                }}
                className="rounded-full border border-[#FFFFFF]/40 bg-[#FFFFFF]/10 px-4 py-2 text-sm font-medium text-[#FFFFFF] transition hover:bg-[#FFFFFF]/20"
              >
                Logout
              </button>
            </nav>
          </div>

          {message ? (
            <div className="mt-6 rounded-2xl border border-[#D4AF37]/60 bg-[#FFFFFF]/10 px-4 py-3 text-sm text-[#FFFFFF]">
              {message}
            </div>
          ) : null}
          {error ? (
            <div className="mt-3 rounded-2xl border border-[#D4AF37]/60 bg-[#FFFFFF]/10 px-4 py-3 text-sm text-[#FFFFFF]">
              {error}
            </div>
          ) : null}
          <div className="mt-4 rounded-2xl border border-[#D4AF37]/40 bg-[#FFFFFF]/10 px-4 py-3 text-sm text-[#FFFFFF]">
            <p className="font-medium text-[#FFFFFF]">Example mappings</p>
            <p className="mt-1">Attendance + Room Rental: Ravi (201–205), Kumar (211–215), Mani (221–225)</p>
            <p>Room Rental Only: Manager (301–304)</p>
            <p className="mt-1 text-xs text-[#F5E6A8]">
              Total active workers: {activeWorkerCount} / {workers.length}
            </p>
          </div>
        </section>

        <section className="rounded-3xl border border-[#D4AF37]/35 bg-[#FFFFFF] p-6 shadow-sm">
          <form onSubmit={handleSubmit} className="grid gap-4 xl:grid-cols-2">
            <label className="grid gap-2 text-sm text-[#0B1F3A]">
              <span>Person Name</span>
              <input
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                className="rounded-2xl border border-[#D4AF37]/35 bg-[#FFFFFF] px-4 py-3 text-[#0B1F3A] outline-none transition focus:border-[#0B1F3A] focus:ring-2 focus:ring-[#0B1F3A]/20"
              />
            </label>

            <label className="grid gap-2 text-sm text-[#0B1F3A]">
              <span>Phone</span>
              <input
                value={form.phone}
                onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
                className="rounded-2xl border border-[#D4AF37]/35 bg-[#FFFFFF] px-4 py-3 text-[#0B1F3A] outline-none transition focus:border-[#0B1F3A] focus:ring-2 focus:ring-[#0B1F3A]/20"
                placeholder="Optional"
              />
            </label>

            <label className="grid gap-2 text-sm text-[#0B1F3A] xl:col-span-2">
              <span>Person Type</span>
              <select
                value={form.personType}
                onChange={(event) => {
                  const nextType = event.target.value as WorkerPersonType;
                  setForm((current) => ({
                    ...current,
                    personType: nextType,
                    attendanceDeviceUserId:
                      nextType === "ROOM_ONLY" ? "" : current.attendanceDeviceUserId,
                  }));
                }}
                className="rounded-2xl border border-[#D4AF37]/35 bg-[#FFFFFF] px-4 py-3 text-[#0B1F3A] outline-none transition focus:border-[#0B1F3A] focus:ring-2 focus:ring-[#0B1F3A]/20"
              >
                <option value="ATTENDANCE_AND_ROOM">Attendance + Room Rental</option>
                <option value="ROOM_ONLY">Room Rental Only</option>
              </select>
            </label>

            {form.personType === "ATTENDANCE_AND_ROOM" ? (
              <label className="grid gap-2 text-sm text-[#0B1F3A] xl:col-span-2">
                <span>Attendance Device User ID</span>
                <input
                  value={form.attendanceDeviceUserId}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, attendanceDeviceUserId: event.target.value }))
                  }
                  className="rounded-2xl border border-[#D4AF37]/35 bg-[#FFFFFF] px-4 py-3 text-[#0B1F3A] outline-none transition focus:border-[#0B1F3A] focus:ring-2 focus:ring-[#0B1F3A]/20"
                />
              </label>
            ) : null}

            <label className="grid gap-2 text-sm text-[#0B1F3A]">
              <span>Single Room Device User ID</span>
              <input
                value={form.singleRoomDeviceUserId}
                onChange={(event) =>
                  setForm((current) => ({ ...current, singleRoomDeviceUserId: event.target.value }))
                }
                className="rounded-2xl border border-[#D4AF37]/35 bg-[#FFFFFF] px-4 py-3 text-[#0B1F3A] outline-none transition focus:border-[#0B1F3A] focus:ring-2 focus:ring-[#0B1F3A]/20"
              />
            </label>

            <label className="grid gap-2 text-sm text-[#0B1F3A]">
              <span>Double Room Device User ID</span>
              <input
                value={form.doubleRoomDeviceUserId}
                onChange={(event) =>
                  setForm((current) => ({ ...current, doubleRoomDeviceUserId: event.target.value }))
                }
                className="rounded-2xl border border-[#D4AF37]/35 bg-[#FFFFFF] px-4 py-3 text-[#0B1F3A] outline-none transition focus:border-[#0B1F3A] focus:ring-2 focus:ring-[#0B1F3A]/20"
              />
            </label>

            <label className="grid gap-2 text-sm text-[#0B1F3A]">
              <span>Monthly Room Device User ID</span>
              <input
                value={form.monthlyRoomDeviceUserId}
                onChange={(event) =>
                  setForm((current) => ({ ...current, monthlyRoomDeviceUserId: event.target.value }))
                }
                className="rounded-2xl border border-[#D4AF37]/35 bg-[#FFFFFF] px-4 py-3 text-[#0B1F3A] outline-none transition focus:border-[#0B1F3A] focus:ring-2 focus:ring-[#0B1F3A]/20"
              />
            </label>

            <label className="grid gap-2 text-sm text-[#0B1F3A]">
              <span>Family Room Device User ID</span>
              <input
                value={form.familyRoomDeviceUserId}
                onChange={(event) =>
                  setForm((current) => ({ ...current, familyRoomDeviceUserId: event.target.value }))
                }
                className="rounded-2xl border border-[#D4AF37]/35 bg-[#FFFFFF] px-4 py-3 text-[#0B1F3A] outline-none transition focus:border-[#0B1F3A] focus:ring-2 focus:ring-[#0B1F3A]/20"
              />
            </label>

            <div className="flex flex-wrap gap-3 pt-2 xl:col-span-2">
              <button
                type="submit"
                className="rounded-full border border-[#0B1F3A] bg-[#0B1F3A] px-5 py-3 text-sm font-semibold text-[#FFFFFF] transition hover:border-[#D4AF37] hover:bg-[#07162A]"
              >
                Save Person
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="rounded-full border border-[#D4AF37]/55 bg-[#FFFFFF] px-5 py-3 text-sm font-medium text-[#0B1F3A] transition hover:bg-[#F5E6A8]/35"
              >
                Reset
              </button>
            </div>
          </form>
        </section>

        <section className="rounded-3xl border border-[#D4AF37]/35 bg-[#FFFFFF] p-6 shadow-sm">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-2xl font-semibold text-[#0B1F3A]">Workers</h2>
              <p className="mt-1 text-sm text-[#64748B]">
                View and manage worker fingerprints and attendance roles.
              </p>
            </div>
          </div>

          <div className="mt-6 overflow-x-auto">
            <table className="min-w-full divide-y divide-[#E2E8F0] text-left text-sm">
              <thead className="text-[#64748B]">
                <tr>
                  <th className="pb-3 pr-4 font-medium">Person Name</th>
                  <th className="pb-3 pr-4 font-medium">Phone</th>
                  <th className="pb-3 pr-4 font-medium">Person Type</th>
                  <th className="pb-3 pr-4 font-medium">Attendance FP ID</th>
                  <th className="pb-3 pr-4 font-medium">Single Room FP ID</th>
                  <th className="pb-3 pr-4 font-medium">Double Room FP ID</th>
                  <th className="pb-3 pr-4 font-medium">Monthly Room FP ID</th>
                  <th className="pb-3 pr-4 font-medium">Family Room FP ID</th>
                  <th className="pb-3 pr-4 font-medium">Status</th>
                  <th className="pb-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F5F9] text-[#0B1F3A]">
                {workers.length > 0 ? (
                  workers.map((worker) => {
                    const attendanceMapping = worker.fingerMappings.find(
                      (mapping) => mapping.actionType === "ATTENDANCE",
                    );
                    const singleMapping = worker.fingerMappings.find(
                      (mapping) => mapping.actionType === "SINGLE_ROOM",
                    );
                    const doubleMapping = worker.fingerMappings.find(
                      (mapping) => mapping.actionType === "DOUBLE_ROOM",
                    );
                    const monthlyMapping = worker.fingerMappings.find(
                      (mapping) => mapping.actionType === "MONTHLY_ROOM",
                    );
                    const familyMapping = worker.fingerMappings.find(
                      (mapping) => mapping.actionType === "FAMILY_ROOM",
                    );

                    return (
                      <tr key={worker.id} className="align-top">
                        <td className="py-4 pr-4 font-medium text-[#0B1F3A]">{worker.name}</td>
                        <td className="py-4 pr-4">{worker.phone ?? "-"}</td>
                        <td className="py-4 pr-4">{formatWorkerPersonType(worker.personType)}</td>
                        <td className="py-4 pr-4">
                          {worker.personType === "ROOM_ONLY"
                            ? "Not required"
                            : attendanceMapping?.deviceUserId ?? "-"}
                        </td>
                        <td className="py-4 pr-4">{singleMapping?.deviceUserId ?? "-"}</td>
                        <td className="py-4 pr-4">{doubleMapping?.deviceUserId ?? "-"}</td>
                        <td className="py-4 pr-4">{monthlyMapping?.deviceUserId ?? "-"}</td>
                        <td className="py-4 pr-4">{familyMapping?.deviceUserId ?? "-"}</td>
                        <td className="py-4 pr-4">
                          <span className={worker.isActive ? "text-[#0B1F3A]" : "text-[#64748B]"}>
                            {worker.isActive ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td className="py-4 pr-4">
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => handleEdit(worker)}
                              className="rounded-full border border-[#D4AF37]/45 bg-[#FFFFFF] px-3 py-1.5 text-xs font-medium text-[#0B1F3A] transition hover:bg-[#F5E6A8]/35"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleToggleActive(worker)}
                              className="rounded-full border border-[#D4AF37]/45 bg-[#FFFFFF] px-3 py-1.5 text-xs font-medium text-[#0B1F3A] transition hover:bg-[#F5E6A8]/35"
                            >
                              {worker.isActive ? "Inactive" : "Active"}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(worker.id)}
                              className="rounded-full border border-[#D4AF37]/45 bg-[#FFFFFF] px-3 py-1.5 text-xs font-medium text-[#0B1F3A] transition hover:bg-[#F5E6A8]/35"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td className="py-6 text-[#64748B]" colSpan={10}>
                      No workers saved yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
