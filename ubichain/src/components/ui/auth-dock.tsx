"use client";
import React, {
  useState,
  useRef,
  useContext,
  createContext,
  useEffect
} from "react";
import {
  motion,
  useMotionValue,
  useTransform,
  useSpring
} from "motion/react";

// shared mouse position
const MouseContext = createContext({ x: 0, y: 0 });

// SVG icons
const GithubIcon = () => (
  <svg
    width="28"
    height="28"
    viewBox="0 0 24 24"
    fill="white"
    stroke="white"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 
             3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 
             6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 
             5.07 0 0 0 19.91 1S18.73.65 16 
             2.48a13.38 13.38 0 0 0-7 0C6.27.65 
             5.09 1 5.09 1A5.07 5.07 0 0 0 5 
             4.77a5.44 5.44 0 0 0-1.5 3.78c0 
             5.42 3.3 6.61 6.44 7A3.37 3.37 
             0 0 0 9 18.13V22"></path>
  </svg>
);

const GoogleIcon = () => (
  <svg width="28" height="28" viewBox="0 0 24 24">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
  </svg>
);


// individual icon with magnetic effect
function DockIcon({ icon, onClick, ariaLabel }: { 
  icon: React.ReactNode; 
  onClick: () => void;
  ariaLabel: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mouse = useContext(MouseContext);
  const distance = useMotionValue(Infinity);

  useEffect(() => {
    if (!ref.current || mouse.x === 0) {
      distance.set(Infinity);
      return;
    }
    const iconRect = ref.current.getBoundingClientRect();
    const containerRect = ref.current.parentElement?.getBoundingClientRect();
    if (!containerRect) return;
    
    const iconCenterX = iconRect.left + iconRect.width / 2;
    const mouseXAbsolute = containerRect.left + mouse.x;
    distance.set(Math.abs(mouseXAbsolute - iconCenterX));
  }, [mouse, distance]);

  const width = useTransform(distance, [0, 100], [60, 48]);
  const springW = useSpring(width, { mass: 0.1, stiffness: 150, damping: 12 });

  return (
    <motion.div
      ref={ref}
      style={{ width: springW }}
      className="aspect-square rounded-full bg-zinc-800 hover:bg-zinc-700 transition-colors grid place-items-center text-2xl cursor-pointer border border-zinc-600 text-white"
      onClick={onClick}
      role="button"
      aria-label={ariaLabel}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          onClick();
        }
      }}
    >
      {icon}
    </motion.div>
  );
}

// auth dock component
export default function AuthDock({ 
  onGithubClick = () => console.log('GitHub login'),
  onGoogleClick = () => console.log('Google login'),
}) {
  const [pos, setPos] = useState({ x: 0, y: 0 });

  const onMouseMove = (e: React.MouseEvent) => {
    const { clientX, currentTarget } = e;
    const { left } = currentTarget.getBoundingClientRect();
    setPos({ x: clientX - left, y: 0 });
  };

  const onMouseLeave = () => {
    setPos({ x: 0, y: 0 });
  };

  return (
    <MouseContext.Provider value={pos}>
      <div className="flex items-center justify-center w-full">
        <div
          onMouseMove={onMouseMove}
          onMouseLeave={onMouseLeave}
          className="flex h-20 items-end gap-3 rounded-2xl bg-zinc-900/80 px-4 pb-4 border border-zinc-600 backdrop-blur-sm"
        >
          <DockIcon 
            icon={<GithubIcon />} 
            onClick={onGithubClick}
            ariaLabel="Sign in with GitHub"
          />
          <DockIcon 
            icon={<GoogleIcon />} 
            onClick={onGoogleClick}
            ariaLabel="Sign in with Google"
          />
        </div>
      </div>
    </MouseContext.Provider>
  );
}