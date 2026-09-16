import { memo } from "react";
import { getRadarPosition, teamEnum } from "../utilities/utilities";

const Bomb = ({ bombData, mapData, localTeam, settings }) => {
  const radarPosition = getRadarPosition(mapData, bombData);
  if (!radarPosition || (radarPosition.x <= 0 && radarPosition.y <= 0)) {
    return null;
  }

  const bombMultiplier = settings?.bombSize ?? 0.8;
  const sizeStyle = `calc(clamp(16px, 2.4vmin, 26px) * ${bombMultiplier})`;

  const isDefused = bombData.m_is_defused;
  const bombColor = isDefused
    ? "#10b981"
    : localTeam === teamEnum.counterTerrorist
    ? "#38bdf8"
    : "#f59e0b";

  return (
    <div
      className={`absolute pointer-events-none ${!isDefused ? "animate-pulse" : ""}`}
      style={{
        width: sizeStyle,
        height: sizeStyle,
        left: `${radarPosition.x * 100}%`,
        top: `${radarPosition.y * 100}%`,
        transform: "translate(-50%, -50%)",
        transition: "left 100ms linear, top 100ms linear",
        backgroundColor: bombColor,
        WebkitMask: `url('./assets/icons/c4_sml.png') no-repeat center / contain`,
        zIndex: 25,
      }}
    />
  );
};

export default memo(Bomb);
