import {
  PlayerPosition,
  type PlayerPositionType,
  getPositionSymbol,
} from "@/api-models/position";

interface PositionBadgeProps {
  position: PlayerPositionType;
  size?: "sm" | "md";
}

export function PositionBadge({ position, size = "sm" }: PositionBadgeProps) {
  const sizeClasses =
    size === "sm" ? "text-xs px-1.5 py-0.5" : "text-sm px-2 py-1";

  let colorClasses: string;
  switch (position) {
    case PlayerPosition.DEFENSE:
      colorClasses = "bg-blue-100 text-blue-800";
      break;
    case PlayerPosition.ATTACK:
      colorClasses = "bg-green-100 text-green-800";
      break;
    case PlayerPosition.SOLO:
      colorClasses = "bg-purple-100 text-purple-800";
      break;
    case PlayerPosition.MIXED:
      colorClasses = "bg-orange-100 text-orange-800";
      break;
    default:
      colorClasses = "bg-gray-100 text-gray-800";
  }

  const symbol = getPositionSymbol(position);

  return (
    <span
      className={`inline-flex items-center font-medium rounded ${sizeClasses} ${colorClasses}`}
    >
      {symbol}
    </span>
  );
}
