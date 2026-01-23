import type { Headline } from "@/lib/types";

interface HeadlineLinkProps {
  headline: Headline;
}

export function HeadlineLink({ headline }: HeadlineLinkProps) {
  // If there's an image, show a card-style layout
  if (headline.image_url) {
    return (
      <li className="py-2">
        <a
          href={headline.url}
          target="_blank"
          rel="noopener noreferrer"
          className="block group"
          title={headline.title}
        >
          <div className="flex gap-3 items-start">
            <div className="flex-shrink-0 w-16 h-16 rounded overflow-hidden border border-dark-200">
              <img
                src={headline.image_url}
                alt=""
                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-200"
              />
            </div>
            <span className="neon-link text-sm hover:underline leading-tight pt-1">
              {headline.title}
            </span>
          </div>
        </a>
      </li>
    );
  }

  // Default text-only layout
  return (
    <li className="headline-bullet py-1">
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
  );
}
