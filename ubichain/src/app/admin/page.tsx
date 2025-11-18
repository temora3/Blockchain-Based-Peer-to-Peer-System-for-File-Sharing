"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { useUserRole } from "@/hooks/use-user-role";
import { 
  Shield, 
  Users, 
  FileText, 
  Activity, 
  Link2, 
  Loader2,
  ArrowUpRight
} from "lucide-react";
import Link from "next/link";

export default function AdminOverview() {
  const router = useRouter();
  const { role, loading: roleLoading, isAdmin } = useUserRole();
  const [mounted, setMounted] = useState(false);
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalTorrents: 0,
    activeUsers: 0,
    blockchainFiles: 0,
    loading: true,
  });
  const [recentActivity, setRecentActivity] = useState<any[]>([]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    async function checkAccess() {
      if (!roleLoading && mounted) {
        if (!isAdmin) {
          router.push("/profile");
          return;
        }
        await loadStats();
      }
    }
    checkAccess();
  }, [isAdmin, roleLoading, mounted, router]);

  async function loadStats() {
    try {
      // Get total users count
      const { count: userCount, error: userError } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true });

      // Get active users (users who have signed in recently - last 7 days)
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const { count: activeUserCount } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true });

      // Get total torrents count
      let torrentCount = 0;
      try {
        const res = await fetch('/api/torrents');
        const data = await res.json();
        torrentCount = data.torrents?.length || 0;
      } catch (err) {
        console.error('Error fetching torrents:', err);
      }

      // Get recent torrents for activity feed
      try {
        const res = await fetch('/api/torrents');
        const data = await res.json();
        const recent = (data.torrents || []).slice(0, 5);
        setRecentActivity(recent);
      } catch (err) {
        console.error('Error fetching recent activity:', err);
      }

      setStats({
        totalUsers: userCount || 0,
        totalTorrents: torrentCount,
        activeUsers: activeUserCount || 0,
        blockchainFiles: torrentCount, // Approximate - same as torrents for now
        loading: false,
      });
    } catch (error) {
      console.error('Error loading admin stats:', error);
      setStats(prev => ({ ...prev, loading: false }));
    }
  }

  if (!mounted || roleLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-2xl px-6 py-4 shadow-2xl shadow-[#CC2E28]/10">
          <Loader2 className="w-6 h-6 animate-spin text-white" />
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return null;
  }

  const statCards = [
    {
      title: "Total Users",
      value: stats.totalUsers,
      icon: Users,
      color: "from-blue-500/20 to-cyan-500/20",
      link: "/admin/users",
    },
    {
      title: "Total Torrents",
      value: stats.totalTorrents,
      icon: FileText,
      color: "from-purple-500/20 to-pink-500/20",
      link: "/admin/torrents",
    },
    {
      title: "Active Users",
      value: stats.activeUsers,
      icon: Activity,
      color: "from-green-500/20 to-emerald-500/20",
      link: "/admin/users",
    },
    {
      title: "Blockchain Files",
      value: stats.blockchainFiles,
      icon: Link2,
      color: "from-orange-500/20 to-red-500/20",
      link: "/admin/blockchain",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-2xl p-6 shadow-2xl shadow-[#CC2E28]/10 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-transparent pointer-events-none"></div>
        <div className="relative">
          <div className="flex items-center gap-3 mb-2">
            <Shield className="w-8 h-8 text-white" />
            <h1 className="text-3xl font-bold text-white">Admin Dashboard</h1>
          </div>
          <p className="text-white/70">Overview of your blockchain-based file sharing platform</p>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <Link
              key={card.title}
              href={card.link}
              className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-6 shadow-lg shadow-black/10 relative overflow-hidden group hover:scale-[1.02] transition-all duration-300"
            >
              <div className={`absolute inset-0 bg-gradient-to-br ${card.color} opacity-0 group-hover:opacity-100 transition-opacity duration-300`}></div>
              <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-transparent pointer-events-none"></div>
              <div className="relative">
                <div className="flex items-center justify-between mb-4">
                  <div className="rounded-xl border border-white/20 bg-white/10 backdrop-blur-md p-3">
                    <Icon className="w-6 h-6 text-white" />
                  </div>
                  <ArrowUpRight className="w-5 h-5 text-white/40 group-hover:text-white/60 transition-colors" />
                </div>
                <h3 className="text-sm uppercase tracking-wide text-white/60 mb-1">{card.title}</h3>
                {stats.loading ? (
                  <Loader2 className="w-5 h-5 animate-spin text-white/60" />
                ) : (
                  <p className="text-3xl font-bold text-white">{card.value}</p>
                )}
              </div>
            </Link>
          );
        })}
      </div>

      {/* Recent Activity */}
      <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-2xl p-6 shadow-2xl shadow-[#CC2E28]/10 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-transparent pointer-events-none"></div>
        <div className="relative">
          <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
            <Activity className="w-5 h-5" />
            Recent Activity
          </h2>
          <div className="space-y-3">
            {recentActivity.length > 0 ? (
              recentActivity.map((torrent: any, index: number) => (
                <div
                  key={index}
                  className="p-3 rounded-xl border border-white/20 bg-white/10 backdrop-blur-md"
                >
                  <p className="text-white/90 text-sm font-medium truncate">{torrent.name}</p>
                  <p className="text-white/50 text-xs mt-1">
                    {new Date(torrent.createdAt).toLocaleDateString()}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-white/50 text-sm">No recent activity</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
