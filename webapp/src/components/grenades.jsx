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

const GRENADE_CONFIG = {
  smoke: {
    label: "SMOKE",
    duration: 18.0,
    badgeBg: "bg-slate-900/90",
    border: "border-slate-400/80",
    glow: "rgba(148, 163, 184, 0.4)",
    iconColor: "bg-slate-200",
  },
  molotov: {
    label: "MOLY",
    duration: 7.0,
    badgeBg: "bg-amber-950/90",
    border: "border-amber-500/90",
    glow: "rgba(245, 158, 11, 0.5)",
    iconColor: "bg-amber-400",
  },
  inferno: {
    label: "FIRE",
    duration: 7.0,
    badgeBg: "bg-orange-950/90",
    border: "border-orange-500/90",
    glow: "rgba(239, 68, 68, 0.55)",
    iconColor: "bg-orange-400",
  },
  hegrenade: {
    label: "HE",
    duration: 0,
    badgeBg: "bg-rose-950/95",
    border: "border-rose-500/90",
    glow: "rgba(244, 63, 94, 0.6)",
    iconColor: "bg-rose-400",
  },
  flashbang: {
    label: "FLASH",
    duration: 0,
    badgeBg: "bg-sky-950/90",
    border: "border-sky-400/90",
    glow: "rgba(56, 189, 248, 0.6)",
    iconColor: "bg-sky-300",
  },
  decoy: {
    label: "DECOY",
    duration: 15.0,
    badgeBg: "bg-purple-950/90",
    border: "border-purple-400/80",
    glow: "rgba(192, 132, 252, 0.5)",
    iconColor: "bg-purple-300",
  },
};

const GrenadesLayer = ({ grenades = [], mapData, settings }) => {
  const [recentExplosions, setRecentExplosions] = useState([]);
  const [now, setNow] = useState(Date.now());
  const prevGrenadesRef = useRef(new Map());
  const detonationTimesRef = useRef(new Map());

  // Tick clock every 100ms when active detonated grenades exist to update countdown timers smoothly
  useEffect(() => {
    const hasActiveDetonations = grenades.some(
      (g) =>
        (g.m_type === "smoke" && g.m_is_detonated) ||
        g.m_type === "inferno" ||
        (g.m_type === "molotov" && g.m_is_detonated)
    );

    if (!hasActiveDetonations && recentExplosions.length === 0) return;

    const interval = setInterval(() => {
      setNow(Date.now());
    }, 100);

    return () => clearInterval(interval);
  }, [grenades, recentExplosions.length]);

  // Track active detonations and detect explosion impacts
  useEffect(() => {
    const prevMap = prevGrenadesRef.current;
    const currentIds = new Set(grenades.map((g) => g.m_idx));
    const detMap = detonationTimesRef.current;
    const currentTime = Date.now();

    // Register newly detonated smokes / infernos
    grenades.forEach((g) => {
      const isDetonated =
        (g.m_type === "smoke" && g.m_is_detonated) ||
        g.m_type === "inferno" ||
        (g.m_type === "molotov" && g.m_is_detonated);

      if (isDetonated && !detMap.has(g.m_idx)) {
        detMap.set(g.m_idx, currentTime);
      }
    });

    // Cleanup expired/removed grenades from detMap
    for (const [idx] of detMap.entries()) {
      if (!currentIds.has(idx)) {
        detMap.delete(idx);
      }
    }

    // Check for projectiles that disappeared (detonated/impacted)
    prevMap.forEach((prevG, idx) => {
      if (!currentIds.has(idx)) {
        if (prevG.m_type === "hegrenade" || prevG.m_type === "flashbang") {
          const radarPos = getRadarPosition(mapData, prevG.m_position);
          if (radarPos && radarPos.x > 0 && radarPos.y > 0) {
            const expId = `${idx}-${currentTime}`;
            setRecentExplosions((prev) => [
              ...prev.slice(-6),
              {
                id: expId,
                type: prevG.m_type,
                position: radarPos,
                timestamp: currentTime,
              },
            ]);

            // Clear explosion shockwave after 1.8 seconds
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

  const showTimers = settings?.showGrenadeTimers ?? true;

  // Calculate realistic smoke diameter in % of radar based on map scale (CS2 smoke is ~288 units)
  const smokeDiameterPct = Math.min(
    10.5,
    Math.max(5.0, (288 / (mapData.scale * 1024)) * 100)
  );

  // Calculate realistic inferno / fire diameter (~220 units)
  const fireDiameterPct = Math.min(
    8.5,
    Math.max(4.0, (220 / (mapData.scale * 1024)) * 100)
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
        const cfg = GRENADE_CONFIG[grenade.m_type] || GRENADE_CONFIG.smoke;

        // Calculate timer for detonated grenades
        const detStart = detonationTimesRef.current.get(grenade.m_idx) || now;
        const elapsedSec = (now - detStart) / 1000;
        const remainingSmokeSec = Math.max(0, 18.0 - elapsedSec);
        const remainingFireSec = Math.max(0, 7.0 - elapsedSec);

        // Case A: Active Smoke Cloud (Detonated on the ground)
        if (isSmokeDetonated) {
          const isFading = remainingSmokeSec <= 3.5;
          const progressPct = Math.min(100, Math.max(0, (remainingSmokeSec / 18.0) * 100));

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
                className={`w-full h-full rounded-full transition-opacity duration-500 ${
                  isFading ? "animate-pulse opacity-60" : "opacity-90"
                }`}
                style={{
                  background: isFading
                    ? "radial-gradient(circle, rgba(217, 119, 6, 0.45) 0%, rgba(148, 163, 184, 0.3) 50%, rgba(90, 105, 125, 0) 100%)"
                    : "radial-gradient(circle, rgba(186, 205, 230, 0.70) 0%, rgba(130, 148, 172, 0.45) 55%, rgba(90, 105, 125, 0) 100%)",
                  border: isFading ? "1.5px dashed #f59e0b" : "1.5px dashed rgba(210, 225, 245, 0.6)",
                  boxShadow: isFading
                    ? "0 0 14px 4px rgba(245, 158, 11, 0.35)"
                    : "0 0 14px 4px rgba(160, 185, 215, 0.4)",
                }}
              />

              {/* Central Smoke Badge with Timer */}
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <div
                  className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full backdrop-blur-sm border shadow-md ${
                    isFading
                      ? "bg-amber-950/95 border-amber-500 text-amber-300"
                      : "bg-slate-900/90 border-slate-400 text-slate-100"
                  }`}
                >
                  <MaskedIcon
                    path={iconPath}
                    height={11}
                    color={isFading ? "bg-amber-400" : "bg-slate-200"}
                  />
                  {showTimers && (
                    <span className="font-mono text-[9px] font-black tracking-tight">
                      {isFading ? `${remainingSmokeSec.toFixed(1)}s` : `${remainingSmokeSec.toFixed(1)}s`}
                    </span>
                  )}
                </div>
                {showTimers && isFading && (
                  <span className="text-[7.5px] font-black uppercase tracking-wider text-amber-400 bg-black/80 px-1 rounded mt-0.5 animate-bounce">
                    FADING
                  </span>
                )}
              </div>
            </div>
          );
        }

        // Case B: Active Inferno / Molotov Fire Pool (Burning on the ground)
        if (isInferno) {
          const isDying = remainingFireSec <= 1.8;

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
                    "radial-gradient(circle, rgba(239, 68, 68, 0.72) 0%, rgba(245, 158, 11, 0.52) 55%, rgba(220, 38, 38, 0) 100%)",
                  border: "1.5px solid rgba(251, 146, 60, 0.8)",
                  boxShadow: "0 0 16px 5px rgba(245, 158, 11, 0.5)",
                }}
              />

              {/* Central Fire Badge with Timer */}
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-orange-950/95 border border-orange-500 text-orange-200 backdrop-blur-sm shadow-md">
                  <MaskedIcon path="./assets/icons/inferno.svg" height={11} color="bg-amber-400" />
                  {showTimers && (
                    <span className="font-mono text-[9px] font-black tracking-tight text-amber-300">
                      {remainingFireSec.toFixed(1)}s
                    </span>
                  )}
                </div>
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
              className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full border shadow-lg backdrop-blur-xs relative ${cfg.badgeBg} ${cfg.border}`}
              style={{
                boxShadow: `0 0 10px 2px ${cfg.glow}`,
              }}
            >
              {/* Pulse Ring for high threat grenades */}
              {(grenade.m_type === "flashbang" || grenade.m_type === "hegrenade") && (
                <span
                  className="absolute inset-0 rounded-full animate-ping opacity-60"
                  style={{ backgroundColor: cfg.glow }}
                />
              )}

              <MaskedIcon path={iconPath} height={11} color={cfg.iconColor} />

              <span className="text-[8px] font-black tracking-wider uppercase text-white font-mono">
                {cfg.label}
              </span>
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
            /* HE Blast Wave: Double expanding shockwave */
            <div className="relative flex items-center justify-center">
              <span className="w-14 h-14 rounded-full border-2 border-rose-500/90 bg-rose-500/30 animate-ping" />
              <span className="absolute w-8 h-8 rounded-full border border-amber-400/80 bg-amber-400/20 animate-ping opacity-75" />
              <div className="absolute w-5 h-5 rounded-full bg-rose-600 shadow-[0_0_14px_#f43f5e] flex items-center justify-center text-[9px] font-black text-white">
                HE
              </div>
            </div>
          ) : (
            /* Flashbang Flash Pop: High-intensity white/cyan wave */
            <div className="relative flex items-center justify-center">
              <span className="w-16 h-16 rounded-full border-2 border-sky-300 bg-white/60 animate-ping" />
              <span className="absolute w-10 h-10 rounded-full border border-sky-400/80 bg-sky-300/40 animate-ping opacity-80" />
              <div className="absolute w-4 h-4 rounded-full bg-white shadow-[0_0_16px_#ffffff] flex items-center justify-center">
                <span className="w-1.5 h-1.5 rounded-full bg-sky-500" />
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export default memo(GrenadesLayer);
