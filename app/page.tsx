import { MainHeadline } from "@/components/MainHeadline";
import { HeadlineColumn } from "@/components/HeadlineColumn";
import { ThemeToggle } from "@/components/ThemeToggle";
import { getHeadlines, getMainHeadline } from "@/lib/db";

// Revalidate every 10 seconds
export const revalidate = 10;

export default function Home() {
  const leftHeadlines = getHeadlines("left", 15);
  const rightHeadlines = getHeadlines("right", 15);
  const mainHeadline = getMainHeadline();
  
  // Get recent headlines for HOT TOPICS (most recent 10 from both columns)
  const recentLeft = getHeadlines("left", 6);
  const recentRight = getHeadlines("right", 6);
  const hotTopics = [...recentLeft, ...recentRight]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 10);

  return (
    <main className="main-content">
      <div className="grid-bg min-h-screen">
        {/* Page Title */}
        <div className="border-b border-dark-200/30 py-4">
          <div className="container mx-auto px-4">
            <div className="flex items-center justify-between">
              <div className="w-10" /> {/* Spacer for centering */}
              <div className="text-center">
                <h1 className="text-2xl md:text-3xl font-bold tracking-wider">
                  <span className="text-neon-cyan">THE MCAFEE REPORT</span>
                </h1>
                <p className="text-gray-500 text-xs mt-1 tracking-widest">
                  Powered by{" "}
                  <a 
                    href="https://aintivirus.ai/" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-neon-cyan hover:underline"
                  >
                    AintiVirus
                  </a>
                </p>
                <p className="text-gray-500 text-xs mt-1 font-mono">
                  CA: <span className="select-all">7Epmyp9dMD5SzUtxczbuWwsVARyWdzLFAkzxnvZWpump</span>
                </p>
              </div>
              <ThemeToggle />
            </div>
          </div>
        </div>

        {/* Neon divider */}
        <div className="neon-divider" />

        {/* Main content */}
        <div className="container mx-auto px-4 py-8">
          {/* Mobile: Main headline first */}
          <div className="lg:hidden mb-8">
            <MainHeadline headline={mainHeadline} />
            
            {/* Hot Topics on mobile */}
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
                        className="hot-topic-link text-base hover:underline font-bold"
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

          {/* Mobile: Divider between hot topics and columns */}
          <div className="lg:hidden my-8">
            <hr className="border-t-2 border-neon-cyan/50" />
          </div>

          {/* Mobile: Columns after */}
          <div className="lg:hidden grid grid-cols-1 md:grid-cols-2 gap-8">
            <HeadlineColumn headlines={leftHeadlines} />
            <HeadlineColumn headlines={rightHeadlines} />
          </div>

          {/* Desktop: Three column layout */}
          <div className="hidden lg:grid lg:grid-cols-4 gap-8">
            {/* Left Column */}
            <div className="lg:col-span-1">
              <HeadlineColumn headlines={leftHeadlines} />
            </div>

            {/* Center - Main Headline */}
            <div className="lg:col-span-2">
              <MainHeadline headline={mainHeadline} />
              
              {/* Hot Topics */}
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
                          className="hot-topic-link text-base hover:underline font-bold"
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
  );
}
