import { useState, useEffect, useRef, memo } from "react";
import { getRadarPosition, playerColors } from "../utilities/utilities";

// Full circumference of r=18.5 is 2 * PI * 18.5 ~= 116.24
const CIRCUMFERENCE = 116.24;
// 280-degree visible arc with 80-degree gap at bottom
const ARC_TOTAL = (CIRCUMFERENCE * 280) / 360; // 90.41
const ARC_GAP = CIRCUMFERENCE - ARC_TOTAL; // 25.83

const Player = ({ playerData, mapData, localTeam, settings, rotationAngle = 0 }) => {
  const [lastKnownPosition, setLastKnownPosition] = useState(null);
  // Per-player accumulated rotation stored in a ref — avoids global cache bleed
  // that caused the 360-degree spin bug when multiple players shared one Map.
  const accRotRef = useRef(null);

  const radarPosition = getRadarPosition(mapData, playerData.m_position) || { x: 0, y: 0 };
  const posX = radarPosition.x;
  const posY = radarPosition.y;
  const invalidPosition = posX <= 0 && posY <= 0;

  // Smooth angle accumulation — correctly handles ±180 wrap without a full spin
  const targetAngle = 90 - (playerData.m_eye_angle ?? 0);
  if (accRotRef.current === null) {
    accRotRef.current = targetAngle;
  } else {
    const prev = ((accRotRef.current % 360) + 360) % 360;
    const delta = ((targetAngle - prev + 540) % 360) - 180;
    accRotRef.current = accRotRef.current + delta;
  }
  const playerRotation = accRotRef.current;

  const dotMultiplier = settings?.dotSize ?? 1;
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

  let hpColor = "#22c55e";
  let glowColor = "rgba(34, 197, 94, 0.6)";
  let gradStart = "#4ade80";
  let gradEnd = "#22c55e";

  if (!isTeammate) {
    gradStart = hp <= 25 ? "#ef4444" : "#fb923c";
    gradEnd = hp <= 25 ? "#b91c1c" : "#ef4444";
    hpColor = hp <= 25 ? "#ef4444" : "#f97316";
    glowColor = hp <= 25 ? "rgba(239, 68, 68, 0.8)" : "rgba(249, 115, 22, 0.65)";
  } else {
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
      <div
        className="w-full h-full relative flex items-center justify-center"
        style={{
          transform: `rotate(${playerData.m_is_dead ? 0 : playerRotation}deg)`,
          transition: "transform 100ms linear",
          opacity: playerData.m_is_dead ? 0.45 : 1,
        }}
      >
        {playerData.m_is_dead ? (
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
          <div className="w-full h-full relative flex items-center justify-center">
            {/* Directional Vision Arrow */}
            <div
              className="absolute -top-2 left-1/2 -translate-x-1/2 w-0 h-0 z-20"
              style={{
                borderLeft: "3.5px solid transparent",
                borderRight: "3.5px solid transparent",
                borderBottom: `6px solid ${playerColor}`,
                filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.9))",
              }}
            />

            {/* Radial Health Ring */}
            {showHealthBar && (
              <svg
                viewBox="0 0 44 44"
                className="absolute inset-0 w-full h-full z-10 pointer-events-none overflow-visible"
                style={{ filter: `drop-shadow(0 0 4px ${glowColor})` }}
              >
                <defs>
                  <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor={gradStart} />
                    <stop offset="100%" stopColor={gradEnd} />
                  </linearGradient>
                </defs>
                <circle
                  cx="22" cy="22" r="18.5"
                  fill="none"
                  stroke="rgba(255, 255, 255, 0.16)"
                  strokeWidth="3.2"
                  strokeDasharray={`${ARC_TOTAL} ${ARC_GAP}`}
                  strokeLinecap="round"
                  transform="rotate(130 22 22)"
                />
                <circle
                  cx="22" cy="22" r="18.5"
                  fill="none"
                  stroke={`url(#${gradId})`}
                  strokeWidth="3.4"
                  strokeDasharray={`${activeArcLength} ${CIRCUMFERENCE}`}
                  strokeDashoffset="0"
                  strokeLinecap="round"
                  transform="rotate(130 22 22)"
                  className={hp <= 25 ? "animate-pulse" : ""}
                  style={{ transition: "stroke-dasharray 200ms ease-out" }}
                />
              </svg>
            )}

            {/* Avatar */}
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

      {/* Name & HP labels (counter-rotated to stay upright) */}
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
          {showNames && (
            <span
              className="text-[9px] font-extrabold tracking-wider text-zinc-100 uppercase max-w-[64px] truncate"
              style={{
                textShadow: "0 1px 3px rgba(0,0,0,1), 0 0 4px rgba(0,0,0,0.9), 0 0 1px rgba(0,0,0,1)",
              }}
            >
              {playerData.m_name}
            </span>
          )}
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