import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { AdminRoute } from "./components/AdminRoute";
import { AuthProvider, useAuth } from "./contexts/auth-context";
import { AdminDashboardPage } from "./pages/AdminDashboardPage";
import { AdminMemesPage } from "./pages/AdminMemesPage";
import { AdminSeasonsPage } from "./pages/AdminSeasonsPage";
import { AdminTablesPage } from "./pages/AdminTablesPage";
import { AdminUsersPage } from "./pages/AdminUsersPage";
import { HeadToHeadPage } from "./pages/HeadToHeadPage";
import { InviteAcceptPage } from "./pages/InviteAcceptPage";
import { ResetPasswordPage } from "./pages/ResetPasswordPage";
import { KickerAcademyPage } from "./pages/KickerAcademyPage";
import { LeaderboardPage } from "./pages/LeaderboardPage";
import { LoginPage } from "./pages/LoginPage";
import { MatchDetailPage } from "./pages/MatchDetailPage";
import { MatchHistoryPage } from "./pages/MatchHistoryPage";
import { MonthlyMVPPage } from "./pages/MonthlyMVPPage";
import { PlayerProfilePage } from "./pages/PlayerProfilePage";
import { RecordMatchPage } from "./pages/RecordMatchPage";
import { SeasonsPage } from "./pages/SeasonsPage";

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();

  // If we have a user, show the protected content immediately
  if (user) {
    return <>{children}</>;
  }

  // If we don't have a user yet, redirect to login immediately
  // This ensures login page shows right away, even if auth check is still loading
  // The auth check will complete in background, and if user is authenticated,
  // they'll be redirected back automatically
  return <Navigate to="/login" />;
}

function AppContent() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/invite/accept" element={<InviteAcceptPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route
        path="/"
        element={
          <PrivateRoute>
            <LeaderboardPage />
          </PrivateRoute>
        }
      />
      <Route
        path="/record"
        element={
          <PrivateRoute>
            <RecordMatchPage />
          </PrivateRoute>
        }
      />
      <Route
        path="/history"
        element={
          <PrivateRoute>
            <MatchHistoryPage />
          </PrivateRoute>
        }
      />
      <Route
        path="/player/:playerId"
        element={
          <PrivateRoute>
            <PlayerProfilePage />
          </PrivateRoute>
        }
      />
      <Route
        path="/admin"
        element={
          <AdminRoute>
            <AdminDashboardPage />
          </AdminRoute>
        }
      />
      <Route
        path="/admin/memes"
        element={
          <AdminRoute>
            <AdminMemesPage />
          </AdminRoute>
        }
      />
      <Route
        path="/match/:matchId"
        element={
          <PrivateRoute>
            <MatchDetailPage />
          </PrivateRoute>
        }
      />
      <Route
        path="/h2h"
        element={
          <PrivateRoute>
            <HeadToHeadPage />
          </PrivateRoute>
        }
      />
      <Route
        path="/mvp"
        element={
          <PrivateRoute>
            <MonthlyMVPPage />
          </PrivateRoute>
        }
      />
      <Route
        path="/seasons"
        element={
          <PrivateRoute>
            <SeasonsPage />
          </PrivateRoute>
        }
      />
      <Route
        path="/academy"
        element={
          <PrivateRoute>
            <KickerAcademyPage />
          </PrivateRoute>
        }
      />
      <Route
        path="/admin/seasons"
        element={
          <AdminRoute>
            <AdminSeasonsPage />
          </AdminRoute>
        }
      />
      <Route
        path="/admin/users"
        element={
          <AdminRoute>
            <AdminUsersPage />
          </AdminRoute>
        }
      />
      <Route
        path="/admin/tables"
        element={
          <AdminRoute>
            <AdminTablesPage />
          </AdminRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}

export function AppRoutes() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </BrowserRouter>
  );
}
