import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { MemePopup } from "@/frontend/components/MemePopup";
import { Navigation } from "@/frontend/components/Navigation";
import { PlayerSelect } from "@/frontend/components/PlayerSelect";
import { PositionTabBar } from "@/frontend/components/PositionTabBar";
import { Tooltip } from "@/frontend/components/Tooltip";
import { useMemePopup } from "@/frontend/hooks/useMemePopup";
import { fetchApi } from "@/frontend/utils/fetch";
import { PlayerPosition, type PlayerPositionType } from "@/api-models/position";
import { useTableStore } from "@/frontend/stores/tableStore";
import { formatRating } from "@/frontend/utils/rating";

interface Player {
  id: string;
  displayName: string;
  displayRating: number;
}

interface Table {
  id: string;
  brand: string;
  model: string;
  notes: string | null;
}

export function RecordMatchPage() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [tables, setTables] = useState<Table[]>([]);
  const { lastPickedTableId, setLastPickedTableId } = useTableStore();
  const [team1Player1Id, setTeam1Player1Id] = useState("");
  const [team1Player2Id, setTeam1Player2Id] = useState("");
  const [team2Player1Id, setTeam2Player1Id] = useState("");
  const [team2Player2Id, setTeam2Player2Id] = useState("");
  const [team1Score, setTeam1Score] = useState(0);
  const [team2Score, setTeam2Score] = useState(0);
  const [tableId, setTableId] = useState<string>(lastPickedTableId || "");
  const [team1Player1Position, setTeam1Player1Position] =
    useState<PlayerPositionType>(PlayerPosition.DEFENSE);
  const [team1Player2Position, setTeam1Player2Position] =
    useState<PlayerPositionType>(PlayerPosition.ATTACK);
  const [team2Player1Position, setTeam2Player1Position] =
    useState<PlayerPositionType>(PlayerPosition.DEFENSE);
  const [team2Player2Position, setTeam2Player2Position] =
    useState<PlayerPositionType>(PlayerPosition.ATTACK);
  const [isFriendly, setIsFriendly] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { meme, closeMeme, triggerMeme } = useMemePopup();

  useEffect(() => {
    fetchPlayers();
    fetchTables();
  }, []);

  // Initialize tableId from Zustand store
  useEffect(() => {
    if (lastPickedTableId && !tableId) {
      setTableId(lastPickedTableId);
    }
  }, [lastPickedTableId]);

  const team1IsSoloMode = useMemo(() => {
    return !team1Player2Id; // Solo mode when no Player 2
  }, [team1Player2Id]);

  const team2IsSoloMode = useMemo(() => {
    return !team2Player2Id;
  }, [team2Player2Id]);

  // Auto-adjust positions when Player 2 is added/removed
  useEffect(() => {
    if (!team1Player2Id) {
      // No Player 2 = Solo mode, set to SOLO
      setTeam1Player1Position(PlayerPosition.SOLO);
    } else {
      // Player 2 added = Team mode, set to DEFENSE if currently SOLO
      if (team1Player1Position === PlayerPosition.SOLO) {
        setTeam1Player1Position(PlayerPosition.DEFENSE);
        setTeam1Player2Position(PlayerPosition.ATTACK);
      }
    }
  }, [team1Player2Id, team1Player1Position]);

  useEffect(() => {
    if (!team2Player2Id) {
      setTeam2Player1Position(PlayerPosition.SOLO);
    } else {
      if (team2Player1Position === PlayerPosition.SOLO) {
        setTeam2Player1Position(PlayerPosition.DEFENSE);
        setTeam2Player2Position(PlayerPosition.ATTACK);
      }
    }
  }, [team2Player2Id, team2Player1Position]);

  const positionValidationError = useMemo(() => {
    // Team 1 validation
    if (!team1IsSoloMode) {
      // Check MIXED + DEFENSE/ATTACK combination
      if (
        (team1Player1Position === PlayerPosition.MIXED &&
          (team1Player2Position === PlayerPosition.DEFENSE ||
            team1Player2Position === PlayerPosition.ATTACK)) ||
        (team1Player2Position === PlayerPosition.MIXED &&
          (team1Player1Position === PlayerPosition.DEFENSE ||
            team1Player1Position === PlayerPosition.ATTACK))
      ) {
        return "Team 1: Mixed position cannot be combined with Defense or Attack";
      }

      // Same-position validation
      if (
        team1Player1Position !== PlayerPosition.MIXED &&
        team1Player2Position !== PlayerPosition.MIXED &&
        team1Player1Position === team1Player2Position
      ) {
        return "Team 1 players cannot have the same position";
      }
    }

    // Team 2 validation
    if (!team2IsSoloMode) {
      // Check MIXED + DEFENSE/ATTACK combination
      if (
        (team2Player1Position === PlayerPosition.MIXED &&
          (team2Player2Position === PlayerPosition.DEFENSE ||
            team2Player2Position === PlayerPosition.ATTACK)) ||
        (team2Player2Position === PlayerPosition.MIXED &&
          (team2Player1Position === PlayerPosition.DEFENSE ||
            team2Player1Position === PlayerPosition.ATTACK))
      ) {
        return "Team 2: Mixed position cannot be combined with Defense or Attack";
      }

      // Same-position validation
      if (
        team2Player1Position !== PlayerPosition.MIXED &&
        team2Player2Position !== PlayerPosition.MIXED &&
        team2Player1Position === team2Player2Position
      ) {
        return "Team 2 players cannot have the same position";
      }
    }

    return "";
  }, [
    !team1IsSoloMode,
    !team2IsSoloMode,
    team1Player1Position,
    team1Player2Position,
    team2Player1Position,
    team2Player2Position,
  ]);

  // Disabled options helpers for tab bars
  const getDisabledOptionsForTeam1Player1 =
    useMemo((): PlayerPositionType[] => {
      const disabled: PlayerPositionType[] = [];

      if (team1IsSoloMode) {
        // In solo mode, disable DEFENSE/ATTACK/MIXED
        disabled.push(
          PlayerPosition.DEFENSE,
          PlayerPosition.ATTACK,
          PlayerPosition.MIXED,
        );
      } else {
        // In team mode, disable SOLO
        disabled.push(PlayerPosition.SOLO);
        // REMOVED: Don't disable MIXED based on partner's position
      }

      return disabled;
    }, [team1IsSoloMode]);

  const getDisabledOptionsForTeam1Player2 =
    useMemo((): PlayerPositionType[] => {
      const disabled: PlayerPositionType[] = [];

      if (team1IsSoloMode) {
        disabled.push(
          PlayerPosition.DEFENSE,
          PlayerPosition.ATTACK,
          PlayerPosition.MIXED,
        );
      } else {
        disabled.push(PlayerPosition.SOLO);
      }

      return disabled;
    }, [team1IsSoloMode]);

  const getDisabledOptionsForTeam2Player1 =
    useMemo((): PlayerPositionType[] => {
      const disabled: PlayerPositionType[] = [];

      if (team2IsSoloMode) {
        disabled.push(
          PlayerPosition.DEFENSE,
          PlayerPosition.ATTACK,
          PlayerPosition.MIXED,
        );
      } else {
        disabled.push(PlayerPosition.SOLO);
      }

      return disabled;
    }, [team2IsSoloMode]);

  const getDisabledOptionsForTeam2Player2 =
    useMemo((): PlayerPositionType[] => {
      const disabled: PlayerPositionType[] = [];

      if (team2IsSoloMode) {
        disabled.push(
          PlayerPosition.DEFENSE,
          PlayerPosition.ATTACK,
          PlayerPosition.MIXED,
        );
      } else {
        disabled.push(PlayerPosition.SOLO);
      }

      return disabled;
    }, [team2IsSoloMode]);

  const handleTeam1Player1PositionChange = (
    newPosition: PlayerPositionType,
  ) => {
    setTeam1Player1Position(newPosition);

    // Auto-set complementary position for teammate (only in team mode)
    if (team1Player2Id && newPosition !== PlayerPosition.SOLO) {
      if (newPosition === PlayerPosition.DEFENSE) {
        setTeam1Player2Position(PlayerPosition.ATTACK);
      } else if (newPosition === PlayerPosition.ATTACK) {
        setTeam1Player2Position(PlayerPosition.DEFENSE);
      } else if (newPosition === PlayerPosition.MIXED) {
        setTeam1Player2Position(PlayerPosition.MIXED);
      }
    }
  };

  const handleTeam1Player2PositionChange = (
    newPosition: PlayerPositionType,
  ) => {
    setTeam1Player2Position(newPosition);

    // Auto-set complementary position for teammate (only in team mode)
    if (team1Player2Id && newPosition !== PlayerPosition.SOLO) {
      if (newPosition === PlayerPosition.DEFENSE) {
        setTeam1Player1Position(PlayerPosition.ATTACK);
      } else if (newPosition === PlayerPosition.ATTACK) {
        setTeam1Player1Position(PlayerPosition.DEFENSE);
      } else if (newPosition === PlayerPosition.MIXED) {
        setTeam1Player1Position(PlayerPosition.MIXED);
      }
    }
  };

  const handleTeam2Player1PositionChange = (
    newPosition: PlayerPositionType,
  ) => {
    setTeam2Player1Position(newPosition);

    // Auto-set complementary position for teammate (only in team mode)
    if (team2Player2Id && newPosition !== PlayerPosition.SOLO) {
      if (newPosition === PlayerPosition.DEFENSE) {
        setTeam2Player2Position(PlayerPosition.ATTACK);
      } else if (newPosition === PlayerPosition.ATTACK) {
        setTeam2Player2Position(PlayerPosition.DEFENSE);
      } else if (newPosition === PlayerPosition.MIXED) {
        setTeam2Player2Position(PlayerPosition.MIXED);
      }
    }
  };

  const handleTeam2Player2PositionChange = (
    newPosition: PlayerPositionType,
  ) => {
    setTeam2Player2Position(newPosition);

    // Auto-set complementary position for teammate (only in team mode)
    if (team2Player2Id && newPosition !== PlayerPosition.SOLO) {
      if (newPosition === PlayerPosition.DEFENSE) {
        setTeam2Player1Position(PlayerPosition.ATTACK);
      } else if (newPosition === PlayerPosition.ATTACK) {
        setTeam2Player1Position(PlayerPosition.DEFENSE);
      } else if (newPosition === PlayerPosition.MIXED) {
        setTeam2Player1Position(PlayerPosition.MIXED);
      }
    }
  };

  const fetchPlayers = async () => {
    try {
      const data = await fetchApi<{ players: Player[] }>("/api/v1/players");
      setPlayers(data.players);
    } catch {
      setError("Failed to load players");
    }
  };

  const fetchTables = async () => {
    try {
      const data = await fetchApi<{ tables: Table[] }>("/api/v1/tables");
      setTables(data.tables);
    } catch {
      setError("Failed to load tables");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (positionValidationError) {
      setError(positionValidationError);
      return;
    }

    setLoading(true);

    try {
      const result = await fetchApi<{
        success: boolean;
        ratingChanges: Array<{
          displayName: string;
          oldRating: number;
          newRating: number;
          ratingChange: number;
          displayRating: number;
        }>;
        userWon?: boolean;
      }>("/api/v1/match/create", {
        method: "POST",
        body: JSON.stringify({
          team1Player1Id,
          team1Player2Id: team1Player2Id || null,
          team2Player1Id,
          team2Player2Id: team2Player2Id || null,
          team1Score,
          team2Score,
          tableId: tableId || undefined,
          isFriendly,
          ...(!team1IsSoloMode
            ? {
                team1Player1Position,
                team1Player2Position,
              }
            : {}),
          ...(!team2IsSoloMode
            ? {
                team2Player1Position,
                team2Player2Position,
              }
            : {}),
        }),
      });

      const changes = result.ratingChanges
        .map(
          (c) =>
            `${c.displayName}: ${formatRating(c.oldRating)} → ${formatRating(c.newRating)} (${c.ratingChange > 0 ? "+" : ""}${c.ratingChange.toFixed(2)})`,
        )
        .join(", ");

      setSuccess(`Match recorded! Rating changes: ${changes}`);
      setTeam1Player1Id("");
      setTeam1Player2Id("");
      setTeam2Player1Id("");
      setTeam2Player2Id("");
      setTeam1Score(0);
      setTeam2Score(0);

      // Trigger meme popup based on win/loss
      if (result.userWon !== undefined) {
        setTimeout(() => {
          triggerMeme(result.userWon ? "win" : "loss");
        }, 500);
      }

      setTimeout(() => {
        navigate("/");
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record match");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />

      <main className="max-w-4xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">
            Record Match
          </h2>

          {error && (
            <div className="rounded-md bg-red-50 p-4 mb-6">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          {success && (
            <div className="rounded-md bg-green-50 p-4 mb-6">
              <p className="text-sm text-green-800">{success}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="bg-white p-6 rounded-lg shadow">
              <div className="flex items-center space-x-2 mb-4">
                <input
                  type="checkbox"
                  id="isFriendly"
                  checked={isFriendly}
                  onChange={(e) => setIsFriendly(e.target.checked)}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <label
                  htmlFor="isFriendly"
                  className="text-sm font-medium text-gray-700"
                >
                  Friendly match (doesn't count for ranking)
                </label>
              </div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Table
              </label>
              <select
                value={tableId}
                onChange={(e) => {
                  const newTableId = e.target.value;
                  setTableId(newTableId);
                  setLastPickedTableId(newTableId || null);
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Select a table (optional)</option>
                {tables.map((table) => (
                  <option key={table.id} value={table.id}>
                    {table.brand} {table.model}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white p-6 rounded-lg shadow">
                <h3 className="text-lg font-semibold mb-4">Team 1</h3>
                <div className="space-y-4">
                  <PlayerSelect
                    players={players}
                    value={team1Player1Id}
                    onChange={setTeam1Player1Id}
                    required
                    label="Player 1 *"
                  />
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Position
                    </label>
                    <Tooltip
                      content={
                        team1IsSoloMode
                          ? "Solo position for 1v1 or 1v2 matches"
                          : "Defense plays back, Attack plays front. Both players can select Mixed if positions were switched during the game."
                      }
                    >
                      <PositionTabBar
                        value={team1Player1Position}
                        onChange={handleTeam1Player1PositionChange}
                        disabled={false}
                        disabledOptions={getDisabledOptionsForTeam1Player1}
                      />
                    </Tooltip>
                  </div>
                  <PlayerSelect
                    players={players}
                    value={team1Player2Id}
                    onChange={setTeam1Player2Id}
                    excludePlayerIds={[team1Player1Id]}
                    label="Player 2 (optional)"
                    placeholder="None (1v1 or 1v2)"
                  />
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Position
                    </label>
                    <Tooltip
                      content={
                        team1IsSoloMode
                          ? "Solo position for 1v1 or 1v2 matches"
                          : "Defense plays back, Attack plays front. Both players can select Mixed if positions were switched during the game."
                      }
                    >
                      <PositionTabBar
                        value={team1Player2Position}
                        onChange={handleTeam1Player2PositionChange}
                        disabled={!team1Player2Id}
                        disabledOptions={getDisabledOptionsForTeam1Player2}
                      />
                    </Tooltip>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Score *
                    </label>
                    <input
                      type="number"
                      required
                      min="0"
                      value={team1Score}
                      onChange={(e) =>
                        setTeam1Score(parseInt(e.target.value) || 0)
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>
              </div>

              <div className="bg-white p-6 rounded-lg shadow">
                <h3 className="text-lg font-semibold mb-4">Team 2</h3>
                <div className="space-y-4">
                  <PlayerSelect
                    players={players}
                    value={team2Player1Id}
                    onChange={setTeam2Player1Id}
                    excludePlayerIds={[team1Player1Id, team1Player2Id]}
                    required
                    label="Player 1 *"
                  />
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Position
                    </label>
                    <Tooltip
                      content={
                        team2IsSoloMode
                          ? "Solo position for 1v1 or 1v2 matches"
                          : "Defense plays back, Attack plays front. Both players can select Mixed if positions were switched during the game."
                      }
                    >
                      <PositionTabBar
                        value={team2Player1Position}
                        onChange={handleTeam2Player1PositionChange}
                        disabled={false}
                        disabledOptions={getDisabledOptionsForTeam2Player1}
                      />
                    </Tooltip>
                  </div>
                  <PlayerSelect
                    players={players}
                    value={team2Player2Id}
                    onChange={setTeam2Player2Id}
                    excludePlayerIds={[
                      team1Player1Id,
                      team1Player2Id,
                      team2Player1Id,
                    ]}
                    label="Player 2 (optional)"
                    placeholder="None (1v1 or 1v2)"
                  />
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Position
                    </label>
                    <Tooltip
                      content={
                        team2IsSoloMode
                          ? "Solo position for 1v1 or 1v2 matches"
                          : "Defense plays back, Attack plays front. Both players can select Mixed if positions were switched during the game."
                      }
                    >
                      <PositionTabBar
                        value={team2Player2Position}
                        onChange={handleTeam2Player2PositionChange}
                        disabled={!team2Player2Id}
                        disabledOptions={getDisabledOptionsForTeam2Player2}
                      />
                    </Tooltip>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Score *
                    </label>
                    <input
                      type="number"
                      required
                      min="0"
                      value={team2Score}
                      onChange={(e) =>
                        setTeam2Score(parseInt(e.target.value) || 0)
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-center space-x-4">
              <Link
                to="/"
                className="px-6 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 font-medium"
              >
                Cancel
              </Link>
              <button
                type="submit"
                disabled={loading}
                className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium disabled:bg-gray-400"
              >
                {loading ? "Recording..." : "Record Match"}
              </button>
            </div>
          </form>
        </div>
      </main>

      {meme && (
        <MemePopup isOpen={true} memeUrl={meme.url} onClose={closeMeme} />
      )}
    </div>
  );
}
