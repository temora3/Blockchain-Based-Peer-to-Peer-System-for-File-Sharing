"use client";

import { useUserRole } from "@/hooks/use-user-role";
import { Settings, Loader2, Shield, Bell, Globe } from "lucide-react";

export default function AdminSettings() {
  const { isAdmin, loading: roleLoading } = useUserRole();

  if (roleLoading) {
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
            <Settings className="w-8 h-8 text-white" />
            <h1 className="text-3xl font-bold text-white">System Settings</h1>
          </div>
          <p className="text-white/70">Configure platform settings and preferences</p>
        </div>
      </div>

      {/* Settings Sections */}
      <div className="space-y-6">
        {/* General Settings */}
        <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-2xl p-6 shadow-2xl shadow-[#CC2E28]/10 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-transparent pointer-events-none"></div>
          <div className="relative">
            <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
              <Globe className="w-5 h-5" />
              General Settings
            </h2>
            <div className="space-y-4">
              <div className="p-4 rounded-xl border border-white/20 bg-white/10 backdrop-blur-md">
                <p className="text-white/80 text-sm">
                  General platform settings will be available here:
                </p>
                <ul className="mt-3 space-y-2 text-white/60 text-sm list-disc list-inside">
                  <li>Platform name and branding</li>
                  <li>Default user permissions</li>
                  <li>File size limits</li>
                  <li>Storage quotas</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* Security Settings */}
        <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-2xl p-6 shadow-2xl shadow-[#CC2E28]/10 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-transparent pointer-events-none"></div>
          <div className="relative">
            <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
              <Shield className="w-5 h-5" />
              Security Settings
            </h2>
            <div className="space-y-4">
              <div className="p-4 rounded-xl border border-white/20 bg-white/10 backdrop-blur-md">
                <p className="text-white/80 text-sm">
                  Security and access control settings:
                </p>
                <ul className="mt-3 space-y-2 text-white/60 text-sm list-disc list-inside">
                  <li>Two-factor authentication requirements</li>
                  <li>Session timeout settings</li>
                  <li>IP whitelisting/blacklisting</li>
                  <li>Rate limiting configuration</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* Notification Settings */}
        <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-2xl p-6 shadow-2xl shadow-[#CC2E28]/10 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-transparent pointer-events-none"></div>
          <div className="relative">
            <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
              <Bell className="w-5 h-5" />
              Notification Settings
            </h2>
            <div className="space-y-4">
              <div className="p-4 rounded-xl border border-white/20 bg-white/10 backdrop-blur-md">
                <p className="text-white/80 text-sm">
                  Configure notification preferences:
                </p>
                <ul className="mt-3 space-y-2 text-white/60 text-sm list-disc list-inside">
                  <li>Email notifications</li>
                  <li>Admin alerts</li>
                  <li>System event notifications</li>
                  <li>User activity reports</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

