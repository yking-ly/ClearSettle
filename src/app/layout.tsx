import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "ClearSettle — PayPal revenue copilot",
  description: "Turn completed work into a clear, trackable PayPal invoice.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
