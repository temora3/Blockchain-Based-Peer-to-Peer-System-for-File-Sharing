"use client";
import { useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { BoxReveal, Label, Input, BottomGradient } from "@/components/blocks/modern-animated-sign-in";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    });
    setLoading(false);
    if (error) {
      setError(error.message);
    } else {
      setMessage("Password reset email sent! Check your inbox.");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950">
      <section className="max-w-md w-full p-8 bg-zinc-900 rounded-lg shadow-lg flex flex-col gap-6">
        <BoxReveal boxColor="var(--skeleton)" duration={0.3}>
          <h2 className="font-bold text-3xl text-white">Forgot Password</h2>
        </BoxReveal>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <BoxReveal boxColor="var(--skeleton)" duration={0.3}>
            <Label htmlFor="email">Email <span className="text-red-500">*</span></Label>
          </BoxReveal>
          <BoxReveal boxColor="var(--skeleton)" duration={0.3}>
            <Input
              id="email"
              type="email"
              placeholder="Enter your email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
          </BoxReveal>
          {error && <p className="text-red-500 text-sm">{error}</p>}
          {message && <p className="text-green-400 text-sm">{message}</p>}
          <BoxReveal width="100%" boxColor="var(--skeleton)" duration={0.3} overflow="visible">
            <button
              className="bg-gradient-to-br relative group/btn from-zinc-800 to-zinc-900 block bg-zinc-800 w-full text-white rounded-md h-10 font-medium shadow-[0px_1px_0px_0px_#3f3f46_inset,0px_-1px_0px_0px_#3f3f46_inset] outline-hidden hover:cursor-pointer hover:from-zinc-700 hover:to-zinc-800 transition-all duration-200"
              type="submit"
              disabled={loading}
            >
              {loading ? "Sending..." : "Send Reset Link"} &rarr;
              <BottomGradient />
            </button>
          </BoxReveal>
        </form>
      </section>
    </div>
  );
}
