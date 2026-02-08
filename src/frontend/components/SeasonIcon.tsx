import { addCacheBustToImageUrl } from "../utils/image-cache-bust";

interface SeasonIconProps {
  icon: string | null;
  className?: string;
  size?: "sm" | "md" | "lg";
}

export function SeasonIcon({
  icon,
  className = "",
  size = "md",
}: SeasonIconProps) {
  if (!icon) {
    return null;
  }

  const sizeClasses = {
    sm: "w-8 h-8",
    md: "w-16 h-16",
    lg: "w-32 h-32",
  };

  // Check if it's a data URI (preview) or R2 URL
  const isR2Url = icon.startsWith("/api/v1/season-icons/");

  // Determine file type from extension or data URI
  const getFileType = (url: string): "image" | "video" | "other" => {
    if (url.startsWith("data:image/")) return "image";
    if (url.startsWith("data:video/")) return "video";
    if (url.startsWith("/api/v1/season-icons/")) {
      const ext = url.split(".").pop()?.toLowerCase();
      if (["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(ext || "")) {
        return "image";
      }
      if (["mp4", "webm", "mov"].includes(ext || "")) {
        return "video";
      }
    }
    return "other";
  };

  const fileType = getFileType(icon);
  const displayUrl = isR2Url ? addCacheBustToImageUrl(icon) || icon : icon;

  if (fileType === "image") {
    return (
      <img
        src={displayUrl}
        alt="Season icon"
        className={`${sizeClasses[size]} object-contain rounded ${className}`}
        onError={(e) => {
          // Hide broken images
          (e.target as HTMLImageElement).style.display = "none";
        }}
      />
    );
  }

  if (fileType === "video") {
    return (
      <video
        src={displayUrl}
        className={`${sizeClasses[size]} object-contain rounded ${className}`}
        controls
        muted
      />
    );
  }

  // For other file types, show a file icon or download link
  return (
    <div
      className={`${sizeClasses[size]} flex items-center justify-center ${className}`}
    >
      <span className="text-gray-400 text-xs">📎</span>
    </div>
  );
}
