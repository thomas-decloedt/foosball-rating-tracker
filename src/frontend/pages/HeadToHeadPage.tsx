import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Navigation } from "../components/Navigation";
import { PlayerLink } from "../components/PlayerLink";
import { MatchCard, type MatchCardData } from "../components/MatchCard";
import { usePreviousWinner } from "../hooks/usePreviousWinner";
import { fetchApi } from "../utils/fetch";

interface Player {
  id: string;
  displayName: string;
  displayRating: number;
}

interface HeadToHeadData {
  player1: { id: string; displayName: string };
  player2: { id: string; displayName: string };
  stats: {
    totalMatches: number;
    player1Wins: number;
    player2Wins: number;
    player1WinRate: number;
    player2WinRate: number;
  };
  recentMatches: Array<{
    id: string;
    team1Score: number;
    team2Score: number;
    winningTeam: number;
    createdAt: string | Date;
    player1Team: number;
    player2Team: number;
  }>;
}

function RecentMatchesSection({
  matchIds,
  player1Id,
}: {
  matchIds: string[];
  player1Id: string;
}) {
  const [matches, setMatches] = useState<MatchCardData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMatches = async () => {
      try {
        setLoading(true);
        const matchPromises = matchIds.map((id) =>
          fetchApi<{ match: MatchCardData }>(`/api/v1/match/${id}`).then(
            (data) => data.match,
          ),
        );
        const fullMatches = await Promise.all(matchPromises);
        setMatches(fullMatches);
      } catch (err) {
        console.error("Failed to fetch match details:", err);
      } finally {
        setLoading(false);
      }
    };

    if (matchIds.length > 0) {
      fetchMatches();
    }
  }, [matchIds]);

  if (loading) {
    return (
      <div className="text-center py-4 text-gray-500">Loading matches...</div>
    );
  }

  if (matches.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      {matches.map((match) => (
        <MatchCard
          key={match.id}
          match={match}
          highlightPlayerId={player1Id}
          showDate={true}
        />
      ))}
    </div>
  );
}

export function HeadToHeadPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { previousWinnerId, hasGames } = usePreviousWinner();

  const [players, setPlayers] = useState<Player[]>([]);
  const [player1Id, setPlayer1Id] = useState(searchParams.get("player1") || "");
  const [player2Id, setPlayer2Id] = useState(searchParams.get("player2") || "");
  const [h2hData, setH2hData] = useState<HeadToHeadData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchPlayers();
  }, []);

  useEffect(() => {
    if (player1Id && player2Id && player1Id !== player2Id) {
      setSearchParams({ player1: player1Id, player2: player2Id });
      fetchH2H();
    } else if (player1Id && player2Id && player1Id === player2Id) {
      // Clear h2h data if same player selected
      setH2hData(null);
      setError("Cannot compare a player with themselves");
    }
  }, [player1Id, player2Id]);

  const fetchPlayers = async () => {
    try {
      const data = await fetchApi<{ players: Player[] }>("/api/v1/players");
      // Sort alphabetically by displayName
      const sortedPlayers = [...data.players].sort((a, b) =>
        a.displayName.localeCompare(b.displayName),
      );
      setPlayers(sortedPlayers);
    } catch (err) {
      console.error("Failed to fetch players:", err);
    }
  };

  const fetchH2H = async () => {
    if (!player1Id || !player2Id) return;

    // Prevent comparing player with themselves
    if (player1Id === player2Id) {
      setError("Cannot compare a player with themselves");
      setH2hData(null);
      return;
    }

    try {
      setLoading(true);
      setError("");
      const data = await fetchApi<HeadToHeadData>(
        `/api/v1/players/head-to-head?player1Id=${player1Id}&player2Id=${player2Id}`,
      );
      setH2hData(data);
    } catch (err) {
      setError("Failed to load head-to-head data");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">
          Head-to-Head Comparison
        </h2>

        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Player 1
              </label>
              <select
                value={player1Id}
                onChange={(e) => setPlayer1Id(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              >
                <option value="">Select player</option>
                {players.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.displayName}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Player 2
              </label>
              <select
                value={player2Id}
                onChange={(e) => setPlayer2Id(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              >
                <option value="">Select player</option>
                {players
                  .filter((p) => p.id !== player1Id)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.displayName}
                    </option>
                  ))}
              </select>
            </div>
          </div>
        </div>

        {loading && (
          <div className="text-center py-8 text-gray-600">Loading...</div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 mb-6">
            {error}
          </div>
        )}

        {h2hData && (
          <>
            <div className="bg-white rounded-lg shadow p-6 mb-6">
              <div className="grid grid-cols-3 gap-4 items-center">
                <div className="text-center">
                  <PlayerLink
                    playerId={h2hData.player1.id}
                    displayName={h2hData.player1.displayName}
                    className="text-xl font-bold"
                    showCrown={
                      hasGames && h2hData.player1.id === previousWinnerId
                    }
                  />
                  <div className="mt-4">
                    <div className="text-4xl font-bold text-green-600">
                      {h2hData.stats.player1Wins}
                    </div>
                    <div className="text-sm text-gray-600">Wins</div>
                    <div className="text-sm text-gray-600 mt-1">
                      {h2hData.stats.player1WinRate.toFixed(1)}% Win Rate
                    </div>
                  </div>
                </div>

                <div className="text-center">
                  <div className="text-3xl font-bold text-gray-400">VS</div>
                  <div className="mt-2 text-sm text-gray-600">
                    {h2hData.stats.totalMatches}{" "}
                    {h2hData.stats.totalMatches === 1 ? "match" : "matches"}
                  </div>
                </div>

                <div className="text-center">
                  <PlayerLink
                    playerId={h2hData.player2.id}
                    displayName={h2hData.player2.displayName}
                    className="text-xl font-bold"
                    showCrown={
                      hasGames && h2hData.player2.id === previousWinnerId
                    }
                  />
                  <div className="mt-4">
                    <div className="text-4xl font-bold text-green-600">
                      {h2hData.stats.player2Wins}
                    </div>
                    <div className="text-sm text-gray-600">Wins</div>
                    <div className="text-sm text-gray-600 mt-1">
                      {h2hData.stats.player2WinRate.toFixed(1)}% Win Rate
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {h2hData.recentMatches.length > 0 && (
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-xl font-bold mb-4 text-gray-900">
                  Recent Matches
                </h3>
                <RecentMatchesSection
                  matchIds={h2hData.recentMatches.map((m) => m.id)}
                  player1Id={h2hData.player1.id}
                />
              </div>
            )}
          </>
        )}

        {h2hData && h2hData.stats.totalMatches === 0 && (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <p className="text-gray-500">
              These players have never faced each other as opponents
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
