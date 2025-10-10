// 2FA Modal Prompt
"use client";
import React from "react";

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-6 w-full max-w-xs shadow-xl">
        <div className="text-lg font-semibold text-zinc-100 mb-2">2FA Verification</div>
        <div className="text-sm text-zinc-400 mb-4">Enter your 6-digit code from your authenticator app.</div>
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]{6}"
          maxLength={6}
          className="w-full rounded-lg border border-zinc-700 bg-zinc-950/60 px-3 py-2 text-zinc-200 mb-2"
          placeholder="123456"
          value={code}
          onChange={e => setCode(e.target.value)}
          disabled={verifying}
        />
        {error && <div className="text-xs text-red-400 mb-2">{error}</div>}
        <div className="flex gap-2 mt-2">
          <button
            className="flex-1 rounded-lg bg-zinc-700 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-600"
            onClick={onClose}
            disabled={verifying}
          >Cancel</button>
          <button
            className="flex-1 rounded-lg bg-emerald-600 px-3 py-2 text-sm text-white font-medium hover:bg-emerald-700 disabled:opacity-60"
            onClick={() => onVerify(code)}
            disabled={verifying || code.length !== 6}
          >{verifying ? "Verifying…" : "Verify"}</button>
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
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import AuthService from "@/lib/auth";
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
  const [saving, setSaving] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Account form state
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");

  // Security form state
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

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
      };
      setUser(profileUser);
      setFirstName(profileUser.firstName || "");
      setLastName(profileUser.lastName || "");
      setLoading(false);
    }
    load();
  }, [router]);

  const envInfo = useMemo(() => {
    return {
      url: process.env.NEXT_PUBLIC_SUPABASE_URL || "",
      anon: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
    };
  }, []);

  function showToast(message: string) {
    setToast(message);
    setTimeout(() => setToast(null), 2200);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-950 to-black grid place-items-center">
        <div className="text-zinc-300">Loading your profile…</div>
      </div>
    );
  }

  if (!user) return null;

  const initials = (user.fullName || user.email || "U").split(" ").map((s) => s[0]?.toUpperCase()).slice(0, 2).join("");

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-950 to-black">
      <div className="mx-auto max-w-6xl px-4 py-10">
        {/* Header */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 backdrop-blur">
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 rounded-xl bg-gradient-to-br from-cyan-500 to-indigo-600 grid place-items-center text-white text-2xl font-bold">
              {initials}
            </div>
            <div className="flex-1">
              <div className="text-white text-xl font-semibold">
                {user.fullName || user.email}
              </div>
              <div className="text-sm text-zinc-400">
                {user.email}
                {user.emailVerified ? (
                  <span className="ml-2 inline-flex items-center gap-1 text-emerald-400">
                    <ShieldCheck className="h-4 w-4" /> verified
                  </span>
                ) : null}
              </div>
            </div>
            <button
              className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-800"
              onClick={async () => {
                await AuthService.signOut();
                router.push("/signin");
              }}
            >
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-[240px_1fr]">
          {/* Sidebar */}
          <aside className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-2">
            <NavItem icon={<Activity className="h-4 w-4" />} label="Overview" active={active === "overview"} onClick={() => setActive("overview")} />
            <NavItem icon={<User2 className="h-4 w-4" />} label="Account" active={active === "account"} onClick={() => setActive("account")} />
            <NavItem icon={<ShieldCheck className="h-4 w-4" />} label="Security" active={active === "security"} onClick={() => setActive("security")} />
            <NavItem icon={<Settings className="h-4 w-4" />} label="Sessions" active={active === "sessions"} onClick={() => setActive("sessions")} />
            <NavItem icon={<Link2 className="h-4 w-4" />} label="Providers" active={active === "providers"} onClick={() => setActive("providers")} />
            <NavItem icon={<KeyRound className="h-4 w-4" />} label="API Keys" active={active === "keys"} onClick={() => setActive("keys")} />
            <NavItem icon={<AlertTriangle className="h-4 w-4" />} label="Danger" active={active === "danger"} onClick={() => setActive("danger")} />
          </aside>

          {/* Content */}
          <main className="min-h-[520px] rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6">
            {active === "overview" && (
              <div className="space-y-6">
                <SectionTitle icon={<Activity className="h-5 w-5" />} title="Overview" subtitle="Your account at a glance" />
                <div className="grid gap-4 sm:grid-cols-2">
                  <InfoCard label="Email" value={user.email || "—"} />
                  <InfoCard label="User ID" value={user.id} copyable />
                  <InfoCard label="Created" value={new Date(user.createdAt).toLocaleString()} />
                  <InfoCard label="Last sign in" value={user.lastSignInAt ? new Date(user.lastSignInAt).toLocaleString() : "—"} />
                </div>
              </div>
            )}

            {active === "account" && (
              <div className="space-y-6">
                <SectionTitle icon={<User2 className="h-5 w-5" />} title="Account" subtitle="Manage your profile details" />
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm text-zinc-300">First name</label>
                    <input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Jane" className="w-full rounded-lg border border-zinc-700 bg-zinc-950/60 px-3 py-2 text-zinc-200 placeholder:text-zinc-500" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm text-zinc-300">Last name</label>
                    <input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Doe" className="w-full rounded-lg border border-zinc-700 bg-zinc-950/60 px-3 py-2 text-zinc-200 placeholder:text-zinc-500" />
                  </div>
                </div>
                <div>
                  <button
                    disabled={saving}
                    onClick={async () => {
                      setSaving(true);
                      const fullName = [firstName, lastName].filter(Boolean).join(" ");
                      const { error } = await supabase.auth.updateUser({
                        data: { first_name: firstName || null, last_name: lastName || null, full_name: fullName || null },
                      });
                      setSaving(false);
                      if (error) return showToast("Failed to save");
                      setUser((u) => u ? { ...u, firstName, lastName, fullName } : u);
                      showToast("Profile updated");
                    }}
                    className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-br from-cyan-500 to-indigo-600 px-4 py-2 text-sm font-medium text-white hover:from-cyan-600 hover:to-indigo-700 disabled:opacity-60"
                  >
                    {saving ? "Saving…" : "Save changes"}
                  </button>
                </div>
              </div>
            )}

            {active === "security" && (
              <div className="space-y-6">
                <SectionTitle icon={<ShieldCheck className="h-5 w-5" />} title="Security" subtitle="Keep your account secure" />
                {/* 2FA Section */}
                <div className="mb-8">
                  <div className="mb-3 text-base font-semibold text-zinc-100 border-b border-zinc-800 pb-1">Two-Factor Authentication (2FA)</div>
                  <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4">
                    <div className="mb-2 flex items-center gap-2">
                      <span className="font-medium text-zinc-200">Status:</span>
                      {mfaLoading && <span className="text-xs text-zinc-400 ml-2">Checking…</span>}
                      {mfaEnrolled && !mfaLoading && <span className="ml-2 rounded-full bg-emerald-500/15 px-2 py-1 text-xs text-emerald-400 ring-1 ring-inset ring-emerald-500/30">Enabled</span>}
                      {!mfaEnrolled && !mfaLoading && <span className="ml-2 rounded-full bg-zinc-500/15 px-2 py-1 text-xs text-zinc-400 ring-1 ring-inset ring-zinc-500/30">Disabled</span>}
                    </div>
                    {mfaError && <div className="text-xs text-red-400 mb-2">{mfaError}</div>}
                    {/* Enroll button */}
                    {!mfaEnrolled && !totpQr && (
                      <button
                        className="rounded-lg bg-cyan-600/80 px-4 py-2 text-sm text-white font-medium hover:bg-cyan-700 disabled:opacity-60"
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
                        <div className="text-zinc-300 text-sm">Scan this QR code with your authenticator app (Google Authenticator, Authy, etc):</div>
                        <div className="flex items-center gap-4 mt-2">
                          <div
                            className="rounded-lg border border-zinc-700 bg-white"
                            style={{ width: 250, height: 250, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}
                            dangerouslySetInnerHTML={{ __html: patchSvgNamespace(totpQr) }}
                          />
                          <div className="text-xs text-zinc-400 break-all">Secret: <span className="font-mono text-zinc-200">{totpSecret}</span></div>
                        </div>
                        <div className="mt-2">
                          <input
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]{6}"
                            maxLength={6}
                            placeholder="Enter 6-digit code"
                            className="rounded-lg border border-zinc-700 bg-zinc-950/60 px-3 py-2 text-zinc-200 w-40"
                            value={totpCode}
                            onChange={e => setTotpCode(e.target.value)}
                          />
                          <button
                            className="ml-2 rounded-lg bg-emerald-600/80 px-4 py-2 text-sm text-white font-medium hover:bg-emerald-700 disabled:opacity-60"
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
                                showToast("2FA enabled!");
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
                          className="rounded-lg bg-red-600/80 px-4 py-2 text-sm text-white font-medium hover:bg-red-700 disabled:opacity-60"
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
                              showToast("2FA disabled");
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
                {/* Password Change Section */}
                <div className="mb-8">
                  <div className="mb-3 text-base font-semibold text-zinc-100 border-b border-zinc-800 pb-1 flex items-center justify-between">
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
                            className="w-40 rounded-lg border border-emerald-700 bg-emerald-950/60 px-3 py-2 text-emerald-200 mb-2 text-center"
                            placeholder="123456"
                            value={twoFACode}
                            onChange={e => setTwoFACode(e.target.value)}
                            disabled={twoFAVerifying}
                          />
                          {twoFAError && <div className="text-xs text-red-400 mb-2">{twoFAError}</div>}
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
                          <label className="text-sm text-zinc-300">Old password</label>
                          <div className="relative">
                            <input
                              type={showOldPassword ? "text" : "password"}
                              value={oldPassword}
                              onChange={(e) => setOldPassword(e.target.value)}
                              className="w-full rounded-lg border border-zinc-700 bg-zinc-950/60 px-3 py-2 text-zinc-200 pr-10"
                            />
                            <button
                              type="button"
                              className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200"
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
                              className="w-full rounded-lg border border-zinc-700 bg-zinc-950/60 px-3 py-2 text-zinc-200 pr-10"
                            />
                            <button
                              type="button"
                              className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200"
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
                              className="w-full rounded-lg border border-zinc-700 bg-zinc-950/60 px-3 py-2 text-zinc-200 pr-10"
                            />
                            <button
                              type="button"
                              className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200"
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
                          onClick={() => {
                            setPasswordError(null);
                            setPasswordSuccess(null);
                            const validation = validatePasswordFields();
                            if (validation) {
                              setPasswordError(validation);
                              return;
                            }
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
                          className="inline-flex items-center gap-2 rounded-lg bg-zinc-100/10 px-4 py-2 text-sm font-medium text-zinc-200 ring-1 ring-inset ring-zinc-700 hover:bg-zinc-100/15 disabled:opacity-60"
                        >
                          {passwordSaving ? (
                            <>
                              <span className="animate-spin inline-block mr-2 w-4 h-4 border-2 border-t-transparent border-zinc-200 rounded-full align-middle"></span>
                              Updating…
                            </>
                          ) : "Update password"}
                        </button>
                        {passwordError && <div className="mt-2 text-sm text-red-400">{passwordError}</div>}
                        {passwordSuccess && <div className="mt-2 text-sm text-emerald-400">{passwordSuccess}</div>}
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {active === "sessions" && (
              <div className="space-y-6">
                <SectionTitle icon={<Settings className="h-5 w-5" />} title="Sessions" subtitle="Recent authentication activity" />
                <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4 text-sm text-zinc-300">
                  <div>Last sign in: {user.lastSignInAt ? new Date(user.lastSignInAt).toLocaleString() : "—"}</div>
                  <div className="text-zinc-500 mt-1">More detailed session management can be added with Supabase Management API.</div>
                </div>
              </div>
            )}

            {active === "providers" && (
              <div className="space-y-6">
                <SectionTitle icon={<Link2 className="h-5 w-5" />} title="Connected providers" subtitle="OAuth providers linked to your account" />
                <div className="grid gap-3 sm:grid-cols-2">
                  {(user.providers && user.providers.length > 0 ? user.providers : ["email"]).map((p) => (
                    <div key={p} className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-950/40 px-4 py-3">
                      <div className="text-zinc-200 capitalize">{p}</div>
                      <span className="rounded-full bg-emerald-500/15 px-2 py-1 text-xs text-emerald-400 ring-1 ring-inset ring-emerald-500/30">connected</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {active === "keys" && (
              <div className="space-y-6">
                <SectionTitle icon={<KeyRound className="h-5 w-5" />} title="API keys" subtitle="Client keys available in your app runtime" />
                <div className="space-y-3">
                  <KeyRow label="NEXT_PUBLIC_SUPABASE_URL" value={envInfo.url} onCopy={() => showToast("URL copied")} />
                  <KeyRow label="NEXT_PUBLIC_SUPABASE_ANON_KEY" value={envInfo.anon} onCopy={() => showToast("Anon key copied")} />
                </div>
                <div className="text-xs text-zinc-500">These are public client-side keys. Do not expose service role keys in the browser.</div>
              </div>
            )}

            {active === "danger" && (
              <div className="space-y-6">
                <SectionTitle icon={<AlertTriangle className="h-5 w-5" />} title="Danger zone" subtitle="Sensitive actions" />
                <div className="space-y-3">
                  <button
                    className="w-full rounded-lg bg-red-500/10 px-4 py-2 text-red-300 ring-1 ring-inset ring-red-500/30 hover:bg-red-500/15"
                    onClick={async () => {
                      await AuthService.signOut();
                      router.push("/signin");
                    }}
                  >
                    Sign out everywhere
                  </button>
                  <button
                    className="w-full rounded-lg bg-red-500/10 px-4 py-2 text-red-300 ring-1 ring-inset ring-red-500/30 hover:bg-red-500/15"
                    onClick={() => require2FA(async () => showToast("Delete account not implemented"))}
                  >
                    Delete account (2FA required)
                  </button>
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
            className="w-40 rounded-lg border border-emerald-700 bg-emerald-950/60 px-3 py-2 text-emerald-200 mb-2 text-center"
            placeholder="123456"
            value={twoFACode}
            onChange={e => setTwoFACode(e.target.value)}
            disabled={twoFAVerifying}
          />
          {twoFAError && <div className="text-xs text-red-400 mb-2">{twoFAError}</div>}
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
                </div>
              </div>
            )}
          </main>
        </div>

        {toast && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-full border border-zinc-800 bg-zinc-900/80 px-4 py-2 text-sm text-zinc-100 shadow-lg">
            {toast}
          </div>
        )}
      </div>
    </div>
  );
}

function NavItem({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm ${active ? "bg-zinc-800 text-white" : "text-zinc-300 hover:bg-zinc-800/60"}`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function SectionTitle({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle?: string }) {
  return (
    <div>
      <div className="flex items-center gap-2 text-white">
        {icon}
        <h2 className="text-lg font-semibold">{title}</h2>
      </div>
      {subtitle ? <p className="mt-1 text-sm text-zinc-400">{subtitle}</p> : null}
    </div>
  );
}

function InfoCard({ label, value, copyable = false }: { label: string; value: string; copyable?: boolean }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4">
      <div className="text-xs uppercase tracking-wide text-zinc-400">{label}</div>
      <div className="mt-1 flex items-center justify-between gap-2">
        <div className="truncate text-zinc-100" title={value}>{value}</div>
        {copyable ? (
          <button
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-zinc-300 ring-1 ring-inset ring-zinc-700 hover:bg-zinc-800"
            onClick={() => navigator.clipboard.writeText(value)}
            aria-label={`Copy ${label}`}
            title="Copy"
          >
            <Copy className="h-3.5 w-3.5" /> Copy
          </button>
        ) : null}
      </div>
    </div>
  );
}

function KeyRow({ label, value, onCopy }: { label: string; value: string; onCopy: () => void }) {
  const masked = mask(value);
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-zinc-800 bg-zinc-950/40 p-4">
      <div className="min-w-0">
        <div className="text-xs uppercase tracking-wide text-zinc-400">{label}</div>
        <div className="truncate text-zinc-100" title={value}>{masked || "—"}</div>
      </div>
      <button
        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-zinc-300 ring-1 ring-inset ring-zinc-700 hover:bg-zinc-800"
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
