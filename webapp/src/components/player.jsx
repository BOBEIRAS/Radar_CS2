import { useState, useEffect, useRef, memo } from "react";
import { getRadarPosition, playerColors } from "../utilities/utilities";

const rotationCache = new Map();
const calculatePlayerRotation = (playerData) => {
  const playerViewAngle = 90 - (playerData.m_eye_angle ?? 0);
  const idx = playerData.m_idx;
  let currentRot = rotationCache.get(idx) || 0;

  currentRot = (currentRot % 360 + 360) % 360;
  currentRot += ((playerViewAngle - currentRot + 540) % 360) - 180;
  rotationCache.set(idx, currentRot);

  return currentRot;
};

const Player = ({ playerData, mapData, localTeam, settings, rotationAngle = 0 }) => {
  const [lastKnownPosition, setLastKnownPosition] = useState(null);
  const radarPosition = getRadarPosition(mapData, playerData.m_position) || { x: 0, y: 0 };
  const posX = radarPosition.x;
  const posY = radarPosition.y;
  const invalidPosition = posX <= 0 && posY <= 0;
  const playerRotation = calculatePlayerRotation(playerData);

  const dotMultiplier = settings?.dotSize ?? 1;
  const sizeStyle = `calc(clamp(18px, 2.8vmin, 28px) * ${dotMultiplier})`;

  useEffect(() => {
    if (playerData.m_is_dead) {
      setLastKnownPosition((prev) => prev || { x: posX, y: posY });
    } else {
      setLastKnownPosition(null);
    }
  }, [playerData.m_is_dead, posX, posY]);

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

  const showHealth = settings?.showHealth ?? true;
  const showHealthBar = settings?.showHealthBar ?? true;

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
            className="w-full h-full"
            style={{
              WebkitMask: `url('./assets/icons/icon-enemy-death_png.png') no-repeat center / contain`,
              backgroundColor: "#ef4444",
              transform: `rotate(${-rotationAngle}deg)`,
              transition: "transform 200ms ease-out",
            }}
          />
        ) : (
          /* Living Player: Directional Cone + Circular Avatar */
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
                style={{
                  transform: `rotate(${-playerRotation - rotationAngle}deg)`,
                  transition: "transform 100ms linear",
                }}
                onError={(e) => {
                  e.currentTarget.src = `./assets/characters/${playerData.m_model_name}.png`;
                  e.currentTarget.className = "w-full h-full object-contain scale-125 object-top select-none pointer-events-none";
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Floating Tactical Health & Name Badge (always counter-rotated to stay upright) */}
      {!playerData.m_is_dead && (showHealth || showHealthBar || settings?.showNames) && (
        <div
          className="absolute left-1/2 -bottom-4 flex flex-col items-center gap-0.5 px-1 py-0.5 rounded bg-black/95 border border-zinc-800 shadow-md shadow-black pointer-events-none select-none whitespace-nowrap"
          style={{
            zIndex: 30,
            transform: `translateX(-50%) rotate(${-rotationAngle}deg)`,
            transformOrigin: "center top",
            transition: "transform 200ms ease-out",
          }}
        >
          {/* Label Row: HP Number & Name */}
          <div className="flex items-center gap-1 leading-none">
            {showHealth && (
              <span className="font-mono text-[9px] font-bold" style={{ color: hpColor }}>
                {hp}
              </span>
            )}
            {settings?.showNames && (
              <span className="text-zinc-200 font-semibold text-[8px] max-w-[48px] truncate">
                {playerData.m_name}
              </span>
            )}
          </div>

          {/* Mini Health Bar Track */}
          {showHealthBar && (
            <div className="w-6 h-1 bg-zinc-800 rounded-full overflow-hidden border border-black/40">
              <div
                className="h-full rounded-full transition-all duration-200"
                style={{
                  width: `${hp}%`,
                  backgroundColor: hpColor,
                  boxShadow: hp <= 25 ? "0 0 4px #ef4444" : "none",
                }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default memo(Player);