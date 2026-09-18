import { useEffect, useState, useMemo, useCallback } from "react";
import "./app.css";
import PlayerCard from "./components/playercard";
import Radar from "./components/radar";
import SettingsModal, { DEFAULT_SETTINGS } from "./components/settings";
import MaskedIcon from "./components/maskedicon";

const CONNECTION_TIMEOUT = 5000;

const loadSettings = () => {
  try {
    const saved = localStorage.getItem("radarSettings");
    return saved ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
};

const App = () => {
  const [gameState, setGameState] = useState({
    players: [],
    localTeam: null,
    bomb: null,
    scores: { ct: 0, t: 0 },
    grenades: [],
  });

  const [mapData, setMapData] = useState(null);
  const [settings, setSettings] = useState(loadSettings);
  const [connectionStatus, setConnectionStatus] = useState("connecting"); // 'connecting' | 'connected' | 'error'
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [mobileTab, setMobileTab] = useState("radar"); // 'radar' | 'teams'

  const [urlOverlay, setUrlOverlay] = useState(() => {
    if (typeof window === "undefined") return false;
    const p = new URLSearchParams(window.location.search);
    return p.get("overlay") === "1" || p.get("overlay") === "true";
  });

  const isOverlay = urlOverlay || Boolean(settings.overlayMode);

  const toggleOverlayMode = useCallback(() => {
    setSettings((prev) => ({ ...prev, overlayMode: !isOverlay }));
    if (urlOverlay) setUrlOverlay(false);
  }, [isOverlay, urlOverlay]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && isOverlay) {
        toggleOverlayMode();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOverlay, toggleOverlayMode]);

  useEffect(() => {
    localStorage.setItem("radarSettings", JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }, []);

  // WebSocket Connection with Resilient Auto-Reconnect
  useEffect(() => {
    let webSocket = null;
    let reconnectTimeout = null;
    let connectionTimeout = null;
    let isUnmounted = false;
    let currentMapName = "";

    const scheduleReconnect = () => {
      if (isUnmounted || reconnectTimeout) return;
      reconnectTimeout = setTimeout(() => {
        reconnectTimeout = null;
        connect();
      }, 2000);
    };

    const connect = async () => {
      if (isUnmounted) return;
      if (webSocket && (webSocket.readyState === WebSocket.CONNECTING || webSocket.readyState === WebSocket.OPEN)) {
        return;
      }

      try {
        const isSecure = window.location.protocol === "https:";
        const wsProtocol = isSecure ? "wss://" : "ws://";
        const currentHost = window.location.host;

        // Através do Vite proxy ou túnel Cloudflare, /cs2_webradar é reencaminhado automaticamente
        const webSocketURL = `${wsProtocol}${currentHost}/cs2_webradar`;

        webSocket = new WebSocket(webSocketURL);

        connectionTimeout = setTimeout(() => {
          if (webSocket && webSocket.readyState !== WebSocket.OPEN) {
            try { webSocket.close(); } catch {}
            setConnectionStatus("reconnecting");
            scheduleReconnect();
          }
        }, CONNECTION_TIMEOUT);

        webSocket.onopen = () => {
          clearTimeout(connectionTimeout);
          setConnectionStatus("connected");
        };

        webSocket.onclose = () => {
          clearTimeout(connectionTimeout);
          if (!isUnmounted) {
            setConnectionStatus("reconnecting");
            scheduleReconnect();
          }
        };

        webSocket.onerror = () => {
          clearTimeout(connectionTimeout);
          if (!isUnmounted) {
            setConnectionStatus("reconnecting");
            try { webSocket.close(); } catch {}
            scheduleReconnect();
          }
        };

        webSocket.onmessage = async (event) => {
          try {
            const text = await event.data.text();
            if (!text || text === "null") return;
            const parsedData = JSON.parse(text);
            if (!parsedData || typeof parsedData !== "object") return;

            setGameState({
              players: parsedData.m_players || [],
              localTeam: parsedData.m_local_team,
              bomb: parsedData.m_bomb,
              scores: parsedData.m_scores || { ct: 0, t: 0 },
              grenades: parsedData.m_grenades || [],
            });

            const map = parsedData.m_map;
            if (map && map !== "invalid" && map !== currentMapName) {
              currentMapName = map;
              try {
                const response = await fetch(`data/${map}/data.json`);
                if (response.ok) {
                  const data = await response.json();
                  setMapData({ ...data, name: map });
                  document.body.style.backgroundImage = `url(./data/${map}/background.png)`;
                }
              } catch (e) {
                console.error("Error loading map data:", e);
              }
            }
          } catch (e) {
            console.error("Error parsing WebSocket payload:", e);
          }
        };
      } catch (err) {
        if (!isUnmounted) {
          setConnectionStatus("reconnecting");
          scheduleReconnect();
        }
      }
    };

    connect();

    return () => {
      isUnmounted = true;
      if (connectionTimeout) clearTimeout(connectionTimeout);
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (webSocket) {
        webSocket.onopen = null;
        webSocket.onclose = null;
        webSocket.onerror = null;
        webSocket.onmessage = null;
        webSocket.close();
      }
    };
  }, []);

  const { players, localTeam, bomb, scores, grenades } = gameState;

  const tPlayers = useMemo(() => players.filter((p) => p.m_team === 2), [players]);
  const ctPlayers = useMemo(() => players.filter((p) => p.m_team === 3), [players]);

  const effectiveRotation = useMemo(() => {
    const rot = settings.mapRotation ?? "auto";
    if (rot === "auto") {
      return localTeam === 2 ? 180 : 0;
    }
    return Number(rot) || 0;
  }, [settings.mapRotation, localTeam]);

  const cycleRotation = useCallback(() => {
    const sequence = [0, 90, 180, 270, "auto"];
    const current = settings.mapRotation ?? "auto";
    const currentIndex = sequence.indexOf(current);
    const nextIndex = (currentIndex + 1) % sequence.length;
    setSettings((prev) => ({ ...prev, mapRotation: sequence[nextIndex] }));
  }, [settings.mapRotation]);

  const tAliveCount = useMemo(() => tPlayers.filter((p) => !p.m_is_dead).length, [tPlayers]);
  const ctAliveCount = useMemo(() => ctPlayers.filter((p) => !p.m_is_dead).length, [ctPlayers]);

  const hasBombPlanted = bomb && bomb.m_blow_time > 0 && !bomb.m_is_defused;
  const defuseFeasible =
    bomb?.m_is_defusing &&
    bomb?.m_blow_time - bomb?.m_defuse_time > 0;

  const bgDimOpacity = (settings.bgDim ?? 85) / 100;
  const overlayOpacity = (settings.overlayOpacity ?? 70) / 100;

  return (
    <div
      className="w-screen h-screen flex flex-col relative overflow-hidden select-none"
      style={{
        background: isOverlay
          ? `rgba(5, 5, 8, ${overlayOpacity})`
          : `radial-gradient(50% 50% at 50% 50%, rgba(18, 18, 22, ${bgDimOpacity}) 0%, rgba(5, 5, 8, ${bgDimOpacity}) 100%)`,
        backdropFilter: isOverlay ? "blur(4px)" : "blur(8px)",
      }}
    >
      {/* Floating Minimalist HUD Pill when in Overlay Mode */}
      {isOverlay ? (
        <div className="absolute top-2 right-2 z-50 flex items-center gap-1.5 bg-[#0a0a0e]/90 border border-[#222226] rounded-xl px-2.5 py-1.5 backdrop-blur-md shadow-2xl transition-opacity hover:opacity-100 opacity-60">
          <div className="flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-950/70 px-1.5 py-0.5 rounded border border-emerald-500/40">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>OVERLAY</span>
          </div>
          {mapData?.name && (
            <span className="text-[10px] font-mono uppercase text-zinc-300 font-bold px-1">
              {mapData.name.replace("de_", "")}
            </span>
          )}
          <button
            onClick={cycleRotation}
            title="Girar Radar"
            className="p-1 rounded text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            <span className="text-[10px] font-mono text-sky-400 font-bold">{effectiveRotation}°</span>
          </button>
          <button
            onClick={toggleOverlayMode}
            title="Sair do Modo Overlay (Esc)"
            className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors"
          >
            ✕ Sair
          </button>
          <SettingsModal settings={settings} onSettingsChange={setSettings} />
        </div>
      ) : (
        /* Top Header Bar (Ultra-clean, Mobile-Friendly) */
        <header className="w-full h-11 sm:h-12 px-2 sm:px-4 flex items-center justify-between bg-[#09090b]/95 border-b border-[#222226] z-40 flex-shrink-0 backdrop-blur-md gap-1 sm:gap-2">
        {/* Left: Status and Map */}
        <div className="flex items-center gap-1.5 sm:gap-3 text-xs flex-shrink-0">
          {/* Live Status Pill */}
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-[#121215] border border-[#222226]">
            <span
              className={`w-2 h-2 rounded-full flex-shrink-0 ${
                connectionStatus === "connected"
                  ? "bg-emerald-400 shadow-[0_0_6px_#34d399]"
                  : connectionStatus === "reconnecting"
                  ? "bg-amber-400 animate-pulse shadow-[0_0_6px_#fbbf24]"
                  : connectionStatus === "connecting"
                  ? "bg-sky-400 animate-pulse"
                  : "bg-rose-500 shadow-[0_0_6px_#f43f5e]"
              }`}
            />
            {/* Full text on tablet+, shortened on tiny mobile screens */}
            <span className="hidden sm:inline font-semibold text-zinc-200 uppercase tracking-wider text-[11px]">
              {connectionStatus === "connected"
                ? "LIVE"
                : connectionStatus === "reconnecting"
                ? "RECONNECTING"
                : connectionStatus === "connecting"
                ? "CONNECTING"
                : "OFFLINE"}
            </span>
            <span className="sm:hidden font-semibold text-zinc-300 text-[10px]">
              {connectionStatus === "connected"
                ? "LIVE"
                : connectionStatus === "reconnecting"
                ? "REC"
                : "OFF"}
            </span>
          </div>

          {/* Map Name (visible on sm+) */}
          {mapData?.name && (
            <div className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-lg bg-[#121215] border border-[#222226]">
              <span className="text-zinc-500 text-[10px] uppercase font-bold">MAP:</span>
              <span className="font-bold text-zinc-200 uppercase text-[11px]">
                {mapData.name.replace("de_", "")}
              </span>
            </div>
          )}

          {/* Desktop Alive Player Counter */}
          {players.length > 0 && (
            <div className="hidden md:flex items-center gap-1.5 font-mono text-xs">
              <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30 font-bold text-[11px]">
                T: {tAliveCount}
              </span>
              <span className="text-zinc-600">:</span>
              <span className="px-2 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/30 font-bold text-[11px]">
                CT: {ctAliveCount}
              </span>
            </div>
          )}
        </div>

        {/* Center: Match Scoreboard & C4 Alert */}
        <div className="flex items-center justify-center gap-1.5 sm:gap-2">
          {/* Tactical Scoreboard Widget */}
          <div className="flex items-center gap-1 sm:gap-1.5 px-2 py-0.5 sm:py-1 rounded-lg bg-[#121215] border border-[#222226] font-mono text-xs shadow-md">
            <span className="text-sky-400 font-black text-[10px] sm:text-[11px] tracking-wide">CT</span>
            <span className="text-white font-black text-xs px-1 sm:px-1.5 py-0.5 rounded bg-sky-500/15 border border-sky-500/30 leading-none">
              {scores?.ct ?? 0}
            </span>
            <span className="text-zinc-600 font-bold text-[10px]">:</span>
            <span className="text-white font-black text-xs px-1 sm:px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 leading-none">
              {scores?.t ?? 0}
            </span>
            <span className="text-amber-400 font-black text-[10px] sm:text-[11px] tracking-wide">T</span>
          </div>

          {/* C4 Alert (if bomb planted) */}
          {hasBombPlanted && (
            <div className="flex items-center gap-1.5 px-2 py-0.5 sm:py-1 rounded-lg bg-[#150508] border border-rose-500/80 shadow-lg">
              <MaskedIcon
                path="./assets/icons/c4_sml.png"
                height={15}
                color={defuseFeasible ? "bg-emerald-400" : "bg-rose-500 animate-pulse"}
              />
              <div className="flex items-baseline gap-1 font-mono">
                <span className="text-[11px] sm:text-xs font-bold text-white">
                  {bomb.m_blow_time.toFixed(1)}s
                </span>
                {bomb.m_is_defusing && (
                  <span className="text-[9px] sm:text-[10px] text-sky-300">
                    ({bomb.m_defuse_time.toFixed(1)}s)
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right: Quick Controls & Settings */}
        <div className="flex items-center gap-1 sm:gap-1.5 flex-shrink-0">
          {/* Mobile / Tablet View Switcher (Radar vs Times) */}
          <div className="xl:hidden flex items-center bg-[#121215] p-0.5 rounded-lg border border-[#222226] text-xs">
            <button
              onClick={() => setMobileTab("radar")}
              className={`px-2 py-1 rounded-md font-bold text-[11px] transition-colors ${
                mobileTab === "radar"
                  ? "bg-zinc-800 text-white shadow-sm"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Radar
            </button>
            <button
              onClick={() => setMobileTab("teams")}
              className={`px-2 py-1 rounded-md font-bold text-[11px] transition-colors flex items-center gap-1 ${
                mobileTab === "teams"
                  ? "bg-zinc-800 text-white shadow-sm"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <span>Times</span>
              {players.length > 0 && (
                <span className="text-[9px] px-1 rounded bg-black/60 text-sky-400 font-mono">
                  {tAliveCount + ctAliveCount}
                </span>
              )}
            </button>
          </div>

          {/* Desktop Toggle Panels (Side Cards) */}
          <button
            onClick={() =>
              setSettings((prev) => ({ ...prev, showCards: !prev.showCards }))
            }
            title={settings.showCards ? "Hide Side Cards" : "Show Side Cards"}
            className={`hidden xl:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              settings.showCards
                ? "bg-[#121215] border-[#222226] text-zinc-300 hover:text-white hover:border-zinc-600"
                : "bg-zinc-800 border-zinc-600 text-white"
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
            <span>{settings.showCards ? "Focus Radar" : "Show Teams"}</span>
          </button>

          {/* Quick Map Rotation Toggle Button (Mobile: icon + angle, Desktop: full label) */}
          <button
            onClick={cycleRotation}
            title={`Rotate Radar: currently ${settings.mapRotation === "auto" ? `Auto (${effectiveRotation}°)` : `${effectiveRotation}°`}`}
            className="flex items-center gap-1 p-1.5 sm:px-2 sm:py-1.5 rounded-lg text-xs font-medium bg-[#121215] border border-[#222226] text-zinc-300 hover:text-white hover:border-zinc-500 transition-colors select-none"
          >
            <svg
              className="w-3.5 h-3.5 transition-transform duration-300 text-sky-400"
              style={{ transform: `rotate(${effectiveRotation}deg)` }}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <span className="hidden md:inline font-mono text-[11px]">
              {settings.mapRotation === "auto" ? `Auto (${effectiveRotation}°)` : `${effectiveRotation}°`}
            </span>
            <span className="md:hidden font-mono text-[10px] text-sky-400 font-bold">
              {effectiveRotation}°
            </span>
          </button>

          {/* Fullscreen Toggle (Hidden on small mobile to save header space) */}
          <button
            onClick={toggleFullscreen}
            title="Toggle Fullscreen"
            className="hidden sm:flex p-1.5 rounded-lg bg-[#121215] border border-[#222226] text-zinc-300 hover:text-white hover:border-zinc-500 transition-colors"
          >
            {isFullscreen ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
                />
              </svg>
            )}
          </button>

          {/* Overlay Mode Toggle Button */}
          <button
            onClick={toggleOverlayMode}
            title="Ativar Modo Overlay Flutuante"
            className="flex items-center gap-1 p-1.5 sm:px-2.5 sm:py-1.5 rounded-lg text-xs font-medium border bg-[#121215] border-[#222226] text-zinc-300 hover:text-white hover:border-emerald-500/70 transition-colors"
          >
            <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
            </svg>
            <span className="hidden sm:inline font-semibold">Overlay</span>
          </button>

          {/* Settings Modal */}
          <SettingsModal settings={settings} onSettingsChange={setSettings} />
        </div>
      </header>
      )}

      {/* Main Content Area (Maximized viewport for mobile radar) */}
      <main className="w-full flex-1 flex items-center justify-between p-1 sm:p-3 overflow-hidden relative z-20 min-w-0 min-h-0">
        {/* Left Column: Counter-Terrorists (Desktop xl+) */}
        {!isOverlay && settings.showCards && (
          <aside className="hidden xl:flex h-full flex-col justify-center z-30 flex-shrink-0">
            <div className="mb-2 flex items-center justify-between px-1">
              <span className="text-xs font-bold uppercase tracking-wider text-sky-400">
                COUNTER-TERRORISTS ({ctAliveCount}/{ctPlayers.length})
              </span>
            </div>
            <ul id="counterTerrorist" className="flex flex-col gap-2.5 m-0 p-0 overflow-y-auto max-h-[calc(100vh-5.5rem)] pr-1">
              {ctPlayers.map((player) => (
                <PlayerCard
                  key={player.m_idx}
                  playerData={player}
                  isOnRightSide={false}
                  right={false}
                  settings={settings}
                />
              ))}
            </ul>
          </aside>
        )}

        {/* Center: Radar Viewport (Always visible on Desktop, or when mobileTab === 'radar' on mobile) */}
        <section
          className={`flex-1 h-full flex items-center justify-center relative px-2 min-w-0 min-h-0 ${
            mobileTab === "radar" ? "flex" : "hidden xl:flex"
          }`}
        >
          {players.length > 0 && mapData ? (
            <div className="relative max-h-full max-w-full flex items-center justify-center">
              <Radar
                playerArray={players}
                radarImage={`./data/${mapData.name}/radar.png`}
                mapData={mapData}
                localTeam={localTeam}
                bombData={bomb}
                grenadesData={grenades}
                settings={settings}
                rotationAngle={effectiveRotation}
              />
            </div>
          ) : (
            <div className="rounded-xl bg-[#0e0e11]/95 border border-[#222226] p-6 flex flex-col items-center justify-center text-center max-w-sm shadow-2xl">
              <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center mb-3 text-sky-400 font-bold text-sm">
                !
              </div>
              <h3 className="text-sm font-bold text-zinc-100 mb-1 uppercase tracking-wide">
                Waiting for CS2 Game Data
              </h3>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Launch Counter-Strike 2 with the memory reader running. The radar and players will appear automatically.
              </p>
            </div>
          )}
        </section>

        {/* Mobile / Tablet Teams View (Only active when mobileTab === 'teams' on screen < xl) */}
        {mobileTab === "teams" && (
          <section className="xl:hidden w-full h-full overflow-y-auto px-2 py-3 flex flex-col md:flex-row gap-4 items-center justify-start md:justify-center z-30">
            {/* CT Column */}
            <div className="w-full max-w-sm flex flex-col">
              <div className="mb-2 flex items-center justify-between px-1">
                <span className="text-xs font-bold uppercase tracking-wider text-sky-400">
                  COUNTER-TERRORISTS ({ctAliveCount}/{ctPlayers.length})
                </span>
              </div>
              <ul className="flex flex-col gap-2 m-0 p-0">
                {ctPlayers.map((player) => (
                  <PlayerCard
                    key={player.m_idx}
                    playerData={player}
                    isOnRightSide={false}
                    right={false}
                    settings={settings}
                  />
                ))}
              </ul>
            </div>

            {/* T Column */}
            <div className="w-full max-w-sm flex flex-col">
              <div className="mb-2 flex items-center justify-between px-1">
                <span className="text-xs font-bold uppercase tracking-wider text-amber-400">
                  TERRORISTS ({tAliveCount}/{tPlayers.length})
                </span>
              </div>
              <ul className="flex flex-col gap-2 m-0 p-0">
                {tPlayers.map((player) => (
                  <PlayerCard
                    key={player.m_idx}
                    playerData={player}
                    isOnRightSide={true}
                    right={true}
                    settings={settings}
                  />
                ))}
              </ul>
            </div>
          </section>
        )}

        {/* Right Column: Terrorists (Desktop xl+) */}
        {!isOverlay && settings.showCards && (
          <aside className="hidden xl:flex h-full flex-col justify-center z-30 flex-shrink-0">
            <div className="mb-2 flex items-center justify-between px-1">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-400">
                TERRORISTS ({tAliveCount}/{tPlayers.length})
              </span>
            </div>
            <ul id="terrorist" className="flex flex-col gap-2.5 m-0 p-0 overflow-y-auto max-h-[calc(100vh-5.5rem)] pl-1">
              {tPlayers.map((player) => (
                <PlayerCard
                  key={player.m_idx}
                  playerData={player}
                  isOnRightSide={true}
                  right={true}
                  settings={settings}
                />
              ))}
            </ul>
          </aside>
        )}
      </main>
    </div>
  );
};

export default App;