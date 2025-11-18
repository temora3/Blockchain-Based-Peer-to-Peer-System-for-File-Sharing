"use client"

import React, { useEffect, useState } from "react"
import { motion } from "framer-motion"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Home, Upload, Download, User2, Shield } from "lucide-react"
import { cn } from "@/lib/utils"

type IconKey = "home" | "share" | "download" | "profile" | "torrents" | "admin"

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
  admin: Shield,
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
      <div className="flex items-center gap-2 border border-white/10 bg-white/5 backdrop-blur-2xl py-1.5 px-3 rounded-full shadow-2xl shadow-purple-500/10 relative overflow-hidden">
        {/* Glass reflection effect */}
        <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-transparent pointer-events-none"></div>
        <div className="relative flex items-center gap-2">
          {navItems.map((item) => {
            const Icon = item.icon ? ICONS[item.icon] : null;
            const isActive = activeTab === item.name;
          return (
            <Link
              key={item.name}
              href={item.url}
              className={cn(
                  "relative cursor-pointer text-base font-semibold px-5 py-2.5 rounded-full transition-all duration-300 border",
                  "text-white/80 hover:text-white hover:bg-white/10",
                  isActive 
                    ? "text-white border-white/30 bg-white/20 backdrop-blur-md shadow-lg shadow-white/20" 
                    : "border-transparent hover:border-white/20",
                )}
              >
                {/* Glass reflection for active state */}
                {isActive && (
                  <div className="absolute inset-0 bg-gradient-to-br from-white/20 via-white/10 to-transparent rounded-full pointer-events-none"></div>
                )}
                <span className="relative z-10 hidden md:inline">{item.name}</span>
                <span className="relative z-10 md:hidden">
                  {Icon ? <Icon size={18} strokeWidth={2.5} className="text-current" /> : null}
              </span>
              {isActive && (
                <motion.div
                  layoutId="lamp"
                    className="absolute inset-0 w-full rounded-full -z-10"
                    style={{
                      background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.25), rgba(255, 255, 255, 0.15))',
                      backdropFilter: 'blur(12px)',
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
                      style={{ 
                        background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.4), rgba(255, 255, 255, 0.3))',
                        backdropFilter: 'blur(8px)',
                      }}
                    >
                      <div className="absolute w-12 h-6 rounded-full blur-md -top-2 -left-2"
                        style={{ background: 'rgba(255, 255, 255, 0.3)', opacity: 0.7 }} />
                      <div className="absolute w-8 h-6 rounded-full blur-md -top-1"
                        style={{ background: 'rgba(255, 255, 255, 0.25)', opacity: 0.7 }} />
                      <div className="absolute w-4 h-4 rounded-full blur-sm top-0 left-2"
                        style={{ background: 'rgba(255, 255, 255, 0.3)', opacity: 0.6 }} />
                  </div>
                </motion.div>
              )}
            </Link>
            );
        })}
        </div>
      </div>
    </div>
  );
}
