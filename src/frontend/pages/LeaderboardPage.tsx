import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { MemePopup } from "@/frontend/components/MemePopup";
import { Navigation } from "@/frontend/components/Navigation";
import { PlayerLink } from "@/frontend/components/PlayerLink";
import { Tooltip } from "@/frontend/components/Tooltip";
import { useMemePopup } from "@/frontend/hooks/useMemePopup";
import { usePreviousWinner } from "@/frontend/hooks/usePreviousWinner";
import { useRealtime } from "@/frontend/hooks/useRealtime";
import { fetchApi } from "@/frontend/utils/fetch";
import { addCacheBustToImageUrl } from "@/frontend/utils/image-cache-bust";
import {
  calculateConservativeRating,
  formatRating,
} from "@/frontend/utils/rating";

type FilterType =
  | "standard"
  | "defense_leaders"
  | "attack_leaders"
  | "king_of_hill"
  | "mvp"
  | "biggest_losers"
  | "team_rankings"
  | "conqueror"
  | "ball_and_chain"
  | "swiss_army_knife";

interface Player {
  rank: number;
  id: string;
  displayName: string;
  displayRating: number;
  defenseRating: number;
  attackRating: number;
  soloRating: number;
  generalMu: number;
  generalSigma: number;
  defenseMu: number;
  defenseSigma: number;
  attackMu: number;
  attackSigma: number;
  soloMu: number;
  soloSigma: number;
  gamesPlayed: number;
  defenseGames: number;
  attackGames: number;
  wins: number;
  losses: number;
  winRate: number;
  winStreak: number;
  bestWinStreak: number;
  humiliatingDefeats: number;
  soloWins?: number;
  soloGames?: number;
  profileImage?: string | null;
  avgTeammateLoss?: number;
  avgTeammateImpact?: number;
  totalTeammateLoss?: number;
  teammateLosses?: number;
  totalTeammateMatches?: number;
  mvpScore?: number;
  mvpBreakdown?: {
    bayesianWinRate: number;
    gamesWeight: number;
    netWins: number;
    score: number;
  };
  diversityScore?: number;
  positionDiversityScore?: number;
  teamDiversityScore?: number;
}

interface TeamRanking {
  player1Id: string;
  player1Name: string;
  player2Id: string;
  player2Name: string;
  gamesPlayed: number;
  wins: number;
  losses: number;
  winRate: number;
}

export function LeaderboardPage() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [teamRankings, setTeamRankings] = useState<TeamRanking[]>([]);
  const [currentFilter, setCurrentFilter] = useState<FilterType>("standard");
  const [loading, setLoading] = useState(true);
  const [refreshToken, setRefreshToken] = useState(0);
  const { meme, closeMeme } = useMemePopup();
  const { previousWinnerId, hasGames } = usePreviousWinner();

  useEffect(() => {
    fetchData(currentFilter);
  }, [currentFilter, refreshToken]);

  useRealtime({
    topics: [
      `leaderboard:players:${currentFilter}`,
      currentFilter === "team_rankings" ? "leaderboard:team" : "",
    ].filter(Boolean),
    onEvent: (event) => {
      if (event.type === "match-updated") {
        if (
          event.leaderboards.includes("players") ||
          (currentFilter === "team_rankings" &&
            event.leaderboards.includes("team"))
        ) {
          setRefreshToken((prev) => prev + 1);
        }
      }
    },
  });

  const fetchData = async (filter: FilterType) => {
    try {
      setLoading(true);
      if (filter === "team_rankings") {
        const data = await fetchApi<{ teams: TeamRanking[] }>(
          "/api/v1/players/team-rankings",
        );
        setTeamRankings(data.teams);
        setPlayers([]);
      } else {
        const data = await fetchApi<{ players: Player[] }>(
          `/api/v1/players?filter=${filter}`,
        );
        setPlayers(data.players);
        setTeamRankings([]);
      }
    } catch (err) {
      console.error("Failed to fetch data:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="mb-6 bg-white rounded-lg shadow p-1">
            <div className="flex flex-wrap gap-1">
              <button
                onClick={() => setCurrentFilter("standard")}
                className={`flex-1 min-w-[120px] px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  currentFilter === "standard"
                    ? "bg-blue-600 text-white"
                    : "text-gray-700 hover:bg-gray-100"
                }`}
              >
                Ratings
              </button>
              <button
                onClick={() => setCurrentFilter("king_of_hill")}
                className={`flex-1 min-w-[120px] px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  currentFilter === "king_of_hill"
                    ? "bg-blue-600 text-white"
                    : "text-gray-700 hover:bg-gray-100"
                }`}
              >
                King of the Hill
              </button>
              <button
                onClick={() => setCurrentFilter("attack_leaders")}
                className={`flex-1 min-w-[120px] px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  currentFilter === "attack_leaders"
                    ? "bg-blue-600 text-white"
                    : "text-gray-700 hover:bg-gray-100"
                }`}
              >
                Strikers
              </button>
              <button
                onClick={() => setCurrentFilter("defense_leaders")}
                className={`flex-1 min-w-[120px] px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  currentFilter === "defense_leaders"
                    ? "bg-blue-600 text-white"
                    : "text-gray-700 hover:bg-gray-100"
                }`}
              >
                Guardians
              </button>
              <button
                onClick={() => setCurrentFilter("team_rankings")}
                className={`flex-1 min-w-[120px] px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  currentFilter === "team_rankings"
                    ? "bg-blue-600 text-white"
                    : "text-gray-700 hover:bg-gray-100"
                }`}
              >
                Teams
              </button>
            </div>
            <div className="flex flex-wrap gap-1 mt-1">
              <button
                onClick={() => setCurrentFilter("mvp")}
                className={`flex-1 min-w-[120px] px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  currentFilter === "mvp"
                    ? "bg-blue-600 text-white"
                    : "text-gray-700 hover:bg-gray-100"
                }`}
              >
                MVPs
              </button>
              <button
                onClick={() => setCurrentFilter("conqueror")}
                className={`flex-1 min-w-[120px] px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  currentFilter === "conqueror"
                    ? "bg-blue-600 text-white"
                    : "text-gray-700 hover:bg-gray-100"
                }`}
              >
                Conquerors
              </button>
              <button
                onClick={() => setCurrentFilter("ball_and_chain")}
                className={`flex-1 min-w-[120px] px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  currentFilter === "ball_and_chain"
                    ? "bg-blue-600 text-white"
                    : "text-gray-700 hover:bg-gray-100"
                }`}
              >
                Ball and Chain
              </button>
              <button
                onClick={() => setCurrentFilter("swiss_army_knife")}
                className={`flex-1 min-w-[120px] px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  currentFilter === "swiss_army_knife"
                    ? "bg-blue-600 text-white"
                    : "text-gray-700 hover:bg-gray-100"
                }`}
              >
                Swiss Army Knife
              </button>
              <button
                onClick={() => setCurrentFilter("biggest_losers")}
                className={`flex-1 min-w-[120px] px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  currentFilter === "biggest_losers"
                    ? "bg-blue-600 text-white"
                    : "text-gray-700 hover:bg-gray-100"
                }`}
              >
                Wall of Shame
              </button>
            </div>
          </div>

          <div className="flex justify-between items-center mb-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">
                {currentFilter === "standard" && "Leaderboard"}
                {currentFilter === "king_of_hill" && "King of the Hill"}
                {currentFilter === "defense_leaders" && "Top Guardians"}
                {currentFilter === "attack_leaders" && "Top Strikers"}
                {currentFilter === "mvp" && "MVP Rankings"}
                {currentFilter === "team_rankings" && "Best Team Partnerships"}
                {currentFilter === "biggest_losers" && "Wall of Shame"}
                {currentFilter === "conqueror" && "Conqueror Ranking"}
                {currentFilter === "ball_and_chain" && "Ball and Chain"}
                {currentFilter === "swiss_army_knife" && "Swiss Army Knife"}
              </h2>
              <p className="text-sm text-gray-600 mt-1">
                {currentFilter === "standard" &&
                  "Players ranked by conservative rating (μ - 3σ)"}
                {currentFilter === "king_of_hill" &&
                  "Players with the longest active win streaks"}
                {currentFilter === "defense_leaders" &&
                  "Players ranked by guardian position rating"}
                {currentFilter === "attack_leaders" &&
                  "Players ranked by striker position rating"}
                {currentFilter === "mvp" &&
                  "Top performers balanced by win rate, games played, and net wins"}
                {currentFilter === "team_rankings" &&
                  "Best duo partnerships in 2v2 matches"}
                {currentFilter === "biggest_losers" &&
                  "Players who suffered 0-11 defeats"}
                {currentFilter === "conqueror" &&
                  "Players ranked by solo wins (1v1 or 1v2 matches)"}
                {currentFilter === "ball_and_chain" &&
                  "Players who drag down their teammates the most (average teammate rating loss)"}
                {currentFilter === "swiss_army_knife" &&
                  "Players ranked by variety of positions played and team compositions"}
              </p>
            </div>
            <Link
              to="/record"
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium"
            >
              Record Match
            </Link>
          </div>

          {currentFilter === "biggest_losers" && !loading && (
            <div className="mb-6 flex flex-col md:flex-row gap-6 items-start">
              {/* Left column: Image */}
              <div className="flex-shrink-0">
                <img
                  src="/wall-of-shame.jpg"
                  alt="Wall of Shame"
                  className="rounded-lg shadow-lg"
                  style={{
                    maxHeight: "600px",
                    width: "auto",
                    display: "block",
                  }}
                />
              </div>

              {/* Right column: Profile ranking */}
              <div className="flex-1 bg-white rounded-lg shadow-lg p-6">
                {players.length > 0 ? (
                  <>
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">
                      Hall of Shame
                    </h3>
                    <div className="space-y-3">
                      {players.map((player) => (
                        <div
                          key={player.id}
                          className="flex items-center gap-4 p-3 rounded-lg hover:bg-gray-50 transition-colors border border-gray-200"
                        >
                          <div className="flex-shrink-0">
                            {player.profileImage ? (
                              <img
                                src={
                                  addCacheBustToImageUrl(player.profileImage) ||
                                  player.profileImage
                                }
                                alt={player.displayName}
                                className="w-16 h-16 rounded-full object-cover border-2 border-red-500"
                              />
                            ) : (
                              <div className="w-16 h-16 rounded-full bg-gray-300 border-2 border-red-500 flex items-center justify-center">
                                <span className="text-gray-600 font-semibold text-lg">
                                  {player.displayName.charAt(0).toUpperCase()}
                                </span>
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold text-gray-500">
                                #{player.rank}
                              </span>
                              <PlayerLink
                                playerId={player.id}
                                displayName={player.displayName}
                                className="text-base font-semibold"
                                showCrown={
                                  hasGames && player.id === previousWinnerId
                                }
                              />
                            </div>
                            <div className="text-sm text-red-600 font-medium mt-1">
                              {player.humiliatingDefeats}{" "}
                              {player.humiliatingDefeats === 1
                                ? "humiliating defeat"
                                : "humiliating defeats"}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <p className="text-gray-500 text-center">
                      No one has been humiliated yet!
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {loading ? (
            <div className="text-center py-12">
              <p className="text-gray-500">Loading...</p>
            </div>
          ) : currentFilter === "team_rankings" ? (
            teamRankings.length === 0 ? (
              <div className="bg-white shadow rounded-lg p-12 text-center">
                <p className="text-gray-500">No 2v2 team partnerships found</p>
              </div>
            ) : (
              <div className="bg-white shadow overflow-hidden sm:rounded-lg">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Rank
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Team
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Games
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Record
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Win Rate
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {teamRankings.map((team, idx) => (
                      <tr
                        key={`${team.player1Id}_${team.player2Id}`}
                        className="hover:bg-gray-50"
                      >
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-sm font-medium text-gray-900">
                            {idx + 1}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center space-x-2">
                            <PlayerLink
                              playerId={team.player1Id}
                              displayName={team.player1Name}
                              className="text-sm font-medium"
                              showCrown={
                                hasGames && team.player1Id === previousWinnerId
                              }
                            />
                            <span className="text-gray-500">&</span>
                            <PlayerLink
                              playerId={team.player2Id}
                              displayName={team.player2Name}
                              className="text-sm font-medium"
                              showCrown={
                                hasGames && team.player2Id === previousWinnerId
                              }
                            />
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-sm text-gray-500">
                            {team.gamesPlayed}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-sm text-gray-900">
                            {team.wins}W - {team.losses}L
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-sm text-gray-900">
                            {team.winRate.toFixed(1)}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : currentFilter === "biggest_losers" ? null : players.length === // biggest_losers is handled by the Wall of Shame section above, so we don't show the table
            0 ? (
            <div className="bg-white shadow rounded-lg p-12 text-center">
              <p className="text-gray-500">
                {currentFilter === "defense_leaders" && "No players found"}
                {currentFilter === "attack_leaders" && "No players found"}
                {currentFilter === "king_of_hill" &&
                  "No players currently on a winning streak"}
                {currentFilter === "mvp" && "No players found"}
                {currentFilter === "conqueror" &&
                  "No players with solo match wins"}
                {currentFilter === "ball_and_chain" &&
                  "No players found with negative teammate impact"}
                {currentFilter === "swiss_army_knife" && "No players found"}
                {currentFilter === "standard" && "No players found"}
              </p>
            </div>
          ) : (
            <div className="bg-white shadow overflow-visible sm:rounded-lg">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50 relative">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Rank
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Player
                    </th>
                    {currentFilter !== "conqueror" &&
                      currentFilter !== "ball_and_chain" &&
                      currentFilter !== "swiss_army_knife" && (
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Rating
                        </th>
                      )}
                    {currentFilter === "ball_and_chain" && (
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Avg Teammate Impact
                      </th>
                    )}
                    {currentFilter === "swiss_army_knife" && (
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        <Tooltip
                          width="w-80"
                          content={
                            <div className="space-y-2">
                              <div className="font-semibold mb-2">
                                Diversity Score Formula
                              </div>
                              <div className="text-xs space-y-1.5">
                                <div>
                                  <div className="font-medium mb-1">
                                    Diversity Score = (Position Score × 0.5) +
                                    (Team Score × 0.5)
                                  </div>
                                </div>
                                <div className="pt-1 border-t border-gray-700">
                                  <div className="mb-1">
                                    <span className="font-medium">
                                      Position Score:
                                    </span>
                                    <div className="text-gray-300 text-[10px] mt-0.5 ml-2">
                                      Shannon entropy of position distribution
                                      (DEFENSE and ATTACK only)
                                    </div>
                                  </div>
                                  <div>
                                    <span className="font-medium">
                                      Team Score:
                                    </span>
                                    <div className="text-gray-300 text-[10px] mt-0.5 ml-2">
                                      Shannon entropy of teammate/opponent
                                      distribution
                                    </div>
                                  </div>
                                </div>
                                <div className="pt-1 border-t border-gray-700 text-[10px] text-gray-300">
                                  Higher score = more diverse play style
                                </div>
                              </div>
                            </div>
                          }
                        >
                          <span className="cursor-help">Diversity Score</span>
                        </Tooltip>
                      </th>
                    )}
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Games
                    </th>
                    {currentFilter === "conqueror" && (
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Solo Wins
                      </th>
                    )}
                    {currentFilter === "ball_and_chain" && (
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Teammate Losses
                      </th>
                    )}
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Record
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Win Rate
                    </th>
                    {currentFilter === "mvp" && (
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        <Tooltip
                          width="w-80"
                          content={
                            <div className="space-y-2">
                              <div className="font-semibold mb-2">
                                MVP Score Formula
                              </div>
                              <div className="text-xs space-y-1.5">
                                <div>
                                  <div className="font-medium mb-1">
                                    MVP Score = (Bayesian Win Rate × Games
                                    Weight) + (Net Wins × 0.1)
                                  </div>
                                </div>
                                <div className="pt-1 border-t border-gray-700">
                                  <div className="mb-1">
                                    <span className="font-medium">
                                      Bayesian Win Rate:
                                    </span>
                                    <div className="text-gray-300 text-[10px] mt-0.5 ml-2">
                                      (Wins + 10 × 0.5) / (Games Played + 10)
                                    </div>
                                  </div>
                                  <div className="mb-1">
                                    <span className="font-medium">
                                      Games Weight:
                                    </span>
                                    <div className="text-gray-300 text-[10px] mt-0.5 ml-2">
                                      0.6 + 0.4 × (log(Games Played + 1) /
                                      log(101))
                                    </div>
                                  </div>
                                  <div>
                                    <span className="font-medium">
                                      Net Wins:
                                    </span>
                                    <div className="text-gray-300 text-[10px] mt-0.5 ml-2">
                                      Wins - Losses
                                    </div>
                                  </div>
                                </div>
                                <div className="pt-1 border-t border-gray-700 text-[10px] text-gray-300">
                                  Hover over individual scores to see calculated
                                  values
                                </div>
                              </div>
                            </div>
                          }
                        >
                          <span className="cursor-help">MVP Score</span>
                        </Tooltip>
                      </th>
                    )}
                    {currentFilter === "king_of_hill" && (
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Current Streak
                      </th>
                    )}
                    {currentFilter === "standard" && (
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Streak
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {players.map((player) => (
                    <tr key={player.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm font-medium text-gray-900">
                          {player.rank}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <PlayerLink
                          playerId={player.id}
                          displayName={player.displayName}
                          className="text-sm font-medium"
                          showCrown={player.id === previousWinnerId}
                        />
                      </td>
                      {currentFilter === "defense_leaders" ? (
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-sm font-bold text-blue-600">
                            {formatRating(
                              calculateConservativeRating(
                                player.defenseMu,
                                player.defenseSigma,
                              ),
                            )}
                          </span>
                          <span className="text-xs text-gray-400 ml-1">
                            (μ={player.defenseMu.toFixed(2)})
                          </span>
                        </td>
                      ) : currentFilter === "attack_leaders" ? (
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-sm font-bold text-green-600">
                            {formatRating(
                              calculateConservativeRating(
                                player.attackMu,
                                player.attackSigma,
                              ),
                            )}
                          </span>
                          <span className="text-xs text-gray-400 ml-1">
                            (μ={player.attackMu.toFixed(2)})
                          </span>
                        </td>
                      ) : currentFilter === "ball_and_chain" ? (
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-sm font-bold text-red-600">
                            {player.avgTeammateImpact !== undefined
                              ? player.avgTeammateImpact.toFixed(2)
                              : player.avgTeammateLoss
                                ? player.avgTeammateLoss.toFixed(2)
                                : "0.00"}
                          </span>
                        </td>
                      ) : currentFilter === "swiss_army_knife" ? (
                        <td className="px-6 py-4 whitespace-nowrap">
                          {player.diversityScore !== undefined ? (
                            <Tooltip
                              width="w-72"
                              content={
                                <div className="space-y-1">
                                  <div className="font-semibold mb-2">
                                    Diversity Score Breakdown
                                  </div>
                                  <div className="text-xs">
                                    <div>
                                      Combined Score:{" "}
                                      {player.diversityScore.toFixed(3)}
                                    </div>
                                    <div className="mt-1">
                                      Position Score:{" "}
                                      {player.positionDiversityScore !==
                                      undefined
                                        ? player.positionDiversityScore.toFixed(
                                            3,
                                          )
                                        : "N/A"}
                                    </div>
                                    <div className="text-gray-300 text-[10px] mt-0.5">
                                      (Shannon entropy of DEFENSE and ATTACK
                                      positions)
                                    </div>
                                    <div className="mt-1">
                                      Team Score:{" "}
                                      {player.teamDiversityScore !== undefined
                                        ? player.teamDiversityScore.toFixed(3)
                                        : "N/A"}
                                    </div>
                                    <div className="text-gray-300 text-[10px] mt-0.5">
                                      (Shannon entropy of teammate/opponent
                                      distribution)
                                    </div>
                                  </div>
                                </div>
                              }
                            >
                              <span className="text-sm font-bold text-purple-600 cursor-help">
                                {player.diversityScore.toFixed(3)}
                              </span>
                            </Tooltip>
                          ) : (
                            <span className="text-sm text-gray-400">N/A</span>
                          )}
                        </td>
                      ) : (
                        currentFilter !== "conqueror" && (
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="text-sm font-bold text-blue-600">
                              {formatRating(
                                calculateConservativeRating(
                                  player.generalMu,
                                  player.generalSigma,
                                ),
                              )}
                            </span>
                            <span className="text-xs text-gray-400 ml-1">
                              (μ={player.generalMu.toFixed(2)})
                            </span>
                          </td>
                        )
                      )}
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm text-gray-500">
                          {currentFilter === "defense_leaders"
                            ? player.defenseGames
                            : currentFilter === "attack_leaders"
                              ? player.attackGames
                              : currentFilter === "conqueror"
                                ? (player.soloGames ?? 0)
                                : player.gamesPlayed}
                        </span>
                      </td>
                      {currentFilter === "conqueror" && (
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-sm font-medium text-gray-900">
                            {player.soloWins ?? 0}
                          </span>
                        </td>
                      )}
                      {currentFilter === "ball_and_chain" && (
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-sm font-medium text-gray-900">
                            {player.teammateLosses ?? 0} /{" "}
                            {player.totalTeammateMatches ?? 0}
                          </span>
                        </td>
                      )}
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm text-gray-900">
                          {player.wins}W - {player.losses}L
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm text-gray-900">
                          {player.winRate.toFixed(1)}%
                        </span>
                      </td>
                      {currentFilter === "mvp" &&
                        player.mvpScore !== undefined && (
                          <td className="px-6 py-4 whitespace-nowrap">
                            <Tooltip
                              width="w-72"
                              content={
                                player.mvpBreakdown ? (
                                  <div className="space-y-1">
                                    <div className="font-semibold mb-2">
                                      MVP Score Breakdown
                                    </div>
                                    <div className="text-xs">
                                      <div>
                                        Bayesian Win Rate:{" "}
                                        {(
                                          player.mvpBreakdown.bayesianWinRate *
                                          100
                                        ).toFixed(2)}
                                        %
                                      </div>
                                      <div className="text-gray-300 text-[10px] mt-0.5">
                                        = ({player.wins} + 10 × 0.5) / (
                                        {player.gamesPlayed} + 10)
                                      </div>
                                      <div className="mt-1">
                                        Games Weight:{" "}
                                        {player.mvpBreakdown.gamesWeight.toFixed(
                                          3,
                                        )}
                                      </div>
                                      <div className="text-gray-300 text-[10px] mt-0.5">
                                        = 0.6 + 0.4 × (log({player.gamesPlayed}{" "}
                                        + 1) / log(101))
                                      </div>
                                      <div className="mt-1">
                                        Net Wins:{" "}
                                        {player.mvpBreakdown.netWins > 0
                                          ? "+"
                                          : ""}
                                        {player.mvpBreakdown.netWins.toFixed(1)}
                                      </div>
                                      <div className="text-gray-300 text-[10px] mt-0.5">
                                        = {player.wins}W - {player.losses}L
                                      </div>
                                      <div className="mt-2 pt-2 border-t border-gray-700">
                                        <div className="font-semibold">
                                          Total Score:{" "}
                                          {player.mvpScore.toFixed(3)}
                                        </div>
                                        <div className="text-gray-300 text-[10px] mt-0.5">
                                          = (
                                          {(
                                            player.mvpBreakdown
                                              .bayesianWinRate * 100
                                          ).toFixed(2)}
                                          % ×{" "}
                                          {player.mvpBreakdown.gamesWeight.toFixed(
                                            3,
                                          )}
                                          ) + (
                                          {player.mvpBreakdown.netWins > 0
                                            ? "+"
                                            : ""}
                                          {player.mvpBreakdown.netWins.toFixed(
                                            1,
                                          )}{" "}
                                          × 0.1)
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                ) : (
                                  "MVP Score: " + player.mvpScore.toFixed(3)
                                )
                              }
                            >
                              <span className="text-sm font-bold text-purple-600">
                                {player.mvpScore.toFixed(2)}
                              </span>
                            </Tooltip>
                          </td>
                        )}
                      {currentFilter === "king_of_hill" && (
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-sm font-medium text-green-600">
                            {player.winStreak}W
                          </span>
                        </td>
                      )}
                      {currentFilter === "standard" && (
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span
                            className={`text-sm font-medium ${player.winStreak > 0 ? "text-green-600" : "text-gray-400"}`}
                          >
                            {player.winStreak > 0
                              ? `${player.winStreak}W`
                              : "-"}
                          </span>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {meme && (
        <MemePopup isOpen={true} memeUrl={meme.url} onClose={closeMeme} />
      )}
    </div>
  );
}
