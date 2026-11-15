/**
 * `decodeURIComponent` that never throws. A cookie or a path from a request can hold a broken
 * escape (a lone `%`, half a UTF-8 sequence), and the bare call throws on it. Null means "not
 * readable": a cookie is skipped, a path is not found.
 */
export function safeDecode(text: string): string | null {
  try {
    return decodeURIComponent(text);
  } catch {
    return null;
  }
}
