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
        </div>
      )}
      
      <div className="p-8 text-center">
        <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold text-red-600 group-hover:text-red-500 transition-colors leading-tight">
          {headline.title}
        </h2>
        
        {headline.subtitle && (
          <p className="mt-4 text-lg text-dark-300 group-hover:text-foreground transition-colors">
            {headline.subtitle}
          </p>
        )}
      </div>
    </a>
  );
}
