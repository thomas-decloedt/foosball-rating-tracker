import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { Navigation } from "@/frontend/components/Navigation";
import { MatchCard, type MatchCardData } from "@/frontend/components/MatchCard";
import { fetchApi } from "@/frontend/utils/fetch";

export function MatchHistoryPage() {
  const [matches, setMatches] = useState<MatchCardData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMatches();
  }, []);

  const fetchMatches = async () => {
    try {
      const data = await fetchApi<{ matches: MatchCardData[] }>(
        "/api/v1/matches?page=1&limit=50",
      );
      setMatches(data.matches);
    } catch (err) {
      console.error("Failed to fetch matches:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">
            Match History
          </h2>

          {loading ? (
            <div className="text-center py-12">
              <p className="text-gray-500">Loading...</p>
            </div>
          ) : matches.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-lg shadow">
              <p className="text-gray-500 mb-4">No matches recorded yet</p>
              <Link
                to="/record"
                className="text-blue-600 hover:text-blue-800 font-medium"
              >
                Record your first match
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              {matches.map((match) => (
                <MatchCard key={match.id} match={match} showDate={true} />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
