import type React from "react";

interface IconProps {
  width?: number;
  height?: number;
  color?: string;
  className?: string;
}

const ShapeSettingsIcon: React.FC<IconProps> = ({
  width = 24,
  height = 24,
  color = "currentColor",
  className,
}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={width}
    height={height}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <circle cx="8" cy="8" r="5" />
    <rect x="11" y="11" width="10" height="10" rx="1.5" />
  </svg>
);

export default ShapeSettingsIcon;
