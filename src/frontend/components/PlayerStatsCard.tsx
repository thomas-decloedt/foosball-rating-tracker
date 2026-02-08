import { addCacheBustToImageUrl } from "../utils/image-cache-bust";
import { usePreviousWinner } from "../hooks/usePreviousWinner";
import { calculateConservativeRating, formatRating } from "../utils/rating";

interface PlayerStatsCardProps {
  player: {
    id: string;
    displayName: string;
    displayRating: number;
    generalMu: number;
    generalSigma: number;
    gamesPlayed: number;
    wins: number;
    losses: number;
    winRate: number;
    winStreak: number;
    bestWinStreak: number;
    profileImage?: string | null;
  };
}

export function PlayerStatsCard({ player }: PlayerStatsCardProps) {
  const { previousWinnerId, hasGames } = usePreviousWinner();
  const displayRating = calculateConservativeRating(
    player.generalMu,
    player.generalSigma,
  );

  return (
    <div className="bg-white rounded-lg shadow-lg p-8 mb-6">
      <div className="text-center mb-6">
        {player.profileImage && (
          <div className="mb-4 flex justify-center">
            <img
              src={
                addCacheBustToImageUrl(player.profileImage) ||
                player.profileImage
              }
              alt={player.displayName}
              className="w-24 h-24 rounded-full object-cover border-4 border-blue-600"
            />
          </div>
        )}
        <h1 className="text-3xl font-bold text-gray-900 mb-3 flex items-center justify-center gap-2">
          {player.displayName}
          {hasGames && player.id === previousWinnerId && (
            <span className="text-yellow-500" title="Previous season winner">
              👑
            </span>
          )}
        </h1>
        <div className="inline-block bg-blue-600 text-white px-6 py-3 rounded-lg text-2xl font-bold">
          {formatRating(displayRating)} Rating
        </div>
        <div className="text-sm text-gray-500 mt-2">
          μ={player.generalMu.toFixed(2)}, σ={player.generalSigma.toFixed(2)}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div className="bg-gray-50 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-gray-900">
            {player.gamesPlayed}
          </div>
          <div className="text-sm text-gray-600">Games Played</div>
        </div>

        <div className="bg-gray-50 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-gray-900">
            {player.wins}-{player.losses}
          </div>
          <div className="text-sm text-gray-600">Record</div>
        </div>

        <div className="bg-gray-50 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-gray-900">
            {player.winRate.toFixed(1)}%
          </div>
          <div className="text-sm text-gray-600">Win Rate</div>
        </div>

        <div
          className={`rounded-lg p-4 text-center ${player.winStreak > 0 ? "bg-green-100" : "bg-gray-50"}`}
        >
          <div
            className={`text-2xl font-bold ${player.winStreak > 0 ? "text-green-700" : "text-gray-900"}`}
          >
            {player.winStreak}
          </div>
          <div className="text-sm text-gray-600">Win Streak</div>
        </div>

        <div className="bg-gray-50 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-gray-900">
            {player.bestWinStreak}
          </div>
          <div className="text-sm text-gray-600">Best Streak</div>
        </div>
      </div>
    </div>
  );
}
