import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import NavigationWrapper from "@/components/NavigationWrapper";
import PhaseBanner from "@/components/PhaseBanner";
import SiteFooter from "@/components/SiteFooter";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Ottoneu Analytics",
  description: "Fantasy football analytics for Ottoneu leagues",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {/* Keyboard users had to tab the whole nav — six dropdowns, the search
            box and the auth control — on every single page. */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-raised focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-ink focus:shadow-lg"
        >
          Skip to content
        </a>
        <NavigationWrapper />
        <PhaseBanner />
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
