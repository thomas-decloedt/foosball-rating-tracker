import { useEffect, useState } from "react";
import { fetchApi } from "../utils/fetch";
import { MatchCard, type MatchCardData } from "./MatchCard";

interface RecentMatchesListProps {
  playerId: string;
  limit?: number;
}

export function RecentMatchesList({
  playerId,
  limit = 20,
}: RecentMatchesListProps) {
  const [matches, setMatches] = useState<MatchCardData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchMatches();
  }, [playerId, limit]);

  const fetchMatches = async () => {
    try {
      setLoading(true);
      setError("");
      const data = await fetchApi<{ matches: MatchCardData[] }>(
        `/api/v1/matches?playerId=${playerId}&limit=${limit}`,
      );
      setMatches(data.matches);
    } catch (err) {
      setError("Failed to load matches");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-gray-600">Loading matches...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
        {error}
      </div>
    );
  }

  if (matches.length === 0) {
    return (
      <div className="bg-gray-50 rounded-lg p-8 text-center text-gray-600">
        No matches found for this player
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {matches.map((match) => (
        <MatchCard
          key={match.id}
          match={match}
          highlightPlayerId={playerId}
          showDate={true}
        />
      ))}
    </div>
  );
}
