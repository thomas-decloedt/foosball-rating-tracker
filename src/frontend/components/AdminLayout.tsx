import { Link, useLocation } from "react-router-dom";
import { Navigation } from "./Navigation";

interface AdminLayoutProps {
  children: React.ReactNode;
}

export function AdminLayout({ children }: AdminLayoutProps) {
  const location = useLocation();

  const isActive = (path: string) => location.pathname === path;

  const sidebarLinks = [
    { path: "/admin", label: "Dashboard", icon: "📊" },
    { path: "/admin/memes", label: "Meme Management", icon: "🎭" },
    { path: "/admin/seasons", label: "Season Management", icon: "📅" },
    { path: "/admin/users", label: "User Management", icon: "👥" },
    { path: "/admin/tables", label: "Table Management", icon: "🏓" },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top Navigation */}
      <Navigation />

      {/* Main Content with Sidebar */}
      <div className="flex">
        {/* Sidebar */}
        <aside className="w-64 bg-white shadow-sm min-h-[calc(100vh-4rem)]">
          <div className="p-6">
            <div className="mb-6">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                Admin Panel
              </h3>
              <span className="inline-block px-3 py-1 bg-red-100 text-red-800 text-xs font-medium rounded-full">
                ADMIN
              </span>
            </div>
            <nav className="space-y-1">
              {sidebarLinks.map((link) => (
                <Link
                  key={link.path}
                  to={link.path}
                  className={`flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors ${
                    isActive(link.path)
                      ? "bg-blue-50 text-blue-700"
                      : "text-gray-700 hover:bg-gray-50 hover:text-gray-900"
                  }`}
                >
                  <span className="mr-3 text-lg">{link.icon}</span>
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 py-6 px-8">{children}</main>
      </div>
    </div>
  );
}
