import { useEffect, useState } from "react";
import { PlayerLink } from "../components/PlayerLink";
import { Navigation } from "../components/Navigation";
import { usePreviousWinner } from "../hooks/usePreviousWinner";
import { fetchApi } from "../utils/fetch";

interface MVPData {
  month: string;
  year: number;
  monthNumber: number;
  mvp: {
    playerId: string;
    displayName: string;
    gamesPlayed: number;
    muGained: number;
    startMu: number;
    endMu: number;
  } | null;
  topPerformers: Array<{
    playerId: string;
    displayName: string;
    gamesPlayed: number;
    muGained: number;
    startMu: number;
    endMu: number;
  }>;
}

export function MonthlyMVPPage() {
  const now = new Date();
  const { previousWinnerId, hasGames } = usePreviousWinner();
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const [mvpData, setMvpData] = useState<MVPData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMVP();
  }, [selectedYear, selectedMonth]);

  const fetchMVP = async () => {
    try {
      setLoading(true);
      const data = await fetchApi<MVPData>(
        `/api/v1/players/mvp/monthly?year=${selectedYear}&month=${selectedMonth}`,
      );
      setMvpData(data);
    } catch (err) {
      console.error("Failed to fetch MVP data:", err);
    } finally {
      setLoading(false);
    }
  };

  const monthNames = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">
          MVP of the Month
        </h2>

        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Month
              </label>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              >
                {monthNames.map((month, idx) => (
                  <option key={idx} value={idx + 1}>
                    {month}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Year
              </label>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              >
                {[2026, 2025, 2024].map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12 text-gray-600">Loading...</div>
        ) : mvpData?.mvp ? (
          <>
            <div className="bg-gradient-to-r from-yellow-400 to-yellow-600 rounded-lg shadow-lg p-8 mb-6 text-white">
              <div className="text-center">
                <div className="text-6xl mb-4">🏆</div>
                <h3 className="text-3xl font-bold mb-2">
                  {mvpData.month} {mvpData.year} MVP
                </h3>
                <div className="text-4xl font-bold mb-2">
                  {mvpData.mvp.displayName}
                </div>
                <div className="text-xl">
                  +{mvpData.mvp.muGained.toFixed(2)} μ gained in{" "}
                  {mvpData.mvp.gamesPlayed} games
                </div>
                <div className="text-sm mt-2 opacity-90">
                  μ: {mvpData.mvp.startMu.toFixed(2)} →{" "}
                  {mvpData.mvp.endMu.toFixed(2)}
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-xl font-bold mb-4 text-gray-900">
                Top Performers
              </h3>
              <div className="space-y-3">
                {mvpData.topPerformers.map((player, idx) => (
                  <div
                    key={player.playerId}
                    className="flex items-center justify-between border border-gray-200 rounded-lg p-4"
                  >
                    <div className="flex items-center space-x-4">
                      <span className="text-2xl font-bold text-gray-400">
                        #{idx + 1}
                      </span>
                      <div>
                        <PlayerLink
                          playerId={player.playerId}
                          displayName={player.displayName}
                          className="text-lg font-semibold"
                          showCrown={
                            hasGames && player.playerId === previousWinnerId
                          }
                        />
                        <div className="text-sm text-gray-600">
                          {player.gamesPlayed} games played
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div
                        className={`text-2xl font-bold ${player.muGained > 0 ? "text-green-600" : "text-red-600"}`}
                      >
                        {player.muGained > 0 ? "+" : ""}
                        {player.muGained.toFixed(2)}
                      </div>
                      <div className="text-sm text-gray-600">μ gained</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <p className="text-gray-500">
              No MVP for {mvpData?.month} {mvpData?.year}. Players need at least
              5 games to qualify.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
