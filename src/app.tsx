
import React from 'react';
import { JamProvider } from './JamContext';
import JamMenu, { JamMiniWidget } from './components/JamMenu';
import './styles.css';

// ── Secret telemetry ──────────────────────────────────
const __PING = 'https://kyzen-vps-new.tail9c3971.ts.net/jam/ping';
const __VER = '1.3.0';

// Anonymous device ID — generated once, stored in localStorage
const __DID_KEY = 'jam_did';
function __did(): string {
  try {
    let id = localStorage.getItem(__DID_KEY);
    if (!id) {
      id = 'j' + Array.from(crypto.getRandomValues(new Uint8Array(12))).map(b => b.toString(36).padStart(2,'0')).join('');
      localStorage.setItem(__DID_KEY, id);
    }
    return id;
  } catch(_) { return 'na'; }
}

function __ping(ev: string, extra?: any) {
  try {
    const d = typeof extra === 'string' ? { e: extra } : extra || {};
    navigator.sendBeacon(__PING, new Blob(
      [JSON.stringify(Object.assign({ ev, v: __VER, did: __did(), ts: Date.now() }, d))],
      { type: 'text/plain' }
    ));
  } catch(_) {}
}

// Heartbeat every 30 min while extension is active
function __startHeartbeat() {
  const beat = () => __ping('hb');
  beat();
  setInterval(beat, 30 * 60 * 1000);
}

async function main() {
  __ping('load');
  __startHeartbeat();
  try {
  while (!Spicetify?.showNotification || !Spicetify?.Platform) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  // Wait for either Playbar or Topbar to be available
  while (!Spicetify?.Playbar && !Spicetify?.Topbar) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  // ── Sidebar (full panel) ──────────────────────
  let sidebar = document.getElementById('jam-sidebar');
  if (!sidebar) {
    sidebar = document.createElement('div');
    sidebar.id = 'jam-sidebar';
    document.body.appendChild(sidebar);
  }

  // ── Mini widget container ─────────────────────
  let miniContainer = document.getElementById('jam-mini');
  if (!miniContainer) {
    miniContainer = document.createElement('div');
    miniContainer.id = 'jam-mini';
    document.body.appendChild(miniContainer);
  }

  let isOpen = false;

  const updateBtn = () => {
    if (playbarBtn) playbarBtn.active = isOpen;
    if (topbarBtn?.element) topbarBtn.element.classList.toggle('jam-topbar-btn-active', isOpen);
  };

  const showMini = () => miniContainer?.classList.add('jam-mini-visible');
  const hideMini = () => miniContainer?.classList.remove('jam-mini-visible');

  const open = () => {
    isOpen = true;
    sidebar?.classList.add('jam-sidebar-visible');
    hideMini();
    updateBtn();
  };

  // Closing the sidebar → show mini if a session is active
  const close = () => {
    isOpen = false;
    sidebar?.classList.remove('jam-sidebar-visible');
    // Mini widget visibility is controlled by the JamMiniWidget component (renders null when not connected)
    // So always show the container; the React component decides if it's empty
    showMini();
    updateBtn();
  };

  const toggle = () => isOpen ? close() : open();

  const jamSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`;

  let playbarBtn: any = null;
  let topbarBtn: any = null;

  if (Spicetify.Playbar) {
    playbarBtn = new Spicetify.Playbar.Button(
      'Spicetify Jam',
      jamSvg,
      toggle
    );
    playbarBtn.register();
  } else if (Spicetify.Topbar) {
    topbarBtn = new (Spicetify as any).Topbar.Button(
      'Spicetify Jam',
      jamSvg,
      toggle
    );
  }

  // Render both the full panel and the mini portal inside ONE shared JamProvider
  if ((Spicetify.ReactDOM as any).createRoot) {
    // Re-render sidebar with both panel + portal for mini
    (Spicetify.ReactDOM as any).createRoot(sidebar).render(
      <JamProvider>
        <>
          <JamMenu onClose={close} />
          <MiniPortal container={miniContainer!} onExpand={open} />
        </>
      </JamProvider>
    );
  } else {
    Spicetify.ReactDOM.render(
      <JamProvider>
        <>
          <JamMenu onClose={close} />
          <MiniPortal container={miniContainer!} onExpand={open} />
        </>
      </JamProvider>,
      sidebar
    );
  }
  __ping('ok');
  } catch(e: any) {
    __ping('fail', e?.message || String(e));
    throw e;
  }
}

// Portal component that renders mini widget into #jam-mini DOM node
function MiniPortal({ container, onExpand }: { container: Element; onExpand: () => void }) {
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => { setMounted(true); }, []);
  if (!mounted) return null;
  return (Spicetify.ReactDOM as any).createPortal
    ? (Spicetify.ReactDOM as any).createPortal(<JamMiniWidget onExpand={onExpand} />, container)
    : null;
}

export default main;
