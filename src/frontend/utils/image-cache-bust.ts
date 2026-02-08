/**
 * Add cache-busting query parameter to profile image URLs
 * This ensures browsers fetch fresh images instead of serving cached versions
 * @param imageUrl - The profile image URL
 * @returns URL with cache-busting query parameter
 */
export function addCacheBustToImageUrl(imageUrl: string | null): string | null {
  if (!imageUrl) {
    return null;
  }

  // If URL already has query parameters, append; otherwise add
  const separator = imageUrl.includes("?") ? "&" : "?";
  // Use a timestamp that changes every hour to balance cache efficiency with freshness
  // This ensures images refresh reasonably often without defeating caching entirely
  const cacheBuster = `_v=${Math.floor(Date.now() / 3600000)}`;
  return `${imageUrl}${separator}${cacheBuster}`;
}
