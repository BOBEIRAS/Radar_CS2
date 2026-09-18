import { memo, useState, useEffect, useRef } from "react";
import { getRadarPosition } from "../utilities/utilities";
import MaskedIcon from "./maskedicon";

const GRENADE_ICONS = {
  smoke: "./assets/icons/smokegrenade.svg",
  molotov: "./assets/icons/molotov.svg",
  inferno: "./assets/icons/inferno.svg",
  hegrenade: "./assets/icons/hegrenade.svg",
  flashbang: "./assets/icons/flashbang.svg",
  decoy: "./assets/icons/decoy.svg",
};

const GRENADE_COLORS = {
  smoke: {
    border: "rgba(148, 163, 184, 0.8)",
    glow: "rgba(148, 163, 184, 0.45)",
    icon: "bg-slate-200",
  },
  molotov: {
    border: "rgba(245, 158, 11, 0.9)",
    glow: "rgba(245, 158, 11, 0.55)",
    icon: "bg-amber-400",
  },
  inferno: {
    border: "rgba(239, 68, 68, 0.9)",
    glow: "rgba(239, 68, 68, 0.6)",
    icon: "bg-orange-400",
  },
  hegrenade: {
    border: "rgba(244, 63, 94, 0.95)",
    glow: "rgba(244, 63, 94, 0.65)",
    icon: "bg-rose-400",
  },
  flashbang: {
    border: "rgba(56, 189, 248, 0.9)",
    glow: "rgba(56, 189, 248, 0.6)",
    icon: "bg-sky-300",
  },
  decoy: {
    border: "rgba(192, 132, 252, 0.85)",
    glow: "rgba(192, 132, 252, 0.5)",
    icon: "bg-purple-300",
  },
};

const GrenadesLayer = ({ grenades = [], mapData, settings }) => {
  const [recentExplosions, setRecentExplosions] = useState([]);
  const prevGrenadesRef = useRef(new Map());

  // Detect explosion impacts when projectiles disappear
  useEffect(() => {
    const prevMap = prevGrenadesRef.current;
    const currentIds = new Set(grenades.map((g) => g.m_idx));
    const currentTime = Date.now();

    prevMap.forEach((prevG, idx) => {
      if (!currentIds.has(idx)) {
        if (prevG.m_type === "hegrenade" || prevG.m_type === "flashbang") {
          const radarPos = getRadarPosition(mapData, prevG.m_position);
          if (radarPos && radarPos.x > 0 && radarPos.y > 0) {
            const expId = `${idx}-${currentTime}`;
            setRecentExplosions((prev) => [
              ...prev.slice(-5),
              {
                id: expId,
                type: prevG.m_type,
                position: radarPos,
                timestamp: currentTime,
              },
            ]);

            setTimeout(() => {
              setRecentExplosions((prev) => prev.filter((e) => e.id !== expId));
            }, 1800);
          }
        }
      }
    });

    const newMap = new Map();
    grenades.forEach((g) => newMap.set(g.m_idx, g));
    prevGrenadesRef.current = newMap;
  }, [grenades, mapData]);

  if (!mapData || !mapData.scale) {
    return null;
  }

  // Realistic CS2 smoke diameter (~288 units)
  const smokeDiameterPct = Math.min(
    9.5,
    Math.max(4.5, (288 / (mapData.scale * 1024)) * 100)
  );

  // Realistic CS2 fire diameter (~220 units)
  const fireDiameterPct = Math.min(
    8.0,
    Math.max(3.8, (220 / (mapData.scale * 1024)) * 100)
  );

  return (
    <div className="absolute inset-0 pointer-events-none z-15 overflow-hidden">
      {/* 1. Active Grenades in the World */}
      {grenades.map((grenade) => {
        const radarPos = getRadarPosition(mapData, grenade.m_position);
        if (!radarPos || (radarPos.x <= 0 && radarPos.y <= 0)) {
          return null;
        }

        const isSmokeDetonated =
          grenade.m_type === "smoke" && grenade.m_is_detonated;
        const isInferno =
          grenade.m_type === "inferno" ||
          (grenade.m_type === "molotov" && grenade.m_is_detonated);
        const iconPath = GRENADE_ICONS[grenade.m_type] || GRENADE_ICONS.smoke;
        const colors = GRENADE_COLORS[grenade.m_type] || GRENADE_COLORS.smoke;

        // Case A: Active Volumetric Smoke Cloud (Detonated)
        if (isSmokeDetonated) {
          return (
            <div
              key={grenade.m_idx}
              className="absolute transition-all duration-150"
              style={{
                left: `${radarPos.x * 100}%`,
                top: `${radarPos.y * 100}%`,
                transform: "translate(-50%, -50%)",
                width: `${smokeDiameterPct}%`,
                height: `${smokeDiameterPct}%`,
                zIndex: 10,
              }}
            >
              {/* Volumetric Smoke Cloud */}
              <div
                className="w-full h-full rounded-full animate-pulse"
                style={{
                  background:
                    "radial-gradient(circle, rgba(185, 202, 225, 0.70) 0%, rgba(130, 148, 172, 0.45) 55%, rgba(90, 105, 125, 0) 100%)",
                  border: "1.2px dashed rgba(210, 225, 245, 0.6)",
                  boxShadow: "0 0 14px 4px rgba(160, 185, 215, 0.35)",
                }}
              />
              {/* Central Smoke Icon */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-85">
                <MaskedIcon path={iconPath} height={13} color="bg-slate-200" />
              </div>
            </div>
          );
        }

        // Case B: Active Burning Inferno / Molotov Fire Zone
        if (isInferno) {
          return (
            <div
              key={grenade.m_idx}
              className="absolute transition-all duration-150"
              style={{
                left: `${radarPos.x * 100}%`,
                top: `${radarPos.y * 100}%`,
                transform: "translate(-50%, -50%)",
                width: `${fireDiameterPct}%`,
                height: `${fireDiameterPct}%`,
                zIndex: 11,
              }}
            >
              {/* Burning Fire AOE */}
              <div
                className="w-full h-full rounded-full animate-pulse"
                style={{
                  background:
                    "radial-gradient(circle, rgba(239, 68, 68, 0.72) 0%, rgba(245, 158, 11, 0.52) 55%, rgba(220, 38, 38, 0) 100%)",
                  border: "1.2px solid rgba(251, 146, 60, 0.75)",
                  boxShadow: "0 0 14px 4px rgba(245, 158, 11, 0.45)",
                }}
              />
              {/* Flame Icon */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none scale-110">
                <MaskedIcon path="./assets/icons/inferno.svg" height={13} color="bg-amber-400" />
              </div>
            </div>
          );
        }

        // Case C: Projectile Flying in the Air (Fast & Smooth 50ms Interpolation)
        return (
          <div
            key={grenade.m_idx}
            className="absolute transition-all duration-50 ease-linear pointer-events-none"
            style={{
              left: `${radarPos.x * 100}%`,
              top: `${radarPos.y * 100}%`,
              transform: "translate(-50%, -50%)",
              zIndex: 14,
            }}
          >
            {/* Clean Circular Grenade Badge */}
            <div
              className="flex items-center justify-center p-1.5 rounded-full border shadow-lg backdrop-blur-xs relative"
              style={{
                backgroundColor: "rgba(10, 10, 14, 0.90)",
                borderColor: colors.border,
                boxShadow: `0 0 8px 2px ${colors.glow}`,
              }}
            >
              {/* Pulse Ring on high-threat projectile */}
              {(grenade.m_type === "flashbang" || grenade.m_type === "hegrenade") && (
                <span
                  className="absolute inset-0 rounded-full animate-ping opacity-40"
                  style={{ backgroundColor: colors.border }}
                />
              )}
              <MaskedIcon
                path={iconPath}
                height={12}
                color={colors.icon}
              />
            </div>
          </div>
        );
      })}

      {/* 2. Recent Explosions (HE Grenade Blast & Flashbang Pop Shockwaves) */}
      {recentExplosions.map((exp) => (
        <div
          key={exp.id}
          className="absolute pointer-events-none flex items-center justify-center"
          style={{
            left: `${exp.position.x * 100}%`,
            top: `${exp.position.y * 100}%`,
            transform: "translate(-50%, -50%)",
            zIndex: 16,
          }}
        >
          {exp.type === "hegrenade" ? (
            /* HE Blast Wave: Expanding red blast ring */
            <div className="relative flex items-center justify-center">
              <span className="w-12 h-12 rounded-full border-2 border-rose-500/85 bg-rose-500/25 animate-ping" />
              <div className="absolute w-4 h-4 rounded-full bg-rose-600 shadow-[0_0_12px_#f43f5e] flex items-center justify-center text-[8px] font-black text-white">
                !
              </div>
            </div>
          ) : (
            /* Flashbang Pop: High-intensity flash ring */
            <div className="relative flex items-center justify-center">
              <span className="w-12 h-12 rounded-full border-2 border-sky-300/90 bg-white/45 animate-ping" />
              <div className="absolute w-3.5 h-3.5 rounded-full bg-white shadow-[0_0_14px_#ffffff]" />
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export default memo(GrenadesLayer);
