<div align="center">
  <img src="https://raw.githubusercontent.com/Kyzenkms/spicetify-jam/main/assets/logo.png" alt="Spicetify Jam Banner" width="100%" />

  <h1>🎵 Spicetify Jam</h1>
  <p><b>Real-time social listening sessions for Spotify (via Spicetify)</b></p>
  
  <p>
    <img src="https://img.shields.io/badge/version-1.2.3-1db954?style=for-the-badge&logo=spotify" alt="Version 1.2.3" />
    <img src="https://img.shields.io/badge/spicetify-custom%20app-1db954?style=for-the-badge" alt="Spicetify App" />
    <img src="https://img.shields.io/badge/license-MIT-blue?style=for-the-badge" alt="License" />
  </p>
</div>

<br />

**Spicetify Jam** lets you listen together with friends in real-time, syncing playback and sharing a fully collaborative queue right inside Spotify.

Desktop only: this is a Spicetify extension for the Spotify desktop client on Windows, macOS, and Linux. It does not run on the Spotify mobile app.

## ✨ Features

- 🎧 **Listen Together**: Sync playback exactly. When the host skips, everyone skips.
- 📱 **Luxury Sidebar UI**: An integrated, right-panel interface matching Spotify's native look with beautiful design.
- 🔁 **Instant Resume-to-Sync**: If you pause and resume, it instantly auto-matches the host's current timestamp.
- 📋 **Live Shared Queue**: Add, remove, and drag-and-drop tracks to reorder.
- 📸 **Real Profiles**: Displays actual Spotify Profile Pictures automatically for everyone in the session.
- 🕹️ **Guest Remote Control**: Host can optionally allow guests to control playback directly.
- ⏱️ **Auto-Drift Correction**: Actively fixes de-syncs behind the scenes so nobody falls behind.
- 🔗 **Easy Joins**: Join via 6-character code, QR code, or one-click join link.

---

## 📦 Installation

### Prerequisites

Before installing, make sure you have the following:

- **[Git](https://git-scm.com/downloads)** — to clone the repo
- **[Node.js](https://nodejs.org/) (v18+)** — `npm` is bundled with it
- **[Spicetify](https://spicetify.app/)** — the Spotify mod framework

> **Windows users:** After installing Git and Node.js, restart PowerShell so the commands are recognized.

### Windows

Open PowerShell and run:

```powershell
git clone https://github.com/Kyzenkms/spicetify-jam
cd spicetify-jam
npm install
npm run build
spicetify config extensions spicetify-jam.js
spicetify apply
```

### Linux / macOS

Open your Terminal and run:

```bash
git clone https://github.com/Kyzenkms/spicetify-jam
cd spicetify-jam
npm install
npm run build
spicetify config extensions spicetify-jam.js
spicetify apply
```

---

## 🔄 Updating

Already have Spicetify Jam installed? Run these instead — no need to delete the folder first.

### Windows (PowerShell)

```powershell
cd spicetify-jam
git pull
npm install
npm run build
spicetify apply
```

### Linux / macOS

```bash
cd spicetify-jam
git pull
npm install
npm run build
spicetify apply
```

> 💡 **Don't see the "✨ Update Available" banner?** It only shows up when the installed build is older than the latest GitHub release. If you just want to be safe, run the commands above to pull and rebuild.

---

## 🎮 How to Use

### As a Host
1. Open Spotify and click the **Jam icon** on the bottom-right of your player bar.
2. The Jam Sidebar will slide open. Click **Start a new Jam**.
3. Share the **6-character Session ID**, the **QR Code**, or the **Join Link** with your friends.
4. Add songs to the queue natively through Spotify by right-clicking a track and selecting **"Add to Jam"**, or control it directly from the sidebar.

### As a Guest
1. Open Spotify and click the **Jam icon** in your player bar.
2. Enter the host's **Session ID** or click their **Join Link**.
3. Sit back and enjoy! You are now strictly synced to the host. If you pause, the extension will let you know you're falling behind. Hitting play again will instantly jump you to the correct live playback time.

---

## 🔧 Troubleshooting

### ❌ "Connection timed out" when joining a Jam

Spicetify Jam uses **WebRTC P2P** to connect you directly to the host. This can time out when one or both users are behind a **strict NAT** (common on university/corporate networks, some ISPs, or mobile carrier-grade NAT).

**Try these fixes:**

1. ✅ **Switch to a mobile hotspot** — mobile data networks usually have more permissive NAT and this fixes it most of the time
2. ✅ **Use a VPN** — if either the host or guest connects via a VPN, it typically bypasses the NAT restriction
3. ✅ **Try on a home network** instead of school, work, or public Wi-Fi
4. ✅ Make sure **both users have the latest version** installed — older builds had fewer TURN relay fallbacks

### ❌ The Jam icon doesn't appear in Spotify

Run `spicetify apply` again. If it still doesn't show:
```
spicetify restore apply
```
Then restart Spotify.

### ❌ `npm` or `git` is not recognized

You need **[Node.js](https://nodejs.org/)** and **[Git](https://git-scm.com/downloads)** installed. After installing, **restart your terminal** so the new commands are recognized.

---

## 🤝 Contributing

Found a bug or want to suggest a feature? Feel free to open an Issue!

## 📄 License

This project is licensed under the MIT License. See the `LICENSE` file for details.
