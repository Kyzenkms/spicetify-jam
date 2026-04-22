import React, { useState, useEffect } from 'react';
import { useJam } from '../JamContext';
import QRCode from 'qrcode';

const COLORS = [
    'linear-gradient(135deg,#1db954,#1ed760)',
    'linear-gradient(135deg,#e84444,#ff6b6b)',
    'linear-gradient(135deg,#4a90d9,#6eb5ff)',
    'linear-gradient(135deg,#f5a623,#ffc857)',
    'linear-gradient(135deg,#b24592,#f15f79)',
    'linear-gradient(135deg,#00c9ff,#92fe9d)',
];

const I = {
    close:    <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor"><path d="M2.47 2.47a.75.75 0 011.06 0L8 6.94l4.47-4.47a.75.75 0 111.06 1.06L9.06 8l4.47 4.47a.75.75 0 11-1.06 1.06L8 9.06l-4.47 4.47a.75.75 0 01-1.06-1.06L6.94 8 2.47 3.53a.75.75 0 010-1.06z"/></svg>,
    people:   <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor"><path d="M5.5 2a2.5 2.5 0 100 5 2.5 2.5 0 000-5zM4 4.5a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0zM10.5 3a2 2 0 100 4 2 2 0 000-4z"/></svg>,
    copy:     <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M4 6.5V12a1.5 1.5 0 001.5 1.5H10A1.5 1.5 0 0011.5 12V6.5A1.5 1.5 0 0010 5H5.5A1.5 1.5 0 004 6.5z"/></svg>,
    check:    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M13.985 2.383L5.127 12.754 1.388 8.375l-.766.663 4.5 5.2 9.638-11.29-.766-.654z"/></svg>,
    qr:       <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M1 1h6v6H1V1zm2 2v2h2V3H3zm6-2h6v6H9V1zm2 2v2h2V3h-2zM1 9h6v6H1V9zm2 2v2h2v-2H3z"/></svg>,
    leave:    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M3.5 2A1.5 1.5 0 002 3.5v9A1.5 1.5 0 003.5 14H7v-1H3.5a.5.5 0 01-.5-.5v-9a.5.5 0 01.5-.5H7V2H3.5zM10.354 4.646a.5.5 0 00-.708.708L12.293 8H6v1h6.293l-2.647 2.646a.5.5 0 10.708.708l3.5-3.5a.5.5 0 000-.708l-3.5-3.5z"/></svg>,
    jam:      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>,
    warn:     <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>,
    kick:     <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="17" y1="8" x2="22" y2="13"/><line x1="22" y1="8" x2="17" y2="13"/></svg>,
    queue:    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>,
    prev:     <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>,
    next:     <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6z"/></svg>,
    play:     <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>,
    pause:    <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>,
    settings: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
    x:        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
    link:     <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M4.715 6.542L3.343 7.914a3 3 0 104.243 4.243l1.828-1.829A3 3 0 008.586 5.5L8 6.086a1 1 0 00-.154.199 2 2 0 01.861 3.337L6.88 11.45a2 2 0 11-2.83-2.827l.793-.793a4.018 4.018 0 01-.128-1.287z"/></svg>,
    playItem: <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>,
    drag:     <svg width="10" height="14" viewBox="0 0 12 18" fill="rgba(255,255,255,0.25)"><circle cx="4" cy="3" r="1.8"/><circle cx="9" cy="3" r="1.8"/><circle cx="4" cy="9" r="1.8"/><circle cx="9" cy="9" r="1.8"/><circle cx="4" cy="15" r="1.8"/><circle cx="9" cy="15" r="1.8"/></svg>,
};

const fmtTime = (ms: number) => {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
};
const safeInitial = (name: string) => ((name || '?').trim()[0] || '?').toUpperCase();

const JamMenu: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const j = useJam();
    const [joinInput, setJoinInput] = useState('');
    const [qrUrl, setQrUrl] = useState('');
    const [copied, setCopied] = useState(false);
    const [showQr, setShowQr] = useState(false);
    const [dragIdx, setDragIdx] = useState<number | null>(null);
    const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

    useEffect(() => {
        if (j.jamId) {
            QRCode.toDataURL(j.jamId, { width: 200, margin: 1, color: { dark: '#000', light: '#fff' } }).then(setQrUrl);
        }
    }, [j.jamId]);

    const copy = (text: string, msg: string) => {
        try { (Spicetify as any).Platform.ClipboardAPI.copy(text); } catch { navigator.clipboard?.writeText(text); }
        Spicetify.showNotification(msg);
    };

    const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!j.isHost && !j.guestControls) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        j.seekTo(pct * j.duration);
    };

    const pct = j.duration > 0 ? (j.progress / j.duration) * 100 : 0;
    const canEdit = j.isHost || j.guestControls;

    // ── Not Connected (Landing) ──────────────────────────────────────────
    if (!j.connected) {
        return (
            <div className="jam-root">
                <div className="jam-header">
                    <div className="jam-header-left">
                        <div className="jam-logo-icon">{I.jam}</div>
                        <div>
                            <div className="jam-title">Social Jam</div>
                            <div className="jam-subtitle">Listen together</div>
                        </div>
                    </div>
                    <button className="jam-icon-btn" onClick={onClose}>{I.close}</button>
                </div>
                <div className="jam-body">
                    <div className="jam-hero">
                        <div className="jam-hero-icon">{I.jam}</div>
                        <h2 className="jam-hero-title">Host a Listening Session</h2>
                        <p className="jam-hero-desc">Sync playback and share your queue with friends in real-time.</p>
                    </div>
                    <button className="jam-btn green full" onClick={j.startJam}>Start a new Jam</button>
                    <div className="jam-divider"><div className="jam-divider-line"/><span>or join one</span><div className="jam-divider-line"/></div>
                    <input className="jam-input" placeholder="Paste Jam ID or join link…" value={joinInput}
                        onChange={e => setJoinInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && j.joinJam(joinInput)} spellCheck={false}/>
                    <button className="jam-btn outline full" style={{marginTop:8}} onClick={() => j.joinJam(joinInput)}>Join Session</button>
                    {j.error && <div className="jam-error">{I.warn} {j.error}</div>}
                </div>
            </div>
        );
    }

    return (
        <div className="jam-root">
            <div className="jam-header">
                <div className="jam-header-left">
                    <div className="jam-logo-icon active">{I.jam}</div>
                    <div>
                        <div className="jam-title">Jam</div>
                        <div className="jam-subtitle">{j.isHost ? 'Hosting' : `With ${j.hostName}`}</div>
                    </div>
                </div>
                <div className="jam-header-right">
                    {!j.isHost && (
                        <span className={`jam-ping ${j.ping < 0 ? 'measuring' : j.ping > 150 ? 'bad' : 'good'}`}>
                            {j.ping < 0 ? '…' : `${j.ping}ms`}
                        </span>
                    )}
                    <button className="jam-icon-btn" onClick={onClose}>{I.close}</button>
                </div>
            </div>

            <div className="jam-body scrollable">
                {/* Live badge */}
                <div className="jam-live-badge">
                    <span className="jam-live-dot"/>
                    <span>Session Active</span>
                    <span className="jam-badge">{j.isHost ? 'HOST' : 'GUEST'}</span>
                </div>

                {/* Now Playing Card */}
                {j.nowPlaying && (
                    <div className="jam-np-card">
                        <div className="jam-np-art-wrap">
                            {j.nowPlaying.artUrl
                                ? <img className="jam-np-art" src={j.nowPlaying.artUrl} alt="" onError={e => { (e.target as HTMLImageElement).style.display='none'; }}/>
                                : <div className="jam-np-art placeholder"/>}
                        </div>
                        <div className="jam-np-meta">
                            <div className="jam-np-label">NOW PLAYING</div>
                            <div className="jam-np-title">{j.nowPlaying.title}</div>
                            <div className="jam-np-artist">{j.nowPlaying.artist}</div>
                        </div>
                        {/* Progress bar */}
                        <div className="jam-progress-row">
                            <span className="jam-time">{fmtTime(j.progress)}</span>
                            <div className="jam-progress-rail"
                                onClick={handleSeek}
                                style={{ cursor: canEdit ? 'pointer' : 'default' }}>
                                <div className="jam-progress-fill" style={{ width: `${pct}%` }}/>
                                <div className="jam-progress-dot" style={{ left: `${pct}%` }}/>
                            </div>
                            <span className="jam-time">{fmtTime(j.duration)}</span>
                        </div>
                        {/* Controls */}
                        {canEdit && (
                            <div className="jam-controls">
                                <button className="jam-ctrl-btn" onClick={j.prev}>{I.prev}</button>
                                <button className="jam-ctrl-btn main" onClick={j.isPlaying ? j.pause : j.play}>
                                    {j.isPlaying ? I.pause : I.play}
                                </button>
                                <button className="jam-ctrl-btn" onClick={j.next}>{I.next}</button>
                            </div>
                        )}
                    </div>
                )}

                {/* Host Settings */}
                {j.isHost && (
                    <div className="jam-section-card">
                        <div className="jam-section-title">{I.settings} SESSION SETTINGS</div>
                        <div className="jam-setting-row">
                            <span>Guest Playback Controls</span>
                            <button className={`jam-toggle ${j.guestControls ? 'on' : ''}`} onClick={j.toggleGuestControls}>
                                <div className="jam-toggle-knob"/>
                            </button>
                        </div>
                    </div>
                )}

                {/* Queue */}
                {j.queue.length > 0 && (
                    <div className="jam-section-card">
                        <div className="jam-section-title">{I.queue} UP NEXT · {j.queue.length}</div>
                        {j.queue.map((t, i) => (
                            <div
                                key={`${t.uri}-${i}`}
                                className={`jam-q-row${dragIdx === i ? ' drag-src' : ''}${dragOverIdx === i && dragIdx !== i ? ' drag-over' : ''}`}
                                draggable={canEdit}
                                onDragStart={() => setDragIdx(i)}
                                onDragOver={e => { e.preventDefault(); setDragOverIdx(i); }}
                                onDrop={() => { if (dragIdx !== null && dragIdx !== i) j.moveInQueue(dragIdx, i); setDragIdx(null); setDragOverIdx(null); }}
                                onDragEnd={() => { setDragIdx(null); setDragOverIdx(null); }}
                            >
                                {canEdit && <div className="jam-drag-grip">{I.drag}</div>}
                                <div className="jam-q-num">{i + 1}</div>
                                <div className="jam-q-thumb">
                                    {t.artUrl
                                        ? <img src={t.artUrl} alt="" onError={e => { (e.target as HTMLImageElement).style.display='none'; }}/>
                                        : <div className="jam-q-thumb-ph"/>}
                                </div>
                                <div className="jam-q-meta">
                                    <div className="jam-q-title">{t.title}</div>
                                    <div className="jam-q-artist">{t.artist}</div>
                                </div>
                                {canEdit && (
                                    <div className="jam-q-btns">
                                        <button className="jam-q-btn green" title="Play now" onClick={() => j.jumpToTrack(t.uri!)}>{I.playItem}</button>
                                        <button className="jam-q-btn red" title="Remove" onClick={() => j.removeFromQueue(t.uri!)}>{I.x}</button>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}

                {/* Members */}
                <div className="jam-section-card">
                    <div className="jam-section-title">{I.people} LISTENERS · {j.members.length}</div>
                    {j.members.map((m, i) => (
                        <div key={m.id + i} className="jam-member-row">
                            <div className="jam-avatar" style={{ background: COLORS[i % COLORS.length] }}>
                                {m.image
                                    ? <img src={m.image} alt="" onError={e => { (e.target as HTMLImageElement).style.display='none'; }}/>
                                    : safeInitial(m.name)}
                            </div>
                            <div className="jam-member-info">
                                <div className="jam-member-name">{m.name || 'Listener'}</div>
                                <div className="jam-member-role">{m.isHost ? '● Host' : '○ Listener'}</div>
                            </div>
                            {j.isHost && !m.isHost && (
                                <button className="jam-icon-btn small red" onClick={() => j.kickMember(m.id)}>{I.kick}</button>
                            )}
                        </div>
                    ))}
                </div>

                {/* Share */}
                {j.isHost && (
                    <div className="jam-section-card">
                        <div className="jam-section-title">INVITE</div>
                        <div className="jam-id-row">
                            <span className="jam-id-code">{j.jamId}</span>
                            <button
                                className={`jam-icon-btn ${copied ? 'green' : ''}`}
                                onClick={() => { copy(j.jamId, 'Copied!'); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                            >{copied ? I.check : I.copy}</button>
                        </div>
                        <div className="jam-share-row">
                            <button className="jam-btn outline flex-1"
                                onClick={() => copy(`${window.location.origin}${window.location.pathname}#jam=${j.jamId}`, 'Link copied!')}>
                                {I.link} Copy Link
                            </button>
                            <button className="jam-btn outline flex-1" onClick={() => setShowQr(v => !v)}>
                                {I.qr} {showQr ? 'Hide QR' : 'QR Code'}
                            </button>
                        </div>
                        {showQr && qrUrl && (
                            <div className="jam-qr-box">
                                <img src={qrUrl} alt="QR"/>
                                <div className="jam-qr-label">Scan to join</div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Footer */}
            <div className="jam-footer">
                {!j.isHost && (
                    <button className="jam-btn outline full" style={{marginBottom:8}} onClick={j.requestSync}>
                        Sync to Host
                    </button>
                )}
                <button className="jam-btn red full" onClick={j.leaveJam}>
                    {I.leave} {j.isHost ? 'End Jam' : 'Leave Jam'}
                </button>
            </div>
        </div>
    );
};

export default JamMenu;
