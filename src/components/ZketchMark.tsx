import type React from "react";

const SWOOSH = "M14 66 C26 30 46 30 50 50 C54 70 72 70 86 34";

interface ZketchMarkProps {
  size?: number;
  className?: string;
  color?: string;
  animated?: boolean;
}

const ZketchMark: React.FC<ZketchMarkProps> = ({ size = 28, className = "", color = "var(--zk-accent)", animated = true }) => (
  <svg
    viewBox="0 0 100 100"
    width={size}
    height={size}
    aria-hidden="true"
    className={`zk-mark ${animated ? "zk-mark-animated" : ""} ${className}`}
  >
    <path className="zk-mark-ghost2" d={SWOOSH} pathLength={100} transform="translate(-8 4)" fill="none" stroke={color} strokeOpacity={0.22} strokeWidth={10} strokeLinecap="round" />
    <path className="zk-mark-ghost1" d={SWOOSH} pathLength={100} transform="translate(-4 2)" fill="none" stroke={color} strokeOpacity={0.45} strokeWidth={10} strokeLinecap="round" />
    <path className="zk-mark-main" d={SWOOSH} pathLength={100} fill="none" stroke={color} strokeWidth={10} strokeLinecap="round" />
  </svg>
);

export default ZketchMark;
