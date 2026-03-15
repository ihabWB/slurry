import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import { LangProvider } from "@/context/LangContext";

export const metadata: Metadata = {
  title: "نظام إدارة الربو | Stone Waste Management",
  description: "منصة إدارة نقل مخلفات المصانع (الربو) - تتبع النقلات والمالية والخرائط",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar">
      <head>
        <link
          rel="stylesheet"
          href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
          crossOrigin=""
        />
      </head>
      <body className="min-h-screen bg-slate-50 antialiased">
        <AuthProvider>
          <LangProvider>
            {children}
          </LangProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
