import type { Metadata } from "next";
import "./globals.css";
import { Navbar } from "@/components/Navbar";
import { ThemeProvider } from "@/components/ThemeProvider";

export const metadata: Metadata = {
  title: "The McAfee Report",
  description: "The Drudge Report of Crypto - Real-time news and updates for the crypto community",
  keywords: ["crypto", "cryptocurrency", "news", "bitcoin", "ethereum", "defi", "web3"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <ThemeProvider>
          <Navbar />
          <div className="pt-20 lg:pt-24">
            {children}
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
