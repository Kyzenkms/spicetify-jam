<div align="center">
  <img src="https://raw.githubusercontent.com/Kyzenkms/spicetify-jam/main/assets/logo.png" alt="Spicetify Jam Banner" width="100%" />

  <h1>🎵 Spicetify Jam</h1>
  <p><b>Real-time social listening sessions for Spotify (via Spicetify)</b></p>
  
  <p>
    <img src="https://img.shields.io/badge/version-1.0.0-1db954?style=for-the-badge&logo=spotify" alt="Version 1.0.0" />
    <img src="https://img.shields.io/badge/spicetify-custom%20app-1db954?style=for-the-badge" alt="Spicetify App" />
    <img src="https://img.shields.io/badge/license-MIT-blue?style=for-the-badge" alt="License" />
  </p>
</div>

<br />

**Spicetify Jam** lets you listen together with friends in real-time, syncing playback and sharing a fully collaborative queue right inside Spotify.

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

Before installing Spicetify Jam, make sure you have [Spicetify](https://spicetify.app/) installed and working.

### Windows (Quick Install)

Open PowerShell and run the following commands:

```powershell
cd "$env:APPDATA\spicetify\CustomApps"
git clone https://github.com/Kyzenkms/spicetify-jam jam
cd jam
npm install
npm run build
spicetify config custom_apps jam
spicetify apply
```

### Linux / macOS

Open your Terminal and run the following commands:

```bash
cd "$(spicetify -c | grep custom_apps_path | cut -d= -f2)"
git clone https://github.com/Kyzenkms/spicetify-jam jam
cd jam
npm install
npm run build
spicetify config custom_apps jam
spicetify apply
```

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

## 🤝 Contributing

Found a bug or want to suggest a feature? Feel free to open an Issue!

## 📄 License

This project is licensed under the MIT License. See the `LICENSE` file for details.
