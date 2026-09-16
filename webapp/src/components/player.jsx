import { useState, useEffect, memo } from "react";
import { getRadarPosition, playerColors } from "../utilities/utilities";

let playerRotations = [];
const calculatePlayerRotation = (playerData) => {
  const playerViewAngle = 90 - playerData.m_eye_angle;
  const idx = playerData.m_idx;

  playerRotations[idx] = (playerRotations[idx] || 0) % 360;
  playerRotations[idx] +=
    ((playerViewAngle - playerRotations[idx] + 540) % 360) - 180;

  return playerRotations[idx];
};

const Player = ({ playerData, mapData, localTeam, settings }) => {
  const [lastKnownPosition, setLastKnownPosition] = useState(null);
  const radarPosition = getRadarPosition(mapData, playerData.m_position) || { x: 0, y: 0 };
  const invalidPosition = radarPosition.x <= 0 && radarPosition.y <= 0;
  const playerRotation = calculatePlayerRotation(playerData);

  const dotMultiplier = settings?.dotSize ?? 1;
  // Scaled size so avatar is visible and crisp across desktop and mobile screens
  const sizeStyle = `calc(clamp(18px, 2.8vmin, 28px) * ${dotMultiplier})`;

  useEffect(() => {
    if (playerData.m_is_dead) {
      if (!lastKnownPosition) {
        setLastKnownPosition(radarPosition);
      }
    } else {
      setLastKnownPosition(null);
    }
  }, [playerData.m_is_dead, radarPosition, lastKnownPosition]);

  const effectivePosition = playerData.m_is_dead ? lastKnownPosition || { x: 0, y: 0 } : radarPosition;

  const isTeammate = playerData.m_team === localTeam;
  const playerColor = isTeammate
    ? playerColors[playerData.m_color] || "#38bdf8"
    : "#ef4444";

  const hp = Math.max(0, Math.min(100, playerData.m_health || 0));
  let hpColor = "#10b981";
  if (hp <= 25) hpColor = "#ef4444";
  else if (hp <= 50) hpColor = "#f59e0b";

  if (invalidPosition && !playerData.m_is_dead) {
    return null;
  }

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
          /* Dead Skull Icon */
          <div
            className="w-full h-full"
            style={{
              WebkitMask: `url('./assets/icons/icon-enemy-death_png.png') no-repeat center / contain`,
              backgroundColor: "#ef4444",
            }}
          />
        ) : (
          /* Living Player: Directional Cone + Circular Steam Avatar */
          <div className="w-full h-full relative flex items-center justify-center">
            {/* Directional Vision Arrow / Pointer */}
            <div
              className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-0 h-0"
              style={{
                borderLeft: "3.5px solid transparent",
                borderRight: "3.5px solid transparent",
                borderBottom: `6px solid ${playerColor}`,
                filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.8))",
              }}
            />

            {/* Circular Avatar / Portrait Container */}
            <div
              className="w-full h-full rounded-full overflow-hidden bg-black/90 relative flex items-center justify-center"
              style={{
                border: `2px solid ${playerColor}`,
                boxShadow: settings?.radarGlow
                  ? `0 0 8px 2px ${playerColor}aa`
                  : "0 1px 3px rgba(0, 0, 0, 0.8)",
              }}
            >
              <img
                src={`/avatar?steamid=${playerData.m_steam_id}`}
                alt=""
                className="w-full h-full object-cover select-none pointer-events-none"
                onError={(e) => {
                  // Fallback to character model headshot
                  e.currentTarget.src = `./assets/characters/${playerData.m_model_name}.png`;
                  e.currentTarget.className = "w-full h-full object-contain scale-125 object-top select-none pointer-events-none";
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Floating Health Badge (Always visible on alive players for instant tactical info) */}
      {!playerData.m_is_dead && (
        <div
          className="absolute left-1/2 -bottom-3.5 -translate-x-1/2 flex items-center gap-0.5 px-1 py-0.2 rounded bg-black/95 border border-zinc-800 text-[9px] font-mono font-bold leading-none shadow-md shadow-black whitespace-nowrap"
          style={{ zIndex: 30 }}
        >
          <span style={{ color: hpColor }}>{hp}</span>
          {settings?.showNames && (
            <span className="text-zinc-200 font-semibold max-w-[50px] truncate ml-0.5">
              {playerData.m_name}
            </span>
          )}
        </div>
      )}
    </div>
  );
};

export default memo(Player);