import { useEffect, useState } from "react";
import { AdminLayout } from "../components/AdminLayout";
import { ConfirmationModal } from "../components/ConfirmationModal";
import { fetchApi } from "../utils/fetch";
import { formatRating } from "../utils/rating";

interface Invitation {
  id: string;
  email: string;
  status: "pending" | "accepted" | "expired";
  invitedBy: {
    id: string;
    name: string;
  } | null;
  createdAt: string | Date;
  expiresAt: string | Date;
  acceptedAt: string | Date | null;
}

interface User {
  id: string;
  email: string;
  name: string;
  isAdmin: boolean;
  createdAt: string | Date;
  player: {
    id: string;
    displayName: string;
    displayRating: number;
    gamesPlayed: number;
  } | null;
  canDelete: boolean;
  constraintCounts: {
    matches: number;
    seasons: number;
    memes: number;
    invitations: number;
  };
}

type TabType = "users" | "invitations";

export function AdminUsersPage() {
  const [activeTab, setActiveTab] = useState<TabType>("users");

  // Invitations state
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [invitationsLoading, setInvitationsLoading] = useState(true);

  // Users state
  const [users, setUsers] = useState<User[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);

  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [resetPasswordUrl, setResetPasswordUrl] = useState<string | null>(null);
  const [resetPasswordForUser, setResetPasswordForUser] = useState<
    string | null
  >(null);

  const [newInviteEmail, setNewInviteEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [showRevokeModal, setShowRevokeModal] = useState(false);
  const [invitationToRevoke, setInvitationToRevoke] = useState<string | null>(
    null,
  );

  const [showDeleteUserModal, setShowDeleteUserModal] = useState(false);
  const [userToDelete, setUserToDelete] = useState<string | null>(null);

  useEffect(() => {
    if (activeTab === "invitations") {
      fetchInvitations();
    } else {
      fetchUsers();
    }
  }, [activeTab]);

  const fetchInvitations = async () => {
    try {
      setInvitationsLoading(true);
      setError("");
      const data = await fetchApi<{ invitations: Invitation[] }>(
        "/api/v1/admin/invites",
      );
      setInvitations(data.invitations);
    } catch (err) {
      setError("Failed to load invitations");
      console.error(err);
    } finally {
      setInvitationsLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
      setUsersLoading(true);
      setError("");
      const data = await fetchApi<{ users: User[] }>("/api/v1/admin/users");
      setUsers(data.users);
    } catch (err) {
      setError("Failed to load users");
      console.error(err);
    } finally {
      setUsersLoading(false);
    }
  };

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newInviteEmail.trim()) return;

    try {
      setSubmitting(true);
      setError("");
      setInviteLink(null);
      setResetPasswordUrl(null);
      setResetPasswordForUser(null);
      const response = await fetchApi<{
        invitation: any;
        inviteUrl: string;
        emailSent: boolean;
      }>("/api/v1/admin/invites", {
        method: "POST",
        body: JSON.stringify({
          email: newInviteEmail,
        }),
      });

      if (response.emailSent) {
        setSuccessMessage("Invitation email sent successfully!");
      } else {
        setSuccessMessage(
          "Invitation created! Email couldn't be sent - share the link below with the user.",
        );
        setInviteLink(response.inviteUrl);
      }

      setNewInviteEmail("");
      if (activeTab === "invitations") {
        await fetchInvitations();
      }
      setTimeout(() => {
        setSuccessMessage("");
        setInviteLink(null);
      }, 30000); // Keep link visible for 30 seconds
    } catch (err: any) {
      const errorMsg =
        err?.data?.error || err?.message || "Failed to send invitation";
      setError(errorMsg);
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleRevokeClick = (invitationId: string) => {
    setInvitationToRevoke(invitationId);
    setShowRevokeModal(true);
  };

  const confirmRevoke = async () => {
    if (!invitationToRevoke) return;

    try {
      setError("");
      await fetchApi(`/api/v1/admin/invites/${invitationToRevoke}`, {
        method: "DELETE",
      });
      setSuccessMessage("Invitation revoked successfully");
      setShowRevokeModal(false);
      setInvitationToRevoke(null);
      await fetchInvitations();
      setTimeout(() => setSuccessMessage(""), 3000);
    } catch (err) {
      setError("Failed to revoke invitation");
      console.error(err);
    }
  };

  const handleDeleteUserClick = (userId: string) => {
    setUserToDelete(userId);
    setShowDeleteUserModal(true);
  };

  const confirmDeleteUser = async () => {
    if (!userToDelete) return;

    try {
      setError("");
      await fetchApi(`/api/v1/admin/users/${userToDelete}`, {
        method: "DELETE",
      });
      setSuccessMessage("User deleted successfully");
      setShowDeleteUserModal(false);
      setUserToDelete(null);
      await fetchUsers();
      setTimeout(() => setSuccessMessage(""), 3000);
    } catch (err: unknown) {
      const errObj = err as { data?: { error?: string }; message?: string };
      const errorMsg =
        errObj?.data?.error || errObj?.message || "Failed to delete user";
      setError(errorMsg);
      console.error(err);
    }
  };

  const handleResetPassword = async (user: User) => {
    try {
      setError("");
      setInviteLink(null);
      setResetPasswordUrl(null);
      setResetPasswordForUser(null);
      const response = await fetchApi<{ resetUrl: string }>(
        "/api/v1/admin/password-reset",
        {
          method: "POST",
          body: JSON.stringify({ userId: user.id }),
        },
      );
      setSuccessMessage(
        `Password reset link created for ${user.email}. Share the link below with the user.`,
      );
      setResetPasswordUrl(response.resetUrl);
      setResetPasswordForUser(user.email);
      setTimeout(() => {
        setSuccessMessage("");
        setResetPasswordUrl(null);
        setResetPasswordForUser(null);
      }, 30000);
    } catch (err: unknown) {
      const errObj = err as { data?: { error?: string }; message?: string };
      const errorMsg =
        errObj?.data?.error ||
        errObj?.message ||
        "Failed to create password reset link";
      setError(errorMsg);
      console.error(err);
    }
  };

  const stats = {
    total: invitations.length,
    pending: invitations.filter((inv) => inv.status === "pending").length,
    accepted: invitations.filter((inv) => inv.status === "accepted").length,
  };

  const getStatusBadge = (status: string) => {
    const styles = {
      pending: "bg-yellow-100 text-yellow-800",
      accepted: "bg-green-100 text-green-800",
      expired: "bg-gray-100 text-gray-800",
    };
    return (
      <span
        className={`px-2 py-1 text-xs font-medium rounded-full ${
          styles[status as keyof typeof styles] || styles.pending
        }`}
      >
        {status.toUpperCase()}
      </span>
    );
  };

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">User Management</h2>
      </div>

      {successMessage && (
        <div className="mb-6 bg-green-50 border border-green-200 rounded-lg p-4 text-green-700">
          {successMessage}
          {inviteLink && (
            <div className="mt-3 p-3 bg-white border border-green-300 rounded">
              <p className="text-sm font-medium text-gray-700 mb-2">
                Share this link with the user:
              </p>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={inviteLink}
                  readOnly
                  className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded bg-gray-50"
                  onClick={(e) => e.currentTarget.select()}
                />
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(inviteLink);
                    alert("Link copied to clipboard!");
                  }}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm rounded font-medium"
                >
                  Copy
                </button>
              </div>
            </div>
          )}
          {resetPasswordUrl && (
            <div className="mt-3 p-3 bg-white border border-green-300 rounded">
              <p className="text-sm font-medium text-gray-700 mb-2">
                {resetPasswordForUser
                  ? `Share this reset link with ${resetPasswordForUser}:`
                  : "Share this link with the user:"}
              </p>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={resetPasswordUrl}
                  readOnly
                  className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded bg-gray-50"
                  onClick={(e) => e.currentTarget.select()}
                />
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(resetPasswordUrl);
                    alert("Link copied to clipboard!");
                  }}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm rounded font-medium"
                >
                  Copy
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          {error}
        </div>
      )}

      {/* Tabs */}
      <div className="mb-6 border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab("users")}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === "users"
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            Users ({users.length})
          </button>
          <button
            onClick={() => setActiveTab("invitations")}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === "invitations"
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            Invitations ({stats.total})
          </button>
        </nav>
      </div>

      {activeTab === "invitations" && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-white rounded-lg shadow p-6">
              <div className="text-3xl font-bold text-gray-900">
                {stats.total}
              </div>
              <div className="text-sm text-gray-600">Total Invitations</div>
            </div>
            <div className="bg-white rounded-lg shadow p-6">
              <div className="text-3xl font-bold text-yellow-600">
                {stats.pending}
              </div>
              <div className="text-sm text-gray-600">Pending</div>
            </div>
            <div className="bg-white rounded-lg shadow p-6">
              <div className="text-3xl font-bold text-green-600">
                {stats.accepted}
              </div>
              <div className="text-sm text-gray-600">Accepted</div>
            </div>
          </div>
        </>
      )}

      {activeTab === "invitations" && (
        <>
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h3 className="text-xl font-bold text-gray-900 mb-4">
              Send Invitation
            </h3>
            <form onSubmit={handleSendInvite} className="flex space-x-4">
              <input
                type="email"
                value={newInviteEmail}
                onChange={(e) => setNewInviteEmail(e.target.value)}
                placeholder="user@example.com"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md"
                required
              />
              <button
                type="submit"
                disabled={submitting}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-medium disabled:opacity-50"
              >
                {submitting ? "Sending..." : "Send Invitation"}
              </button>
            </form>
            <p className="text-sm text-gray-600 mt-2">
              An email with a magic link will be sent to the user. The
              invitation will expire in 7 days.
            </p>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-xl font-bold text-gray-900 mb-4">
              Invitation History
            </h3>
            {invitationsLoading ? (
              <div className="text-center py-8 text-gray-600">
                Loading invitations...
              </div>
            ) : invitations.length === 0 ? (
              <div className="text-center py-8 text-gray-600">
                No invitations yet. Send one above!
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Email
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Sent Date
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Expires Date
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Invited By
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {invitations.map((invitation) => (
                      <tr key={invitation.id}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {invitation.email}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {getStatusBadge(invitation.status)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {new Date(invitation.createdAt).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {new Date(invitation.expiresAt).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {invitation.invitedBy?.name || "Unknown"}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          {invitation.status === "pending" && (
                            <button
                              onClick={() => handleRevokeClick(invitation.id)}
                              className="text-red-600 hover:text-red-900"
                            >
                              Revoke
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {activeTab === "users" && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-xl font-bold text-gray-900 mb-4">All Users</h3>
          {usersLoading ? (
            <div className="text-center py-8 text-gray-600">
              Loading users...
            </div>
          ) : users.length === 0 ? (
            <div className="text-center py-8 text-gray-600">
              No users found.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Email
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Player
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Role
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Created
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {users.map((user) => (
                    <tr key={user.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {user.name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {user.email}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {user.player ? (
                          <div>
                            <div>{user.player.displayName}</div>
                            <div className="text-xs text-gray-400">
                              Rating: {formatRating(user.player.displayRating)}{" "}
                              • Games: {user.player.gamesPlayed}
                            </div>
                          </div>
                        ) : (
                          <span className="text-gray-400">No player</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {user.isAdmin ? (
                          <span className="px-2 py-1 bg-red-100 text-red-800 text-xs font-medium rounded-full">
                            ADMIN
                          </span>
                        ) : (
                          <span className="px-2 py-1 bg-gray-100 text-gray-800 text-xs font-medium rounded-full">
                            USER
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(user.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex flex-col gap-1">
                          <button
                            onClick={() => handleResetPassword(user)}
                            className="text-blue-600 hover:text-blue-900 text-left"
                          >
                            Reset password
                          </button>
                          {user.canDelete ? (
                            <button
                              onClick={() => handleDeleteUserClick(user.id)}
                              className="text-red-600 hover:text-red-900 text-left"
                            >
                              Delete
                            </button>
                          ) : (
                            <div className="text-xs text-gray-500">
                              {user.constraintCounts.matches > 0 && (
                                <div>
                                  {user.constraintCounts.matches} matches
                                </div>
                              )}
                              {user.constraintCounts.seasons > 0 && (
                                <div>
                                  {user.constraintCounts.seasons} seasons
                                </div>
                              )}
                              {user.constraintCounts.memes > 0 && (
                                <div>{user.constraintCounts.memes} memes</div>
                              )}
                              {user.constraintCounts.invitations > 0 && (
                                <div>
                                  {user.constraintCounts.invitations}{" "}
                                  invitations
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <ConfirmationModal
        isOpen={showRevokeModal}
        title="Revoke Invitation"
        message="Are you sure you want to revoke this invitation? The user will no longer be able to use the invitation link."
        confirmText="Revoke"
        cancelText="Cancel"
        onConfirm={confirmRevoke}
        onCancel={() => {
          setShowRevokeModal(false);
          setInvitationToRevoke(null);
        }}
        danger={true}
      />

      <ConfirmationModal
        isOpen={showDeleteUserModal}
        title="Delete User"
        message="Are you sure you want to delete this user? This will permanently delete their account, player profile, and all associated comments. This action cannot be undone."
        confirmText="Delete User"
        cancelText="Cancel"
        onConfirm={confirmDeleteUser}
        onCancel={() => {
          setShowDeleteUserModal(false);
          setUserToDelete(null);
        }}
        danger={true}
      />
    </AdminLayout>
  );
}
