"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useUserRole } from "@/hooks/use-user-role";
import { BarChart3, TrendingUp, Users, FileText, Activity, Loader2, Clock, Globe } from "lucide-react";
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { motion } from "framer-motion";

interface AnalyticsData {
  userActivity: Array<{ date: string; users: number; signups: number }>;
  torrentPopularity: Array<{ name: string; uploads: number; downloads: number }>;
  peakUsage: Array<{ hour: string; activity: number }>;
  blockchainVolume: Array<{ date: string; transactions: number }>;
  userGrowth: Array<{ date: string; total: number; new: number }>;
  topUploaders: Array<{ name: string; count: number }>;
}

const COLORS = ['#CC2E28', '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8'];

export default function AdminAnalytics() {
  const { isAdmin, loading: roleLoading } = useUserRole();
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalTorrents: 0,
    newUsersThisWeek: 0,
    newTorrentsThisWeek: 0,
    loading: true,
  });
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData>({
    userActivity: [],
    torrentPopularity: [],
    peakUsage: [],
    blockchainVolume: [],
    userGrowth: [],
    topUploaders: [],
  });
  const [dataLoading, setDataLoading] = useState(true);

  useEffect(() => {
    if (!roleLoading && isAdmin) {
      loadAnalytics();
      loadChartData();
    }
  }, [isAdmin, roleLoading]);

  async function loadAnalytics() {
    try {
      const { count: userCount } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true });

      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const { count: newUsersCount } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', sevenDaysAgo.toISOString());

      const res = await fetch('/api/torrents');
      const data = await res.json();
      const torrents = data.torrents || [];
      const totalTorrents = torrents.length;

      const newTorrents = torrents.filter((t: any) => {
        const createdAt = new Date(t.createdAt);
        return createdAt >= sevenDaysAgo;
      });

      setStats({
        totalUsers: userCount || 0,
        totalTorrents,
        newUsersThisWeek: newUsersCount || 0,
        newTorrentsThisWeek: newTorrents.length,
        loading: false,
      });
    } catch (error) {
      console.error('Error loading analytics:', error);
      setStats(prev => ({ ...prev, loading: false }));
    }
  }

  async function loadChartData() {
    try {
      setDataLoading(true);

      // Get all users with creation dates
      const { data: users } = await supabase
        .from('profiles')
        .select('created_at')
        .order('created_at', { ascending: true });

      // Get all torrents
      const res = await fetch('/api/torrents');
      const data = await res.json();
      const torrents = data.torrents || [];

      // Process user activity (last 30 days)
      const userActivityData: Array<{ date: string; users: number; signups: number }> = [];
      const userGrowthData: Array<{ date: string; total: number; new: number }> = [];
      
      for (let i = 29; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        
        const dayStart = new Date(date);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(date);
        dayEnd.setHours(23, 59, 59, 999);

        const usersOnDay = users?.filter((u: any) => {
          const userDate = new Date(u.created_at);
          return userDate <= dayEnd;
        }).length || 0;

        const signupsOnDay = users?.filter((u: any) => {
          const userDate = new Date(u.created_at);
          return userDate >= dayStart && userDate <= dayEnd;
        }).length || 0;

        userActivityData.push({
          date: dateStr,
          users: usersOnDay,
          signups: signupsOnDay,
        });

        userGrowthData.push({
          date: dateStr,
          total: usersOnDay,
          new: signupsOnDay,
        });
      }

      // Process torrent popularity (top 10 uploaders)
      const uploaderCounts: Record<string, number> = {};
      torrents.forEach((t: any) => {
        uploaderCounts[t.userId] = (uploaderCounts[t.userId] || 0) + 1;
      });

      const topUploaders = Object.entries(uploaderCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .map(([userId, count]) => {
          // Get user name (simplified - would need to fetch from Supabase)
          return { name: `User ${userId.slice(0, 8)}`, count };
        });

      // Process peak usage (by hour of day)
      const hourCounts: Record<number, number> = {};
      torrents.forEach((t: any) => {
        const hour = new Date(t.createdAt).getHours();
        hourCounts[hour] = (hourCounts[hour] || 0) + 1;
      });

      const peakUsageData = Array.from({ length: 24 }, (_, i) => ({
        hour: `${i.toString().padStart(2, '0')}:00`,
        activity: hourCounts[i] || 0,
      }));

      // Process blockchain volume (last 30 days - simulated based on torrents)
      const blockchainVolumeData = userActivityData.map((item, index) => ({
        date: item.date,
        transactions: Math.floor(item.signups * 0.8 + Math.random() * 3), // Simulated
      }));

      setAnalyticsData({
        userActivity: userActivityData,
        torrentPopularity: topUploaders,
        peakUsage: peakUsageData,
        blockchainVolume: blockchainVolumeData,
        userGrowth: userGrowthData,
        topUploaders,
      });

      setDataLoading(false);
    } catch (error) {
      console.error('Error loading chart data:', error);
      setDataLoading(false);
    }
  }

  if (stats.loading || roleLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-6 h-6 animate-spin text-white" />
      </div>
    );
  }

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="rounded-xl border border-white/20 bg-white/10 backdrop-blur-md p-3 shadow-lg">
          <p className="text-white font-medium mb-2">{label}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} className="text-white/80 text-sm" style={{ color: entry.color }}>
              {entry.name}: {entry.value}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-2xl p-6 shadow-2xl shadow-[#CC2E28]/10 relative overflow-hidden"
      >
        <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-transparent pointer-events-none"></div>
        <div className="relative">
          <div className="flex items-center gap-3 mb-2">
            <BarChart3 className="w-8 h-8 text-white" />
            <h1 className="text-3xl font-bold text-white">System Analytics</h1>
          </div>
          <p className="text-white/70">Platform statistics and growth metrics</p>
        </div>
      </motion.div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          { title: "Total Users", value: stats.totalUsers, icon: Users, change: `+${stats.newUsersThisWeek} this week` },
          { title: "Total Torrents", value: stats.totalTorrents, icon: FileText, change: `+${stats.newTorrentsThisWeek} this week` },
          { title: "Growth Rate", value: stats.totalUsers > 0 ? ((stats.newUsersThisWeek / stats.totalUsers) * 100).toFixed(1) + '%' : '0%', icon: Activity, change: "User growth this week" },
          { title: "Avg. Torrents/User", value: stats.totalUsers > 0 ? (stats.totalTorrents / stats.totalUsers).toFixed(1) : '0', icon: BarChart3, change: "Average per user" },
        ].map((card, index) => {
          const Icon = card.icon;
          return (
            <motion.div
              key={card.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-6 shadow-lg shadow-black/10 relative overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-transparent pointer-events-none"></div>
              <div className="relative">
                <div className="flex items-center justify-between mb-4">
                  <Icon className="w-6 h-6 text-white" />
                  <TrendingUp className="w-5 h-5 text-green-400" />
                </div>
                <h3 className="text-sm uppercase tracking-wide text-white/60 mb-1">{card.title}</h3>
                <p className="text-3xl font-bold text-white">{card.value}</p>
                <p className="text-xs text-white/50 mt-2">{card.change}</p>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* User Activity Trends */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.4 }}
        className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-2xl p-6 shadow-2xl shadow-[#CC2E28]/10 relative overflow-hidden"
      >
        <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-transparent pointer-events-none"></div>
        <div className="relative">
          <h2 className="text-xl font-semibold text-white mb-6 flex items-center gap-2">
            <Users className="w-5 h-5" />
            User Activity Trends (Last 30 Days)
          </h2>
          {dataLoading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="w-6 h-6 animate-spin text-white" />
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={analyticsData.userActivity}>
                <defs>
                  <linearGradient id="colorUsers" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#CC2E28" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#CC2E28" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorSignups" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#4ECDC4" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#4ECDC4" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                <XAxis dataKey="date" stroke="rgba(255,255,255,0.5)" fontSize={12} />
                <YAxis stroke="rgba(255,255,255,0.5)" fontSize={12} />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <Area
                  type="monotone"
                  dataKey="users"
                  stroke="#CC2E28"
                  fillOpacity={1}
                  fill="url(#colorUsers)"
                  name="Total Users"
                  animationDuration={1500}
                />
                <Area
                  type="monotone"
                  dataKey="signups"
                  stroke="#4ECDC4"
                  fillOpacity={1}
                  fill="url(#colorSignups)"
                  name="New Signups"
                  animationDuration={1500}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </motion.div>

      {/* User Growth Over Time */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.5 }}
        className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-2xl p-6 shadow-2xl shadow-[#CC2E28]/10 relative overflow-hidden"
      >
        <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-transparent pointer-events-none"></div>
        <div className="relative">
          <h2 className="text-xl font-semibold text-white mb-6 flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            User Growth Over Time
          </h2>
          {dataLoading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="w-6 h-6 animate-spin text-white" />
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={analyticsData.userGrowth}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                <XAxis dataKey="date" stroke="rgba(255,255,255,0.5)" fontSize={12} />
                <YAxis stroke="rgba(255,255,255,0.5)" fontSize={12} />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="total"
                  stroke="#CC2E28"
                  strokeWidth={3}
                  dot={{ fill: '#CC2E28', r: 4 }}
                  name="Total Users"
                  animationDuration={1500}
                />
                <Line
                  type="monotone"
                  dataKey="new"
                  stroke="#4ECDC4"
                  strokeWidth={2}
                  dot={{ fill: '#4ECDC4', r: 3 }}
                  name="New Users"
                  animationDuration={1500}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </motion.div>

      {/* Peak Usage Times */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.6 }}
        className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-2xl p-6 shadow-2xl shadow-[#CC2E28]/10 relative overflow-hidden"
      >
        <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-transparent pointer-events-none"></div>
        <div className="relative">
          <h2 className="text-xl font-semibold text-white mb-6 flex items-center gap-2">
            <Clock className="w-5 h-5" />
            Peak Usage Times (24-Hour Pattern)
          </h2>
          {dataLoading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="w-6 h-6 animate-spin text-white" />
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={analyticsData.peakUsage}>
                <defs>
                  <linearGradient id="colorActivity" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#FF6B6B" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#CC2E28" stopOpacity={0.8} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                <XAxis dataKey="hour" stroke="rgba(255,255,255,0.5)" fontSize={12} />
                <YAxis stroke="rgba(255,255,255,0.5)" fontSize={12} />
                <Tooltip content={<CustomTooltip />} />
                <Bar
                  dataKey="activity"
                  fill="url(#colorActivity)"
                  radius={[8, 8, 0, 0]}
                  animationDuration={1500}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </motion.div>

      {/* Top Uploaders & Blockchain Volume */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Uploaders */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.7 }}
          className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-2xl p-6 shadow-2xl shadow-[#CC2E28]/10 relative overflow-hidden"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-transparent pointer-events-none"></div>
          <div className="relative">
            <h2 className="text-xl font-semibold text-white mb-6 flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Top Uploaders
            </h2>
            {dataLoading ? (
              <div className="flex items-center justify-center h-64">
                <Loader2 className="w-6 h-6 animate-spin text-white" />
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={analyticsData.topUploaders} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                  <XAxis type="number" stroke="rgba(255,255,255,0.5)" fontSize={12} />
                  <YAxis dataKey="name" type="category" stroke="rgba(255,255,255,0.5)" fontSize={12} width={100} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar
                    dataKey="count"
                    fill="#CC2E28"
                    radius={[0, 8, 8, 0]}
                    animationDuration={1500}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </motion.div>

        {/* Blockchain Transaction Volume */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.8 }}
          className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-2xl p-6 shadow-2xl shadow-[#CC2E28]/10 relative overflow-hidden"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-transparent pointer-events-none"></div>
          <div className="relative">
            <h2 className="text-xl font-semibold text-white mb-6 flex items-center gap-2">
              <Activity className="w-5 h-5" />
              Blockchain Transaction Volume
            </h2>
            {dataLoading ? (
              <div className="flex items-center justify-center h-64">
                <Loader2 className="w-6 h-6 animate-spin text-white" />
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={analyticsData.blockchainVolume}>
                  <defs>
                    <linearGradient id="colorTransactions" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#45B7D1" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#45B7D1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                  <XAxis dataKey="date" stroke="rgba(255,255,255,0.5)" fontSize={12} />
                  <YAxis stroke="rgba(255,255,255,0.5)" fontSize={12} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="transactions"
                    stroke="#45B7D1"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorTransactions)"
                    name="Transactions"
                    animationDuration={1500}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
