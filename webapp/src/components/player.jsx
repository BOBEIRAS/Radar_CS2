import { useState, useEffect, useId, memo } from "react";
import { getRadarPosition, playerColors } from "../utilities/utilities";

const rotationCache = new Map();
const calculatePlayerRotation = (playerData) => {
  const playerViewAngle = 90 - (playerData.m_eye_angle ?? 0);
  const idx = playerData.m_idx;
  let currentRot = rotationCache.get(idx) || 0;

  currentRot = ((currentRot % 360) + 360) % 360;
  currentRot += ((playerViewAngle - currentRot + 540) % 360) - 180;
  rotationCache.set(idx, currentRot);

  return currentRot;
};

// Full circumference of r=18.5 is 2 * PI * 18.5 ~= 116.24
const CIRCUMFERENCE = 116.24;
// 280-degree visible arc with 80-degree gap at bottom
const ARC_TOTAL = (CIRCUMFERENCE * 280) / 360; // 90.41
const ARC_GAP = CIRCUMFERENCE - ARC_TOTAL; // 25.83

const Player = ({ playerData, mapData, localTeam, settings, rotationAngle = 0 }) => {
  const [lastKnownPosition, setLastKnownPosition] = useState(null);
  const radarPosition = getRadarPosition(mapData, playerData.m_position) || { x: 0, y: 0 };
  const posX = radarPosition.x;
  const posY = radarPosition.y;
  const invalidPosition = posX <= 0 && posY <= 0;
  const playerRotation = calculatePlayerRotation(playerData);

  const dotMultiplier = settings?.dotSize ?? 1;
  // Scaled for high visibility of radial health ring
  const sizeStyle = `calc(clamp(28px, 4.2vmin, 44px) * ${dotMultiplier})`;

  useEffect(() => {
    if (playerData.m_is_dead) {
      setLastKnownPosition((prev) => prev || { x: posX, y: posY });
    } else {
      setLastKnownPosition(null);
    }
  }, [playerData.m_is_dead, posX, posY]);

  const effectivePosition = playerData.m_is_dead
    ? lastKnownPosition || { x: 0, y: 0 }
    : radarPosition;

  const isTeammate = playerData.m_team === localTeam;
  const playerColor = isTeammate
    ? playerColors[playerData.m_color] || "#38bdf8"
    : "#ef4444";

  const hp = Math.max(0, Math.min(100, playerData.m_health || 0));

  // Health colors & glow matching the tactical HUD image
  let hpColor = "#22c55e"; // bright neon green
  let glowColor = "rgba(34, 197, 94, 0.6)";
  let gradStart = "#4ade80";
  let gradEnd = "#22c55e";

  if (!isTeammate) {
    // Enemy style like the reference image: fire orange / crimson red
    gradStart = hp <= 25 ? "#ef4444" : "#fb923c";
    gradEnd = hp <= 25 ? "#b91c1c" : "#ef4444";
    hpColor = hp <= 25 ? "#ef4444" : "#f97316";
    glowColor = hp <= 25 ? "rgba(239, 68, 68, 0.8)" : "rgba(249, 115, 22, 0.65)";
  } else {
    // Teammate / Local player
    if (hp <= 25) {
      hpColor = "#ef4444";
      glowColor = "rgba(239, 68, 68, 0.8)";
      gradStart = "#f87171";
      gradEnd = "#ef4444";
    } else if (hp <= 50) {
      hpColor = "#f59e0b";
      glowColor = "rgba(245, 158, 11, 0.65)";
      gradStart = "#fde047";
      gradEnd = "#f59e0b";
    } else {
      hpColor = "#22c55e";
      glowColor = "rgba(34, 197, 94, 0.65)";
      gradStart = "#86efac";
      gradEnd = "#10b981";
    }
  }

  if (invalidPosition && !playerData.m_is_dead) {
    return null;
  }

  const showHealth = settings?.showHealth ?? true;
  const showHealthBar = settings?.showHealthBar ?? true;
  const showNames = settings?.showNames ?? false;

  // Active arc length based on current HP
  const activeArcLength = ARC_TOTAL * (hp / 100);
  const gradId = `hp-grad-${playerData.m_idx ?? 0}`;

  return (
    <div
      className="absolute pointer-events-none"
      style={{
        width: sizeStyle,
        height: sizeStyle,
        left: `${effectivePosition.x * 100}%`,
        top: `${effectivePosition.y * 100}%`,
        transform: "translate(-50%, -50%)",
        transition: "left 100ms linear, top 100ms linear",
        zIndex: playerData.m_is_dead ? 5 : 20,
      }}
    >
      {/* Container with View Rotation */}
      <div
        className="w-full h-full relative flex items-center justify-center"
        style={{
          transform: `rotate(${playerData.m_is_dead ? 0 : playerRotation}deg)`,
          transition: "transform 100ms linear",
          opacity: playerData.m_is_dead ? 0.45 : 1,
        }}
      >
        {playerData.m_is_dead ? (
          /* Dead Skull Icon - counter-rotated so it stays upright */
          <div
            className="w-3/4 h-3/4"
            style={{
              WebkitMask: `url('./assets/icons/icon-enemy-death_png.png') no-repeat center / contain`,
              backgroundColor: "#ef4444",
              transform: `rotate(${-rotationAngle}deg)`,
              transition: "transform 200ms ease-out",
            }}
          />
        ) : (
          /* Living Player: Directional Pointer + Radial Health Ring + Avatar */
          <div className="w-full h-full relative flex items-center justify-center">
            {/* Directional Vision Arrow (points in player facing direction) */}
            <div
              className="absolute -top-2 left-1/2 -translate-x-1/2 w-0 h-0 z-20"
              style={{
                borderLeft: "3.5px solid transparent",
                borderRight: "3.5px solid transparent",
                borderBottom: `6px solid ${playerColor}`,
                filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.9))",
              }}
            />

            {/* Tactical Radial Health Ring (SVG HUD arc) */}
            {showHealthBar && (
              <svg
                viewBox="0 0 44 44"
                className="absolute inset-0 w-full h-full z-10 pointer-events-none overflow-visible"
                style={{
                  filter: `drop-shadow(0 0 4px ${glowColor})`,
                }}
              >
                <defs>
                  <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor={gradStart} />
                    <stop offset="100%" stopColor={gradEnd} />
                  </linearGradient>
                </defs>

                {/* Track (Dark translucent background ring with gap at bottom) */}
                <circle
                  cx="22"
                  cy="22"
                  r="18.5"
                  fill="none"
                  stroke="rgba(255, 255, 255, 0.16)"
                  strokeWidth="3.2"
                  strokeDasharray={`${ARC_TOTAL} ${ARC_GAP}`}
                  strokeLinecap="round"
                  transform="rotate(130 22 22)"
                />

                {/* Dynamic Glowing Health Arc */}
                <circle
                  cx="22"
                  cy="22"
                  r="18.5"
                  fill="none"
                  stroke={`url(#${gradId})`}
                  strokeWidth="3.4"
                  strokeDasharray={`${activeArcLength} ${CIRCUMFERENCE}`}
                  strokeDashoffset="0"
                  strokeLinecap="round"
                  transform="rotate(130 22 22)"
                  className={hp <= 25 ? "animate-pulse" : ""}
                  style={{
                    transition: "stroke-dasharray 200ms ease-out",
                  }}
                />
              </svg>
            )}

            {/* Circular Avatar / Portrait (with dark border separating from radial ring) */}
            <div
              className="w-[66%] h-[66%] rounded-full overflow-hidden bg-black/95 relative flex items-center justify-center z-0"
              style={{
                border: `2px solid ${playerColor}`,
                boxShadow: settings?.radarGlow
                  ? `0 0 8px 2px ${playerColor}aa`
                  : "0 1px 4px rgba(0, 0, 0, 0.9)",
              }}
            >
              <img
                src={`/avatar?steamid=${playerData.m_steam_id}`}
                alt=""
                className="w-full h-full object-cover select-none pointer-events-none"
                style={{
                  transform: `rotate(${-playerRotation - rotationAngle}deg)`,
                  transition: "transform 100ms linear",
                }}
                onError={(e) => {
                  e.currentTarget.src = `./assets/characters/${playerData.m_model_name}.png`;
                  e.currentTarget.className =
                    "w-full h-full object-contain scale-125 object-top select-none pointer-events-none";
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Futuristic Tactical Name & HP Labels (always counter-rotated to stay upright) */}
      {!playerData.m_is_dead && (showHealth || showNames) && (
        <div
          className="absolute left-1/2 top-[88%] flex flex-col items-center pointer-events-none select-none whitespace-nowrap leading-tight"
          style={{
            zIndex: 30,
            transform: `translateX(-50%) rotate(${-rotationAngle}deg)`,
            transformOrigin: "center top",
            transition: "transform 200ms ease-out",
          }}
        >
          {/* Player Tag / Name (clean, uppercase, crisp tactical text) */}
          {showNames && (
            <span
              className="text-[9px] font-extrabold tracking-wider text-zinc-100 uppercase max-w-[64px] truncate"
              style={{
                textShadow:
                  "0 1px 3px rgba(0,0,0,1), 0 0 4px rgba(0,0,0,0.9), 0 0 1px rgba(0,0,0,1)",
              }}
            >
              {playerData.m_name}
            </span>
          )}

          {/* HP Number (e.g. "HP: 80" matching the reference HUD photo) */}
          {showHealth && (
            <span
              className="font-mono text-[8px] font-black tracking-tighter"
              style={{
                color: hpColor,
                textShadow: `0 0 6px ${glowColor}, 0 1px 2px rgba(0,0,0,1)`,
              }}
            >
              HP: {hp}
            </span>
          )}
        </div>
      )}
    </div>
  );
};

export default memo(Player);