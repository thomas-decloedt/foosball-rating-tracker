import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/frontend/contexts/auth-context";

export function Navigation() {
  const { user, player, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const isActive = (path: string) => location.pathname === path;

  return (
    <nav className="bg-white shadow">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center space-x-8">
            <Link to="/" className="text-xl font-bold text-gray-900">
              Foosball Rating Tracker
            </Link>
            <div className="flex space-x-4">
              <Link
                to="/"
                className={
                  isActive("/")
                    ? "text-sm font-medium text-blue-600"
                    : "text-sm text-gray-700 hover:text-gray-900"
                }
              >
                Leaderboard
              </Link>
              <Link
                to="/history"
                className={
                  isActive("/history")
                    ? "text-sm font-medium text-blue-600"
                    : "text-sm text-gray-700 hover:text-gray-900"
                }
              >
                Match History
              </Link>
              <Link
                to="/record"
                className={
                  isActive("/record")
                    ? "text-sm font-medium text-blue-600"
                    : "text-sm text-gray-700 hover:text-gray-900"
                }
              >
                Record Match
              </Link>
              <Link
                to="/h2h"
                className={
                  isActive("/h2h")
                    ? "text-sm font-medium text-blue-600"
                    : "text-sm text-gray-700 hover:text-gray-900"
                }
              >
                Head-to-Head
              </Link>
              <Link
                to="/seasons"
                className={
                  isActive("/seasons")
                    ? "text-sm font-medium text-blue-600"
                    : "text-sm text-gray-700 hover:text-gray-900"
                }
              >
                Seasons
              </Link>
              <Link
                to="/academy"
                className={
                  location.pathname.startsWith("/academy")
                    ? "text-sm font-medium text-blue-600"
                    : "text-sm text-gray-700 hover:text-gray-900"
                }
              >
                Kicker Academy
              </Link>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            {user?.isAdmin && (
              <Link
                to="/admin"
                className={
                  isActive("/admin") || location.pathname.startsWith("/admin/")
                    ? "text-sm font-medium text-blue-600"
                    : "text-sm text-gray-700 hover:text-gray-900"
                }
              >
                Admin Dashboard
              </Link>
            )}
            <Link
              to={`/player/${player?.id}`}
              className="text-sm text-gray-700 hover:text-gray-900"
            >
              {user?.name}
            </Link>
            <button
              onClick={handleLogout}
              className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900"
            >
              Logout
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}
