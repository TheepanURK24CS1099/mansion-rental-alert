"use client";

import { useEffect, useState, type FormEvent, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import {
  getSessionServerSnapshot,
  getSessionSnapshot,
  isLoggedInSession,
  setSessionValue,
  subscribeToSessionStore,
} from "@/lib/sessionStore";

const VALID_USERNAME = "skc";
const VALID_PASSWORD = "skcmansion";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const session = useSyncExternalStore(
    subscribeToSessionStore,
    getSessionSnapshot,
    getSessionServerSnapshot,
  );

  useEffect(() => {
    if (isLoggedInSession(session)) {
      router.replace("/dashboard");
    }
  }, [router, session]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (username === VALID_USERNAME && password === VALID_PASSWORD) {
      setSessionValue("logged-in");
      router.replace("/dashboard");
      return;
    }

    setError("Invalid username or password");
  };

  if (isLoggedInSession(session)) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-slate-100">
        <div className="rounded-3xl border border-white/10 bg-white/5 px-6 py-8 text-sm text-slate-300 shadow-2xl shadow-slate-950/30">
          Redirecting to dashboard...
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.15),_transparent_35%),linear-gradient(180deg,_#0f172a_0%,_#020617_100%)] px-4 py-8 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-md items-center">
        <section className="w-full rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl shadow-slate-950/30 backdrop-blur sm:p-8">
          <div className="space-y-3 text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-400/10 px-3 py-1 text-xs font-medium text-cyan-100">
              Temporary local login only. No database connected.
            </div>
            <h1 className="text-3xl font-semibold tracking-tight text-white">
              Mansion Rental Alert System
            </h1>
            <p className="text-sm text-slate-300">Owner dashboard login</p>
          </div>

          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            <label className="block space-y-2 text-sm text-slate-200">
              <span>Username</span>
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/30"
                placeholder="Enter username"
                autoComplete="username"
              />
            </label>

            <label className="block space-y-2 text-sm text-slate-200">
              <span>Password</span>
              <input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/30"
                placeholder="Enter password"
                autoComplete="current-password"
              />
            </label>

            {error ? (
              <p className="rounded-2xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-100">
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              className="w-full rounded-full bg-cyan-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
            >
              Sign in
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
