import { PlayerPosition, type PlayerPositionType } from "@/api-models/position";

interface PositionTabBarProps {
  value: PlayerPositionType;
  onChange: (position: PlayerPositionType) => void;
  disabled?: boolean;
  disabledOptions?: PlayerPositionType[];
  className?: string;
}

export function PositionTabBar({
  value,
  onChange,
  disabled = false,
  disabledOptions = [],
  className = "",
}: PositionTabBarProps) {
  // Show all four position options
  const positions = [
    { value: PlayerPosition.SOLO, label: "Solo" },
    { value: PlayerPosition.DEFENSE, label: "Back (Defense)" },
    { value: PlayerPosition.ATTACK, label: "Front (Attack)" },
    { value: PlayerPosition.MIXED, label: "Mixed" },
  ];

  const isOptionDisabled = (position: PlayerPositionType) => {
    return disabled || disabledOptions.includes(position);
  };

  return (
    <div
      className={`bg-white rounded-lg shadow p-1 flex flex-wrap gap-1 ${className}`}
    >
      {positions.map(({ value: posValue, label }) => {
        const isSelected = posValue === value;
        const isDisabled = isOptionDisabled(posValue);

        return (
          <button
            key={posValue}
            type="button"
            onClick={() => !isDisabled && onChange(posValue)}
            disabled={isDisabled}
            className={`
              flex-1 min-w-[90px] px-4 py-2 rounded-md font-medium transition-colors
              ${
                isSelected && !disabled
                  ? "bg-blue-600 text-white"
                  : isDisabled
                    ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                    : "text-gray-700 hover:bg-gray-100"
              }
            `}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
