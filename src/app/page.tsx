import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.15),_transparent_35%),linear-gradient(180deg,_#0f172a_0%,_#020617_100%)] px-4 py-8 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-3xl items-center justify-center">
        <section className="w-full rounded-3xl border border-white/10 bg-white/5 p-8 text-center shadow-2xl shadow-slate-950/30 backdrop-blur sm:p-10">
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-400/10 px-3 py-1 text-xs font-medium text-cyan-100">
            Secure owner portal
          </div>
          <h1 className="mt-5 text-4xl font-semibold tracking-tight text-white sm:text-5xl">
            Mansion Rental Alert System
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-sm font-medium leading-6 text-cyan-100 sm:text-base">
            Biometric-based room rental and staff attendance management.
          </p>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
            Track room rental updates, staff IN/OUT attendance, and WhatsApp alert
            history from one secure dashboard.
          </p>

          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium text-slate-200">
              Room Rental Alerts
            </span>
            <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium text-slate-200">
              Staff Attendance
            </span>
            <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium text-slate-200">
              WhatsApp Message Logs
            </span>
          </div>

          <div className="mt-8 flex justify-center">
            <Link
              href="/login"
              className="rounded-full bg-cyan-400 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
            >
              Login to Dashboard
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
