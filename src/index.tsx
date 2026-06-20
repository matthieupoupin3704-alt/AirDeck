import {
  PanelSection,
  PanelSectionRow,
  ToggleField,
  Navigation,
} from "@decky/ui";
import { routerHook } from "@decky/api";
import {
  callable,
  definePlugin,
  toaster,
} from "@decky/api"
import { useState, useEffect } from "react";
import { FaMusic, FaBluetooth, FaCog } from "react-icons/fa";

const play_pause = callable<[playing: boolean], void>("play_pause");
const next = callable<[], void>("next");
const previous = callable<[], void>("previous");
const shuffle = callable<[], void>("shuffle");
const repeat = callable<[], void>("repeat");
const get_metadata = callable<[], any>("get_metadata");

const SETTINGS_ROUTE = "/airdeck-settings";

const styles = {
  container: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 0,
    padding: "0 4px",
  },
  artworkRow: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    gap: 6,
    padding: "4px 0 2px",
  },
  artwork: {
    width: "100%",
    maxWidth: 140,
    aspectRatio: "1 / 1" as const,
    borderRadius: 10,
    objectFit: "cover" as const,
    background: "oklch(0.22 0.01 260)",
  },
  artworkPlaceholder: {
    width: "100%",
    maxWidth: 140,
    aspectRatio: "1 / 1" as const,
    borderRadius: 10,
    background: "oklch(0.22 0.01 260)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 40,
    color: "oklch(0.35 0.01 260)",
  },
  trackInfo: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    gap: 2,
    width: "100%",
  },
  title: {
    fontSize: 13,
    fontWeight: 600,
    color: "oklch(0.96 0.005 260)",
    whiteSpace: "nowrap" as const,
    overflow: "hidden",
    textOverflow: "ellipsis",
    lineHeight: 1.3,
    width: "100%",
    textAlign: "center" as const,
  },
  artist: {
    fontSize: 11,
    fontWeight: 400,
    color: "oklch(0.62 0.01 260)",
    whiteSpace: "nowrap" as const,
    overflow: "hidden",
    textOverflow: "ellipsis",
    lineHeight: 1.3,
    width: "100%",
    textAlign: "center" as const,
  },
  noTrack: {
    fontSize: 12,
    color: "oklch(0.50 0.01 260)",
    fontStyle: "italic" as const,
  },
  progressContainer: {
    padding: "2px 0 4px",
  },
  progressTrack: {
    width: "100%",
    height: 6,
    background: "oklch(0.28 0.01 260)",
    borderRadius: 3,
    overflow: "hidden",
  },
  controls: {
    display: "flex",
    flexDirection: "row" as const,
    justifyContent: "center",
    alignItems: "center",
    gap: 4,
    padding: "2px 0 4px",
  },
  btn: {
    background: "none",
    border: "none",
    color: "oklch(0.82 0.01 260)",
    cursor: "pointer",
    padding: "6px 10px",
    borderRadius: 6,
    fontSize: 16,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "background 0.15s, color 0.15s",
    lineHeight: 1,
  },
  btnPrimary: {
    background: "oklch(0.96 0.005 260)",
    color: "oklch(0.12 0.01 260)",
    padding: "7px 14px",
    fontSize: 18,
    borderRadius: 8,
  },
  emptyState: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    textAlign: "center" as const,
    gap: 8,
    padding: "24px 12px 16px",
  },
  emptyIcon: {
    fontSize: 38,
    color: "oklch(0.55 0.13 250)",
    display: "flex",
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: 600,
    color: "oklch(0.92 0.005 260)",
  },
  emptySub: {
    fontSize: 11,
    lineHeight: 1.4,
    color: "oklch(0.58 0.01 260)",
    maxWidth: 140,
    marginBottom: 4,
  },
  gear: {
    position: "absolute" as const,
    top: 2,
    right: 6,
    fontSize: 18,
    color: "oklch(0.96 0.005 260)",
    cursor: "pointer",
    padding: 4,
    zIndex: 2,
    display: "flex",
  },
  bluetoothBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    background: "oklch(0.55 0.13 250)",
    color: "oklch(0.98 0.005 260)",
    border: "none",
    borderRadius: 8,
    padding: "10px 18px",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    transition: "background 0.15s",
    outline: "none",
  },
};

function fmtTime(secs: number): string {
  if (!isFinite(secs) || secs < 0) secs = 0;
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function ProgressBar({ position, length }: { position: number; length: number }) {
  const pct = length > 0 ? Math.min((position / length) * 100, 100) : 0;
  return (
    <div style={styles.progressContainer}>
      <div style={{ ...styles.progressTrack, position: "relative", overflow: "visible" }}>
        <div style={{
          height: "100%",
          width: `${pct}%`,
          background: "oklch(0.78 0.14 260)",
          borderRadius: 3,
          transition: "width 1s linear",
        }} />
        <div style={{
          position: "absolute",
          top: "50%",
          left: `${pct}%`,
          transform: "translate(-50%, -50%)",
          width: 12,
          height: 12,
          borderRadius: "50%",
          background: "oklch(0.96 0.005 260)",
          transition: "left 1s linear",
          pointerEvents: "none",
        }} />
      </div>
    </div>
  );
}

function openBluetoothSettings() {
  try {
    Navigation.Navigate("/settings/bluetooth");
  } catch (e) {
    console.error("[AirDeck] failed to open Bluetooth settings", e);
  }
}

function BluetoothButton() {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={openBluetoothSettings}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        ...styles.bluetoothBtn,
        ...(hovered ? { background: "oklch(0.62 0.14 250)" } : {}),
      }}
    >
      <FaBluetooth /> Connect a device
    </button>
  );
}

function CtrlBtn({ onClick, children, primary, active }: { onClick: () => void; children: React.ReactNode; primary?: boolean; active?: boolean }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        ...styles.btn,
        ...(primary ? styles.btnPrimary : {}),
        ...(active && !primary ? { background: "oklch(0.82 0.01 260)", color: "oklch(0.12 0.01 260)" } : {}),
        ...(hovered && !primary && !active ? { background: "oklch(0.28 0.01 260)", color: "oklch(0.96 0.005 260)" } : {}),
        ...(hovered && !primary && active ? { background: "oklch(0.72 0.01 260)", color: "oklch(0.12 0.01 260)" } : {}),
        ...(hovered && primary ? { background: "oklch(0.88 0.005 260)" } : {}),
        outline: "none",
      }}
    >
      {children}
    </button>
  );
}

/**
 * Global media store. Lives for the whole plugin lifetime (started in definePlugin),
 * independent of whether the Quick Access panel is mounted. This is what keeps the
 * now-playing notification working with the panel closed, and prevents state from
 * resetting every time the panel reopens.
 */
interface MediaState {
  metadata: any;
  position: number;
  isPlaying: boolean;
  onShuffle: boolean;
  onRepeat: boolean;
}

class AirDeckStore {
  state: MediaState = {
    metadata: null,
    position: 0,
    isPlaying: false,
    onShuffle: false,
    onRepeat: false,
  };

  private listeners = new Set<() => void>();
  private trackKey = "";        // persists across panel open/close
  private length = 0;
  private shuffleLock = 0;
  private repeatLock = 0;
  private intervalId?: number;
  private ticks = 0;            // counts seconds; we poll BlueZ every few ticks
  private polling = false;      // guard against overlapping async polls

  // Notifications preference, persisted in localStorage (default on).
  notifyEnabled = (() => {
    try { return localStorage.getItem("airdeck_notify") !== "0"; } catch { return true; }
  })();

  setNotifyEnabled(v: boolean) {
    this.notifyEnabled = v;
    try { localStorage.setItem("airdeck_notify", v ? "1" : "0"); } catch {}
    this.emit();
  }

  subscribe = (cb: () => void) => {
    this.listeners.add(cb);
    return () => { this.listeners.delete(cb); };
  };

  getSnapshot = () => this.state;

  private emit() {
    this.listeners.forEach(l => l());
  }

  private set(patch: Partial<MediaState>) {
    this.state = { ...this.state, ...patch };
    this.emit();
  }

  lockShuffle(v: boolean) { this.shuffleLock = Date.now() + 3000; this.set({ onShuffle: v }); }
  lockRepeat(v: boolean) { this.repeatLock = Date.now() + 3000; this.set({ onRepeat: v }); }
  setPlaying(v: boolean) { this.set({ isPlaying: v }); }

  start() {
    if (this.intervalId !== undefined) return; // already running
    // Single 1s loop. Every second we interpolate the position locally; every 3rd second
    // we hit BlueZ. One timeline → no race between two intervals fighting over position.
    this.intervalId = window.setInterval(() => {
      this.tick();
      this.ticks = (this.ticks + 1) % 2;
      if (this.ticks === 0) this.poll();
    }, 1000);
    this.poll(); // prime immediately on start
  }

  stop() {
    if (this.intervalId !== undefined) { window.clearInterval(this.intervalId); this.intervalId = undefined; }
  }

  private tick() {
    if (!this.state.isPlaying) return;
    const len = this.length;
    const nxt = this.state.position + 1;
    this.set({ position: len > 0 && nxt > len ? len : nxt });
  }

  private async poll() {
    if (this.polling) return; // don't overlap a slow busctl call with the next one
    this.polling = true;
    try {
      await this._poll();
    } finally {
      this.polling = false;
    }
  }

  private async _poll() {
    let m: any;
    try {
      m = await get_metadata();
    } catch {
      return; // plugin restart / transient backend error: keep the loop alive
    }

    const playing = m?.status === "Playing";
    this.length = m?.length ?? 0;
    const bluezPos = m?.position ?? 0;

    const key = `${m?.title ?? ""}|${m?.artist ?? ""}`;
    let position = this.state.position;

    if (key !== this.trackKey) {
      const prevKey = this.trackKey;
      this.trackKey = key;
      position = bluezPos;
      // Toast on real track change while playing (skip first load + empty tracks + if disabled).
      if (prevKey !== "" && playing && m?.title && this.notifyEnabled) {
        const art = m?.art_url;
        toaster.toast({
          title: m.title,
          body: m.artist || "Unknown Artist",
          logo: art
            ? <img src={art} style={{ width: 44, height: 44, objectFit: "contain", border: "2px solid #ccc", borderRadius: "4px" }} />
            : undefined,
          duration: 4000,
        });
      }
    } else {
      const drift = Math.abs(bluezPos - this.state.position);
      position = drift > 3 ? bluezPos : this.state.position;
    }

    this.set({
      metadata: m,
      isPlaying: playing,
      position,
      onShuffle: Date.now() > this.shuffleLock ? m?.isshuffle === "alltracks" : this.state.onShuffle,
      onRepeat: Date.now() > this.repeatLock ? m?.isrepeat === "alltracks" : this.state.onRepeat,
    });
  }
}

const store = new AirDeckStore();

function Content() {
  const [snap, setSnap] = useState<MediaState>(store.getSnapshot());
  useEffect(() => store.subscribe(() => setSnap(store.getSnapshot())), []);
  const { metadata, position, isPlaying, onShuffle, onRepeat } = snap;
  const [showRemaining, setShowRemaining] = useState<boolean>(false);

  const hasTrack = metadata?.title || metadata?.artist;

  // No Bluetooth media device connected: guide the user to pair one.
  if (metadata?.no_device) {
    return (
      <PanelSection>
        <PanelSectionRow>
          <div style={styles.emptyState}>
            <div style={styles.emptyIcon}><FaBluetooth /></div>
            <div style={styles.emptyTitle}>No device connected</div>
            <div style={styles.emptySub}>
              Connect your phone over Bluetooth to control its music here.
            </div>
            <BluetoothButton />
          </div>
        </PanelSectionRow>
      </PanelSection>
    );
  }

  return (
    <PanelSection>
      <PanelSectionRow>
        <div style={{ ...styles.container, position: "relative" }}>

          {/* settings gear, top-right */}
          <div
            onClick={() => { Navigation.CloseSideMenus(); Navigation.Navigate(SETTINGS_ROUTE); }}
            style={styles.gear}
          >
            <FaCog />
          </div>

          <div style={{ height: 12 }} />

          {/* Artwork + track info */}
          <div style={styles.artworkRow}>
            {metadata?.art_url
              ? <img src={metadata.art_url} style={styles.artwork} />
              : <div style={styles.artworkPlaceholder}>♪</div>
            }
            <div style={styles.trackInfo}>
              {hasTrack ? (
                <>
                  <div style={styles.title}>{metadata.title}</div>
                  <div style={styles.artist}>{metadata.artist || "Unknown Artist"}</div>
                  {metadata.album && (
                    <div style={{ ...styles.artist, marginTop: 2, opacity: 0.7 }}>{metadata.album}</div>
                  )}
                </>
              ) : (
                <div style={styles.noTrack}>No track playing</div>
              )}
            </div>
          </div>

          {/* Progress bar */}
          <ProgressBar position={position} length={metadata?.length ?? 0} />
          <div
            onClick={() => setShowRemaining(r => !r)}
            style={{ fontSize: 10, color: "oklch(0.55 0.01 260)", textAlign: "right", cursor: "pointer", paddingBottom: 4 }}
          >
            {showRemaining
              ? `-${fmtTime((metadata?.length ?? 0) - position)}`
              : `${fmtTime(position)} / ${fmtTime(metadata?.length ?? 0)}`
            }
          </div>


          {/* Controls */}
          <div style={styles.controls}>
            <CtrlBtn onClick={() => { shuffle(); store.lockShuffle(!onShuffle); }} active={onShuffle}>
              ⇄
            </CtrlBtn>
            <CtrlBtn onClick={() => previous()}>⏮</CtrlBtn>
            <CtrlBtn onClick={() => { play_pause(isPlaying); store.setPlaying(!isPlaying); }} primary>
              {isPlaying ? "⏸" : "▶"}
            </CtrlBtn>
            <CtrlBtn onClick={() => next()}>⏭</CtrlBtn>
            <CtrlBtn onClick={() => { repeat(); store.lockRepeat(!onRepeat); }} active={onRepeat}>
              ↺
            </CtrlBtn>
          </div>

        </div>
      </PanelSectionRow>
    </PanelSection>
  );
}

function SettingsPage() {
  const [notify, setNotify] = useState<boolean>(store.notifyEnabled);
  return (
    <div style={{ padding: "16px 24px" }}>
      <PanelSection title="Notifications">
        <PanelSectionRow>
          <ToggleField
            label="Now playing notifications"
            description="Show a toast when the track changes."
            checked={notify}
            onChange={(v: boolean) => { setNotify(v); store.setNotifyEnabled(v); }}
          />
        </PanelSectionRow>
      </PanelSection>
    </div>
  );
}

export default definePlugin(() => {
  // Start polling immediately, for the whole plugin lifetime.
  store.start();
  routerHook.addRoute(SETTINGS_ROUTE, SettingsPage, { exact: true });
  return {
    name: "AirDeck",
    icon: <FaMusic />,
    content: <Content />,
    onDismount() {
      store.stop();
      routerHook.removeRoute(SETTINGS_ROUTE);
    },
  };
});
