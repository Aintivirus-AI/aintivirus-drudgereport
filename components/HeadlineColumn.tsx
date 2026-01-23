import type { Headline } from "@/lib/types";
import { HeadlineLink } from "./HeadlineLink";

interface HeadlineColumnProps {
  headlines: Headline[];
}

export function HeadlineColumn({ headlines }: HeadlineColumnProps) {
  if (headlines.length === 0) {
    return (
      <div className="space-y-2">
        <div className="text-dark-300 text-sm text-center py-8 opacity-50">
          No headlines yet...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <ul className="space-y-1">
        {headlines.map((headline) => (
          <HeadlineLink key={headline.id} headline={headline} />
        ))}
      </ul>
    </div>
  );
}
