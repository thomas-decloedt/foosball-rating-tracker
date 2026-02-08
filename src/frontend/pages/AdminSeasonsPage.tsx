import { useEffect, useState } from "react";
import { AdminLayout } from "../components/AdminLayout";
import { ConfirmationModal } from "../components/ConfirmationModal";
import { SeasonIcon } from "../components/SeasonIcon";
import { fetchApi } from "../utils/fetch";

interface Season {
  id: string;
  name: string;
  startDate: string | Date;
  endDate: string | Date | null;
  isActive: boolean;
  createdAt: string | Date;
  icon: string | null;
}

export function AdminSeasonsPage() {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const [newSeasonName, setNewSeasonName] = useState("");
  const [newSeasonStartDate, setNewSeasonStartDate] = useState("");
  const [newSeasonIconFile, setNewSeasonIconFile] = useState<File | null>(null);
  const [newSeasonIconPreview, setNewSeasonIconPreview] = useState<
    string | null
  >(null);
  const [submitting, setSubmitting] = useState(false);

  const [showEndModal, setShowEndModal] = useState(false);
  const [seasonToEnd, setSeasonToEnd] = useState<string | null>(null);

  const [editingSeason, setEditingSeason] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editStartDate, setEditStartDate] = useState("");
  const [editIconFile, setEditIconFile] = useState<File | null>(null);
  const [editIconPreview, setEditIconPreview] = useState<string | null>(null);
  const [iconRemoved, setIconRemoved] = useState(false);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    fetchSeasons();
  }, []);

  const fetchSeasons = async () => {
    try {
      setLoading(true);
      setError("");
      const data = await fetchApi<{ seasons: Season[] }>("/api/v1/seasons");
      setSeasons(data.seasons);
    } catch (err) {
      setError("Failed to load seasons");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const convertFileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") {
          resolve(reader.result);
        } else {
          reject(new Error("Failed to convert file to base64"));
        }
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleIconFileSelect = (file: File | null, isEdit: boolean = false) => {
    if (!file) {
      if (isEdit) {
        setEditIconFile(null);
        setEditIconPreview(null);
      } else {
        setNewSeasonIconFile(null);
        setNewSeasonIconPreview(null);
      }
      return;
    }

    // Validate file size (2MB max)
    if (file.size > 2 * 1024 * 1024) {
      setError("File must be smaller than 2MB");
      return;
    }

    if (isEdit) {
      setEditIconFile(file);
      // Create preview for images/videos
      const reader = new FileReader();
      reader.onload = (e) => {
        if (e.target?.result) {
          setEditIconPreview(e.target.result as string);
        }
      };
      reader.readAsDataURL(file);
    } else {
      setNewSeasonIconFile(file);
      // Create preview for images/videos
      const reader = new FileReader();
      reader.onload = (e) => {
        if (e.target?.result) {
          setNewSeasonIconPreview(e.target.result as string);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCreateSeason = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSeasonName.trim()) return;

    try {
      setSubmitting(true);
      setError("");

      let iconBase64: string | undefined = undefined;
      if (newSeasonIconFile) {
        iconBase64 = await convertFileToBase64(newSeasonIconFile);
      }

      await fetchApi("/api/v1/admin/seasons", {
        method: "POST",
        body: JSON.stringify({
          name: newSeasonName,
          startDate: newSeasonStartDate || undefined,
          icon: iconBase64,
        }),
      });
      setSuccessMessage("Season created successfully!");
      setNewSeasonName("");
      setNewSeasonStartDate("");
      setNewSeasonIconFile(null);
      setNewSeasonIconPreview(null);
      await fetchSeasons();
      setTimeout(() => setSuccessMessage(""), 3000);
    } catch (err) {
      setError("Failed to create season");
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleEndClick = (seasonId: string) => {
    setSeasonToEnd(seasonId);
    setShowEndModal(true);
  };

  const confirmEndSeason = async () => {
    if (!seasonToEnd) return;

    try {
      setError("");
      await fetchApi(`/api/v1/admin/seasons/${seasonToEnd}/end`, {
        method: "POST",
      });
      setSuccessMessage("Season ended successfully");
      setShowEndModal(false);
      setSeasonToEnd(null);
      await fetchSeasons();
      setTimeout(() => setSuccessMessage(""), 3000);
    } catch (err) {
      setError("Failed to end season");
      console.error(err);
    }
  };

  const handleEditClick = (season: Season) => {
    setEditingSeason(season.id);
    setEditName(season.name);
    setEditStartDate(new Date(season.startDate).toISOString().slice(0, 16));
    setEditIconFile(null);
    setEditIconPreview(season.icon || null);
    setIconRemoved(false);
  };

  const handleCancelEdit = () => {
    setEditingSeason(null);
    setEditName("");
    setEditStartDate("");
    setEditIconFile(null);
    setEditIconPreview(null);
    setIconRemoved(false);
  };

  const handleSaveEdit = async (seasonId: string) => {
    try {
      setUpdating(true);
      setError("");

      let iconBase64: string | null | undefined = undefined;
      if (editIconFile) {
        // New file selected - upload it
        iconBase64 = await convertFileToBase64(editIconFile);
      } else if (iconRemoved) {
        // User explicitly removed the icon
        iconBase64 = null;
      }
      // If neither condition is true, iconBase64 stays undefined (no change)

      const updateBody: {
        name: string;
        startDate?: string;
        icon?: string | null;
      } = {
        name: editName,
      };
      if (editStartDate && editStartDate.trim() !== "") {
        updateBody.startDate = editStartDate;
      }
      if (iconBase64 !== undefined) {
        updateBody.icon = iconBase64;
      }
      await fetchApi(`/api/v1/admin/seasons/${seasonId}`, {
        method: "PATCH",
        body: JSON.stringify(updateBody),
      });
      setSuccessMessage("Season updated successfully");
      setEditingSeason(null);
      setEditIconFile(null);
      setEditIconPreview(null);
      setIconRemoved(false);
      await fetchSeasons();
      setTimeout(() => setSuccessMessage(""), 3000);
    } catch (err) {
      setError("Failed to update season");
      console.error(err);
    } finally {
      setUpdating(false);
    }
  };

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Season Management</h2>
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

      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h3 className="text-xl font-bold text-gray-900 mb-4">
          Create New Season
        </h3>
        <form onSubmit={handleCreateSeason} className="space-y-4">
          <div className="flex space-x-4">
            <input
              type="text"
              value={newSeasonName}
              onChange={(e) => setNewSeasonName(e.target.value)}
              placeholder="Season name (e.g., Spring 2026, Season 2)"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md"
              required
            />
            <input
              type="datetime-local"
              value={newSeasonStartDate}
              onChange={(e) => setNewSeasonStartDate(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md"
            />
            <button
              type="submit"
              disabled={submitting}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-medium disabled:opacity-50"
            >
              {submitting ? "Creating..." : "Create Season"}
            </button>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Season Icon (optional)
            </label>
            <input
              type="file"
              accept="*"
              onChange={(e) =>
                handleIconFileSelect(e.target.files?.[0] || null, false)
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            />
            {newSeasonIconPreview && (
              <div className="mt-2">
                {newSeasonIconPreview.startsWith("data:image/") ? (
                  <img
                    src={newSeasonIconPreview}
                    alt="Preview"
                    className="max-w-32 max-h-32 object-contain rounded"
                  />
                ) : newSeasonIconPreview.startsWith("data:video/") ? (
                  <video
                    src={newSeasonIconPreview}
                    className="max-w-32 max-h-32 rounded"
                    controls
                  />
                ) : (
                  <div className="text-sm text-gray-600">
                    File selected: {newSeasonIconFile?.name}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => handleIconFileSelect(null, false)}
                  className="mt-1 text-sm text-red-600 hover:text-red-800"
                >
                  Remove
                </button>
              </div>
            )}
            <p className="text-xs text-gray-500 mt-1">
              Upload any file type (image, gif, video, etc.). Max 2MB.
            </p>
          </div>
          <p className="text-sm text-gray-600">
            Start date is optional. If not provided, current date/time will be
            used.
          </p>
        </form>
        <p className="text-sm text-gray-600 mt-2">
          Creating a new season will end the current active season and reset
          player stats.
        </p>
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-xl font-bold text-gray-900 mb-4">All Seasons</h3>
        {loading ? (
          <div className="text-center py-8 text-gray-600">
            Loading seasons...
          </div>
        ) : seasons.length === 0 ? (
          <div className="text-center py-8 text-gray-600">
            No seasons yet. Create one above!
          </div>
        ) : (
          <div className="space-y-3">
            {seasons.map((season) => (
              <div
                key={season.id}
                className={`border rounded-lg p-4 ${season.isActive ? "border-green-300 bg-green-50" : "border-gray-200"}`}
              >
                {editingSeason === season.id ? (
                  <div className="space-y-4">
                    <div className="flex items-center space-x-2">
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-md font-semibold"
                      />
                      {season.isActive && (
                        <span className="px-2 py-1 bg-green-600 text-white text-xs font-medium rounded">
                          ACTIVE
                        </span>
                      )}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Start Date
                      </label>
                      <input
                        type="datetime-local"
                        value={editStartDate}
                        onChange={(e) => setEditStartDate(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Season Icon (optional)
                      </label>
                      <input
                        type="file"
                        accept="*"
                        onChange={(e) =>
                          handleIconFileSelect(
                            e.target.files?.[0] || null,
                            true,
                          )
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                      />
                      {editIconPreview && (
                        <div className="mt-2">
                          {editIconPreview.startsWith("data:image/") ||
                          editIconPreview.startsWith(
                            "/api/v1/season-icons/",
                          ) ? (
                            <img
                              src={editIconPreview}
                              alt="Preview"
                              className="max-w-32 max-h-32 object-contain rounded"
                            />
                          ) : editIconPreview.startsWith("data:video/") ? (
                            <video
                              src={editIconPreview}
                              className="max-w-32 max-h-32 rounded"
                              controls
                            />
                          ) : editIconPreview.startsWith(
                              "/api/v1/season-icons/",
                            ) ? (
                            <div className="text-sm text-gray-600">
                              Current icon: {editIconPreview}
                            </div>
                          ) : (
                            <div className="text-sm text-gray-600">
                              File selected:{" "}
                              {editIconFile?.name || "Current icon"}
                            </div>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              setEditIconFile(null);
                              setEditIconPreview(null);
                              setIconRemoved(true);
                            }}
                            className="mt-1 text-sm text-red-600 hover:text-red-800"
                          >
                            Remove
                          </button>
                        </div>
                      )}
                      <p className="text-xs text-gray-500 mt-1">
                        Upload any file type (image, gif, video, etc.). Max 2MB.
                        Leave empty to keep current icon, or remove to delete.
                      </p>
                    </div>
                    <div className="flex space-x-2">
                      <button
                        onClick={() => handleSaveEdit(season.id)}
                        disabled={updating}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-medium disabled:opacity-50"
                      >
                        {updating ? "Saving..." : "Save"}
                      </button>
                      <button
                        onClick={handleCancelEdit}
                        disabled={updating}
                        className="px-4 py-2 bg-gray-300 hover:bg-gray-400 text-gray-800 rounded-md font-medium disabled:opacity-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex justify-between items-center">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2">
                        {season.icon && (
                          <SeasonIcon icon={season.icon} size="sm" />
                        )}
                        <span className="text-lg font-semibold text-gray-900">
                          {season.name}
                        </span>
                        {season.isActive && (
                          <span className="px-2 py-1 bg-green-600 text-white text-xs font-medium rounded">
                            ACTIVE
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-gray-600 mt-1">
                        Started: {new Date(season.startDate).toLocaleString()}
                        {season.endDate &&
                          ` • Ended: ${new Date(season.endDate).toLocaleString()}`}
                      </div>
                    </div>
                    <div className="flex space-x-2">
                      {season.isActive && (
                        <>
                          <button
                            onClick={() => handleEditClick(season)}
                            className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-md font-medium text-sm"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleEndClick(season.id)}
                            className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-md font-medium text-sm"
                          >
                            End Season
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <ConfirmationModal
        isOpen={showEndModal}
        title="End Season"
        message="Are you sure you want to end this season? Player ratings will carry over, but season stats will be finalized."
        confirmText="End Season"
        cancelText="Cancel"
        onConfirm={confirmEndSeason}
        onCancel={() => {
          setShowEndModal(false);
          setSeasonToEnd(null);
        }}
        danger={true}
      />
    </AdminLayout>
  );
}
