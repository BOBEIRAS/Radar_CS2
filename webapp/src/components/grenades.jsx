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
    bg: "rgba(160, 175, 195, 0.55)",
    border: "rgba(200, 215, 235, 0.6)",
    icon: "#e2e8f0",
  },
  molotov: {
    bg: "rgba(239, 68, 68, 0.6)",
    border: "rgba(245, 158, 11, 0.7)",
    icon: "#f97316",
  },
  inferno: {
    bg: "rgba(239, 68, 68, 0.65)",
    border: "rgba(245, 158, 11, 0.8)",
    icon: "#f59e0b",
  },
  hegrenade: {
    bg: "rgba(239, 68, 68, 0.8)",
    border: "rgba(248, 113, 113, 0.9)",
    icon: "#ef4444",
  },
  flashbang: {
    bg: "rgba(56, 189, 248, 0.7)",
    border: "rgba(224, 242, 254, 0.9)",
    icon: "#38bdf8",
  },
  decoy: {
    bg: "rgba(168, 85, 247, 0.6)",
    border: "rgba(192, 132, 252, 0.8)",
    icon: "#c084fc",
  },
};

const GrenadesLayer = ({ grenades = [], mapData, settings }) => {
  const [recentExplosions, setRecentExplosions] = useState([]);
  const prevGrenadesRef = useRef(new Map());

  // Track detonated HE grenades & Flashbangs to render brief impact blast rings
  useEffect(() => {
    const prevMap = prevGrenadesRef.current;
    const currentIds = new Set(grenades.map((g) => g.m_idx));

    // Check for projectiles that disappeared (detonated)
    prevMap.forEach((prevG, idx) => {
      if (!currentIds.has(idx)) {
        if (prevG.m_type === "hegrenade" || prevG.m_type === "flashbang") {
          const radarPos = getRadarPosition(mapData, prevG.m_position);
          if (radarPos && radarPos.x > 0 && radarPos.y > 0) {
            const expId = `${idx}-${Date.now()}`;
            setRecentExplosions((prev) => [
              ...prev.slice(-6),
              {
                id: expId,
                type: prevG.m_type,
                position: radarPos,
                timestamp: Date.now(),
              },
            ]);

            // Clear explosion after 1.8 seconds
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

  // Calculate realistic smoke diameter in % of radar based on map scale (CS2 smoke is ~288 units)
  const smokeDiameterPct = Math.min(
    9.5,
    Math.max(4.5, (288 / (mapData.scale * 1024)) * 100)
  );

  // Calculate realistic inferno / fire diameter (~220 units)
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

        // Case A: Active Smoke Cloud (Detonated on the ground)
        if (isSmokeDetonated) {
          return (
            <div
              key={grenade.m_idx}
              className="absolute transition-all duration-200"
              style={{
                left: `${radarPos.x * 100}%`,
                top: `${radarPos.y * 100}%`,
                transform: "translate(-50%, -50%)",
                width: `${smokeDiameterPct}%`,
                height: `${smokeDiameterPct}%`,
                zIndex: 10,
              }}
            >
              {/* Volumetric Smoke Cloud Layer */}
              <div
                className="w-full h-full rounded-full animate-pulse"
                style={{
                  background:
                    "radial-gradient(circle, rgba(175, 190, 210, 0.65) 0%, rgba(130, 145, 165, 0.45) 55%, rgba(90, 105, 125, 0) 100%)",
                  border: "1px dashed rgba(210, 225, 245, 0.5)",
                  boxShadow: "0 0 12px 3px rgba(160, 180, 205, 0.35)",
                }}
              />
              {/* Central Smoke Icon */}
              <div
                className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-85"
                title="Active Smoke Cloud"
              >
                <MaskedIcon path={iconPath} height={13} color="bg-zinc-200" />
              </div>
            </div>
          );
        }

        // Case B: Active Inferno / Molotov Fire Pool (Burning on the ground)
        if (isInferno) {
          return (
            <div
              key={grenade.m_idx}
              className="absolute transition-all duration-200"
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
                    "radial-gradient(circle, rgba(239, 68, 68, 0.68) 0%, rgba(245, 158, 11, 0.48) 55%, rgba(220, 38, 38, 0) 100%)",
                  border: "1px solid rgba(251, 146, 60, 0.65)",
                  boxShadow: "0 0 14px 4px rgba(245, 158, 11, 0.45)",
                }}
              />
              {/* Flame Icon */}
              <div
                className="absolute inset-0 flex items-center justify-center pointer-events-none scale-110"
                title="Active Fire Zone"
              >
                <MaskedIcon path="./assets/icons/inferno.svg" height={14} color="bg-amber-400" />
              </div>
            </div>
          );
        }

        // Case C: Projectile Flying in the Air (Smoke, Molotov, HE, Flashbang, Decoy)
        return (
          <div
            key={grenade.m_idx}
            className="absolute transition-all duration-75 ease-linear pointer-events-none"
            style={{
              left: `${radarPos.x * 100}%`,
              top: `${radarPos.y * 100}%`,
              transform: "translate(-50%, -50%)",
              zIndex: 14,
            }}
          >
            {/* Flying Projectile Pill / Badge */}
            <div
              className="flex items-center justify-center p-1 rounded-full border shadow-lg backdrop-blur-xs relative"
              style={{
                backgroundColor: "rgba(10, 10, 14, 0.88)",
                borderColor: colors.border,
                boxShadow: `0 0 8px 2px ${colors.border}`,
              }}
            >
              {/* Pulse Ring */}
              <span
                className="absolute inset-0 rounded-full animate-ping opacity-45"
                style={{ backgroundColor: colors.border }}
              />
              <MaskedIcon
                path={iconPath}
                height={12}
                color={
                  grenade.m_type === "hegrenade"
                    ? "bg-rose-400"
                    : grenade.m_type === "molotov"
                    ? "bg-amber-400"
                    : grenade.m_type === "flashbang"
                    ? "bg-sky-300"
                    : grenade.m_type === "decoy"
                    ? "bg-purple-400"
                    : "bg-slate-200"
                }
              />
            </div>
          </div>
        );
      })}

      {/* 2. Recent Explosions (HE Grenade Blast & Flashbang Pop) */}
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
            /* HE Blast Wave */
            <div className="relative flex items-center justify-center">
              <span className="w-10 h-10 rounded-full border-2 border-rose-500/80 bg-rose-500/25 animate-ping" />
              <div className="absolute w-4 h-4 rounded-full bg-rose-500/90 shadow-[0_0_10px_#f43f5e] flex items-center justify-center text-[8px] font-black text-white">
                !
              </div>
            </div>
          ) : (
            /* Flashbang Flash Pop */
            <div className="relative flex items-center justify-center">
              <span className="w-8 h-8 rounded-full border border-sky-300/80 bg-white/40 animate-ping" />
              <div className="absolute w-3 h-3 rounded-full bg-white shadow-[0_0_12px_#ffffff]" />
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export default memo(GrenadesLayer);
