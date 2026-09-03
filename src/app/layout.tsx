import type { Metadata } from "next";
import "./globals.css";
import { ElectronTitleBar } from "@/components/ElectronTitleBar";

export const metadata: Metadata = {
  title: "Build Play Contracting — Estimating",
  description: "Playground installation estimating system",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {/* Renders nothing in a browser tab; supplies the whole window's
            title bar/drag region/min-max-close when running as the desktop
            app, so it has to sit above every page, login included. */}
        <ElectronTitleBar />
        {children}
      </body>
    </html>
  );
}
