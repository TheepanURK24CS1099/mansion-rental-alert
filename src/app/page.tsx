import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-[#F8FAFC] px-4 py-8 text-[#64748B] sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-3xl items-center justify-center">
        <section className="w-full rounded-3xl border border-[#D4AF37]/35 bg-[#FFFFFF] p-8 text-center shadow-sm sm:p-10">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#D4AF37]/60 bg-[#F5E6A8]/35 px-3 py-1 text-xs font-medium text-[#0B1F3A]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#D4AF37]" />
            Secure owner portal
          </div>
          <h1 className="mt-5 text-4xl font-semibold tracking-tight text-[#0B1F3A] sm:text-5xl">
            Mansion Rental Alert System
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-sm font-medium leading-6 text-[#0B1F3A] sm:text-base">
            Biometric-based room rental and staff attendance management.
          </p>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-6 text-[#64748B] sm:text-base">
            Track room rental updates, staff IN/OUT attendance, and WhatsApp alert
            history from one secure dashboard.
          </p>

          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <span className="rounded-full border border-[#D4AF37]/45 bg-[#F8FAFC] px-4 py-2 text-xs font-medium text-[#0B1F3A]">
              Room Rental Alerts
            </span>
            <span className="rounded-full border border-[#D4AF37]/45 bg-[#F8FAFC] px-4 py-2 text-xs font-medium text-[#0B1F3A]">
              Staff Attendance
            </span>
            <span className="rounded-full border border-[#D4AF37]/45 bg-[#F8FAFC] px-4 py-2 text-xs font-medium text-[#0B1F3A]">
              WhatsApp Message Logs
            </span>
          </div>

          <div className="mt-8 flex justify-center">
            <Link
              href="/login"
              className="rounded-full border border-[#0B1F3A] bg-[#0B1F3A] px-6 py-3 text-sm font-semibold text-[#FFFFFF] transition hover:border-[#D4AF37] hover:bg-[#07162A]"
            >
              Login to Dashboard
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
