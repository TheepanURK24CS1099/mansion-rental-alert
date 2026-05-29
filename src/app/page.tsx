import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.15),_transparent_35%),linear-gradient(180deg,_#0f172a_0%,_#020617_100%)] px-4 py-8 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-3xl items-center justify-center">
        <section className="w-full rounded-3xl border border-white/10 bg-white/5 p-8 text-center shadow-2xl shadow-slate-950/30 backdrop-blur sm:p-10">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-200">
            Mansion rental alert system
          </div>
          <h1 className="mt-5 text-4xl font-semibold tracking-tight text-white sm:text-5xl">
            Mansion Rental Alert System
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
            Local mock dashboard for rental alert testing, owner login, and room
            notification previews.
          </p>
          <div className="mt-8 flex justify-center">
            <Link
              href="/login"
              className="rounded-full bg-cyan-400 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
            >
              Go to Login
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
