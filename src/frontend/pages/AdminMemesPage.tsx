import { useEffect, useState } from "react";
import { AdminLayout } from "../components/AdminLayout";
import { ConfirmationModal } from "../components/ConfirmationModal";
import { fetchApi } from "../utils/fetch";

interface Meme {
  id: string;
  type: "gif" | "image";
  url: string;
  isActive: boolean;
  createdAt: string | Date;
}

export function AdminMemesPage() {
  const [memes, setMemes] = useState<Meme[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const [newMemeType, setNewMemeType] = useState<"gif" | "image">("gif");
  const [newMemeUrl, setNewMemeUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [memeToDelete, setMemeToDelete] = useState<string | null>(null);

  useEffect(() => {
    fetchMemes();
  }, []);

  const fetchMemes = async () => {
    try {
      setLoading(true);
      setError("");
      const data = await fetchApi<{ memes: Meme[] }>(
        "/api/v1/memes?activeOnly=false",
      );
      setMemes(data.memes);
    } catch (err) {
      setError("Failed to load memes");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemeUrl.trim()) return;

    try {
      setSubmitting(true);
      setError("");
      await fetchApi("/api/v1/admin/memes", {
        method: "POST",
        body: JSON.stringify({
          type: newMemeType,
          url: newMemeUrl,
        }),
      });
      setSuccessMessage("Meme added successfully!");
      setNewMemeUrl("");
      await fetchMemes();
      setTimeout(() => setSuccessMessage(""), 3000);
    } catch (err) {
      setError("Failed to add meme");
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = async (memeId: string, currentStatus: boolean) => {
    try {
      setError("");
      await fetchApi(`/api/v1/admin/memes/${memeId}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !currentStatus }),
      });
      await fetchMemes();
    } catch (err) {
      setError("Failed to update meme");
      console.error(err);
    }
  };

  const handleDeleteClick = (memeId: string) => {
    setMemeToDelete(memeId);
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!memeToDelete) return;

    try {
      setError("");
      await fetchApi(`/api/v1/admin/memes/${memeToDelete}`, {
        method: "DELETE",
      });
      setSuccessMessage("Meme deleted successfully");
      setShowDeleteModal(false);
      setMemeToDelete(null);
      await fetchMemes();
      setTimeout(() => setSuccessMessage(""), 3000);
    } catch (err) {
      setError("Failed to delete meme");
      console.error(err);
    }
  };

  const stats = {
    total: memes.length,
    active: memes.filter((m) => m.isActive).length,
  };

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Meme Management</h2>
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-3xl font-bold text-gray-900">{stats.total}</div>
          <div className="text-sm text-gray-600">Total Memes</div>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-3xl font-bold text-green-600">
            {stats.active}
          </div>
          <div className="text-sm text-gray-600">Active Memes</div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h3 className="text-xl font-bold text-gray-900 mb-4">Add New Meme</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Type
              </label>
              <select
                value={newMemeType}
                onChange={(e) =>
                  setNewMemeType(e.target.value as "gif" | "image")
                }
                className="w-full border border-gray-300 rounded-md p-2"
              >
                <option value="gif">GIF</option>
                <option value="image">Image</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                URL
              </label>
              <div className="flex space-x-2">
                <input
                  type="url"
                  value={newMemeUrl}
                  onChange={(e) => setNewMemeUrl(e.target.value)}
                  placeholder="https://example.com/meme.gif"
                  className="flex-1 border border-gray-300 rounded-md p-2"
                  required
                />
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-medium disabled:opacity-50"
                >
                  {submitting ? "Adding..." : "Add Meme"}
                </button>
              </div>
            </div>
          </div>
        </form>
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-xl font-bold text-gray-900 mb-4">Meme Library</h3>
        {loading ? (
          <div className="text-center py-8 text-gray-600">Loading memes...</div>
        ) : memes.length === 0 ? (
          <div className="text-center py-8 text-gray-600">
            No memes yet. Add one above!
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {memes.map((meme) => (
              <div
                key={meme.id}
                className={`border-2 rounded-lg p-3 ${
                  meme.isActive
                    ? "border-green-300"
                    : "border-gray-300 opacity-50"
                }`}
              >
                <img
                  src={meme.url}
                  alt="meme"
                  className="w-full h-32 object-cover rounded mb-2"
                />
                <div className="flex flex-col space-y-2">
                  <span className="text-xs text-gray-500 uppercase">
                    {meme.type}
                  </span>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => handleToggleActive(meme.id, meme.isActive)}
                      className={`flex-1 text-xs py-1 px-2 rounded ${
                        meme.isActive
                          ? "bg-yellow-100 text-yellow-800 hover:bg-yellow-200"
                          : "bg-green-100 text-green-800 hover:bg-green-200"
                      }`}
                    >
                      {meme.isActive ? "Deactivate" : "Activate"}
                    </button>
                    <button
                      onClick={() => handleDeleteClick(meme.id)}
                      className="flex-1 text-xs py-1 px-2 rounded bg-red-100 text-red-800 hover:bg-red-200"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <ConfirmationModal
        isOpen={showDeleteModal}
        title="Delete Meme"
        message="Are you sure you want to permanently delete this meme?"
        confirmText="Delete"
        cancelText="Cancel"
        onConfirm={confirmDelete}
        onCancel={() => {
          setShowDeleteModal(false);
          setMemeToDelete(null);
        }}
        danger={true}
      />
    </AdminLayout>
  );
}
