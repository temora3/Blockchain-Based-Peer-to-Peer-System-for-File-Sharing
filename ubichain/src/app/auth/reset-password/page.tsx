"use client";
import { useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { BoxReveal, Label, Input, BottomGradient } from "@/components/blocks/modern-animated-sign-in";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setMessage("");
    if (password.length < 6) {
      setError("Password must be at least 6 characters long.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      setError(error.message);
    } else {
      setMessage("Password updated! You can now sign in with your new password.");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950">
      <section className="max-w-md w-full p-8 bg-zinc-900 rounded-lg shadow-lg flex flex-col gap-6">
        <BoxReveal boxColor="var(--skeleton)" duration={0.3}>
          <h2 className="font-bold text-3xl text-white">Reset Password</h2>
        </BoxReveal>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <BoxReveal boxColor="var(--skeleton)" duration={0.3}>
            <Label htmlFor="password">New Password <span className="text-red-500">*</span></Label>
          </BoxReveal>
          <BoxReveal boxColor="var(--skeleton)" duration={0.3}>
            <Input
              id="password"
              type="password"
              placeholder="Enter new password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
          </BoxReveal>
          <BoxReveal boxColor="var(--skeleton)" duration={0.3}>
            <Label htmlFor="confirmPassword">Confirm Password <span className="text-red-500">*</span></Label>
          </BoxReveal>
          <BoxReveal boxColor="var(--skeleton)" duration={0.3}>
            <Input
              id="confirmPassword"
              type="password"
              placeholder="Confirm new password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              required
            />
          </BoxReveal>
          {error && <p className="text-red-500 text-sm">{error}</p>}
          {message && (
            <>
              <p className="text-green-400 text-sm">{message}</p>
              <div className="mt-4 text-center">
                <a href="/signin" className="text-cyan-400 hover:text-cyan-300 underline text-sm transition-colors">Return to Sign In</a>
              </div>
            </>
          )}
          <BoxReveal width="100%" boxColor="var(--skeleton)" duration={0.3} overflow="visible">
            <button
              className="bg-gradient-to-br relative group/btn from-zinc-800 to-zinc-900 block bg-zinc-800 w-full text-white rounded-md h-10 font-medium shadow-[0px_1px_0px_0px_#3f3f46_inset,0px_-1px_0px_0px_#3f3f46_inset] outline-hidden hover:cursor-pointer hover:from-zinc-700 hover:to-zinc-800 transition-all duration-200"
              type="submit"
              disabled={loading}
            >
              {loading ? "Updating..." : "Update Password"} &rarr;
              <BottomGradient />
            </button>
          </BoxReveal>
        </form>
      </section>
    </div>
  );
}
