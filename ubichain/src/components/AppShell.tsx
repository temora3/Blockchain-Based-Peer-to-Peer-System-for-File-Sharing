"use client";
import React from "react";
import { usePathname } from "next/navigation";
import { NavBar } from "@/components/ui/tubelight-navbar";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const hideOn = ["/signin", "/signup", "/auth/"];
  const shouldHideNav = hideOn.some((p) => pathname === p || pathname.startsWith(p));

  return (
    <>
      {!shouldHideNav && (
        <NavBar
          items={[
            { name: "Home", url: "/", icon: "home" },
            { name: "Share", url: "/share", icon: "share" },
            { name: "Download", url: "/download", icon: "download" },
            { name: "Profile", url: "/profile", icon: "profile" },
          ]}
        />
      )}
      {children}
    </>
  );
}


