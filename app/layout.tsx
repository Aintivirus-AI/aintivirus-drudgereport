import type { Metadata } from "next";
import { JetBrains_Mono, Space_Grotesk, Syne } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";
import { PageViewTracker } from "@/components/PageViewTracker";

// Self-host fonts via next/font (privacy-safe: no user data sent to Google)
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const syne = Syne({
  subsets: ["latin"],
  variable: "--font-syne",
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "THE MCAFEE REPORT",
  description: "The Drudge Report of Crypto - Real-time news and updates for the crypto community",
  keywords: ["crypto", "cryptocurrency", "news", "bitcoin", "ethereum", "defi", "web3"],
  icons: {
    icon: "/mcafee-logo.png",
    shortcut: "/mcafee-logo.png",
    apple: "/mcafee-logo.png",
  },
  alternates: {
    canonical: SITE_URL,
    types: {
      "application/rss+xml": `${SITE_URL}/api/feed`,
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className={`${jetbrainsMono.variable} ${spaceGrotesk.variable} ${syne.variable}`}>
      <body className="min-h-screen bg-background text-foreground antialiased">
        {/* Organization + WebSite JSON-LD for rich search results */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@graph": [
                {
                  "@type": "Organization",
                  "@id": `${SITE_URL}/#organization`,
                  name: "The McAfee Report",
                  url: SITE_URL,
                  logo: {
                    "@type": "ImageObject",
                    url: `${SITE_URL}/mcafee-logo.png`,
                  },
                  sameAs: [
                    "https://x.com/TheMcAfeeReport",
                    "https://t.me/AIntivirus",
                    "https://github.com/aintivirus-AI",
                    "https://medium.com/@themcafeereport",
                  ],
                },
                {
                  "@type": "WebSite",
                  "@id": `${SITE_URL}/#website`,
                  url: SITE_URL,
                  name: "THE MCAFEE REPORT",
                  description: "The Drudge Report of Crypto — Real-time news and updates for the crypto community",
                  publisher: { "@id": `${SITE_URL}/#organization` },
                },
              ],
            }),
          }}
        />
        <ThemeProvider>
          <PageViewTracker />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
