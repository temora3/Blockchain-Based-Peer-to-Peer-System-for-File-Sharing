"use client";

import { useEffect, useState } from "react";
import { useUserRole } from "@/hooks/use-user-role";
import { Link2, ExternalLink, Loader2, FileText, Clock, Activity, TrendingUp, CheckCircle, XCircle, Gas } from "lucide-react";
import { motion } from "framer-motion";
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { getBlockchainStats, FileRegisteredEvent } from "@/lib/blockchain-monitor";

const COLORS = ['#CC2E28', '#FF6B6B', '#4ECDC4', '#45B7D1'];

export default function AdminBlockchain() {
  const { isAdmin, loading: roleLoading } = useUserRole();
  const [loading, setLoading] = useState(true);
  const [contractAddress, setContractAddress] = useState<string | null>(null);
  const [stats, setStats] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!roleLoading && isAdmin) {
      setContractAddress(process.env.NEXT_PUBLIC_REGISTRY_ADDRESS || null);
      loadBlockchainData();
    }
  }, [isAdmin, roleLoading]);

  async function loadBlockchainData() {
    try {
      setLoading(true);
      setError(null);
      const blockchainStats = await getBlockchainStats();
      setStats(blockchainStats);
      
      // If no data, show informative message instead of error
      if (blockchainStats.totalFilesRegistered === 0) {
        setError(null); // Clear any previous errors
      }
    } catch (err: any) {
      console.error('Error loading blockchain data:', err);
      setError(err.message || 'Failed to load blockchain data. Make sure the contract is deployed and you have network access.');
    } finally {
      setLoading(false);
    }
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

  if (loading || roleLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-6 h-6 animate-spin text-white" />
      </div>
    );
  }

  const successRate = stats?.transactionStats
    ? ((stats.transactionStats.successfulTransactions / stats.transactionStats.totalTransactions) * 100).toFixed(1)
    : '0';

  const pieData = stats?.transactionStats
    ? [
        { name: 'Successful', value: stats.transactionStats.successfulTransactions },
        { name: 'Failed', value: stats.transactionStats.failedTransactions },
      ]
    : [];

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
            <Link2 className="w-8 h-8 text-white" />
            <h1 className="text-3xl font-bold text-white">Blockchain Monitor</h1>
          </div>
          <p className="text-white/70">Monitor blockchain registrations and transactions</p>
        </div>
      </motion.div>

      {/* Contract Info */}
      {contractAddress && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-2xl p-6 shadow-2xl shadow-[#CC2E28]/10 relative overflow-hidden"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-transparent pointer-events-none"></div>
          <div className="relative">
            <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
              <FileText className="w-5 h-5" />
              FileRegistry Contract
            </h2>
            <div className="space-y-3">
              <div className="p-4 rounded-xl border border-white/20 bg-white/10 backdrop-blur-md">
                <p className="text-xs text-white/40 mb-1">Contract Address</p>
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm text-white/90 font-mono break-all">{contractAddress}</p>
                  <a
                    href={`https://sepolia.etherscan.io/address/${contractAddress}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/20 bg-white/10 backdrop-blur-md text-white/90 hover:bg-white/20 transition-all text-sm"
                  >
                    <ExternalLink className="w-4 h-4" />
                    View on Etherscan
                  </a>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* Error Message */}
      {error && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 backdrop-blur-xl p-4 shadow-lg">
          <p className="text-red-300 text-sm">{error}</p>
          <p className="text-red-200/70 text-xs mt-2">
            Make sure you're connected to Sepolia testnet and the contract address is configured.
          </p>
        </div>
      )}

      {/* No Data Message */}
      {!error && !loading && stats && stats.totalFilesRegistered === 0 && (
        <div className="rounded-2xl border border-yellow-500/30 bg-yellow-500/10 backdrop-blur-xl p-6 shadow-lg">
          <div className="flex items-center gap-3 mb-2">
            <FileText className="w-5 h-5 text-yellow-400" />
            <p className="text-yellow-300 font-medium">No Blockchain Data Available</p>
          </div>
          <p className="text-yellow-200/70 text-sm mb-3">
            No files have been registered on the blockchain yet. Once users start sharing files, 
            the registration data will appear here.
          </p>
          {!contractAddress && (
            <p className="text-yellow-200/70 text-xs">
              Note: Contract address is not configured. Please set NEXT_PUBLIC_REGISTRY_ADDRESS in your environment variables.
            </p>
          )}
        </div>
      )}

      {/* Stats Grid */}
      {stats && stats.transactionStats && stats.totalFilesRegistered > 0 && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              {
                title: "Total Files Registered",
                value: stats.totalFilesRegistered || 0,
                icon: FileText,
                color: "from-blue-500/20 to-cyan-500/20",
              },
              {
                title: "Total Transactions",
                value: stats.transactionStats?.totalTransactions || 0,
                icon: Activity,
                color: "from-purple-500/20 to-pink-500/20",
              },
              {
                title: "Success Rate",
                value: `${successRate}%`,
                icon: CheckCircle,
                color: "from-green-500/20 to-emerald-500/20",
              },
              {
                title: "Avg. Gas Used",
                value: stats.transactionStats?.averageGasUsed > 0
                  ? `${(stats.transactionStats.averageGasUsed / 1000).toFixed(1)}k`
                  : 'N/A',
                icon: Gas,
                color: "from-orange-500/20 to-red-500/20",
              },
            ].map((card, index) => {
              const IconComponent = card.icon;
              if (!IconComponent) return null; // Safety check
              return (
                <motion.div
                  key={card.title}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.2 + index * 0.1 }}
                  className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-6 shadow-lg shadow-black/10 relative overflow-hidden"
                >
                  <div className={`absolute inset-0 bg-gradient-to-br ${card.color} opacity-50`}></div>
                  <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-transparent pointer-events-none"></div>
                  <div className="relative">
                    <div className="flex items-center justify-between mb-4">
                      <IconComponent className="w-6 h-6 text-white" />
                      <TrendingUp className="w-5 h-5 text-green-400" />
                    </div>
                    <h3 className="text-sm uppercase tracking-wide text-white/60 mb-1">{card.title}</h3>
                    <p className="text-3xl font-bold text-white">{card.value}</p>
                  </div>
                </motion.div>
              );
            })}
          </div>

          {/* Transaction Success/Failure Pie Chart */}
          {stats.transactionStats.totalTransactions > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.6 }}
              className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-2xl p-6 shadow-2xl shadow-[#CC2E28]/10 relative overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-transparent pointer-events-none"></div>
              <div className="relative">
                <h2 className="text-xl font-semibold text-white mb-6 flex items-center gap-2">
                  <Activity className="w-5 h-5" />
                  Transaction Success Rate
                </h2>
                {pieData.length > 0 && pieData.some(d => d.value > 0) ? (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                      outerRadius={100}
                      fill="#8884d8"
                      dataKey="value"
                      animationDuration={1500}
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-64">
                    <p className="text-white/50">No transaction data available</p>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* Daily Registrations */}
          {stats.dailyRegistrations && stats.dailyRegistrations.length > 0 && (
            <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.7 }}
            className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-2xl p-6 shadow-2xl shadow-[#CC2E28]/10 relative overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-transparent pointer-events-none"></div>
            <div className="relative">
              <h2 className="text-xl font-semibold text-white mb-6 flex items-center gap-2">
                <TrendingUp className="w-5 h-5" />
                Daily File Registrations (Last 30 Days)
              </h2>
              {stats.dailyRegistrations.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={stats.dailyRegistrations}>
                    <defs>
                      <linearGradient id="colorRegistrations" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#CC2E28" stopOpacity={0.8} />
                        <stop offset="95%" stopColor="#CC2E28" stopOpacity={0.3} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                    <XAxis dataKey="date" stroke="rgba(255,255,255,0.5)" fontSize={12} />
                    <YAxis stroke="rgba(255,255,255,0.5)" fontSize={12} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar
                      dataKey="count"
                      fill="url(#colorRegistrations)"
                      radius={[8, 8, 0, 0]}
                      animationDuration={1500}
                    />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-64">
                  <p className="text-white/50">No registration data available</p>
                </div>
              )}
            </div>
          </motion.div>
          )}

          {/* Gas Usage Over Time */}
          {stats.gasUsageOverTime && stats.gasUsageOverTime.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.8 }}
              className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-2xl p-6 shadow-2xl shadow-[#CC2E28]/10 relative overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-transparent pointer-events-none"></div>
              <div className="relative">
                <h2 className="text-xl font-semibold text-white mb-6 flex items-center gap-2">
                  <Gas className="w-5 h-5" />
                  Gas Usage Over Time
                </h2>
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={stats.gasUsageOverTime}>
                    <defs>
                      <linearGradient id="colorGas" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#FF6B6B" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#FF6B6B" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                    <XAxis dataKey="date" stroke="rgba(255,255,255,0.5)" fontSize={12} />
                    <YAxis stroke="rgba(255,255,255,0.5)" fontSize={12} />
                    <Tooltip content={<CustomTooltip />} />
                    <Area
                      type="monotone"
                      dataKey="gasUsed"
                      stroke="#FF6B6B"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#colorGas)"
                      name="Gas Used"
                      animationDuration={1500}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </motion.div>
          )}

          {/* Recent Transactions */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.9 }}
            className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-2xl p-6 shadow-2xl shadow-[#CC2E28]/10 relative overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-transparent pointer-events-none"></div>
            <div className="relative">
              <h2 className="text-xl font-semibold text-white mb-6 flex items-center gap-2">
                <Clock className="w-5 h-5" />
                Recent File Registrations
              </h2>
              <div className="space-y-3">
                {stats.recentEvents.length > 0 ? (
                  stats.recentEvents.map((event: FileRegisteredEvent, index: number) => (
                    <div
                      key={index}
                      className="p-4 rounded-xl border border-white/20 bg-white/10 backdrop-blur-md hover:bg-white/15 transition-all"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <p className="text-white font-medium mb-1">{event.name}</p>
                          <p className="text-white/60 text-xs font-mono mb-2">
                            Owner: {event.owner.slice(0, 6)}...{event.owner.slice(-4)}
                          </p>
                          <p className="text-white/50 text-xs">
                            {new Date(event.timestamp * 1000).toLocaleString()}
                          </p>
                        </div>
                        <a
                          href={`https://sepolia.etherscan.io/tx/${event.transactionHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/20 bg-white/10 backdrop-blur-md text-white/90 hover:bg-white/20 transition-all text-sm"
                        >
                          <ExternalLink className="w-4 h-4" />
                          View TX
                        </a>
                      </div>
                      <div className="mt-2 p-2 rounded-lg border border-white/10 bg-white/5 backdrop-blur-sm">
                        <p className="text-xs text-white/40 mb-1">File ID</p>
                        <p className="text-xs text-white/70 font-mono break-all">{event.fileId}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-white/50 text-center py-8">No recent registrations</p>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </div>
  );
}
