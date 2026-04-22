
import React, { useState } from 'react';
import { JamProvider } from './JamContext';
import JamMenu from './components/JamMenu';
import './styles.css';

async function main() {
  while (!Spicetify?.showNotification || !Spicetify?.Platform) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  // ── Sidebar panel (mirrors Spotify's right panel) ─────────────────
  const sidebar = document.createElement('div');
  sidebar.id = 'jam-sidebar';
  document.body.appendChild(sidebar);

  let isOpen = false;

  const open  = () => { isOpen = true;  sidebar.classList.add('jam-sidebar-visible'); updateBtn(); };
  const close = () => { isOpen = false; sidebar.classList.remove('jam-sidebar-visible'); updateBtn(); };
  const toggle = () => isOpen ? close() : open();

  // ── Jam icon button in the bottom bar ────────────────────────────
  const jamSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`;

  const createJamButton = () => {
    if (document.getElementById('jam-bottom-button')) return;
    const bar = document.querySelector('.main-nowPlayingBar-extraControls, .main-nowPlayingBar-right');
    if (!bar) { setTimeout(createJamButton, 500); return; }

    const btn = document.createElement('button');
    btn.id = 'jam-bottom-button';
    btn.className = 'jam-topbar-btn';
    btn.innerHTML = jamSvg;
    btn.title = 'Spicetify Jam';
    btn.onclick = toggle;
    bar.insertBefore(btn, bar.firstChild);
  };

  const updateBtn = () => {
    const btn = document.getElementById('jam-bottom-button');
    if (!btn) return;
    btn.classList.toggle('jam-topbar-btn-active', isOpen);
  };

  createJamButton();

  // ── Render React into the sidebar ────────────────────────────────
  Spicetify.ReactDOM.render(
    <JamProvider>
      <JamMenu onClose={close} />
    </JamProvider>,
    sidebar
  );

  console.log('[Spicetify Jam] Loaded.');
}

export default main;
