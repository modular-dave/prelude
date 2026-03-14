import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Prelude",
  description: "AI companion brain — neural memory dashboard",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-[#04040a] text-neutral-100 antialiased">
        {children}
      </body>
    </html>
  );
}
