import React from 'react';
import Svg, { Path } from 'react-native-svg';

interface GridIconProps {
  size?: number;
  color?: string;
}

/**
 * Premium electrical transmission power grid / pylon SVG icon.
 * Symmetrical down X=16.
 */
export const GridIcon: React.FC<GridIconProps> = ({
  size = 26,
  color = '#2563eb',
}) => {
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      {/* ── Outer Power Transmission Lines ── */}
      <Path
        d="M2 13Q8 16 16 16Q24 16 30 13"
        stroke={color}
        strokeWidth="1"
        strokeOpacity="0.4"
        strokeDasharray="2 2"
      />
      <Path
        d="M2 19Q8 22 16 22Q24 22 30 19"
        stroke={color}
        strokeWidth="1"
        strokeOpacity="0.4"
        strokeDasharray="2 2"
      />

      {/* ── Main Pylon Frame ── */}
      {/* Top Spire */}
      <Path
        d="M16 3L14 10H18L16 3Z"
        stroke={color}
        strokeWidth="1.4"
        strokeLinejoin="round"
      />

      {/* Main Legs */}
      <Path
        d="M14 10L8 29"
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <Path
        d="M18 10L24 29"
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
      />

      {/* ── Horizontal Crossarms ── */}
      {/* Top Crossarm */}
      <Path
        d="M9 10H23"
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      {/* Mid Crossarm */}
      <Path
        d="M6 16H26"
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      {/* Lower Crossarm */}
      <Path
        d="M5 22H27"
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
      />

      {/* ── Internal X-Bracing ── */}
      <Path
        d="M14 10L18 16M18 10L14 16"
        stroke={color}
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <Path
        d="M13 16L19 22M19 16L13 22"
        stroke={color}
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <Path
        d="M11.5 22L20.5 29M20.5 22L11.5 29"
        stroke={color}
        strokeWidth="1.2"
        strokeLinecap="round"
      />

      {/* ── Insulator Drops ── */}
      <Path
        d="M9 10V12.5M23 10V12.5M6 16V18.5M26 16V18.5"
        stroke={color}
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </Svg>
  );
};
