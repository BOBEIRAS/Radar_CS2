import { memo } from "react";
import MaskedIcon from "./maskedicon";
import { playerColors, teamEnum } from "../utilities/utilities";

const PlayerCard = ({ playerData, isOnRightSide, right, settings }) => {
  const isDead = playerData.m_is_dead;
  const isTerrorist = playerData.m_team === teamEnum.terrorist;
  const playerHexColor = playerColors[playerData.m_color] || (isTerrorist ? "#df7d29" : "#84c8ed");
  const modelName = playerData.m_model_name;

  const hp = Math.max(0, Math.min(100, playerData.m_health || 0));
  const activeWeapon = playerData.m_weapons?.m_active;

  return (
    <li
      className={`relative flex items-center justify-between rounded bg-[#0e0e11]/95 border border-[#222226] px-2.5 py-2 overflow-hidden w-64 sm:w-72 h-[5.8rem] shadow-xl transition-all ${
        isDead ? "opacity-35 grayscale" : "hover:border-zinc-600 hover:bg-[#131317]"
      }`}
    >
      {/* Left / Main Details Column */}
      <div className="flex-1 flex flex-col justify-between h-full min-w-0 pr-1 z-10">
        {/* Row 1: Color Tag, Player Name and Health */}
        <div className="flex items-center justify-between gap-1 leading-tight">
          <div className="flex items-center gap-1.5 truncate">
            {/* Player Color Pip */}
            <span
              className="w-1.5 h-3.5 rounded-xs flex-shrink-0"
              style={{ backgroundColor: playerHexColor }}
              title={`Slot Color: ${playerHexColor}`}
            />
            {/* Player Steam Avatar */}
            <img
              src={`/avatar?steamid=${playerData.m_steam_id}`}
              alt=""
              className="w-4 h-4 rounded-xs object-cover flex-shrink-0 bg-black/60 border border-zinc-700"
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />
            {/* Player Name */}
            <a
              href={`https://steamcommunity.com/profiles/${playerData.m_steam_id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-semibold text-zinc-200 hover:text-white truncate transition-colors"
              title={`${playerData.m_name} (Steam Profile)`}
            >
              {playerData.m_name || "Player"}
            </a>
          </div>

          {/* Health Number */}
          <span
            className={`font-mono text-xs font-bold ${
              isDead ? "text-red-400" : hp <= 25 ? "text-red-400" : "text-zinc-200"
            }`}
          >
            {isDead ? 0 : hp}
          </span>
        </div>

        {/* Row 2: Money */}
        <div className="flex items-center leading-none">
          <span className="font-mono text-[11px] font-bold text-[#4ade80]">
            ${playerData.m_money?.toLocaleString() ?? 0}
          </span>
        </div>

        {/* Row 3: Weapons (Primary, Secondary, Knife) */}
        <div className="flex items-center gap-2 pt-0.5">
          {/* Primary Weapon */}
          {playerData.m_weapons?.m_primary && (
            <div
              className={`transition-all ${
                activeWeapon === playerData.m_weapons.m_primary ? "scale-105" : "opacity-75"
              }`}
              title={`Primary: ${playerData.m_weapons.m_primary}`}
            >
              <MaskedIcon
                path={`./assets/icons/${playerData.m_weapons.m_primary}.svg`}
                height={15}
                color={
                  activeWeapon === playerData.m_weapons.m_primary ? "bg-white" : "bg-zinc-400"
                }
              />
            </div>
          )}

          {/* Secondary Weapon */}
          {playerData.m_weapons?.m_secondary && (
            <div
              className={`transition-all ${
                activeWeapon === playerData.m_weapons.m_secondary ? "scale-105" : "opacity-75"
              }`}
              title={`Secondary: ${playerData.m_weapons.m_secondary}`}
            >
              <MaskedIcon
                path={`./assets/icons/${playerData.m_weapons.m_secondary}.svg`}
                height={14}
                color={
                  activeWeapon === playerData.m_weapons.m_secondary ? "bg-white" : "bg-zinc-400"
                }
              />
            </div>
          )}

          {/* Melee / Knife */}
          {playerData.m_weapons?.m_melee && playerData.m_weapons.m_melee.length > 0 ? (
            playerData.m_weapons.m_melee.map((knife) => (
              <div
                key={knife}
                className={`transition-all ${activeWeapon === knife ? "scale-105" : "opacity-75"}`}
                title={`Knife: ${knife}`}
              >
                <MaskedIcon
                  path={`./assets/icons/${knife}.svg`}
                  height={13}
                  color={activeWeapon === knife ? "bg-white" : "bg-zinc-400"}
                />
              </div>
            ))
          ) : (
            <div title="Knife">
              <MaskedIcon
                path={`./assets/icons/knife.svg`}
                height={13}
                color={activeWeapon === "knife" ? "bg-white" : "bg-zinc-400"}
              />
            </div>
          )}
        </div>

        {/* Row 4: Full Equipment (Grenades, Defuser, Bomb, Armor) */}
        <div className="flex items-center gap-1.5 pt-0.5">
          {/* Grenades */}
          {playerData.m_weapons?.m_utilities?.map((utility, idx) => (
            <div
              key={`${utility}-${idx}`}
              className={`transition-all ${activeWeapon === utility ? "scale-110" : "opacity-75"}`}
              title={utility}
            >
              <MaskedIcon
                path={`./assets/icons/${utility}.svg`}
                height={13}
                color={activeWeapon === utility ? "bg-[#f59e0b]" : "bg-zinc-400"}
              />
            </div>
          ))}

          {/* Defuse Kit */}
          {playerData.m_team === teamEnum.counterTerrorist && playerData.m_has_defuser && (
            <div title="Defuse Kit">
              <MaskedIcon path="./assets/icons/defuser.svg" height={13} color="bg-[#38bdf8]" />
            </div>
          )}

          {/* C4 Bomb */}
          {playerData.m_team === teamEnum.terrorist && playerData.m_has_bomb && (
            <div title="C4 Explosive" className="animate-pulse">
              <MaskedIcon path="./assets/icons/c4.svg" height={14} color="bg-[#f43f5e]" />
            </div>
          )}

          {/* Kevlar / Helmet */}
          {(playerData.m_armor > 0 || playerData.m_has_helmet) && (
            <div
              className="flex items-center gap-0.5 ml-auto opacity-80"
              title={`Armor: ${playerData.m_armor}${playerData.m_has_helmet ? " (With Helmet)" : ""}`}
            >
              <MaskedIcon
                path={`./assets/icons/${playerData.m_has_helmet ? "kevlar_helmet" : "kevlar"}.svg`}
                height={12}
                color="bg-zinc-400"
              />
              <span className="font-mono text-[9px] text-zinc-400">{playerData.m_armor}</span>
            </div>
          )}
        </div>
      </div>

      {/* Right Side: 3D Character Avatar Bust */}
      <div className="flex-shrink-0 flex items-center justify-end h-full w-14 pointer-events-none select-none z-0">
        <img
          className="h-16 w-auto object-contain drop-shadow-md -mr-1"
          src={`./assets/characters/${modelName}.png`}
          alt=""
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
        />
      </div>
    </li>
  );
};

export default memo(PlayerCard);
