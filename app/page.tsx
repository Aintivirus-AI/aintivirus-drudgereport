import { MainHeadline } from "@/components/MainHeadline";
import { HeadlineColumn } from "@/components/HeadlineColumn";
import { Footer } from "@/components/Footer";
import { getHeadlines, getMainHeadline } from "@/lib/db";

// Revalidate every 10 seconds
export const revalidate = 10;

export default function Home() {
  const leftHeadlines = getHeadlines("left", 25);
  const rightHeadlines = getHeadlines("right", 25);
  const mainHeadline = getMainHeadline();

  return (
    <>
      {/* Main content area - theme aware */}
      <main className="main-content">
        <div className="grid-bg min-h-screen">
          {/* Page Title */}
          <div className="border-b border-dark-200/30 py-4">
            <div className="container mx-auto px-4 text-center">
              <h1 className="text-2xl md:text-3xl font-bold tracking-wider">
                <span className="text-neon-cyan">AINTIVIRUS</span>
                <span className="content-title-text"> OFF THE GRID</span>
              </h1>
              <p className="text-gray-500 text-xs mt-1 tracking-widest uppercase">
                by $AINTI
              </p>
            </div>
          </div>

          {/* Neon divider */}
          <div className="neon-divider" />

          {/* Main content - Three column layout */}
          <div className="container mx-auto px-4 py-8">
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
              {/* Left Column */}
              <div className="lg:col-span-1">
                <HeadlineColumn headlines={leftHeadlines} />
              </div>

              {/* Center - Main Headline */}
              <div className="lg:col-span-2">
                <MainHeadline headline={mainHeadline} />
                
                {/* Additional center content area */}
                <div className="mt-8 space-y-4">
                  <h2 className="text-neon-cyan text-lg font-semibold border-b border-dark-200/30 pb-2">
                    HOT TOPICS
                  </h2>
                  <div className="text-gray-500 text-sm">
                    <p className="text-center py-8 opacity-50">
                      More content coming soon...
                    </p>
                  </div>
                </div>
              </div>

              {/* Right Column */}
              <div className="lg:col-span-1">
                <HeadlineColumn headlines={rightHeadlines} />
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer - always dark */}
      <Footer />
    </>
  );
}
