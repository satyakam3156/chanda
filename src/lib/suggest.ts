import type { Category } from '@/types/database'

/**
 * Suggest a category from the description using each category's merchant keywords.
 * The longest matching keyword wins, so "swiggy instamart" can beat "swiggy" if both exist.
 */
export function suggestCategory(description: string, categories: Category[]): Category | null {
  const text = description.toLowerCase()
  let best: { cat: Category; len: number } | null = null
  for (const cat of categories) {
    if (!cat.is_active) continue
    for (const kw of cat.match_keywords) {
      if (kw && text.includes(kw) && (!best || kw.length > best.len)) best = { cat, len: kw.length }
    }
  }
  return best?.cat ?? null
}
