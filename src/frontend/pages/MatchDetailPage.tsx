import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { CommentForm } from "../components/CommentForm";
import { CommentList } from "../components/CommentList";
import { MemePopup } from "../components/MemePopup";
import { Navigation } from "../components/Navigation";
import { PlayerLink } from "../components/PlayerLink";
import { MatchCard, type MatchCardData } from "../components/MatchCard";
import { useMemePopup } from "../hooks/useMemePopup";
import { usePreviousWinner } from "../hooks/usePreviousWinner";
import { fetchApi } from "../utils/fetch";

type MatchData = MatchCardData;

interface RatingChange {
  playerId: string;
  displayName: string;
  muBefore: number;
  sigmaBefore: number;
  muAfter: number;
  sigmaAfter: number;
  muChange: number;
}

export function MatchDetailPage() {
  const { matchId } = useParams<{ matchId: string }>();
  const navigate = useNavigate();
  const { meme, closeMeme } = useMemePopup();
  const { previousWinnerId, hasGames } = usePreviousWinner();

  const [match, setMatch] = useState<MatchData | null>(null);
  const [ratingChanges, setRatingChanges] = useState<RatingChange[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshComments, setRefreshComments] = useState(0);

  useEffect(() => {
    if (!matchId) {
      navigate("/history");
      return;
    }
    fetchMatchData();
  }, [matchId]);

  const fetchMatchData = async () => {
    try {
      setLoading(true);
      setError("");

      const data = await fetchApi<{
        match: MatchData;
        ratingChanges: RatingChange[];
      }>(`/api/v1/match/${matchId}`);

      setMatch(data.match);
      setRatingChanges(data.ratingChanges);
    } catch (err) {
      setError("Failed to load match details");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-xl text-gray-600">Loading match details...</div>
      </div>
    );
  }

  if (error || !match) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navigation />

        <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
          <Link
            to="/history"
            className="text-blue-600 hover:text-blue-800 mb-4 inline-block"
          >
            ← Back to Match History
          </Link>
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-red-700">
            {error || "Match not found"}
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
          to="/history"
          className="text-blue-600 hover:text-blue-800 mb-4 inline-block"
        >
          ← Back to Match History
        </Link>

        <div className="mb-6">
          <MatchCard
            match={match}
            showDate={true}
            showTable={true}
            clickable={false}
          />
        </div>

        <section className="bg-white rounded-lg shadow p-6 mb-6">
          <h3 className="text-xl font-bold mb-4 text-gray-900">
            Rating Changes
          </h3>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Player
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    μ Before
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    μ After
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Change
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {ratingChanges.map((change) => (
                  <tr key={change.playerId}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <PlayerLink
                        playerId={change.playerId}
                        displayName={change.displayName}
                        className="text-sm font-medium"
                        showCrown={
                          hasGames && change.playerId === previousWinnerId
                        }
                      />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                      <div>{change.muBefore.toFixed(2)}</div>
                      <div className="text-xs text-gray-400">
                        σ={change.sigmaBefore.toFixed(2)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                      <div>{change.muAfter.toFixed(2)}</div>
                      <div className="text-xs text-gray-400">
                        σ={change.sigmaAfter.toFixed(2)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`text-sm font-bold ${
                          change.muChange > 0
                            ? "text-green-600"
                            : change.muChange < 0
                              ? "text-red-600"
                              : "text-gray-600"
                        }`}
                      >
                        {change.muChange > 0 ? "+" : ""}
                        {change.muChange.toFixed(2)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="bg-white rounded-lg shadow p-6">
          <h3 className="text-xl font-bold mb-4 text-gray-900">
            Shitpost Thread
          </h3>
          <CommentForm
            matchId={matchId!}
            onCommentAdded={() => setRefreshComments((prev) => prev + 1)}
          />
          <CommentList matchId={matchId!} refreshTrigger={refreshComments} />
        </section>
      </main>

      {meme && (
        <MemePopup isOpen={true} memeUrl={meme.url} onClose={closeMeme} />
      )}
    </div>
  );
}
