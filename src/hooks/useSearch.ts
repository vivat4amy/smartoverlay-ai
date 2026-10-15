import { useCallback, useState } from "react";
import { api } from "@/services/api";

export interface SearchResultItem {
  id: string;
  title: string;
  description: string;
  category: string;
  icon: string;
  url?: string;
  image_url?: string;
  metadata: Record<string, unknown>;
}

export function useSearch() {
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [loading, setLoading] = useState(false);

  const searchContent = useCallback(
    async (type: string, query: string) => {
      if (!query.trim()) return;
      setLoading(true);
      try {
        const response = await api.search(type, query);
        setResults(response.results || []);
      } catch (err) {
        console.error("[Search] Ошибка поиска:", err);
        setResults([]);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const clearResults = useCallback(() => setResults([]), []);

  return { results, loading, searchContent, clearResults };
}
