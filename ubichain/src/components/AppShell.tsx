"use client";
import React, { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { NavBar } from "@/components/ui/tubelight-navbar";
import { ToastProvider } from "@/components/ui/toast-1";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  
  useEffect(() => {
    setMounted(true);
  }, []);

  const hideOn = ["/signin", "/signup", "/"];
  const hideOnPrefixes = ["/auth/"]; // Paths that should match sub-paths
  
  // Only hide nav if mounted and pathname matches (prevents hydration mismatch)
  const shouldHideNav = mounted && (
    hideOn.some((p) => pathname === p) ||
    hideOnPrefixes.some((p) => pathname?.startsWith(p))
  );

  return (
    <ToastProvider>
      {mounted && !shouldHideNav && (
        <NavBar
          items={[
            { name: "Share", url: "/share", icon: "share" },
            { name: "Download", url: "/download", icon: "download" },
            { name: "Profile", url: "/profile", icon: "profile" },
          ]}
        />
      )}
      {children}
    </ToastProvider>
  );
}


