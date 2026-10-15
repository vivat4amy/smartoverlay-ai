import type { Recognition, Tip } from "@/store/appStore";

/** Map Python snake_case recognition JSON to the frontend Recognition shape. */
export function mapRecognition(data: Record<string, unknown>): Recognition {
  return {
    category: (data.category as string) || "general",
    title: (data.title as string) || "",
    confidence: (data.confidence as number) || 0,
    detectedObjects:
      (data.detected_objects as string[]) ||
      (data.detectedObjects as string[]) ||
      [],
    textContent:
      (data.text_content as string) || (data.textContent as string) || "",
    entity: (data.entity as Recognition["entity"]) ?? null,
  };
}

export function normalizeTips(raw: unknown): Tip[] {
  if (!Array.isArray(raw)) return [];
  const out: Tip[] = [];
  for (let i = 0; i < raw.length; i++) {
    const o = raw[i] as Record<string, unknown>;
    const text = typeof o.text === "string" ? o.text : "";
    if (!text.trim()) continue;
    out.push({
      id: typeof o.id === "string" ? o.id : `tip-${i}-${text.slice(0, 8)}`,
      text,
      category: typeof o.category === "string" ? o.category : "general",
      url: typeof o.url === "string" ? o.url : undefined,
    });
  }
  return out;
}
