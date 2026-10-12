import React from 'react';
import Svg, { Path, Circle, Defs, LinearGradient, Stop } from 'react-native-svg';

interface SolarPanelIconProps {
  size?: number;
  color?: string;
  sunColor?: string;
}

/**
 * Premium rooftop solar panel SVG icon — 100% horizontally centered & symmetrical.
 */
export const SolarPanelIcon: React.FC<SolarPanelIconProps> = ({
  size = 42,
  color = '#d97706',
  sunColor = '#f59e0b',
}) => {
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <Defs>
        <LinearGradient id="panelGradCentered" x1="16" y1="13" x2="16" y2="25" gradientUnits="userSpaceOnUse">
          <Stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <Stop offset="100%" stopColor={color} stopOpacity="0.08" />
        </LinearGradient>
      </Defs>

      {/* ── Sun & Rays (Centered at X=16) ── */}
      <Circle cx="16" cy="6.5" r="3.2" fill={sunColor} />
      {/* Symmetrical Sun Rays */}
      <Path
        d="M16 1.5V3M10.5 6.5H12M20 6.5H21.5M12.1 2.6L13.2 3.7M19.9 2.6L18.8 3.7M12.4 9.8L13.4 8.8M19.6 9.8L18.6 8.8"
        stroke={sunColor}
        strokeWidth="1.2"
        strokeLinecap="round"
      />

      {/* ── Solar Panel Perspective Body (Centered at X=16) ── */}
      {/* Panel Face Fill */}
      <Path
        d="M7 13H25L28 24.5H4L7 13Z"
        fill="url(#panelGradCentered)"
      />

      {/* Panel Outer Frame */}
      <Path
        d="M7 13H25L28 24.5H4L7 13Z"
        stroke={color}
        strokeWidth="1.6"
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {/* Photovoltaic Vertical Grid Lines (Perspective, Symmetrical around X=16) */}
      <Path
        d="M13 13L12 24.5"
        stroke={color}
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <Path
        d="M19 13L20 24.5"
        stroke={color}
        strokeWidth="1.2"
        strokeLinecap="round"
      />

      {/* Photovoltaic Horizontal Grid Lines (Symmetrical around X=16) */}
      <Path
        d="M6 16.8H26"
        stroke={color}
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <Path
        d="M5 20.6H27"
        stroke={color}
        strokeWidth="1.2"
        strokeLinecap="round"
      />

      {/* ── Mounting Stand / Roof Base (Centered at X=16) ── */}
      <Path
        d="M16 24.5V28"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <Path
        d="M11 28H21"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </Svg>
  );
};
