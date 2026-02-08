import { Link } from "react-router-dom";
import { PositionBadge } from "./PositionBadge";
import type { PlayerPositionType } from "@/api-models/position";
import { addCacheBustToImageUrl } from "../utils/image-cache-bust";

interface PlayerLinkProps {
  playerId: string;
  displayName: string;
  className?: string;
  profileImage?: string | null;
  asSpan?: boolean;
  position?: PlayerPositionType;
  showCrown?: boolean;
}

export function PlayerLink({
  playerId,
  displayName,
  className = "",
  profileImage,
  asSpan = false,
  position,
  showCrown = false,
}: PlayerLinkProps) {
  const content = (
    <>
      {profileImage && (
        <img
          src={addCacheBustToImageUrl(profileImage) || profileImage}
          alt={displayName}
          className="w-6 h-6 rounded-full object-cover"
        />
      )}
      <span>{displayName}</span>
      {showCrown && (
        <span className="text-yellow-500" title="Previous season winner">
          👑
        </span>
      )}
      {position && <PositionBadge position={position} size="sm" />}
    </>
  );

  if (asSpan) {
    return (
      <span
        className={`text-blue-600 flex items-center space-x-2 ${className}`}
      >
        {content}
      </span>
    );
  }

  return (
    <Link
      to={`/player/${playerId}`}
      className={`text-blue-600 hover:text-blue-800 hover:underline flex items-center space-x-2 ${className}`}
    >
      {content}
    </Link>
  );
}
