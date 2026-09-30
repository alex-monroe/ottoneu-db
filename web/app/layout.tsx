import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import NavigationWrapper from "@/components/NavigationWrapper";
import PhaseBanner from "@/components/PhaseBanner";
import SiteFooter from "@/components/SiteFooter";
import PositionalRanksProvider from "@/components/PositionalRanksProvider";
import { fetchCurrentRankTable } from "@/lib/positional-rank-data";
import type { RankTable } from "@/lib/types";

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

/**
 * The current season's positional ranks, for the rank tag beside every player
 * name. A decoration, so a failed read degrades to no tags rather than taking
 * every page down with it.
 */
async function loadRankTable(): Promise<RankTable | null> {
  try {
    return await fetchCurrentRankTable();
  } catch (err) {
    console.error("Positional rank table unavailable:", err);
    return null;
  }
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const rankTable = await loadRankTable();
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable}`}
    >
      <body className="antialiased">
        {/* Keyboard users had to tab the whole nav — six dropdowns, the search
            box and the auth control — on every single page. */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-raised focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-ink focus:shadow-lg"
        >
          Skip to content
        </a>
        <PositionalRanksProvider table={rankTable}>
          <NavigationWrapper />
          <PhaseBanner />
          {children}
          <SiteFooter />
        </PositionalRanksProvider>
      </body>
    </html>
  );
}
