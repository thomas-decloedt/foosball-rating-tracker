import { useEffect, useState } from "react";
import { AdminLayout } from "../components/AdminLayout";
import { ConfirmationModal } from "../components/ConfirmationModal";
import { Modal } from "../components/Modal";
import { PlayerLink } from "../components/PlayerLink";
import { usePreviousWinner } from "../hooks/usePreviousWinner";
import { fetchApi } from "../utils/fetch";

interface Match {
  id: string;
  team1Player1: { id: string; displayName: string };
  team1Player2: { id: string; displayName: string } | null;
  team2Player1: { id: string; displayName: string };
  team2Player2: { id: string; displayName: string } | null;
  team1Score: number;
  team2Score: number;
  matchType: "1v1" | "1v2" | "2v2";
  winningTeam: number;
  isDeleted: boolean;
  deletedAt: string | Date | null;
  createdAt: string | Date;
  seasonId: string | null;
}

interface Season {
  id: string;
  name: string;
  startDate: Date | string;
  endDate: Date | string | null;
  isActive: boolean;
}

type FilterType = "all" | "active" | "deleted" | "unassigned";

export function AdminDashboardPage() {
  const { previousWinnerId, hasGames } = usePreviousWinner();
  const [matches, setMatches] = useState<Match[]>([]);
  const [filteredMatches, setFilteredMatches] = useState<Match[]>([]);
  const [filter, setFilter] = useState<FilterType>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [matchToDelete, setMatchToDelete] = useState<string | null>(null);
  const [showRecalculateModal, setShowRecalculateModal] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [matchToEdit, setMatchToEdit] = useState<Match | null>(null);
  const [editTeam1Score, setEditTeam1Score] = useState(0);
  const [editTeam2Score, setEditTeam2Score] = useState(0);
  const [editing, setEditing] = useState(false);

  const [selectedMatchIds, setSelectedMatchIds] = useState<Set<string>>(
    new Set(),
  );
  const [showAssignSeasonModal, setShowAssignSeasonModal] = useState(false);
  const [targetSeasonId, setTargetSeasonId] = useState<string | null>(null);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [assigning, setAssigning] = useState(false);

  useEffect(() => {
    fetchMatches();
    fetchSeasons();
  }, []);

  useEffect(() => {
    applyFilter();
  }, [matches, filter]);

  const fetchMatches = async () => {
    try {
      setLoading(true);
      setError("");
      const data = await fetchApi<{ matches: Match[] }>(
        "/api/v1/matches?includeDeleted=true&limit=100",
      );
      setMatches(data.matches);
    } catch (err) {
      setError("Failed to load matches");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchSeasons = async () => {
    try {
      const data = await fetchApi<{ seasons: Season[] }>(
        "/api/v1/seasons?includeInactive=true",
      );
      setSeasons(data.seasons);
    } catch (err) {
      console.error("Failed to load seasons", err);
    }
  };

  const applyFilter = () => {
    if (filter === "all") {
      setFilteredMatches(matches);
    } else if (filter === "active") {
      setFilteredMatches(matches.filter((m) => !m.isDeleted));
    } else if (filter === "deleted") {
      setFilteredMatches(matches.filter((m) => m.isDeleted));
    } else if (filter === "unassigned") {
      setFilteredMatches(matches.filter((m) => !m.isDeleted && !m.seasonId));
    }
  };

  const handleDeleteClick = (matchId: string) => {
    setMatchToDelete(matchId);
    setShowDeleteModal(true);
  };

  const handleEditClick = (match: Match) => {
    setMatchToEdit(match);
    setEditTeam1Score(match.team1Score);
    setEditTeam2Score(match.team2Score);
    setShowEditModal(true);
  };

  const confirmEdit = async () => {
    if (!matchToEdit) return;

    try {
      setEditing(true);
      setError("");
      const data = await fetchApi<{
        success: boolean;
        summary: {
          matchesReplayed: number;
          playersUpdated: number;
          duration: number;
        };
      }>(`/api/v1/admin/match/${matchToEdit.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          team1Score: editTeam1Score,
          team2Score: editTeam2Score,
        }),
      });
      setSuccessMessage(
        `Match updated successfully! ${data.summary.playersUpdated} players updated, ${data.summary.matchesReplayed} matches replayed in ${(data.summary.duration / 1000).toFixed(2)}s`,
      );
      setShowEditModal(false);
      setMatchToEdit(null);
      await fetchMatches();
      setTimeout(() => setSuccessMessage(""), 5000);
    } catch (err) {
      setError("Failed to update match");
      console.error(err);
      // Close modal even on error to prevent grey screen
      setShowEditModal(false);
      setMatchToEdit(null);
    } finally {
      setEditing(false);
    }
  };

  const confirmDelete = async () => {
    if (!matchToDelete) return;

    try {
      setError("");
      await fetchApi(`/api/v1/admin/match/${matchToDelete}`, {
        method: "DELETE",
      });
      setSuccessMessage("Match deleted successfully");
      setShowDeleteModal(false);
      setMatchToDelete(null);
      await fetchMatches();
      setTimeout(() => setSuccessMessage(""), 3000);
    } catch (err) {
      setError("Failed to delete match");
      console.error(err);
    }
  };

  const handleRecalculateClick = () => {
    setShowRecalculateModal(true);
  };

  const confirmRecalculate = async () => {
    try {
      setRecalculating(true);
      setError("");
      const data = await fetchApi<{
        success: boolean;
        summary: {
          playersUpdated: number;
          matchesReplayed: number;
          duration: number;
        };
      }>("/api/v1/admin/recalculate-ratings", {
        method: "POST",
      });
      setSuccessMessage(
        `Ratings recalculated successfully! ${data.summary.playersUpdated} players updated, ${data.summary.matchesReplayed} matches replayed in ${(data.summary.duration / 1000).toFixed(2)}s`,
      );
      setShowRecalculateModal(false);
      await fetchMatches();
      setTimeout(() => setSuccessMessage(""), 5000);
    } catch (err) {
      setError("Failed to recalculate ratings");
      console.error(err);
      // Close modal even on error to prevent grey screen
      setShowRecalculateModal(false);
    } finally {
      setRecalculating(false);
    }
  };

  const handleToggleMatch = (matchId: string) => {
    const newSelection = new Set(selectedMatchIds);
    if (newSelection.has(matchId)) {
      newSelection.delete(matchId);
    } else {
      newSelection.add(matchId);
    }
    setSelectedMatchIds(newSelection);
  };

  const handleSelectAll = () => {
    if (selectedMatchIds.size === filteredMatches.length) {
      setSelectedMatchIds(new Set());
    } else {
      setSelectedMatchIds(new Set(filteredMatches.map((m) => m.id)));
    }
  };

  const confirmAssignSeason = async () => {
    try {
      setAssigning(true);
      setError("");
      const data = await fetchApi<{
        success: boolean;
        summary: {
          matchesUpdated: number;
          seasonsAffected: string[];
          playersAffected: number;
          duration: number;
        };
      }>("/api/v1/admin/matches/assign-season", {
        method: "POST",
        body: JSON.stringify({
          matchIds: Array.from(selectedMatchIds),
          seasonId: targetSeasonId,
        }),
      });
      setSuccessMessage(
        `Successfully assigned ${data.summary.matchesUpdated} match${data.summary.matchesUpdated !== 1 ? "es" : ""}! ${data.summary.playersAffected} players updated across ${data.summary.seasonsAffected.length} season(s) in ${(data.summary.duration / 1000).toFixed(2)}s`,
      );
      setShowAssignSeasonModal(false);
      setTargetSeasonId(null);
      setSelectedMatchIds(new Set());
      await fetchMatches();
      setTimeout(() => setSuccessMessage(""), 5000);
    } catch (err) {
      setError("Failed to assign matches to season");
      console.error(err);
      setShowAssignSeasonModal(false);
    } finally {
      setAssigning(false);
    }
  };

  const getSeasonName = (seasonId: string) => {
    return seasons.find((s) => s.id === seasonId)?.name ?? "Unknown";
  };

  const formatTeam = (
    player1: { id: string; displayName: string },
    player2: { id: string; displayName: string } | null,
  ) => {
    if (player2) {
      return (
        <>
          <PlayerLink
            playerId={player1.id}
            displayName={player1.displayName}
            showCrown={hasGames && player1.id === previousWinnerId}
          />
          {" & "}
          <PlayerLink
            playerId={player2.id}
            displayName={player2.displayName}
            showCrown={hasGames && player2.id === previousWinnerId}
          />
        </>
      );
    }
    return (
      <PlayerLink
        playerId={player1.id}
        displayName={player1.displayName}
        showCrown={hasGames && player1.id === previousWinnerId}
      />
    );
  };

  const stats = {
    total: matches.length,
    active: matches.filter((m) => !m.isDeleted).length,
    deleted: matches.filter((m) => m.isDeleted).length,
  };

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Admin Dashboard</h2>
      </div>

      {successMessage && (
        <div className="mb-6 bg-green-50 border border-green-200 rounded-lg p-4 text-green-700">
          {successMessage}
        </div>
      )}

      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-3xl font-bold text-gray-900">{stats.total}</div>
          <div className="text-sm text-gray-600">Total Matches</div>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-3xl font-bold text-green-600">
            {stats.active}
          </div>
          <div className="text-sm text-gray-600">Active Matches</div>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-3xl font-bold text-red-600">{stats.deleted}</div>
          <div className="text-sm text-gray-600">Deleted Matches</div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h3 className="text-xl font-bold text-gray-900 mb-4">
          Rating Recalculation
        </h3>
        <p className="text-sm text-gray-600 mb-4">
          Recalculate all player ratings (general, solo, attack, and defense)
          from scratch by replaying all matches in chronological order using the
          OpenSkill algorithm. This will reset all player stats and replay every
          non-deleted match.
        </p>
        <button
          onClick={handleRecalculateClick}
          disabled={recalculating}
          className="px-6 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-md font-medium disabled:opacity-50"
        >
          {recalculating ? "Recalculating..." : "Recalculate All Ratings"}
        </button>
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-bold text-gray-900">Match Management</h3>
          <div className="flex space-x-2">
            <button
              onClick={() => setFilter("all")}
              className={`px-4 py-2 rounded-md text-sm font-medium ${
                filter === "all"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-200 text-gray-700 hover:bg-gray-300"
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilter("active")}
              className={`px-4 py-2 rounded-md text-sm font-medium ${
                filter === "active"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-200 text-gray-700 hover:bg-gray-300"
              }`}
            >
              Active
            </button>
            <button
              onClick={() => setFilter("deleted")}
              className={`px-4 py-2 rounded-md text-sm font-medium ${
                filter === "deleted"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-200 text-gray-700 hover:bg-gray-300"
              }`}
            >
              Deleted
            </button>
            <button
              onClick={() => setFilter("unassigned")}
              className={`px-4 py-2 rounded-md text-sm font-medium ${
                filter === "unassigned"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-200 text-gray-700 hover:bg-gray-300"
              }`}
            >
              Unassigned
            </button>
          </div>
        </div>

        {selectedMatchIds.size > 0 && (
          <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <span className="font-medium text-blue-900">
                {selectedMatchIds.size} match
                {selectedMatchIds.size !== 1 ? "es" : ""} selected
              </span>
              <button
                onClick={() => setSelectedMatchIds(new Set())}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                Clear selection
              </button>
            </div>
            <button
              onClick={() => setShowAssignSeasonModal(true)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-medium"
            >
              Assign to Season
            </button>
          </div>
        )}

        {loading ? (
          <div className="text-center py-8 text-gray-600">
            Loading matches...
          </div>
        ) : filteredMatches.length === 0 ? (
          <div className="text-center py-8 text-gray-600">No matches found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 w-12">
                    <input
                      type="checkbox"
                      checked={
                        selectedMatchIds.size === filteredMatches.length &&
                        filteredMatches.length > 0
                      }
                      onChange={handleSelectAll}
                      className="rounded border-gray-300"
                    />
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Match
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Score
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Season
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredMatches.map((match) => (
                  <tr
                    key={match.id}
                    className={match.isDeleted ? "bg-red-50" : ""}
                  >
                    <td className="px-4 py-4">
                      <input
                        type="checkbox"
                        checked={selectedMatchIds.has(match.id)}
                        onChange={() => handleToggleMatch(match.id)}
                        className="rounded border-gray-300"
                      />
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <div className="mb-1">
                        <span
                          className={
                            match.winningTeam === 1 ? "font-semibold" : ""
                          }
                        >
                          {formatTeam(match.team1Player1, match.team1Player2)}
                        </span>
                      </div>
                      <div className="text-gray-500">vs</div>
                      <div className="mt-1">
                        <span
                          className={
                            match.winningTeam === 2 ? "font-semibold" : ""
                          }
                        >
                          {formatTeam(match.team2Player1, match.team2Player2)}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm font-bold">
                      {match.team1Score} - {match.team2Score}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs font-medium rounded">
                        {match.matchType}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {new Date(match.createdAt).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      {match.seasonId ? (
                        <span className="px-2 py-1 bg-purple-100 text-purple-800 text-xs font-medium rounded">
                          {getSeasonName(match.seasonId)}
                        </span>
                      ) : (
                        <span className="text-gray-400 italic">Unassigned</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      {match.isDeleted ? (
                        <div>
                          <span className="px-2 py-1 bg-red-100 text-red-800 text-xs font-medium rounded">
                            DELETED
                          </span>
                          {match.deletedAt && (
                            <div className="text-xs text-gray-500 mt-1">
                              {new Date(match.deletedAt).toLocaleString()}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="px-2 py-1 bg-green-100 text-green-800 text-xs font-medium rounded">
                          ACTIVE
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      {!match.isDeleted && (
                        <div className="flex space-x-3">
                          <button
                            onClick={() => handleEditClick(match)}
                            className="text-blue-600 hover:text-blue-800 font-medium"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeleteClick(match.id)}
                            className="text-red-600 hover:text-red-800 font-medium"
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ConfirmationModal
        isOpen={showDeleteModal}
        title="Delete Match"
        message="Are you sure you want to delete this match? This will mark the match as deleted but not recalculate ratings."
        confirmText="Delete"
        cancelText="Cancel"
        onConfirm={confirmDelete}
        onCancel={() => {
          setShowDeleteModal(false);
          setMatchToDelete(null);
        }}
        danger={true}
      />

      <ConfirmationModal
        isOpen={showRecalculateModal}
        title="Recalculate Ratings"
        message="This will reset all player ratings (general, solo, attack, and defense) to default values (μ=25, σ=8.333) and replay all non-deleted matches in chronological order using the OpenSkill algorithm. This operation cannot be undone. Are you sure?"
        confirmText="Recalculate"
        cancelText="Cancel"
        onConfirm={confirmRecalculate}
        onCancel={() => setShowRecalculateModal(false)}
        danger={true}
      />

      <Modal
        isOpen={showEditModal && matchToEdit !== null}
        onClose={() => {
          setShowEditModal(false);
          setMatchToEdit(null);
        }}
      >
        {matchToEdit && (
          <>
            <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
              <h3 className="text-xl font-bold text-gray-900 mb-4">
                Edit Match Scores
              </h3>
              <div className="mb-4">
                <div className="mb-2">
                  <span className="font-semibold">Team 1:</span>{" "}
                  {matchToEdit.team1Player1.displayName}
                  {matchToEdit.team1Player2 &&
                    ` & ${matchToEdit.team1Player2.displayName}`}
                </div>
                <div className="mb-4">
                  <span className="font-semibold">Team 2:</span>{" "}
                  {matchToEdit.team2Player1.displayName}
                  {matchToEdit.team2Player2 &&
                    ` & ${matchToEdit.team2Player2.displayName}`}
                </div>
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Team 1 Score
                </label>
                <input
                  type="number"
                  min="0"
                  value={editTeam1Score}
                  onChange={(e) =>
                    setEditTeam1Score(parseInt(e.target.value) || 0)
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Team 2 Score
                </label>
                <input
                  type="number"
                  min="0"
                  value={editTeam2Score}
                  onChange={(e) =>
                    setEditTeam2Score(parseInt(e.target.value) || 0)
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md text-sm text-yellow-800">
                <strong>Warning:</strong> Changing match scores will
                automatically recalculate all ratings from this match forward.
                This may take a few moments.
              </div>
            </div>
            <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
              <button
                onClick={confirmEdit}
                disabled={editing}
                className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 text-base font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 sm:ml-3 sm:w-auto sm:text-sm"
              >
                {editing ? "Updating..." : "Update Match"}
              </button>
              <button
                onClick={() => {
                  setShowEditModal(false);
                  setMatchToEdit(null);
                }}
                disabled={editing}
                className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 sm:mt-0 sm:w-auto sm:text-sm"
              >
                Cancel
              </button>
            </div>
          </>
        )}
      </Modal>

      <Modal
        isOpen={showAssignSeasonModal}
        onClose={() => {
          setShowAssignSeasonModal(false);
          setTargetSeasonId(null);
        }}
      >
        <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
          <h3 className="text-xl font-bold text-gray-900 mb-4">
            Assign Matches to Season
          </h3>
          <p className="text-sm text-gray-600 mb-4">
            Select a season to assign {selectedMatchIds.size} selected match
            {selectedMatchIds.size !== 1 ? "es" : ""} to. Season stats will be
            automatically recalculated.
          </p>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Target Season
            </label>
            <select
              value={targetSeasonId ?? ""}
              onChange={(e) => setTargetSeasonId(e.target.value || null)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Unassign (remove from season)</option>
              {seasons
                .filter((s) => s.isActive || !s.endDate)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} {s.isActive ? "(Active)" : ""}
                  </option>
                ))}
            </select>
          </div>
          <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md text-sm text-yellow-800">
            <strong>Warning:</strong> This will recalculate season stats for all
            affected players. This operation may take a few moments.
          </div>
        </div>
        <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
          <button
            onClick={confirmAssignSeason}
            disabled={assigning}
            className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 text-base font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 sm:ml-3 sm:w-auto sm:text-sm"
          >
            {assigning ? "Assigning..." : "Assign to Season"}
          </button>
          <button
            onClick={() => {
              setShowAssignSeasonModal(false);
              setTargetSeasonId(null);
            }}
            disabled={assigning}
            className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 sm:mt-0 sm:w-auto sm:text-sm"
          >
            Cancel
          </button>
        </div>
      </Modal>
    </AdminLayout>
  );
}
