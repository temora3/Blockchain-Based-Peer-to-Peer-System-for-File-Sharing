// 2FA Modal Prompt
"use client";
import React, { useState } from "react";
import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { EnhancedImageUpload } from "../../components/ui/enhanced-image-upload";
import FileUploader from "../../components/FileUploader";
import AuthService from "@/lib/auth";
import { getWebTorrentClient } from '@/lib/torrent';
import { Buffer } from 'buffer';
import { useToast } from "@/components/ui/toast-1";
import { useWallet } from "@/hooks/use-wallet";
import { WalletConnect } from "@/components/ui/wallet-connect";

function TwoFAModal({ open, onClose, onVerify, verifying, error }: {
  open: boolean;
  onClose: () => void;
  onVerify: (code: string) => void;
  verifying: boolean;
  error?: string | null;
}) {
  const [code, setCode] = useState("");
  if (!open) return null;
  return (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm pointer-events-none">
      <div className="rounded-3xl border border-white/20 bg-white/10 backdrop-blur-2xl p-6 w-full max-w-xs shadow-2xl shadow-purple-500/20 relative overflow-hidden pointer-events-auto">
        {/* Glass reflection */}
        <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-transparent pointer-events-none"></div>
        <div className="relative">
          <div className="text-lg font-semibold text-white mb-2 drop-shadow-sm">2FA Verification</div>
          <div className="text-sm text-white/70 mb-4">Enter your 6-digit code from your authenticator app.</div>
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]{6}"
          maxLength={6}
            className="w-full rounded-xl border border-white/20 bg-white/10 backdrop-blur-md px-3 py-2.5 text-white placeholder:text-white/40 mb-2 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-all"
          placeholder="123456"
          value={code}
          onChange={e => setCode(e.target.value)}
          disabled={verifying}
        />
          {error && <div className="text-xs text-red-300 mb-2">{error}</div>}
        <div className="flex gap-2 mt-2">
          <button
              className="flex-1 rounded-xl border border-white/20 bg-white/10 backdrop-blur-md px-3 py-2.5 text-sm text-white/90 hover:bg-white/20 hover:border-white/30 transition-all duration-200"
            onClick={onClose}
            disabled={verifying}
          >Cancel</button>
          <button
              className="flex-1 rounded-xl bg-gradient-to-br from-emerald-500/80 to-cyan-500/80 backdrop-blur-md px-3 py-2.5 text-sm text-white font-medium hover:from-emerald-500 hover:to-cyan-500 disabled:opacity-60 shadow-lg shadow-emerald-500/20 transition-all duration-200"
            onClick={() => onVerify(code)}
            disabled={verifying || code.length !== 6}
          >{verifying ? "Verifying…" : "Verify"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Helper to ensure SVG has xmlns attribute and decode data URI if needed
function patchSvgNamespace(svg: string | null): string {
  if (!svg) return "";
  // If it's a data URI, decode it
  if (svg.startsWith("data:image/svg+xml")) {
    try {
      const commaIdx = svg.indexOf(",");
      if (commaIdx !== -1) {
        svg = decodeURIComponent(svg.slice(commaIdx + 1));
      }
    } catch {}
  }
  if (svg.includes("xmlns=")) return svg;
  return svg.replace(
    /<svg(\s|>)/,
    '<svg xmlns="http://www.w3.org/2000/svg"$1'
  );
}

import {
  LogOut,
  ShieldCheck,
  User2,
  KeyRound,
  Link2,
  Activity,
  Settings,
  AlertTriangle,
  Copy,
  Eye,
  EyeOff,
  Upload,
} from "lucide-react";

type ProfileUser = {
  id: string;
  email: string | null;
  createdAt: string;
  lastSignInAt: string | null;
  fullName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  providers?: string[];
  emailVerified?: boolean;
  profilePic?: string | null;
};

type TabKey = "overview" | "account" | "security" | "sessions" | "providers" | "keys" | "danger";

function mask(str: string, visible: number = 4) {
  if (!str) return "";
  if (str.length <= visible * 2) return "••••";
  return `${str.slice(0, visible)}••••${str.slice(-visible)}`;
}

export default function UserProfile() {
  
  // Password visibility toggles
  const [showOldPassword, setShowOldPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  // 2FA inline section state
  const [show2FASection, setShow2FASection] = useState(false);
  const [twoFACode, setTwoFACode] = useState("");
  // Top-level render debug log (after all state declarations)
  // This will log on every render and show the current value of show2FASection
  console.log('UserProfile render, show2FASection:', show2FASection);
  // Helper for password validation
  function validatePasswordFields() {
    if (!oldPassword || !newPassword || !confirmPassword) {
      return "All fields are required.";
    }
    if (newPassword !== confirmPassword) {
      return "New passwords do not match.";
    }
    if (oldPassword === newPassword) {
      return "New password must be different from old password.";
    }
    return null;
  }
  // Password change feedback state
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  // Change password expand state
  const [showPasswordFields, setShowPasswordFields] = useState(false);
  const [oldPassword, setOldPassword] = useState("");
  // ...existing code...
  const [twoFAVerifying, setTwoFAVerifying] = useState(false);
  const [twoFAError, setTwoFAError] = useState<string | null>(null);
  const twoFAActionRef = React.useRef<null | (() => Promise<void>)>(null);

  // Helper to trigger 2FA before sensitive actions
  // Accepts an action that takes an optional accessToken
  const aal2AccessTokenRef = React.useRef<string | null>(null);
  async function require2FA(action: (accessToken?: string | null) => Promise<void>) {
    setTwoFAError(null);
    setTwoFACode("");
    try {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) throw error;
      const totp = data?.all?.find((f: any) => f.factor_type === "totp" && f.status === "verified");
      if (totp) {
        twoFAActionRef.current = action;
        setShow2FASection(true);
      } else {
        await action();
      }
    } catch (e) {
      await action();
    }
  }

  // 2FA verify handler
  async function handle2FAVerify(code: string) {
    setTwoFAVerifying(true);
    setTwoFAError(null);
    try {
      // Find the TOTP factor id
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) throw error;
      const totp = data?.all?.find((f: any) => f.factor_type === "totp" && f.status === "verified");
      if (!totp) throw new Error("No TOTP factor found");
      // 1. Create challenge
      const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({ factorId: totp.id });
      if (challengeError) throw challengeError;
      // 2. Verify code
      const { data: verifyData, error: verifyError } = await supabase.auth.mfa.verify({ factorId: totp.id, challengeId: challengeData.id, code });
      if (verifyError) throw verifyError;
      // 3. Set AAL2 session using returned tokens
      if (verifyData?.access_token && verifyData?.refresh_token) {
        await supabase.auth.setSession({
          access_token: verifyData.access_token,
          refresh_token: verifyData.refresh_token,
        });
      } else {
        throw new Error("2FA verification did not return session tokens");
      }
      setShow2FASection(false);
      setTwoFAVerifying(false);
      setTwoFAError(null);
      setTwoFACode("");
      if (twoFAActionRef.current) {
        await twoFAActionRef.current();
        twoFAActionRef.current = null;
      }
    } catch (e: any) {
      setTwoFAError(e.message || "Invalid code");
      setTwoFAVerifying(false);
      console.error('2FA verification error', e);
    }
  }


  // ...other state declarations...

  // Tab state

  // ...other state declarations...

    const [active, setActive] = useState<TabKey>("overview"); // Keep this declaration

  // 2FA state (must be after 'active')
  const [mfaEnrolled, setMfaEnrolled] = useState(false);
  // Delete account confirmation modal
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const [mfaLoading, setMfaLoading] = useState(false);
  const [mfaError, setMfaError] = useState<string | null>(null);
  const [totpSecret, setTotpSecret] = useState<string | null>(null);
  const [totpQr, setTotpQr] = useState<string | null>(null);
  const [totpCode, setTotpCode] = useState("");
  const [verifying, setVerifying] = useState(false);

  // Check if user has TOTP enrolled when Security tab is active
  useEffect(() => {
    async function checkMfa() {
      setMfaLoading(true);
      setMfaError(null);
      try {
        const { data, error } = await supabase.auth.mfa.listFactors();
        if (error) throw error;
        const totp = data?.all?.find((f: any) => f.factor_type === "totp" && f.status === "verified");
        setMfaEnrolled(!!totp);
      } catch (e: any) {
        setMfaError(e.message || "Failed to check 2FA status");
      } finally {
        setMfaLoading(false);
      }
    }
    if (active === "security") checkMfa();
  }, [active]);
  const router = useRouter();
  const [user, setUser] = useState<ProfileUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [profilePicUrl, setProfilePicUrl] = useState<string | null>(null);
  const [profilePicUploading, setProfilePicUploading] = useState(false);
  const [profilePicFile, setProfilePicFile] = useState<File | null>(null);
  const [tempProfilePicUrl, setTempProfilePicUrl] = useState<string | null>(null);
  const [profilePicChanged, setProfilePicChanged] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const { showToast } = useToast();
  // Seeding points state (client-side calculation from WebTorrent stats)
  const [points, setPoints] = useState<number>(0);
  const [totalSeedingTime, setTotalSeedingTime] = useState<number>(0);
  // Wallet connection (for blockchain file registration)
  const wallet = useWallet();
  // Account form state
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");

  // Security form state
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Set mounted on client side to prevent hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    async function load() {
      const { data } = await supabase.auth.getUser();
      const supaUser = data?.user;
      if (!supaUser) {
        router.push("/signin");
        return;
      }
      const meta = (supaUser.user_metadata || {}) as Record<string, any>;
      const appMeta = (supaUser.app_metadata || {}) as Record<string, any>;
      const profileUser: ProfileUser = {
        id: supaUser.id,
        email: supaUser.email ?? null,
        createdAt: supaUser.created_at,
        lastSignInAt: (supaUser as any).last_sign_in_at ?? null,
        fullName: meta.full_name ?? null,
        firstName: meta.first_name ?? null,
        lastName: meta.last_name ?? null,
        providers: (appMeta.providers as string[]) || [],
        emailVerified: Boolean((supaUser as any).email_confirmed_at),
        profilePic: meta.profile_pic || null,
      };
      setUser(profileUser);
      setFirstName(profileUser.firstName || "");
      setLastName(profileUser.lastName || "");
      setProfilePicUrl(meta.profile_pic || null);
      setLoading(false);
    }
    if (mounted) {
    load();
    }
  }, [router, mounted]);

  // Note: Seeding is now handled on the Share page. Points are calculated from WebTorrent client stats.

  // Calculate points from WebTorrent client stats (seeding UI moved to Share page)
  useEffect(() => {
    const interval = setInterval(() => {
      try {
        const client = (window as any).__webtorrentClient;
        if (!client) return;
        
        // Calculate points from all torrents
        const torrents = client.torrents || [];
        let activeSeedingCount = 0;
        
        torrents.forEach((torrent: any) => {
          // Count actively seeding torrents (torrents that are ready to seed)
          // A torrent is seeding if it's done (all pieces available) or was created via seed()
          // We check if torrent is ready and has files available for seeding
          const isSeeding = torrent.done === true || (torrent.ready && torrent.files && torrent.files.length > 0);
          if (isSeeding) {
            activeSeedingCount++;
          }
        });
        
        // Points calculation: 10 points per actively seeding file/torrent
        // Points are based solely on the number of files being seeded, not file size
        const calculatedPoints = activeSeedingCount * 10;
        setPoints(calculatedPoints);
      } catch (err) {
        console.error('Points calculation error:', err);
      }
    }, 500);
    
    return () => {
      clearInterval(interval);
    };
  }, []);


  const envInfo = useMemo(() => {
    return {
      url: process.env.NEXT_PUBLIC_SUPABASE_URL || "",
      anon: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
    };
  }, []);



  // Prevent hydration mismatch by not rendering loading state until mounted
  if (!mounted || loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-950 via-purple-950 to-black grid place-items-center relative overflow-hidden">
        <div className="fixed inset-0 -z-10">
          <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 via-purple-500/10 to-pink-500/10 animate-pulse"></div>
        </div>
        <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-2xl px-6 py-4 shadow-2xl shadow-purple-500/10">
          <div className="text-white/90">Loading your profile…</div>
        </div>
      </div>
    );
  }

  if (!user) return null;

  const initials = (user.fullName || user.email || "U").split(" ").map((s) => s[0]?.toUpperCase()).slice(0, 2).join("");

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-950 via-purple-950 to-black relative overflow-hidden">
      {/* Animated background layers for depth */}
      <div className="fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 via-purple-500/10 to-pink-500/10 animate-pulse"></div>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(120,119,198,0.15),transparent_50%)]"></div>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_80%,rgba(59,130,246,0.15),transparent_50%)]"></div>
      </div>
      
      <div className="mx-auto max-w-6xl px-4 py-10 relative z-10">
        {/* Header */}
        <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-2xl p-6 shadow-2xl shadow-purple-500/10 relative overflow-hidden">
          {/* Glass reflection effect */}
          <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-transparent pointer-events-none"></div>
          <div className="relative">
          <div className="flex items-center gap-4">
            {profilePicUrl ? (
                <div className="relative">
                  <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-cyan-400/50 to-purple-500/50 blur-xl"></div>
              <img 
                src={profilePicUrl} 
                alt="Profile" 
                    className="relative h-16 w-16 rounded-2xl object-cover border border-white/20 shadow-lg"
              />
                </div>
            ) : (
                <div className="relative">
                  <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-cyan-400/50 to-purple-500/50 blur-xl"></div>
                  <div className="relative h-16 w-16 rounded-2xl bg-gradient-to-br from-cyan-400 to-purple-500 grid place-items-center text-white text-2xl font-bold shadow-lg border border-white/20">
                {initials}
                  </div>
              </div>
            )}
            <div className="flex-1">
                <div className="text-white text-xl font-semibold drop-shadow-sm">
                {user.fullName || user.email}
              </div>
                <div className="text-sm text-white/70">
                {user.email}
                {user.emailVerified ? (
                    <span className="ml-2 inline-flex items-center gap-1 text-emerald-300">
                    <ShieldCheck className="h-4 w-4" /> verified
                  </span>
                ) : null}
              </div>
            </div>
            <button
                className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 backdrop-blur-md px-4 py-2.5 text-sm text-white/90 hover:bg-white/20 hover:border-white/30 transition-all duration-300 shadow-lg shadow-black/20"
              onClick={async () => {
                await AuthService.signOut();
                router.push("/signin");
              }}
            >
              <LogOut className="h-4 w-4" /> Sign out
            </button>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-[240px_1fr]">
          {/* Sidebar */}
          <aside className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-2xl shadow-2xl shadow-purple-500/10 p-3 relative overflow-hidden">
            {/* Glass reflection */}
            <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-transparent pointer-events-none"></div>
            <div className="relative space-y-1.5">
            <NavItem icon={<Activity className="h-4 w-4" />} label="Overview" active={active === "overview"} onClick={() => setActive("overview")} />
            <NavItem icon={<User2 className="h-4 w-4" />} label="Account" active={active === "account"} onClick={() => setActive("account")} />
            <NavItem icon={<ShieldCheck className="h-4 w-4" />} label="Security" active={active === "security"} onClick={() => setActive("security")} />
            <NavItem icon={<Settings className="h-4 w-4" />} label="Sessions" active={active === "sessions"} onClick={() => setActive("sessions")} />
            <NavItem icon={<Link2 className="h-4 w-4" />} label="Providers" active={active === "providers"} onClick={() => setActive("providers")} />
            <NavItem icon={<AlertTriangle className="h-4 w-4" />} label="Danger" active={active === "danger"} onClick={() => setActive("danger")} />
            </div>
          </aside>

          {/* Content */}
          <main className="min-h-[520px] rounded-3xl border border-white/10 bg-white/5 backdrop-blur-2xl p-6 shadow-2xl shadow-purple-500/10 relative overflow-hidden">
            {/* Glass reflection */}
            <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-transparent pointer-events-none"></div>
            <div className="relative">
            {active === "overview" && (
                <>
              <div className="space-y-6">
                <SectionTitle icon={<Activity className="h-5 w-5" />} title="Overview" subtitle="Your account at a glance" />
                    <div className="mb-4">
                      <WalletConnect />
                    </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <InfoCard label="Email" value={user.email || "—"} />
                  <InfoCard label="Created" value={new Date(user.createdAt).toLocaleString()} />
                  <InfoCard label="Last sign in" value={user.lastSignInAt ? new Date(user.lastSignInAt).toLocaleString() : "—"} />
                      <InfoCard label="Seeding points" value={points.toFixed(0)} />
                </div>
              </div>
                </>
            )}

            {active === "account" && (
              <div className="space-y-10">
                {/* Profile Picture Section */}
                <div>
                  <EnhancedImageUpload
                    value={tempProfilePicUrl || profilePicUrl || undefined}
                    onChange={(url: string) => {
                      setTempProfilePicUrl(url);
                      setProfilePicChanged(true);
                    }}
                    onUploadStart={() => {
                      showToast('Uploading profile picture...', 'info');
                    }}
                    onUploadComplete={(url: string) => {
                      setTempProfilePicUrl(url);
                      setProfilePicChanged(true);
                      showToast('Profile picture uploaded successfully! Click Update to save changes.', 'success');
                    }}
                    onUploadError={(error: string) => {
                      showToast(`Upload failed: ${error}`, 'error');
                    }}
                    title="Profile Picture"
                    supportedFormats="Supported formats: JPG, PNG, GIF (Max 5MB)"
                  />
                  
                  {profilePicChanged && (
                    <div className="mt-4 flex gap-3">
                      <button
                        onClick={async () => {
                          if (!tempProfilePicUrl) return;
                          
                          setSaving(true);
                          try {
                            // Save to user profile in Supabase
                            const { error } = await supabase.auth.updateUser({ 
                              data: { profile_pic: tempProfilePicUrl } 
                            });
                            
                            if (error) {
                              showToast('Failed to update profile picture', 'error');
                            } else {
                              setProfilePicUrl(tempProfilePicUrl);
                              setUser(u => u ? { ...u, profilePic: tempProfilePicUrl } : u);
                              setProfilePicChanged(false);
                              setTempProfilePicUrl(null);
                              showToast('Profile picture updated successfully!', 'success');
                            }
                          } catch (error) {
                            showToast('Failed to update profile picture', 'error');
                          } finally {
                            setSaving(false);
                          }
                        }}
                        disabled={saving || !tempProfilePicUrl}
                        className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-br from-cyan-500/80 to-purple-500/80 backdrop-blur-md px-4 py-2.5 text-sm font-medium text-white hover:from-cyan-500 hover:to-purple-500 disabled:opacity-60 shadow-lg shadow-cyan-500/20 transition-all duration-300"
                      >
                        {saving ? "Updating..." : "Update Profile Picture"}
                      </button>
                      
                      <button
                        onClick={() => {
                          setTempProfilePicUrl(null);
                          setProfilePicChanged(false);
                        }}
                        className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 backdrop-blur-md px-4 py-2.5 text-sm text-white/90 hover:bg-white/20 hover:border-white/30 transition-all duration-200"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>

                {/* Name Section */}
                <div>
                  <div className="mb-2 text-base font-semibold text-white border-b border-white/10 pb-1">Name</div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-sm text-white/80">First name</label>
                      <input
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        placeholder="Jane"
                        className="w-full rounded-xl border border-white/20 bg-white/10 backdrop-blur-md px-3 py-2.5 text-white/90 placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        readOnly={!editingName}
                        disabled={!editingName}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm text-white/80">Last name</label>
                      <input
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        placeholder="Doe"
                        className="w-full rounded-xl border border-white/20 bg-white/10 backdrop-blur-md px-3 py-2.5 text-white/90 placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        readOnly={!editingName}
                        disabled={!editingName}
                      />
                    </div>
                  </div>
                  <div className="mt-3">
                    {!editingName ? (
                      <button
                        onClick={() => setEditingName(true)}
                        className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-br from-cyan-500 to-indigo-600 px-4 py-2 text-sm font-medium text-white hover:from-cyan-600 hover:to-indigo-700"
                      >
                        Edit Name
                      </button>
                    ) : (
                      <button
                        disabled={saving}
                        onClick={async () => {
                          setSaving(true);
                          const fullName = [firstName, lastName].filter(Boolean).join(" ");
                          const { error } = await supabase.auth.updateUser({
                            data: { first_name: firstName || null, last_name: lastName || null, full_name: fullName || null },
                          });
                          setSaving(false);
                          setEditingName(false);
                          if (error) return showToast("Failed to save", 'error');
                          setUser((u) => u ? { ...u, firstName, lastName, fullName } : u);
                          showToast("Profile updated", 'success');
                        }}
                        className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-br from-cyan-500/80 to-purple-500/80 backdrop-blur-md px-4 py-2.5 text-sm font-medium text-white hover:from-cyan-500 hover:to-purple-500 disabled:opacity-60 shadow-lg shadow-cyan-500/20 transition-all duration-300"
                      >
                        {saving ? "Saving…" : "Save changes"}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {active === "security" && (
              <div className="space-y-6">
                <SectionTitle icon={<ShieldCheck className="h-5 w-5" />} title="Security" subtitle="Keep your account secure" />
                {/* 2FA Section */}
                <div className="mb-8">
                  <div className="mb-3 text-base font-semibold text-white border-b border-white/10 pb-1">Two-Factor Authentication (2FA)</div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-4 shadow-lg shadow-black/10 relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-transparent pointer-events-none"></div>
                    <div className="relative">
                    <div className="mb-2 flex items-center gap-2">
                      <span className="font-medium text-white/90">Status:</span>
                      {mfaLoading && <span className="text-xs text-white/60 ml-2">Checking…</span>}
                      {mfaEnrolled && !mfaLoading && <span className="ml-2 rounded-full bg-emerald-500/20 px-2 py-1 text-xs text-emerald-300 ring-1 ring-inset ring-emerald-500/40 backdrop-blur-sm">Enabled</span>}
                      {!mfaEnrolled && !mfaLoading && <span className="ml-2 rounded-full bg-white/10 px-2 py-1 text-xs text-white/60 ring-1 ring-inset ring-white/20 backdrop-blur-sm">Disabled</span>}
                    </div>
                    {mfaError && <div className="text-xs text-red-300 mb-2">{mfaError}</div>}
                    {/* Enroll button */}
                    {!mfaEnrolled && !totpQr && (
                      <button
                        className="rounded-xl bg-gradient-to-br from-cyan-500/80 to-purple-500/80 backdrop-blur-md px-4 py-2.5 text-sm text-white font-medium hover:from-cyan-500 hover:to-purple-500 disabled:opacity-60 shadow-lg shadow-cyan-500/20 transition-all duration-300"
                        disabled={mfaLoading}
                        onClick={async () => {
                          setMfaError(null);
                          setMfaLoading(true);
                          try {
                            // Clean up any unverified TOTP factors first
                            const { data: factorsData, error: factorsError } = await supabase.auth.mfa.listFactors();
                            if (factorsError) throw factorsError;
                            const unverifiedTotp = (factorsData?.all || []).filter((f: any) => f.factor_type === "totp" && f.status !== "verified");
                            for (const factor of unverifiedTotp) {
                              await supabase.auth.mfa.unenroll({ factorId: factor.id });
                            }
                            // Now enroll new TOTP
                            const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp" });
                            if (error) throw error;
                            setTotpSecret(data.totp.secret);
                            setTotpQr(data.totp.qr_code);
                            // Save factorId for verification
                            (window as any)._supabaseTotpFactorId = data.id;
                          } catch (e: any) {
                            setMfaError(e.message || "Failed to start 2FA setup");
                          } finally {
                            setMfaLoading(false);
                          }
                        }}
                      >
                        Set up 2FA
                      </button>
                    )}
                    {/* Show QR and verify */}
                    {totpQr && !mfaEnrolled && (
                      <div className="mt-4 space-y-2">
                        <div className="text-white/80 text-sm">Scan this QR code with your authenticator app (Google Authenticator, Authy, etc):</div>
                        <div className="flex items-center gap-4 mt-2">
                          <div
                            className="rounded-xl border border-white/20 bg-white/20 backdrop-blur-sm shadow-lg"
                            style={{ width: 250, height: 250, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}
                            dangerouslySetInnerHTML={{ __html: patchSvgNamespace(totpQr) }}
                          />
                          <div className="text-xs text-white/60 break-all">Secret: <span className="font-mono text-white/90">{totpSecret}</span></div>
                        </div>
                        <div className="mt-2">
                          <input
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]{6}"
                            maxLength={6}
                            placeholder="Enter 6-digit code"
                            className="rounded-xl border border-white/20 bg-white/10 backdrop-blur-md px-3 py-2.5 text-white/90 w-40 placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-all"
                            value={totpCode}
                            onChange={e => setTotpCode(e.target.value)}
                          />
                          <button
                            className="ml-2 rounded-xl bg-gradient-to-br from-emerald-500/80 to-cyan-500/80 backdrop-blur-md px-4 py-2.5 text-sm text-white font-medium hover:from-emerald-500 hover:to-cyan-500 disabled:opacity-60 shadow-lg shadow-emerald-500/20 transition-all duration-300"
                            disabled={verifying || totpCode.length !== 6}
                            onClick={async () => {
                              setVerifying(true);
                              setMfaError(null);
                              try {
                                // Get factorId from enroll step
                                const factorId = (window as any)._supabaseTotpFactorId;
                                if (!factorId) throw new Error("Missing TOTP factorId");
                                // 1. Create challenge
                                const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
                                if (challengeError) throw challengeError;
                                // 2. Verify code
                                const { error: verifyError } = await supabase.auth.mfa.verify({ factorId, challengeId: challengeData.id, code: totpCode });
                                if (verifyError) throw verifyError;
                                setTotpQr(null);
                                setTotpSecret(null);
                                setTotpCode("");
                                setMfaEnrolled(true);
                                showToast("2FA enabled!", 'success');
                              } catch (e: any) {
                                setMfaError(e.message || "Failed to verify code");
                              } finally {
                                setVerifying(false);
                              }
                            }}
                          >
                            {verifying ? "Verifying…" : "Verify"}
                          </button>
                        </div>
                      </div>
                    )}
                    {/* Disable 2FA */}
                    {mfaEnrolled && (
                      <div className="mt-4">
                        <button
                          className="rounded-xl bg-gradient-to-br from-red-500/80 to-pink-500/80 backdrop-blur-md px-4 py-2.5 text-sm text-white font-medium hover:from-red-500 hover:to-pink-500 disabled:opacity-60 shadow-lg shadow-red-500/20 transition-all duration-300"
                          disabled={mfaLoading}
                          onClick={async () => {
                            setMfaError(null);
                            setMfaLoading(true);
                            try {
                              // Find the TOTP factor id
                              const { data, error } = await supabase.auth.mfa.listFactors();
                              if (error) throw error;
                              const totp = data?.all?.find((f: any) => f.factor_type === "totp" && f.status === "verified");
                              if (!totp) throw new Error("No TOTP factor found");
                              const { error: removeError } = await supabase.auth.mfa.unenroll({ factorId: totp.id });
                              if (removeError) throw removeError;
                              setMfaEnrolled(false);
                              showToast("2FA disabled", 'info');
                            } catch (e: any) {
                              setMfaError(e.message || "Failed to disable 2FA");
                            } finally {
                              setMfaLoading(false);
                            }
                          }}
                        >
                          Disable 2FA
                        </button>
                      </div>
                    )}
                    </div>
                  </div>
                </div>
                {/* Password Change Section */}
                <div className="mb-8">
                  <div className="mb-3 text-base font-semibold text-white border-b border-white/10 pb-1 flex items-center justify-between">
                    <span>Change Password</span>
                    <button
                      onClick={() => setShowPasswordFields((v) => !v)}
                      aria-expanded={showPasswordFields}
                    >
                      {showPasswordFields ? "Cancel" : "Change Password"}
                    </button>
                  </div>
                  {showPasswordFields && (
                    <>
                      {/* Inline 2FA Section (appears when show2FASection is true) */}
                      {show2FASection && (
                        <div className="mb-6 p-4 rounded-xl border border-emerald-700 bg-emerald-950/40 flex flex-col items-center max-w-md mx-auto">
                          <div className="text-lg font-semibold text-emerald-200 mb-2">2FA Verification Required</div>
                          <div className="text-sm text-emerald-100 mb-4">Enter your 6-digit code from your authenticator app to continue.</div>
                          <input
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]{6}"
                            maxLength={6}
                            className="w-40 rounded-xl border border-emerald-500/30 bg-emerald-500/10 backdrop-blur-md px-3 py-2.5 text-emerald-100 mb-2 text-center placeholder:text-emerald-300/50 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-all"
                            placeholder="123456"
                            value={twoFACode}
                            onChange={e => setTwoFACode(e.target.value)}
                            disabled={twoFAVerifying}
                          />
                          {twoFAError && <div className="text-xs text-red-300 mb-2">{twoFAError}</div>}
                          <div className="flex gap-2 mt-2">
                            <button
                              className="rounded-lg bg-zinc-700 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-600"
                              onClick={() => { setShow2FASection(false); setTwoFACode(""); setTwoFAError(null); setTwoFAVerifying(false); }}
                              disabled={twoFAVerifying}
                            >Cancel</button>
                            <button
                              className="rounded-lg bg-emerald-600 px-3 py-2 text-sm text-white font-medium hover:bg-emerald-700 disabled:opacity-60"
                              onClick={() => handle2FAVerify(twoFACode)}
                              disabled={twoFAVerifying || twoFACode.length !== 6}
                            >{twoFAVerifying ? "Verifying…" : "Verify"}</button>
                          </div>
                        </div>
                      )}
                      <div className="grid gap-4 sm:grid-cols-3">
                        <div className="space-y-2">
                          <label className="text-sm text-white/80">Old password</label>
                          <div className="relative">
                            <input
                              type={showOldPassword ? "text" : "password"}
                              value={oldPassword}
                              onChange={(e) => setOldPassword(e.target.value)}
                              className="w-full rounded-xl border border-white/20 bg-white/10 backdrop-blur-md px-3 py-2.5 text-white/90 pr-10 placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-all"
                            />
                            <button
                              type="button"
                              className="absolute right-2 top-1/2 -translate-y-1/2 text-white/60 hover:text-white transition-colors"
                              tabIndex={-1}
                              onClick={() => setShowOldPassword((v) => !v)}
                              aria-label={showOldPassword ? "Hide password" : "Show password"}
                            >
                              {showOldPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm text-zinc-300">New password</label>
                          <div className="relative">
                            <input
                              type={showNewPassword ? "text" : "password"}
                              value={newPassword}
                              onChange={(e) => setNewPassword(e.target.value)}
                              className="w-full rounded-xl border border-white/20 bg-white/10 backdrop-blur-md px-3 py-2.5 text-white/90 pr-10 placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-all"
                            />
                            <button
                              type="button"
                              className="absolute right-2 top-1/2 -translate-y-1/2 text-white/60 hover:text-white transition-colors"
                              tabIndex={-1}
                              onClick={() => setShowNewPassword((v) => !v)}
                              aria-label={showNewPassword ? "Hide password" : "Show password"}
                            >
                              {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm text-zinc-300">Confirm password</label>
                          <div className="relative">
                            <input
                              type={showConfirmPassword ? "text" : "password"}
                              value={confirmPassword}
                              onChange={(e) => setConfirmPassword(e.target.value)}
                              className="w-full rounded-xl border border-white/20 bg-white/10 backdrop-blur-md px-3 py-2.5 text-white/90 pr-10 placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-all"
                            />
                            <button
                              type="button"
                              className="absolute right-2 top-1/2 -translate-y-1/2 text-white/60 hover:text-white transition-colors"
                              tabIndex={-1}
                              onClick={() => setShowConfirmPassword((v) => !v)}
                              aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                            >
                              {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                          </div>
                        </div>
                      </div>
                      <div className="mt-4">
                        <button
                          disabled={passwordSaving}
                          onClick={async () => {
                            setPasswordError(null);
                            setPasswordSuccess(null);
                            const validation = validatePasswordFields();
                            if (validation) {
                              setPasswordError(validation);
                              return;
                            }
                            // 1. Check old password first
                            setPasswordSaving(true);
                            const { data: userData, error: userError } = await supabase.auth.getUser();
                            if (userError || !userData?.user?.email) {
                              setPasswordSaving(false);
                              setPasswordError("Could not get current user.");
                              return;
                            }
                            const { error: signInError } = await supabase.auth.signInWithPassword({
                              email: userData.user.email,
                              password: oldPassword,
                            });
                            if (signInError) {
                              setPasswordSaving(false);
                              setPasswordError("Old password is incorrect.");
                              return;
                            }
                            setPasswordSaving(false);
                            // 2. If old password is correct, proceed to 2FA (if enabled)
                            require2FA(async () => {
                              setPasswordSaving(true);
                              setPasswordError(null);
                              setPasswordSuccess(null);
                              const res = await AuthService.updatePassword(newPassword, oldPassword);
                              setPasswordSaving(false);
                              if (res.success) {
                                setPasswordSuccess("Password updated successfully!");
                                setOldPassword("");
                                setNewPassword("");
                                setConfirmPassword("");
                                setShowPasswordFields(false);
                              } else {
                                setPasswordError(res.error || "Failed to update password");
                              }
                            });
                          }}
                          className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 backdrop-blur-md px-4 py-2.5 text-sm font-medium text-white/90 hover:bg-white/20 hover:border-white/30 disabled:opacity-60 transition-all duration-200 shadow-lg shadow-black/10"
                        >
                          {passwordSaving ? (
                            <>
                              <span className="animate-spin inline-block mr-2 w-4 h-4 border-2 border-t-transparent border-white/60 rounded-full align-middle"></span>
                              Updating…
                            </>
                          ) : "Update password"}
                        </button>
                        {passwordError && <div className="mt-2 text-sm text-red-300">{passwordError}</div>}
                        {passwordSuccess && <div className="mt-2 text-sm text-emerald-300">{passwordSuccess}</div>}
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {active === "sessions" && (
              <div className="space-y-6">
                <SectionTitle icon={<Settings className="h-5 w-5" />} title="Sessions" subtitle="Recent authentication activity" />
                <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-4 text-sm text-white/80 shadow-lg shadow-black/10 relative overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-transparent pointer-events-none"></div>
                  <div className="relative">
                  <div>Last sign in: {user.lastSignInAt ? new Date(user.lastSignInAt).toLocaleString() : "—"}</div>
                  <div className="text-white/50 mt-1">More detailed session management can be added with Supabase Management API.</div>
                  </div>
                </div>
              </div>
            )}

            {active === "providers" && (
              <div className="space-y-6">
                <SectionTitle icon={<Link2 className="h-5 w-5" />} title="Connected providers" subtitle="OAuth providers linked to your account" />
                <div className="grid gap-3 sm:grid-cols-2">
                  {(user.providers && user.providers.length > 0 ? user.providers : ["email"]).map((p) => (
                    <div key={p} className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl px-4 py-3 shadow-lg shadow-black/10 relative overflow-hidden">
                      <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-transparent pointer-events-none"></div>
                      <div className="relative flex-1 text-white/90 capitalize">{p}</div>
                      <span className="relative rounded-full bg-emerald-500/20 px-2 py-1 text-xs text-emerald-300 ring-1 ring-inset ring-emerald-500/40 backdrop-blur-sm">connected</span>
                    </div>
                  ))}
                </div>
              </div>
            )}



            {active === "danger" && (
              <div className="space-y-6">
                <SectionTitle icon={<AlertTriangle className="h-5 w-5" />} title="Danger zone" subtitle="Sensitive actions" />
                <div className="space-y-3">
                  <button
                    className="w-full rounded-xl border border-red-500/30 bg-red-500/10 backdrop-blur-md px-4 py-2.5 text-red-300 hover:bg-red-500/20 hover:border-red-500/40 transition-all duration-200 shadow-lg shadow-red-500/10"
                    onClick={async () => {
                      await AuthService.signOut();
                      router.push("/signin");
                    }}
                  >
                    Sign out everywhere
                  </button>
                  <button
                    className="w-full rounded-xl border border-red-500/30 bg-red-500/10 backdrop-blur-md px-4 py-2.5 text-red-300 hover:bg-red-500/20 hover:border-red-500/40 transition-all duration-200 shadow-lg shadow-red-500/10"
                    onClick={() => setShowDeleteConfirm(true)}
                  >
                    Delete account (2FA required)
                  </button>

                  {showDeleteConfirm && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
                      <div className="w-full max-w-md rounded-3xl border border-red-500/30 bg-white/10 backdrop-blur-2xl p-6 shadow-2xl shadow-red-500/20 relative overflow-hidden">
                        <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-transparent pointer-events-none"></div>
                        <div className="relative">
                        <div className="text-lg font-semibold text-red-300 mb-1 drop-shadow-sm">Confirm account deletion</div>
                        <div className="text-sm text-white/80 mb-4">
                          This action is irreversible. All your data and session will be permanently deleted.
                        </div>
                        <div className="flex items-center justify-end gap-2">
                          <button
                            className="rounded-xl border border-white/20 bg-white/10 backdrop-blur-md px-3 py-2 text-sm text-white/90 hover:bg-white/20 hover:border-white/30 transition-all duration-200"
                            onClick={() => setShowDeleteConfirm(false)}
                          >
                            Cancel
                          </button>
                          <button
                            className="rounded-xl bg-gradient-to-br from-red-500/80 to-pink-500/80 backdrop-blur-md px-3 py-2 text-sm text-white hover:from-red-500 hover:to-pink-500 shadow-lg shadow-red-500/20 transition-all duration-300"
                            onClick={() => {
                              setShowDeleteConfirm(false)
                              require2FA(async () => {
                                try {
                                  showToast('Deleting account…', 'info')
                                  const res = await fetch('/api/delete-account', { method: 'POST' })
                                  const json = await res.json()
                                  if (!res.ok) {
                                    throw new Error(json?.error || 'Failed to delete account')
                                  }
                                  showToast('Account deleted', 'success')
                                  await AuthService.signOut()
                                  router.push('/signin')
                                } catch (e: any) {
                                  showToast(e?.message || 'Failed to delete account', 'error')
                                }
                              })
                            }}
                          >
                            Yes, delete my account
                          </button>
                        </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

      {/* Inline 2FA Section (appears when show2FASection is true) */}
      {show2FASection && (
              <div className="mb-6 p-4 rounded-3xl border border-emerald-500/30 bg-emerald-500/10 backdrop-blur-2xl flex flex-col items-center max-w-md mx-auto shadow-2xl shadow-emerald-500/20 relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-transparent pointer-events-none"></div>
                <div className="relative w-full">
                  <div className="text-lg font-semibold text-emerald-200 mb-2 drop-shadow-sm">2FA Verification Required</div>
                  <div className="text-sm text-emerald-100/90 mb-4">Enter your 6-digit code from your authenticator app to continue.</div>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
                    className="w-40 rounded-xl border border-emerald-500/30 bg-emerald-500/10 backdrop-blur-md px-3 py-2.5 text-emerald-100 mb-2 text-center placeholder:text-emerald-300/50 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-all"
            placeholder="123456"
            value={twoFACode}
            onChange={e => setTwoFACode(e.target.value)}
            disabled={twoFAVerifying}
          />
                  {twoFAError && <div className="text-xs text-red-300 mb-2">{twoFAError}</div>}
          <div className="flex gap-2 mt-2">
            <button
                      className="rounded-xl border border-white/20 bg-white/10 backdrop-blur-md px-3 py-2 text-sm text-white/90 hover:bg-white/20 hover:border-white/30 transition-all duration-200"
              onClick={() => { setShow2FASection(false); setTwoFACode(""); setTwoFAError(null); setTwoFAVerifying(false); }}
              disabled={twoFAVerifying}
            >Cancel</button>
            <button
                      className="rounded-xl bg-gradient-to-br from-emerald-500/80 to-cyan-500/80 backdrop-blur-md px-3 py-2 text-sm text-white font-medium hover:from-emerald-500 hover:to-cyan-500 disabled:opacity-60 shadow-lg shadow-emerald-500/20 transition-all duration-300"
              onClick={() => handle2FAVerify(twoFACode)}
              disabled={twoFAVerifying || twoFACode.length !== 6}
            >{twoFAVerifying ? "Verifying…" : "Verify"}</button>
          </div>
                </div>
              </div>
            )}
            </div>
          </main>
        </div>

      </div>
    </div>
  );
}

function NavItem({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-base font-medium transition-all duration-300 relative overflow-hidden
        ${active
          ? "bg-gradient-to-br from-cyan-500/30 to-purple-500/30 text-white shadow-lg shadow-cyan-500/20 border border-white/30 backdrop-blur-md scale-[1.02]"
          : "text-white/70 hover:bg-white/10 hover:text-white border border-transparent hover:border-white/20"}
      `}
    >
      {active && (
        <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-transparent"></div>
      )}
      <span className="relative z-10">{icon}</span>
      <span className="relative z-10">{label}</span>
    </button>
  );
}

function SectionTitle({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle?: string }) {
  return (
    <div>
      <div className="flex items-center gap-2 text-white drop-shadow-sm">
        {icon}
        <h2 className="text-lg font-semibold">{title}</h2>
      </div>
      {subtitle ? <p className="mt-1 text-sm text-white/60">{subtitle}</p> : null}
    </div>
  );
}

function InfoCard({ label, value, copyable = false }: { label: string; value: string; copyable?: boolean }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-4 shadow-lg shadow-black/10 relative overflow-hidden">
      {/* Glass reflection */}
      <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-transparent pointer-events-none"></div>
      <div className="relative">
        <div className="text-xs uppercase tracking-wide text-white/60">{label}</div>
      <div className="mt-1 flex items-center justify-between gap-2">
          <div className="truncate text-white/90" title={value}>{value}</div>
        {copyable ? (
          <button
              className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs text-white/80 border border-white/20 bg-white/10 backdrop-blur-sm hover:bg-white/20 hover:border-white/30 transition-all duration-200"
            onClick={() => navigator.clipboard.writeText(value)}
            aria-label={`Copy ${label}`}
            title="Copy"
          >
            <Copy className="h-3.5 w-3.5" /> Copy
          </button>
        ) : null}
        </div>
      </div>
    </div>
  );
}

function KeyRow({ label, value, onCopy }: { label: string; value: string; onCopy: () => void }) {
  const masked = mask(value);
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-4 shadow-lg shadow-black/10 relative overflow-hidden">
      {/* Glass reflection */}
      <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-transparent pointer-events-none"></div>
      <div className="relative flex-1 min-w-0">
        <div className="text-xs uppercase tracking-wide text-white/60">{label}</div>
        <div className="truncate text-white/90" title={value}>{masked || "—"}</div>
      </div>
      <button
        className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs text-white/80 border border-white/20 bg-white/10 backdrop-blur-sm hover:bg-white/20 hover:border-white/30 transition-all duration-200 relative z-10"
        onClick={() => {
          if (!value) return;
          navigator.clipboard.writeText(value);
          onCopy();
        }}
      >
        <Copy className="h-3.5 w-3.5" /> Copy
      </button>
    </div>
  );
}
