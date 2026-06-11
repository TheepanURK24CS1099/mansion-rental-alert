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
      <main className="flex min-h-screen items-center justify-center bg-[#F8FAFC] px-4 text-[#64748B]">
        <div className="rounded-3xl border border-[#D4AF37]/35 bg-[#FFFFFF] px-6 py-8 text-sm text-[#64748B] shadow-sm">
          Redirecting to dashboard...
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#F8FAFC] px-4 py-8 text-[#64748B] sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-md items-center">
        <section className="w-full rounded-3xl border border-[#D4AF37]/35 bg-[#FFFFFF] p-6 shadow-sm sm:p-8">
          <div className="space-y-3 text-center">
            <h1 className="text-3xl font-semibold tracking-tight text-[#0B1F3A]">
              SKC Mansion Alert System
            </h1>
            <p className="text-sm text-[#64748B]">
              Owner login for room rental and staff attendance monitoring.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            <label className="block space-y-2 text-sm text-[#0B1F3A]">
              <span>Username</span>
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                className="w-full rounded-2xl border border-[#D4AF37]/35 bg-[#FFFFFF] px-4 py-3 text-[#0B1F3A] outline-none transition placeholder:text-[#64748B] focus:border-[#0B1F3A] focus:ring-2 focus:ring-[#0B1F3A]/20"
                placeholder="Enter username"
                autoComplete="username"
              />
            </label>

            <label className="block space-y-2 text-sm text-[#0B1F3A]">
              <span>Password</span>
              <input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                className="w-full rounded-2xl border border-[#D4AF37]/35 bg-[#FFFFFF] px-4 py-3 text-[#0B1F3A] outline-none transition placeholder:text-[#64748B] focus:border-[#0B1F3A] focus:ring-2 focus:ring-[#0B1F3A]/20"
                placeholder="Enter password"
                autoComplete="current-password"
              />
            </label>

            {error ? (
              <p className="rounded-2xl border border-rose-400/40 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              className="w-full rounded-full border border-[#0B1F3A] bg-[#0B1F3A] px-4 py-3 text-sm font-semibold text-[#FFFFFF] transition hover:border-[#D4AF37] hover:bg-[#07162A]"
            >
              Sign in
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
