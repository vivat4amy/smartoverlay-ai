import type { SearchResultItem } from "@/hooks/useSearch";

interface Props {
  result: SearchResultItem;
}

export function SearchCard({ result }: Props) {
  return (
    <div className="bg-surface/90 backdrop-blur-md rounded-xl px-4 py-3 border border-border/50 hover:border-accent/40 transition-colors cursor-default">
      <div className="flex items-start gap-3">
        {result.image_url ? (
          <img
            src={result.image_url}
            alt={result.title}
            className="w-10 h-10 rounded-lg object-cover shrink-0"
          />
        ) : (
          <span className="text-2xl shrink-0">{result.icon}</span>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-text truncate">
            {result.title}
          </p>
          {result.description && (
            <p className="text-xs text-text-dim mt-0.5 line-clamp-2">
              {result.description}
            </p>
          )}
          {result.url && (
            <a
              href={result.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-accent-light hover:text-accent mt-1 inline-block"
            >
              Подробнее
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
