"use client"

import React, { useEffect, useState } from "react"
import { motion } from "framer-motion"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Home, Upload, Download, User2 } from "lucide-react"
import { cn } from "@/lib/utils"

type IconKey = "home" | "share" | "download" | "profile" | "torrents"

interface NavItem {
  name: string
  url: string
  icon?: IconKey
}

interface NavBarProps {
  items: NavItem[]
  className?: string
}

const ICONS: Record<IconKey, any> = {
  home: Home,
  share: Upload,
  download: Download,
  profile: User2,
  torrents: Download, // reuse Download icon for Torrents
}

export function NavBar({ items, className }: NavBarProps) {
  const pathname = usePathname();
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768)
    }

    handleResize()
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [])

  // Add Torrents page to nav items if not present
  const navItems = [
    ...items,
    { name: "Torrents", url: "/torrents", icon: "torrents" as IconKey },
  ];
  
  // Determine active tab based on current pathname
  const getActiveTabName = () => {
    // Find the nav item whose URL matches the current pathname
    const matchingItem = navItems.find(item => {
      if (item.url === pathname) return true;
      // For paths like /profile, check if pathname starts with the item URL
      if (pathname?.startsWith(item.url) && item.url !== '/') return true;
      return false;
    });
    return matchingItem?.name || items[0]?.name || '';
  };
  
  const activeTab = getActiveTabName();

  return (
    <div
      className={cn(
        "fixed top-0 left-1/2 -translate-x-1/2 z-50 pt-4",
        className,
      )}
    >
      <div className="flex items-center gap-2 bg-zinc-900/90 backdrop-blur-lg py-1 px-2 rounded-full shadow-2xl">
        {navItems.map((item) => {
          const Icon = item.icon ? ICONS[item.icon] : null;
          const isActive = activeTab === item.name;
          return (
            <Link
              key={item.name}
              href={item.url}
              className={cn(
                "relative cursor-pointer text-base font-bold px-6 py-2 rounded-full transition-colors border border-transparent",
                "text-white hover:text-emerald-300",
                isActive && "text-white shadow-lg bg-[#3C3E3E]",
              )}
            >
              <span className="hidden md:inline">{item.name}</span>
              <span className="md:hidden">
                {Icon ? <Icon size={18} strokeWidth={2.5} color="white" /> : null}
              </span>
              {isActive && (
                <motion.div
                  layoutId="lamp"
                  className="absolute inset-0 w-full rounded-full -z-10"
                  style={{
                    background: '#3C3E3E',
                    opacity: 0.85,
                  }}
                  initial={false}
                  transition={{
                    type: "spring",
                    stiffness: 300,
                    damping: 30,
                  }}
                >
                  <div
                    className="absolute -top-2 left-1/2 -translate-x-1/2 w-8 h-1 rounded-t-full"
                    style={{ background: '#3C3E3E', opacity: 1 }}
                  >
                    <div className="absolute w-12 h-6 rounded-full blur-md -top-2 -left-2"
                      style={{ background: '#3C3E3E', opacity: 0.7 }} />
                    <div className="absolute w-8 h-6 rounded-full blur-md -top-1"
                      style={{ background: '#3C3E3E', opacity: 0.7 }} />
                    <div className="absolute w-4 h-4 rounded-full blur-sm top-0 left-2"
                      style={{ background: '#3C3E3E', opacity: 0.5 }} />
                  </div>
                </motion.div>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
