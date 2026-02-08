import { useEffect, useState } from "react";
import { PlayerLink } from "../components/PlayerLink";
import { Navigation } from "../components/Navigation";
import { fetchApi } from "../utils/fetch";

interface Season {
  id: string;
  name: string;
  startDate: string;
  endDate: string | null;
  isActive: boolean;
  winnerId: string | null;
  previousWinnerId: string | null;
}

interface SeasonPlayer {
  rank: number;
  playerId: string;
  displayName: string;
  displayRating: number;
  gamesPlayed: number;
  wins: number;
  losses: number;
  winRate: number;
  muDelta: number;
  mvpScore?: number;
  mvpBreakdown?: {
    bayesianWinRate: number;
    gamesWeight: number;
    netWins: number;
    netWinsContribution: number;
    ratingGain: number;
    ratingGainContribution: number;
    diversityPenalty: number;
    diversityPenaltyContribution: number;
    finalScore: number;
  };
}

interface SeasonLeaderboard {
  season: Season;
  players: SeasonPlayer[];
}

interface CurrentSeasonData {
  season: {
    id: string;
    name: string;
    startDate: string;
    isActive: boolean;
    previousWinnerId: string | null;
  } | null;
  players: SeasonPlayer[];
}

export function SeasonsPage() {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [currentSeason, setCurrentSeason] = useState<CurrentSeasonData | null>(
    null,
  );
  const [selectedSeasonId, setSelectedSeasonId] = useState<string | null>(null);
  const [selectedSeasonLeaderboard, setSelectedSeasonLeaderboard] =
    useState<SeasonLeaderboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingLeaderboard, setLoadingLeaderboard] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [seasonsData, currentSeasonData] = await Promise.all([
        fetchApi<{ seasons: Season[] }>("/api/v1/seasons?includeInactive=true"),
        fetchApi<CurrentSeasonData>("/api/v1/seasons/weekly/current"),
      ]);

      setSeasons(seasonsData.seasons);
      setCurrentSeason(currentSeasonData);
    } catch (err) {
      console.error("Failed to fetch seasons data:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchSeasonLeaderboard = async (seasonId: string) => {
    try {
      setLoadingLeaderboard(true);
      const data = await fetchApi<SeasonLeaderboard>(
        `/api/v1/seasons/${seasonId}/leaderboard?filter=mvp`,
      );
      setSelectedSeasonLeaderboard(data);
    } catch (err) {
      console.error("Failed to fetch season leaderboard:", err);
    } finally {
      setLoadingLeaderboard(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const getWinnerName = (season: Season, players: SeasonPlayer[]) => {
    if (!season.winnerId) return null;
    const winner = players.find((p) => p.playerId === season.winnerId);
    return winner?.displayName || null;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navigation />
        <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
          <div className="text-center py-12 text-gray-600">Loading...</div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Seasons</h2>

        {/* Current Season Section */}
        {currentSeason?.season && (
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h3 className="text-xl font-bold mb-4 text-gray-900">
              Current Season: {currentSeason.season.name}
            </h3>
            <div className="text-sm text-gray-600 mb-4">
              Started: {formatDate(currentSeason.season.startDate)}
            </div>

            {currentSeason.players.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Rank
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Player
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Games
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        W-L
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Win Rate
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Rating
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Season Score
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {currentSeason.players.map((player) => (
                      <tr key={player.playerId}>
                        <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                          #{player.rank}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <PlayerLink
                            playerId={player.playerId}
                            displayName={player.displayName}
                            showCrown={
                              currentSeason.players.length > 0 &&
                              player.playerId ===
                                (currentSeason.season?.previousWinnerId || null)
                            }
                            className="font-semibold"
                          />
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                          {player.gamesPlayed}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                          {player.wins}-{player.losses}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                          {player.winRate.toFixed(1)}%
                        </td>
                        <td
                          className={`px-4 py-3 whitespace-nowrap text-sm font-medium ${player.muDelta >= 0 ? "text-green-600" : "text-red-600"}`}
                        >
                          {player.muDelta >= 0 ? "+" : ""}
                          {player.muDelta.toFixed(2)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                          {player.mvpScore?.toFixed(2) || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                No players in current season yet.
              </div>
            )}
          </div>
        )}

        {/* Historic Seasons List */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-xl font-bold mb-4 text-gray-900">
            Historic Seasons
          </h3>
          <div className="space-y-3">
            {seasons
              .filter((s) => !s.isActive)
              .map((season) => {
                const leaderboard =
                  selectedSeasonLeaderboard?.season.id === season.id
                    ? selectedSeasonLeaderboard
                    : null;
                const winnerName = leaderboard
                  ? getWinnerName(season, leaderboard.players)
                  : null;

                return (
                  <div
                    key={season.id}
                    className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 cursor-pointer"
                    onClick={() => {
                      if (selectedSeasonId === season.id) {
                        setSelectedSeasonId(null);
                        setSelectedSeasonLeaderboard(null);
                      } else {
                        setSelectedSeasonId(season.id);
                        fetchSeasonLeaderboard(season.id);
                      }
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2">
                          <h4 className="text-lg font-semibold text-gray-900">
                            {season.name}
                          </h4>
                          {season.winnerId && (
                            <span className="text-yellow-500">👑</span>
                          )}
                        </div>
                        <div className="text-sm text-gray-600 mt-1">
                          {formatDate(season.startDate)}
                          {season.endDate && ` - ${formatDate(season.endDate)}`}
                        </div>
                        {winnerName && (
                          <div className="text-sm text-gray-700 mt-1">
                            Winner:{" "}
                            <span className="font-semibold">{winnerName}</span>
                          </div>
                        )}
                      </div>
                      <div className="text-gray-400">
                        {selectedSeasonId === season.id ? "▼" : "▶"}
                      </div>
                    </div>

                    {selectedSeasonId === season.id && (
                      <div className="mt-4 pt-4 border-t border-gray-200">
                        {loadingLeaderboard ? (
                          <div className="text-center py-4 text-gray-600">
                            Loading...
                          </div>
                        ) : leaderboard ? (
                          leaderboard.players.length > 0 ? (
                            <div className="overflow-x-auto">
                              <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                  <tr>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                                      Rank
                                    </th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                                      Player
                                    </th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                                      Games
                                    </th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                                      W-L
                                    </th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                                      Rating
                                    </th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                                      Season Score
                                    </th>
                                  </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                  {leaderboard.players
                                    .slice(0, 10)
                                    .map((player) => (
                                      <tr key={player.playerId}>
                                        <td className="px-4 py-2 text-sm">
                                          #{player.rank}
                                        </td>
                                        <td className="px-4 py-2">
                                          <PlayerLink
                                            playerId={player.playerId}
                                            displayName={player.displayName}
                                            showCrown={
                                              leaderboard.players.length > 0 &&
                                              player.playerId ===
                                                season.winnerId
                                            }
                                          />
                                        </td>
                                        <td className="px-4 py-2 text-sm">
                                          {player.gamesPlayed}
                                        </td>
                                        <td className="px-4 py-2 text-sm">
                                          {player.wins}-{player.losses}
                                        </td>
                                        <td
                                          className={`px-4 py-2 text-sm ${player.muDelta >= 0 ? "text-green-600" : "text-red-600"}`}
                                        >
                                          {player.muDelta >= 0 ? "+" : ""}
                                          {player.muDelta.toFixed(2)}
                                        </td>
                                        <td className="px-4 py-2 text-sm">
                                          {player.mvpBreakdown?.finalScore.toFixed(
                                            2,
                                          ) || "—"}
                                        </td>
                                      </tr>
                                    ))}
                                </tbody>
                              </table>
                            </div>
                          ) : (
                            <div className="text-center py-8 text-gray-500">
                              No players found for this season.
                            </div>
                          )
                        ) : null}
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        </div>

        {/* Formula Footnote */}
        <div className="mt-8 bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-3">
            Season Score Formula
          </h3>
          <div className="text-sm text-gray-700 leading-relaxed">
            <p className="mb-3">
              The Season Score combines win rate, games played, net wins, rating
              improvement, playing style diversity, and teammate quality.
            </p>
            <p>
              Players are rewarded for winning more games, playing more matches,
              improving their rating, and playing with lower-rated teammates.
              Players are penalized for playing the same position and with the
              same teammates repeatedly.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
