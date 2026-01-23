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
  
  // Get recent headlines for HOT TOPICS (most recent 5 from both columns)
  const recentLeft = getHeadlines("left", 3);
  const recentRight = getHeadlines("right", 3);
  const hotTopics = [...recentLeft, ...recentRight]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5);

  return (
    <>
      {/* Main content area - theme aware */}
      <main className="main-content">
        <div className="grid-bg min-h-screen">
          {/* Page Title */}
          <div className="border-b border-dark-200/30 py-4">
            <div className="container mx-auto px-4 text-center">
              <h1 className="text-2xl md:text-3xl font-bold tracking-wider">
                <span className="text-neon-cyan">The McAfee Report</span>
              </h1>
              <p className="text-gray-500 text-xs mt-1 tracking-widest uppercase">
                Powered by AintiVirus
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
                  {hotTopics.length > 0 ? (
                    <ul className="space-y-2">
                      {hotTopics.map((headline) => (
                        <li key={headline.id} className="headline-bullet py-1">
                          <a
                            href={headline.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="neon-link text-sm hover:underline"
                            title={headline.title}
                          >
                            {headline.title}
                          </a>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="text-gray-500 text-sm">
                      <p className="text-center py-8 opacity-50">
                        More content coming soon...
                      </p>
                    </div>
                  )}
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
