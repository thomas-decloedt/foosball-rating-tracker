import { useMemo } from "react";

interface Player {
  id: string;
  displayName: string;
  displayRating: number;
}

interface PlayerSelectProps {
  players: Player[];
  value: string;
  onChange: (value: string) => void;
  excludePlayerIds?: string[];
  required?: boolean;
  label: string;
  placeholder?: string;
}

export function PlayerSelect({
  players,
  value,
  onChange,
  excludePlayerIds = [],
  required = false,
  label,
  placeholder = "Select player",
}: PlayerSelectProps) {
  const sortedAndFilteredPlayers = useMemo(() => {
    return players
      .filter((p) => !excludePlayerIds.includes(p.id))
      .sort((a, b) =>
        a.displayName.localeCompare(b.displayName, undefined, {
          sensitivity: "base",
        }),
      );
  }, [players, excludePlayerIds]);

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">
        {label}
      </label>
      <select
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
      >
        <option value="">{placeholder}</option>
        {sortedAndFilteredPlayers.map((p) => (
          <option key={p.id} value={p.id}>
            {p.displayName}
          </option>
        ))}
      </select>
    </div>
  );
}
