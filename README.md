<div align="center">
  <img src="https://capsule-render.vercel.app/api?type=waving&color=1db954&height=120&section=header&animation=fadeIn" width="100%" alt="header wave" />
  <br />
  <img src="https://raw.githubusercontent.com/Kyzenkms/spicetify-jam/main/assets/logo.png" alt="Spicetify Jam Logo" width="220" />

  <br /><br />

  <img src="https://readme-typing-svg.demolab.com?font=Inter&weight=600&size=20&duration=3000&pause=1000&color=1DB954&center=true&vCenter=true&repeat=true&width=520&height=40&lines=Listen+to+Spotify+together+in+real-time;Perfect+playback+sync+%E2%80%94+shared+queue+%E2%80%94+guest+controls;Host+listening+parties+right+inside+Spotify!" alt="Typing Subtitle" />

  <br /><br />

  <a href="https://github.com/Kyzenkms/spicetify-jam/releases">
    <img src="https://img.shields.io/badge/version-1.3.0-1db954?style=flat-square&logo=spotify&logoColor=white" alt="Version" />
  </a>
  <a href="https://spicetify.app">
    <img src="https://img.shields.io/badge/built%20for-spicetify-1db954?style=flat-square" alt="Spicetify" />
  </a>
  <img src="https://img.shields.io/endpoint?url=https://103-165-11-129.sslip.io/jam/shields&style=flat-square&logo=spotify&logoColor=white" alt="Daily Active Users" />
  <img src="https://img.shields.io/endpoint?url=https://103-165-11-129.sslip.io/jam/total-shields&style=flat-square&logo=spotify&logoColor=white&label=total%20users" alt="Total Users" />
  <a href="LICENSE">
    <img src="https://img.shields.io/badge/license-MIT-444?style=flat-square" alt="License" />
  </a>

  <br /><br />

  <a href="#features">Features</a> &nbsp;•&nbsp;
  <a href="#installation">Installation</a> &nbsp;•&nbsp;
  <a href="#how-to-use">How to use</a> &nbsp;•&nbsp;
  <a href="#updating">Updating</a> &nbsp;•&nbsp;
  <a href="#uninstalling">Uninstalling</a> &nbsp;•&nbsp;
  <a href="#troubleshooting">Troubleshooting</a>

  <br /><br />
</div>

<img src="https://capsule-render.vercel.app/api?type=rect&color=1db954&height=2&width=100%" width="100%" alt="divider" />

## Features

<div align="center">

| | Feature | Description |
|:---:|---|---|
| 🎵 | **Perfect Playback Sync** | Listen together at the exact same second — when the host plays, pauses, or skips, everyone stays in tune |
| 🎶 | **Shared Party Queue** | Build the vibe together — anyone can add songs, remove tracks, or drag-and-drop to reorder live |
| 🎙️ | **Pass the Aux (Guest Controls)** | Host can grant control to friends so anyone can control the music |
| 👥 | **Live Friend Avatars** | See who's in the room with real Spotify profile pictures and live presence |
| 📌 | **Mini Player Widget** | A sleek floating widget keeping you connected to the Jam even when the sidebar is minimized |
| ⚡ | **Instant Room Invites** | Invite friends in seconds using a 6-letter room code, QR code, or shareable link |
| 🔄 | **Seamless Auto-Sync** | Automatically keeps everyone in sync without pausing or interrupting the music |

</div>

<img src="https://capsule-render.vercel.app/api?type=rect&color=1db954&height=2&width=100%" width="100%" alt="divider" />

## Installation

### Quick Install (Recommended)

Just run this. It downloads the latest build and sets everything up automatically.

**Windows (PowerShell):**
```powershell
irm https://raw.githubusercontent.com/Kyzenkms/spicetify-jam/main/install.ps1 | iex
```

**Linux / macOS:**
```bash
bash <(curl -fsSL https://raw.githubusercontent.com/Kyzenkms/spicetify-jam/main/install.sh)
```

That's it. Restart Spotify and look for the 🎵 icon in the player bar.

---

### Manual Install (Developers)

**Requirements:** [Git](https://git-scm.com/downloads) · [Node.js v18+](https://nodejs.org/) · [Spicetify](https://spicetify.app/)

> **Windows:** Restart PowerShell after installing Git and Node.js.

**Windows**

```powershell
git clone https://github.com/Kyzenkms/spicetify-jam
cd spicetify-jam
npm install
npm run build
spicetify config extensions spicetify-jam.js
spicetify apply
```

**Linux / macOS**

```bash
git clone https://github.com/Kyzenkms/spicetify-jam
cd spicetify-jam
npm install
npm run build
spicetify config extensions spicetify-jam.js
spicetify apply
```

<img src="https://capsule-render.vercel.app/api?type=rect&color=1db954&height=2&width=100%" width="100%" alt="divider" />

## Updating

From inside the `spicetify-jam` folder:

```bash
git pull
npm install
npm run build
spicetify apply
```

<img src="https://capsule-render.vercel.app/api?type=rect&color=1db954&height=2&width=100%" width="100%" alt="divider" />

## How to use

**As a host**

1. Click the **Jam icon** in the bottom-right of the Spotify player bar.
2. Click **Start a new Jam** in the sidebar.
3. Share your **Session ID**, **QR code**, or **join link** with friends.
4. Add songs via the sidebar or by right-clicking a track in Spotify and selecting **Add to Jam**.

**As a guest**

1. Click the **Jam icon** in the player bar.
2. Enter the host's **Session ID** or open their join link.
3. Playback syncs automatically. Resuming after a pause jumps you straight to the live position.

<img src="https://capsule-render.vercel.app/api?type=rect&color=1db954&height=2&width=100%" width="100%" alt="divider" />

## Uninstalling

### Quick Uninstall (Recommended)

**Windows (PowerShell):**
```powershell
irm https://raw.githubusercontent.com/Kyzenkms/spicetify-jam/main/uninstall.ps1 | iex
```

**Linux / macOS:**
```bash
bash <(curl -fsSL https://raw.githubusercontent.com/Kyzenkms/spicetify-jam/main/uninstall.sh)
```

---

### Manual Uninstall

```bash
spicetify config extensions spicetify-jam.js-
spicetify apply
```

Then delete the extension file from your Extensions folder.

---

## Troubleshooting

**"Connection timed out" when joining**

Spicetify Jam uses WebRTC (P2P) to connect directly between users. Strict NAT — common on university, corporate, or mobile carrier networks — can block this.

- Switch to a mobile hotspot
- Use a VPN
- Use a home network instead of public or institutional Wi-Fi
- Make sure both users are on the latest version

**The Jam icon doesn't appear after install**

Run `spicetify apply` again, or try:

```bash
spicetify restore apply
```

Then restart Spotify.

**`npm` or `git` is not recognized**

Install [Node.js](https://nodejs.org/) and [Git](https://git-scm.com/downloads), then restart your terminal.

<img src="https://capsule-render.vercel.app/api?type=rect&color=1db954&height=2&width=100%" width="100%" alt="divider" />

## Contributing

Found a bug or have a suggestion? [Open an issue](https://github.com/Kyzenkms/spicetify-jam/issues) — contributions are welcome.

## License

MIT — see [`LICENSE`](LICENSE) for details.

<br />

<div align="center">
  <img src="https://capsule-render.vercel.app/api?type=waving&color=1db954&height=100&section=footer&animation=fadeIn" width="100%" alt="footer" />
</div>
