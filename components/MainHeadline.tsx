import type { MainHeadlineData } from "@/lib/types";

interface MainHeadlineProps {
  headline: MainHeadlineData | null;
}

export function MainHeadline({ headline }: MainHeadlineProps) {
  if (!headline) {
    return (
      <div className="main-headline border border-dark-200 rounded-lg p-8 text-center bg-dark-100">
        <p className="text-dark-300 opacity-50">No main headline set</p>
      </div>
    );
  }

  return (
    <a
      href={headline.url}
      target="_blank"
      rel="noopener noreferrer"
      className="block main-headline border border-neon-cyan/30 rounded-lg overflow-hidden bg-dark-100 hover:bg-dark-200 transition-all duration-300 group"
    >
      {headline.image_url && (
        <div className="relative w-full aspect-video overflow-hidden">
          <img
            src={headline.image_url}
            alt={headline.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-dark-100 to-transparent" />
        </div>
      )}
      
      <div className={`p-8 text-center ${headline.image_url ? '-mt-16 relative z-10' : ''}`}>
        <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold text-neon-cyan group-hover:text-neon-purple transition-colors leading-tight">
          {headline.title}
        </h2>
        
        {headline.subtitle && (
          <p className="mt-4 text-lg text-dark-300 group-hover:text-foreground transition-colors">
            {headline.subtitle}
          </p>
        )}
        
        <div className="mt-6 flex items-center justify-center gap-2 text-sm text-dark-300">
          <span className="inline-block w-2 h-2 rounded-full bg-neon-green animate-pulse" />
          <span>LIVE</span>
        </div>
      </div>
    </a>
  );
}
