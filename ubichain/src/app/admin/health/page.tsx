"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useUserRole } from "@/hooks/use-user-role";
import { Activity, CheckCircle, XCircle, AlertCircle, Loader2, Server, Database, Link2 } from "lucide-react";

interface HealthStatus {
  name: string;
  status: 'healthy' | 'degraded' | 'down';
  message: string;
  icon: any;
}

export default function AdminHealth() {
  const { isAdmin, loading: roleLoading } = useUserRole();
  const [healthChecks, setHealthChecks] = useState<HealthStatus[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!roleLoading && isAdmin) {
      checkSystemHealth();
    }
  }, [isAdmin, roleLoading]);

  async function checkSystemHealth() {
    setLoading(true);
    const checks: HealthStatus[] = [];

    // Check Supabase
    try {
      const { data, error } = await supabase.from('profiles').select('count').limit(1);
      checks.push({
        name: 'Supabase Database',
        status: error ? 'down' : 'healthy',
        message: error ? 'Connection failed' : 'Connected',
        icon: Database,
      });
    } catch {
      checks.push({
        name: 'Supabase Database',
        status: 'down',
        message: 'Connection failed',
        icon: Database,
      });
    }

    // Check MongoDB (via API)
    try {
      const res = await fetch('/api/torrents');
      checks.push({
        name: 'MongoDB Database',
        status: res.ok ? 'healthy' : 'degraded',
        message: res.ok ? 'Connected' : 'Response error',
        icon: Database,
      });
    } catch {
      checks.push({
        name: 'MongoDB Database',
        status: 'down',
        message: 'Connection failed',
        icon: Database,
      });
    }

    // Check Blockchain
    const contractAddress = process.env.NEXT_PUBLIC_REGISTRY_ADDRESS;
    checks.push({
      name: 'Blockchain Connection',
      status: contractAddress ? 'healthy' : 'degraded',
      message: contractAddress ? 'Contract configured' : 'Contract not configured',
      icon: Link2,
    });

    // Check API
    try {
      const res = await fetch('/api/torrents');
      checks.push({
        name: 'API Server',
        status: res.ok ? 'healthy' : 'degraded',
        message: res.ok ? 'Responding' : 'Response error',
        icon: Server,
      });
    } catch {
      checks.push({
        name: 'API Server',
        status: 'down',
        message: 'Not responding',
        icon: Server,
      });
    }

    setHealthChecks(checks);
    setLoading(false);
  }

  if (loading || roleLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-6 h-6 animate-spin text-white" />
      </div>
    );
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy':
        return <CheckCircle className="w-5 h-5 text-green-400" />;
      case 'degraded':
        return <AlertCircle className="w-5 h-5 text-yellow-400" />;
      case 'down':
        return <XCircle className="w-5 h-5 text-red-400" />;
      default:
        return null;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy':
        return 'border-green-500/30 bg-green-500/10';
      case 'degraded':
        return 'border-yellow-500/30 bg-yellow-500/10';
      case 'down':
        return 'border-red-500/30 bg-red-500/10';
      default:
        return 'border-white/20 bg-white/10';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-2xl p-6 shadow-2xl shadow-[#CC2E28]/10 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-transparent pointer-events-none"></div>
        <div className="relative">
          <div className="flex items-center gap-3 mb-2">
            <Activity className="w-8 h-8 text-white" />
            <h1 className="text-3xl font-bold text-white">System Health</h1>
          </div>
          <p className="text-white/70">Monitor system components and services</p>
        </div>
      </div>

      {/* Health Checks */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {healthChecks.map((check, index) => {
          const Icon = check.icon;
          return (
            <div
              key={index}
              className={`rounded-2xl border ${getStatusColor(check.status)} backdrop-blur-xl p-6 shadow-lg shadow-black/10 relative overflow-hidden`}
            >
              <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-transparent pointer-events-none"></div>
              <div className="relative">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <Icon className="w-6 h-6 text-white" />
                    <h3 className="text-lg font-semibold text-white">{check.name}</h3>
                  </div>
                  {getStatusIcon(check.status)}
                </div>
                <p className="text-white/70 text-sm">{check.message}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

