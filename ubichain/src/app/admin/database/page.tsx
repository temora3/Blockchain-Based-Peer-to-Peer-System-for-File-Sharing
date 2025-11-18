"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useUserRole } from "@/hooks/use-user-role";
import { Database, Table, Loader2, Users, FileText } from "lucide-react";

export default function AdminDatabase() {
  const { isAdmin, loading: roleLoading } = useUserRole();
  const [stats, setStats] = useState({
    profilesCount: 0,
    torrentsCount: 0,
    loading: true,
  });

  useEffect(() => {
    if (!roleLoading && isAdmin) {
      loadDatabaseStats();
    }
  }, [isAdmin, roleLoading]);

  async function loadDatabaseStats() {
    try {
      // Supabase stats
      const { count: profilesCount } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true });

      // MongoDB stats
      const res = await fetch('/api/torrents');
      const data = await res.json();
      const torrentsCount = data.torrents?.length || 0;

      setStats({
        profilesCount: profilesCount || 0,
        torrentsCount,
        loading: false,
      });
    } catch (error) {
      console.error('Error loading database stats:', error);
      setStats(prev => ({ ...prev, loading: false }));
    }
  }

  if (stats.loading || roleLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-6 h-6 animate-spin text-white" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-2xl p-6 shadow-2xl shadow-[#CC2E28]/10 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-transparent pointer-events-none"></div>
        <div className="relative">
          <div className="flex items-center gap-3 mb-2">
            <Database className="w-8 h-8 text-white" />
            <h1 className="text-3xl font-bold text-white">Database Statistics</h1>
          </div>
          <p className="text-white/70">View database tables and record counts</p>
        </div>
      </div>

      {/* Database Tables */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Supabase Tables */}
        <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-2xl p-6 shadow-2xl shadow-[#CC2E28]/10 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-transparent pointer-events-none"></div>
          <div className="relative">
            <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
              <Table className="w-5 h-5" />
              Supabase Tables
            </h2>
            <div className="space-y-3">
              <div className="p-4 rounded-xl border border-white/20 bg-white/10 backdrop-blur-md">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-white/60" />
                    <span className="text-white font-medium">profiles</span>
                  </div>
                  <span className="text-white/70 text-sm">{stats.profilesCount} records</span>
                </div>
                <p className="text-white/50 text-xs">User profiles and authentication data</p>
              </div>
            </div>
          </div>
        </div>

        {/* MongoDB Collections */}
        <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-2xl p-6 shadow-2xl shadow-[#CC2E28]/10 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-transparent pointer-events-none"></div>
          <div className="relative">
            <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
              <Table className="w-5 h-5" />
              MongoDB Collections
            </h2>
            <div className="space-y-3">
              <div className="p-4 rounded-xl border border-white/20 bg-white/10 backdrop-blur-md">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-white/60" />
                    <span className="text-white font-medium">torrents</span>
                  </div>
                  <span className="text-white/70 text-sm">{stats.torrentsCount} records</span>
                </div>
                <p className="text-white/50 text-xs">Torrent files and metadata</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

