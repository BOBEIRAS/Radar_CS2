import { memo } from "react";
import Player from "./player";
import Bomb from "./bomb";
import GrenadesLayer from "./grenades";

const Radar = ({
  playerArray,
  radarImage,
  mapData,
  localTeam,
  bombData,
  grenadesData,
  settings
}) => {
  return (
    <div
      id="radar"
      className="relative inline-block origin-center overflow-hidden rounded-xl shadow-2xl shadow-black border border-zinc-800 bg-black/70 max-w-full max-h-full"
    >
      {/* Imagem do radar definindo as dimensões exatas 1:1 do container */}
      <img
        className="block max-h-[calc(100vh-4.5rem)] max-w-[calc(100vw-1.5rem)] xl:max-h-[84vh] w-auto h-auto object-contain select-none pointer-events-none"
        src={radarImage}
        alt="Radar Map"
        draggable={false}
      />

      {/* Camada tática de Granadas (Fumaça, Fogo, HE, Flash, Decoy) */}
      {(settings?.showGrenades ?? true) && grenadesData && (
        <GrenadesLayer
          grenades={grenadesData}
          mapData={mapData}
          settings={settings}
        />
      )}

      {/* Renderização fluida dos jogadores */}
      {playerArray.map((player) => (
        <Player
          key={player.m_idx}
          playerData={player}
          mapData={mapData}
          localTeam={localTeam}
          settings={settings}
        />
      ))}

      {/* Renderização da Bomba */}
      {bombData && (
        <Bomb
          bombData={bombData}
          mapData={mapData}
          localTeam={localTeam}
          settings={settings}
        />
      )}
    </div>
  );
};

export default memo(Radar);
