import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { EloChart } from "../components/EloChart";
import { MemePopup } from "../components/MemePopup";
import { Navigation } from "../components/Navigation";
import { PlayerStatsCard } from "../components/PlayerStatsCard";
import { RecentMatchesList } from "../components/RecentMatchesList";
import { SeasonIcon } from "../components/SeasonIcon";
import { useAuth } from "../contexts/auth-context";
import { useMemePopup } from "../hooks/useMemePopup";
import { usePreviousWinner } from "../hooks/usePreviousWinner";
import { useRealtime } from "../hooks/useRealtime";
import { fetchApi } from "../utils/fetch";
import { addCacheBustToImageUrl } from "../utils/image-cache-bust";
import { calculateConservativeRating, formatRating } from "../utils/rating";

interface PlayerData {
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
  soloGames: number;
  wins: number;
  losses: number;
  winRate: number;
  winStreak: number;
  bestWinStreak: number;
  profileImage: string | null;
}

interface Opponent {
  opponentId: string;
  opponentName: string;
  matchesPlayed: number;
  wins: number;
  losses: number;
  winRate: number;
}

interface WonSeason {
  id: string;
  name: string;
  startDate: string;
  endDate: string | null;
  icon: string | null;
  winnerMvpScore: number | null;
}

interface RatingHistoryEntry {
  id: string;
  muBefore: number;
  sigmaBefore: number;
  muAfter: number;
  sigmaAfter: number;
  muChange: number;
  displayBefore: number;
  displayAfter: number;
  createdAt: Date | string;
  matchId: string;
}

export function PlayerProfilePage() {
  const { playerId } = useParams<{ playerId: string }>();
  const navigate = useNavigate();
  const { meme, closeMeme } = useMemePopup();
  const { player: currentPlayer, refreshUser } = useAuth();
  const { previousWinnerId, hasGames } = usePreviousWinner();

  const [player, setPlayer] = useState<PlayerData | null>(null);
  const [history, setHistory] = useState<RatingHistoryEntry[]>([]);
  const [opponents, setOpponents] = useState<Opponent[]>([]);
  const [wonSeasons, setWonSeasons] = useState<WonSeason[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Profile image update state
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Display name editing state
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedDisplayName, setEditedDisplayName] = useState("");
  const [nameUpdateError, setNameUpdateError] = useState("");
  const [nameUpdateSuccess, setNameUpdateSuccess] = useState(false);
  const [updatingName, setUpdatingName] = useState(false);

  const isOwnProfile = currentPlayer?.id === playerId;

  useEffect(() => {
    if (!playerId) {
      navigate("/");
      return;
    }
    fetchPlayerData();
  }, [playerId]);

  // Initialize editedDisplayName when player data loads
  useEffect(() => {
    if (player && !isEditingName) {
      setEditedDisplayName(player.displayName);
    }
  }, [player, isEditingName]);

  useRealtime({
    topics: playerId ? [`player:${playerId}`] : [],
    onEvent: (event) => {
      if (
        event.type === "match-updated" &&
        playerId &&
        event.players.includes(playerId)
      ) {
        fetchPlayerData();
      }
    },
  });

  const fetchPlayerData = async () => {
    try {
      setLoading(true);
      setError("");

      const [playerData, historyData, opponentsData, wonSeasonsData] =
        await Promise.all([
          fetchApi<{ player: PlayerData }>(`/api/v1/players/${playerId}`),
          fetchApi<{ history: RatingHistoryEntry[] }>(
            `/api/v1/players/${playerId}/history`,
          ),
          fetchApi<{ opponents: Opponent[] }>(
            `/api/v1/players/${playerId}/opponents`,
          ),
          fetchApi<{ seasons: WonSeason[] }>(
            `/api/v1/players/${playerId}/won-seasons`,
          ),
        ]);

      setPlayer(playerData.player);
      setHistory(historyData.history);
      setOpponents(opponentsData.opponents);
      setWonSeasons(wonSeasonsData.seasons);
    } catch (err) {
      setError("Failed to load player profile");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      setUploadError("Please select an image file");
      return;
    }

    // Validate file size (500KB max)
    if (file.size > 500 * 1024) {
      setUploadError("Image must be smaller than 500KB");
      return;
    }

    setUploadError("");
    setImageFile(file);

    // Create preview
    const reader = new FileReader();
    reader.onloadend = () => {
      setImagePreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleImageUpdate = async () => {
    if (!imageFile || !imagePreview) return;

    try {
      setUploading(true);
      setUploadError("");
      setUploadSuccess(false);

      const response = await fetchApi<{
        success: boolean;
        profileImage: string | null;
      }>("/api/v1/auth/update-profile", {
        method: "POST",
        body: JSON.stringify({ profileImage: imagePreview }),
      });

      // Refresh user data to get updated profile image
      await refreshUser();

      // Update local player state with R2 URL from API response
      if (player) {
        setPlayer({ ...player, profileImage: response.profileImage });
      }

      // Reset form
      setImageFile(null);
      setImagePreview(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }

      setUploadSuccess(true);
      setTimeout(() => setUploadSuccess(false), 3000);
    } catch (err: any) {
      const errorMsg =
        err?.data?.error || err?.message || "Failed to update profile image";
      setUploadError(errorMsg);
    } finally {
      setUploading(false);
    }
  };

  const handleImageRemove = async () => {
    try {
      setUploading(true);
      setUploadError("");
      setUploadSuccess(false);

      const response = await fetchApi<{
        success: boolean;
        profileImage: string | null;
      }>("/api/v1/auth/update-profile", {
        method: "POST",
        body: JSON.stringify({ profileImage: null }),
      });

      // Refresh user data
      await refreshUser();

      // Update local player state with API response
      if (player) {
        setPlayer({ ...player, profileImage: response.profileImage });
      }

      setUploadSuccess(true);
      setTimeout(() => setUploadSuccess(false), 3000);
    } catch (err: any) {
      const errorMsg =
        err?.data?.error || err?.message || "Failed to remove profile image";
      setUploadError(errorMsg);
    } finally {
      setUploading(false);
    }
  };

  const handleNameUpdate = async () => {
    if (!player || !playerId) return;

    // Validate input
    const trimmedName = editedDisplayName.trim();
    if (!trimmedName) {
      setNameUpdateError("Display name cannot be empty");
      return;
    }

    if (trimmedName.length > 100) {
      setNameUpdateError("Display name must be 100 characters or less");
      return;
    }

    try {
      setUpdatingName(true);
      setNameUpdateError("");
      setNameUpdateSuccess(false);

      await fetchApi<{
        success: boolean;
        player: { id: string; displayName: string };
      }>(`/api/v1/players/${playerId}/displayName`, {
        method: "PATCH",
        body: JSON.stringify({ displayName: trimmedName }),
      });

      // Refresh player data
      await fetchPlayerData();
      // Refresh user data to update cached player info
      await refreshUser();

      setIsEditingName(false);
      setNameUpdateSuccess(true);
      setTimeout(() => setNameUpdateSuccess(false), 3000);
    } catch (err: any) {
      const errorMsg =
        err?.data?.error || err?.message || "Failed to update display name";
      setNameUpdateError(errorMsg);
    } finally {
      setUpdatingName(false);
    }
  };

  const handleNameCancel = () => {
    if (player) {
      setEditedDisplayName(player.displayName);
    }
    setIsEditingName(false);
    setNameUpdateError("");
    setNameUpdateSuccess(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-xl text-gray-600">Loading player profile...</div>
      </div>
    );
  }

  if (error || !player) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navigation />

        <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
          <Link
            to="/"
            className="text-blue-600 hover:text-blue-800 mb-4 inline-block"
          >
            ← Back to Leaderboard
          </Link>
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-red-700">
            {error || "Player not found"}
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <Link
          to="/"
          className="text-blue-600 hover:text-blue-800 mb-4 inline-block"
        >
          ← Back to Leaderboard
        </Link>

        <PlayerStatsCard player={player} />

        {/* Trophy Case */}
        {wonSeasons.length > 0 && (
          <section className="bg-white p-6 rounded-lg shadow mb-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Trophy Case
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {wonSeasons.map((season) => (
                <div key={season.id} className="flex flex-col aspect-square">
                  {/* Fixed height container for icons - center axis aligned */}
                  <div className="flex-1 flex items-center justify-center mb-2">
                    {season.icon ? (
                      <SeasonIcon icon={season.icon} size="lg" />
                    ) : (
                      <span className="text-3xl">🏆</span>
                    )}
                  </div>

                  {/* Text bottom-aligned */}
                  <div className="font-medium text-sm text-gray-900 mb-0.5 text-center">
                    {season.name}
                  </div>
                  <div className="text-xs text-gray-500 text-center">
                    {new Date(season.startDate).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                    {season.endDate &&
                      season.endDate !== season.startDate &&
                      ` - ${new Date(season.endDate).toLocaleDateString(
                        "en-US",
                        {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        },
                      )}`}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {isOwnProfile && (
          <>
            <section className="bg-white p-6 rounded-lg shadow mb-6">
              <h3 className="text-xl font-bold mb-4 text-gray-900">
                Display Name
              </h3>
              {!isEditingName ? (
                <div className="flex items-center gap-4">
                  <span className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                    {player.displayName}
                    {hasGames && player.id === previousWinnerId && (
                      <span
                        className="text-yellow-500"
                        title="Previous season winner"
                      >
                        👑
                      </span>
                    )}
                  </span>
                  <button
                    onClick={() => setIsEditingName(true)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium transition-colors"
                  >
                    Edit
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <input
                      type="text"
                      value={editedDisplayName}
                      onChange={(e) => setEditedDisplayName(e.target.value)}
                      maxLength={100}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Enter display name"
                      disabled={updatingName}
                    />
                    <p className="text-sm text-gray-500 mt-1">
                      Maximum 100 characters
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleNameUpdate}
                      disabled={updatingName}
                      className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {updatingName ? "Saving..." : "Save"}
                    </button>
                    <button
                      onClick={handleNameCancel}
                      disabled={updatingName}
                      className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400 font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                  {nameUpdateError && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">
                      {nameUpdateError}
                    </div>
                  )}
                  {nameUpdateSuccess && (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-green-700 text-sm">
                      Display name updated successfully!
                    </div>
                  )}
                </div>
              )}
            </section>

            <section className="bg-white p-6 rounded-lg shadow mb-6">
              <h3 className="text-xl font-bold mb-4 text-gray-900">
                Profile Image
              </h3>
              <div className="flex flex-col md:flex-row gap-6 items-start">
                <div className="flex-shrink-0">
                  <div className="w-32 h-32 rounded-full overflow-hidden border-4 border-blue-600 bg-gray-200 flex items-center justify-center">
                    {imagePreview ? (
                      <img
                        src={imagePreview}
                        alt="Preview"
                        className="w-full h-full object-cover"
                      />
                    ) : player.profileImage ? (
                      <img
                        src={
                          addCacheBustToImageUrl(player.profileImage) ||
                          player.profileImage
                        }
                        alt={player.displayName}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-gray-600 font-semibold text-4xl">
                        {player.displayName.charAt(0).toUpperCase()}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex-1 space-y-4">
                  <div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleImageSelect}
                      className="hidden"
                      id="profile-image-input"
                    />
                    <label
                      htmlFor="profile-image-input"
                      className="inline-block px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium cursor-pointer transition-colors"
                    >
                      Choose Image
                    </label>
                    <p className="text-sm text-gray-500 mt-2">
                      Maximum file size: 500KB. Supported formats: JPG, PNG, GIF
                    </p>
                  </div>
                  {imagePreview && (
                    <div className="flex gap-2">
                      <button
                        onClick={handleImageUpdate}
                        disabled={uploading}
                        className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {uploading ? "Uploading..." : "Update Image"}
                      </button>
                      <button
                        onClick={() => {
                          setImagePreview(null);
                          setImageFile(null);
                          if (fileInputRef.current) {
                            fileInputRef.current.value = "";
                          }
                        }}
                        disabled={uploading}
                        className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400 font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                  {player.profileImage && !imagePreview && (
                    <button
                      onClick={handleImageRemove}
                      disabled={uploading}
                      className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {uploading ? "Removing..." : "Remove Image"}
                    </button>
                  )}
                  {uploadError && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">
                      {uploadError}
                    </div>
                  )}
                  {uploadSuccess && (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-green-700 text-sm">
                      Profile image updated successfully!
                    </div>
                  )}
                </div>
              </div>
            </section>
          </>
        )}

        <section className="bg-white p-6 rounded-lg shadow mb-6">
          <h3 className="text-xl font-bold mb-4 text-gray-900">
            Position Breakdown
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="border border-gray-200 rounded-lg p-4">
              <h4 className="text-lg font-semibold text-gray-700 mb-2">
                Attack
              </h4>
              <p className="text-3xl font-bold text-green-600">
                {formatRating(
                  calculateConservativeRating(
                    player.attackMu,
                    player.attackSigma,
                  ),
                )}
              </p>
              <p className="text-sm text-gray-500">
                μ={player.attackMu.toFixed(2)}, σ=
                {player.attackSigma.toFixed(2)}
              </p>
              <p className="text-sm text-gray-500">
                {player.attackGames} games played
              </p>
            </div>

            <div className="border border-gray-200 rounded-lg p-4">
              <h4 className="text-lg font-semibold text-gray-700 mb-2">
                Defense
              </h4>
              <p className="text-3xl font-bold text-blue-600">
                {formatRating(
                  calculateConservativeRating(
                    player.defenseMu,
                    player.defenseSigma,
                  ),
                )}
              </p>
              <p className="text-sm text-gray-500">
                μ={player.defenseMu.toFixed(2)}, σ=
                {player.defenseSigma.toFixed(2)}
              </p>
              <p className="text-sm text-gray-500">
                {player.defenseGames} games played
              </p>
            </div>

            <div className="border border-gray-200 rounded-lg p-4">
              <h4 className="text-lg font-semibold text-gray-700 mb-2">Solo</h4>
              <p className="text-3xl font-bold text-purple-600">
                {formatRating(
                  calculateConservativeRating(player.soloMu, player.soloSigma),
                )}
              </p>
              <p className="text-sm text-gray-500">
                μ={player.soloMu.toFixed(2)}, σ={player.soloSigma.toFixed(2)}
              </p>
              <p className="text-sm text-gray-500">
                {player.soloGames} games played
              </p>
            </div>
          </div>
        </section>

        {opponents.length > 0 && (
          <section className="bg-white p-6 rounded-lg shadow mb-6">
            <h3 className="text-xl font-bold mb-4 text-gray-900">
              Top Opponents
            </h3>
            <div className="space-y-2">
              {opponents.slice(0, 5).map((opponent) => (
                <Link
                  key={opponent.opponentId}
                  to={`/h2h?player1=${playerId}&player2=${opponent.opponentId}`}
                  className="block border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
                >
                  <div className="flex justify-between items-center">
                    <div>
                      <span className="font-semibold text-gray-900">
                        {opponent.opponentName}
                      </span>
                      <div className="text-sm text-gray-600 mt-1">
                        {opponent.matchesPlayed} matches • {opponent.wins}W -{" "}
                        {opponent.losses}L
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-bold text-gray-900">
                        {opponent.winRate.toFixed(1)}%
                      </div>
                      <div className="text-sm text-gray-600">Win Rate</div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        <section className="bg-white p-6 rounded-lg shadow mb-6">
          <h3 className="text-xl font-bold mb-4 text-gray-900">
            Rating History
          </h3>
          <div className="h-96">
            <EloChart history={history} />
          </div>
        </section>

        <section>
          <h3 className="text-xl font-bold mb-4 text-gray-900">
            Recent Matches
          </h3>
          <RecentMatchesList playerId={playerId!} limit={20} />
        </section>
      </main>

      {meme && (
        <MemePopup isOpen={true} memeUrl={meme.url} onClose={closeMeme} />
      )}
    </div>
  );
}
