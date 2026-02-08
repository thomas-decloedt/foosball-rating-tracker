import { createContext, useContext, useEffect, useState } from "react";

import { fetchApi } from "@/frontend/utils/fetch";

interface User {
  id: string;
  email: string;
  name: string;
  isAdmin: boolean;
  profileImage?: string | null;
}

interface Player {
  id: string;
  displayName: string;
  displayRating: number;
  generalMu: number;
  generalSigma: number;
  gamesPlayed: number;
  wins: number;
  losses: number;
}

interface AuthContextType {
  user: User | null;
  player: Player | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (
    email: string,
    password: string,
    name: string,
    displayName: string,
  ) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [player, setPlayer] = useState<Player | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = async () => {
    // Set loading to true at start
    setLoading(true);
    try {
      const data = await fetchApi<{ user: User; player: Player }>(
        "/api/v1/auth/me",
      );
      setUser(data.user);
      setPlayer(data.player);
    } catch (err) {
      // Log error but don't show it - user might just not be logged in
      console.error("Failed to fetch user:", err);
      setUser(null);
      setPlayer(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshUser();
  }, []);

  const login = async (email: string, password: string) => {
    const data = await fetchApi<{ user: User; player: Player }>(
      "/api/v1/auth/login",
      {
        method: "POST",
        body: JSON.stringify({ email, password }),
      },
    );
    setUser(data.user);
    setPlayer(data.player);
  };

  const register = async (
    email: string,
    password: string,
    name: string,
    displayName: string,
  ) => {
    const data = await fetchApi<{ user: User; player: Player }>(
      "/api/v1/auth/register",
      {
        method: "POST",
        body: JSON.stringify({ email, password, name, displayName }),
      },
    );
    setUser(data.user);
    setPlayer(data.player);
  };

  const logout = async () => {
    await fetchApi("/api/v1/auth/logout", { method: "POST" });
    setUser(null);
    setPlayer(null);
  };

  return (
    <AuthContext.Provider
      value={{ user, player, loading, login, register, logout, refreshUser }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
