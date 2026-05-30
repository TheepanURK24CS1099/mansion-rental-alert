import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mansion Rental Alert System",
  description: "Biometric room rental alerts for owner notifications",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-slate-950 text-slate-100">
        {children}
      </body>
    </html>
  );
}
