import { motion } from "framer-motion";

interface ReadinessRingProps {
  value: number; // 0-100
  size?: number;
  strokeWidth?: number;
  label?: string;
  sublabel?: string;
}

/**
 * Animated readiness ring — cinematic gradient stroke, soft inner glow,
 * pulse halo. Designed as the emotional centerpiece of the dashboard hero.
 */
export function ReadinessRing({
  value,
  size = 220,
  strokeWidth = 14,
  label,
  sublabel,
}: ReadinessRingProps) {
  const clamped = Math.max(0, Math.min(100, value));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (clamped / 100) * circumference;

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      {/* Outer glow halo */}
      <div
        aria-hidden
        className="absolute inset-0 rounded-full bg-gradient-calm opacity-40 blur-2xl animate-pulse-glow"
      />
      <svg width={size} height={size} className="relative -rotate-90">
        <defs>
          <linearGradient id="ring-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="hsl(188 95% 65%)" />
            <stop offset="50%" stopColor="hsl(220 95% 70%)" />
            <stop offset="100%" stopColor="hsl(264 90% 72%)" />
          </linearGradient>
          <filter id="ring-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {/* Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="hsl(var(--border))"
          strokeWidth={strokeWidth}
          fill="none"
          opacity={0.5}
        />
        {/* Progress */}
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="url(#ring-grad)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          fill="none"
          filter="url(#ring-glow)"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: dashOffset }}
          transition={{ duration: 1.4, ease: [0.2, 0.8, 0.2, 1] }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4">
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="text-5xl md:text-6xl font-display font-semibold text-gradient-aurora leading-none"
        >
          {clamped}%
        </motion.div>
        {label && (
          <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground mt-3">{label}</p>
        )}
        {sublabel && (
          <p className="text-xs text-foreground/70 mt-1 max-w-[160px]">{sublabel}</p>
        )}
      </div>
    </div>
  );
}
