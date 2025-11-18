"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { 
  Shield, 
  Users, 
  FileText, 
  BarChart3, 
  AlertTriangle,
  Menu,
  X
} from "lucide-react";

interface AdminNavItem {
  name: string;
  href: string;
  icon: any;
  group: string;
}

const navItems: AdminNavItem[] = [
  { name: "Overview", href: "/admin", icon: Shield, group: "Main" },
  { name: "User Management", href: "/admin/users", icon: Users, group: "Management" },
  { name: "Torrent Management", href: "/admin/torrents", icon: FileText, group: "Management" },
  { name: "System Analytics", href: "/admin/analytics", icon: BarChart3, group: "Analytics" },
  { name: "Content Moderation", href: "/admin/moderation", icon: AlertTriangle, group: "Moderation" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const groupedItems = navItems.reduce((acc, item) => {
    if (!acc[item.group]) {
      acc[item.group] = [];
    }
    acc[item.group].push(item);
    return acc;
  }, {} as Record<string, AdminNavItem[]>);

  return (
    <div className="min-h-screen relative pt-20">
      <div className="flex">
        {/* Sidebar */}
        <aside
          className={`${
            sidebarOpen ? "w-64" : "w-0"
          } fixed left-0 top-20 h-[calc(100vh-5rem)] bg-white/5 backdrop-blur-2xl border-r border-white/10 transition-all duration-300 overflow-hidden z-40`}
        >
          <div className="p-4 h-full overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Shield className="w-5 h-5" />
                Admin Panel
              </h2>
              <button
                onClick={() => setSidebarOpen(false)}
                className="md:hidden text-white/60 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <nav className="space-y-6">
              {Object.entries(groupedItems).map(([group, items]) => (
                <div key={group}>
                  <h3 className="text-xs uppercase tracking-wider text-white/40 mb-3 px-2">
                    {group}
                  </h3>
                  <div className="space-y-1">
                    {items.map((item) => {
                      const Icon = item.icon;
                      const isActive = pathname === item.href;
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 relative overflow-hidden group ${
                            isActive
                              ? "bg-gradient-to-br from-[#CC2E28]/30 to-[#CC2E28]/20 text-white shadow-lg shadow-[#CC2E28]/20 border border-white/30"
                              : "text-white/70 hover:bg-white/10 hover:text-white border border-transparent hover:border-white/20"
                          }`}
                        >
                          {isActive && (
                            <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-transparent pointer-events-none"></div>
                          )}
                          <Icon className="w-5 h-5 relative z-10" />
                          <span className="relative z-10">{item.name}</span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
            </nav>
          </div>
        </aside>

        {/* Mobile sidebar toggle */}
        {!sidebarOpen && (
          <button
            onClick={() => setSidebarOpen(true)}
            className="fixed left-4 top-24 z-50 md:hidden p-2 rounded-xl bg-white/10 backdrop-blur-md border border-white/20 text-white"
          >
            <Menu className="w-5 h-5" />
          </button>
        )}

        {/* Main content */}
        <main className={`flex-1 transition-all duration-300 ${sidebarOpen ? "ml-64" : "ml-0"}`}>
          <div className="p-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

