import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../contexts/auth-context";
import { fetchApi } from "../utils/fetch";

export function InviteAcceptPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { refreshUser } = useAuth();

  const [token, setToken] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState("");
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);

  useEffect(() => {
    const tokenParam = searchParams.get("token");
    if (!tokenParam) {
      setError("Invalid invitation link. No token provided.");
      setLoading(false);
      return;
    }

    setToken(tokenParam);
    verifyToken(tokenParam);
  }, [searchParams]);

  const verifyToken = async (tokenValue: string) => {
    try {
      setVerifying(true);
      setError("");
      const data = await fetchApi<{
        valid: boolean;
        email: string;
        expiresAt: string;
      }>(`/api/v1/invite/verify/${tokenValue}`);
      setEmail(data.email);
      setExpiresAt(new Date(data.expiresAt));
    } catch (err: any) {
      const errorMsg =
        err?.data?.error || err?.message || "Invalid or expired invitation";
      setError(errorMsg);
    } finally {
      setLoading(false);
      setVerifying(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password.length < 8) {
      setError("Password must be at least 8 characters long");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (!name.trim() || !displayName.trim()) {
      setError("Name and display name are required");
      return;
    }

    if (!token) {
      setError("Invalid invitation token");
      return;
    }

    try {
      setVerifying(true);
      setError("");
      await fetchApi<{
        user: {
          id: string;
          email: string;
          name: string;
          isAdmin: boolean;
        };
        player: {
          id: string;
          displayName: string;
          displayRating: number;
          generalMu: number;
          generalSigma: number;
        };
      }>("/api/v1/invite/accept", {
        method: "POST",
        body: JSON.stringify({
          token,
          email,
          name: name.trim(),
          displayName: displayName.trim(),
          password,
        }),
      });

      // Refresh auth context to get the new user
      await refreshUser();

      // Redirect to home
      navigate("/");
    } catch (err: any) {
      const errorMsg =
        err?.data?.error || err?.message || "Failed to create account";
      setError(errorMsg);
    } finally {
      setVerifying(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-lg text-gray-600">Verifying invitation...</div>
        </div>
      </div>
    );
  }

  if (error && !email) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="max-w-md w-full bg-white rounded-lg shadow p-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">
            Invalid Invitation
          </h1>
          <p className="text-gray-600 mb-6">{error}</p>
          <a
            href="/login"
            className="block text-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-medium"
          >
            Go to Login
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full bg-white rounded-lg shadow p-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          Accept Invitation
        </h1>
        <p className="text-sm text-gray-600 mb-6">
          Create your account to join the Foosball Rating Tracker
        </p>

        {expiresAt && (
          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm text-blue-800">
              <strong>Email:</strong> {email}
            </p>
            <p className="text-sm text-blue-800 mt-1">
              <strong>Expires:</strong> {expiresAt.toLocaleDateString()}
            </p>
          </div>
        )}

        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Email
            </label>
            <input
              type="email"
              value={email}
              disabled
              className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-gray-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Full Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="John Doe"
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
              required
              maxLength={100}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Display Name
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Johnny"
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
              required
              maxLength={50}
            />
            <p className="text-xs text-gray-500 mt-1">
              This is how your name will appear on the leaderboard
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
              required
              minLength={8}
            />
            <p className="text-xs text-gray-500 mt-1">
              Must be at least 8 characters long
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Confirm Password
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm your password"
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
              required
              minLength={8}
            />
          </div>

          <button
            type="submit"
            disabled={verifying}
            className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-medium disabled:opacity-50"
          >
            {verifying ? "Creating Account..." : "Create Account"}
          </button>
        </form>
      </div>
    </div>
  );
}
