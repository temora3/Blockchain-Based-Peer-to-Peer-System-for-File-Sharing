"use client";
import React, { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { NavBar } from "@/components/ui/tubelight-navbar";
import { ToastProvider } from "@/components/ui/toast-1";
import { useUserRole } from "@/hooks/use-user-role";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const { isAdmin, loading: roleLoading } = useUserRole();
  
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

  // Build nav items based on user role
  const navItems = [
    { name: "Share", url: "/share", icon: "share" as const },
    { name: "Download", url: "/download", icon: "download" as const },
    { name: "Profile", url: "/profile", icon: "profile" as const },
  ];

  // Add Admin tab if user is admin
  if (isAdmin && !roleLoading) {
    navItems.push({ name: "Admin", url: "/admin", icon: "admin" as const });
  }

  return (
    <ToastProvider>
      {mounted && !shouldHideNav && (
        <NavBar
          items={navItems}
        />
      )}
      {children}
    </ToastProvider>
  );
}


