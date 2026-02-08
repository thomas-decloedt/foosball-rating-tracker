import { useEffect, useState } from "react";
import { AdminLayout } from "../components/AdminLayout";
import { ConfirmationModal } from "../components/ConfirmationModal";
import { fetchApi } from "../utils/fetch";

interface Table {
  id: string;
  brand: string;
  model: string;
  notes: string | null;
  createdAt: string | Date;
  createdBy?: {
    id: string;
    name: string;
  } | null;
  usageCount?: number;
}

export function AdminTablesPage() {
  const [tables, setTables] = useState<Table[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const [newBrand, setNewBrand] = useState("");
  const [newModel, setNewModel] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [editingTable, setEditingTable] = useState<string | null>(null);
  const [editBrand, setEditBrand] = useState("");
  const [editModel, setEditModel] = useState("");
  const [editNotes, setEditNotes] = useState("");

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [tableToDelete, setTableToDelete] = useState<string | null>(null);

  useEffect(() => {
    fetchTables();
  }, []);

  const fetchTables = async () => {
    try {
      setLoading(true);
      setError("");
      const data = await fetchApi<{ tables: Table[] }>("/api/v1/admin/tables");
      setTables(data.tables);
    } catch (err) {
      setError("Failed to load tables");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBrand.trim() || !newModel.trim()) return;

    try {
      setSubmitting(true);
      setError("");
      await fetchApi("/api/v1/admin/tables", {
        method: "POST",
        body: JSON.stringify({
          brand: newBrand.trim(),
          model: newModel.trim(),
          notes: newNotes.trim() || undefined,
        }),
      });
      setSuccessMessage("Table added successfully!");
      setNewBrand("");
      setNewModel("");
      setNewNotes("");
      await fetchTables();
      setTimeout(() => setSuccessMessage(""), 3000);
    } catch (err) {
      setError("Failed to add table");
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditClick = (table: Table) => {
    setEditingTable(table.id);
    setEditBrand(table.brand);
    setEditModel(table.model);
    setEditNotes(table.notes || "");
  };

  const handleCancelEdit = () => {
    setEditingTable(null);
    setEditBrand("");
    setEditModel("");
    setEditNotes("");
  };

  const handleSaveEdit = async (tableId: string) => {
    try {
      setError("");
      await fetchApi(`/api/v1/admin/tables/${tableId}`, {
        method: "PUT",
        body: JSON.stringify({
          brand: editBrand.trim(),
          model: editModel.trim(),
          notes: editNotes.trim() || undefined,
        }),
      });
      setSuccessMessage("Table updated successfully!");
      setEditingTable(null);
      await fetchTables();
      setTimeout(() => setSuccessMessage(""), 3000);
    } catch (err) {
      setError("Failed to update table");
      console.error(err);
    }
  };

  const handleDeleteClick = (tableId: string) => {
    setTableToDelete(tableId);
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!tableToDelete) return;

    try {
      setError("");
      const result = await fetchApi<{
        success: boolean;
        message: string;
        matchesUpdated: number;
      }>(`/api/v1/admin/tables/${tableToDelete}`, {
        method: "DELETE",
      });
      setSuccessMessage(
        `Table deleted successfully${result.matchesUpdated > 0 ? ` (${result.matchesUpdated} match${result.matchesUpdated === 1 ? "" : "es"} updated)` : ""}`,
      );
      setShowDeleteModal(false);
      setTableToDelete(null);
      await fetchTables();
      setTimeout(() => setSuccessMessage(""), 3000);
    } catch (err) {
      setError("Failed to delete table");
      console.error(err);
    }
  };

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Table Management</h2>
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
        <div className="text-3xl font-bold text-gray-900 mb-2">
          {tables.length}
        </div>
        <div className="text-sm text-gray-600">Total Tables</div>
      </div>

      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h3 className="text-xl font-bold text-gray-900 mb-4">Add New Table</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Brand *
              </label>
              <input
                type="text"
                value={newBrand}
                onChange={(e) => setNewBrand(e.target.value)}
                placeholder="e.g., Garlando, Jupiter"
                className="w-full border border-gray-300 rounded-md p-2"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Model *
              </label>
              <input
                type="text"
                value={newModel}
                onChange={(e) => setNewModel(e.target.value)}
                placeholder="e.g., G-500 Evolution, GoldStar"
                className="w-full border border-gray-300 rounded-md p-2"
                required
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Notes (optional)
            </label>
            <textarea
              value={newNotes}
              onChange={(e) => setNewNotes(e.target.value)}
              placeholder="Optional long-form description..."
              rows={3}
              className="w-full border border-gray-300 rounded-md p-2"
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-medium disabled:opacity-50"
          >
            {submitting ? "Adding..." : "Add Table"}
          </button>
        </form>
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-xl font-bold text-gray-900 mb-4">All Tables</h3>
        {loading ? (
          <div className="text-center py-8 text-gray-600">
            Loading tables...
          </div>
        ) : tables.length === 0 ? (
          <div className="text-center py-8 text-gray-600">
            No tables yet. Add one above!
          </div>
        ) : (
          <div className="space-y-4">
            {tables.map((table) => (
              <div
                key={table.id}
                className="border border-gray-200 rounded-lg p-4"
              >
                {editingTable === table.id ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Brand *
                        </label>
                        <input
                          type="text"
                          value={editBrand}
                          onChange={(e) => setEditBrand(e.target.value)}
                          className="w-full border border-gray-300 rounded-md p-2"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Model *
                        </label>
                        <input
                          type="text"
                          value={editModel}
                          onChange={(e) => setEditModel(e.target.value)}
                          className="w-full border border-gray-300 rounded-md p-2"
                          required
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Notes (optional)
                      </label>
                      <textarea
                        value={editNotes}
                        onChange={(e) => setEditNotes(e.target.value)}
                        rows={3}
                        className="w-full border border-gray-300 rounded-md p-2"
                      />
                    </div>
                    <div className="flex space-x-2">
                      <button
                        onClick={() => handleSaveEdit(table.id)}
                        className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md font-medium"
                      >
                        Save
                      </button>
                      <button
                        onClick={handleCancelEdit}
                        className="px-4 py-2 bg-gray-300 hover:bg-gray-400 text-gray-800 rounded-md font-medium"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <div className="text-lg font-semibold text-gray-900">
                          {table.brand} {table.model}
                        </div>
                        {table.notes && (
                          <div className="text-sm text-gray-600 mt-1">
                            {table.notes}
                          </div>
                        )}
                        <div className="text-xs text-gray-500 mt-2">
                          Created:{" "}
                          {new Date(table.createdAt).toLocaleDateString()}
                          {table.createdBy && ` by ${table.createdBy.name}`}
                          {table.usageCount !== undefined &&
                            ` • Used in ${table.usageCount} match${table.usageCount === 1 ? "" : "es"}`}
                        </div>
                      </div>
                      <div className="flex space-x-2">
                        <button
                          onClick={() => handleEditClick(table)}
                          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-medium text-sm"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeleteClick(table.id)}
                          className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md font-medium text-sm"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <ConfirmationModal
        isOpen={showDeleteModal}
        title="Delete Table"
        message="Are you sure you want to delete this table? If it's used in any matches, those matches will have their table reference removed."
        confirmText="Delete"
        cancelText="Cancel"
        onConfirm={confirmDelete}
        onCancel={() => {
          setShowDeleteModal(false);
          setTableToDelete(null);
        }}
        danger={true}
      />
    </AdminLayout>
  );
}
