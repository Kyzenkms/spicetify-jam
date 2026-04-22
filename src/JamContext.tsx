
import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import Peer, { DataConnection } from 'peerjs';

interface TrackInfo { title: string; artist: string; artUrl: string; uri?: string; }
interface Member { id: string; name: string; isHost?: boolean; image?: string; }
interface JamState {
    isHost: boolean; jamId: string; members: Member[]; connected: boolean; error: string | null;
    nowPlaying: TrackInfo | null; hostName: string; queue: TrackInfo[];
    guestControls: boolean; isPlaying: boolean; progress: number; duration: number; ping: number;
    startJam: () => Promise<void>; joinJam: (id: string, name: string) => Promise<void>;
    leaveJam: () => void; addToQueue: (uri: string) => void; removeFromQueue: (uri: string) => void;
    moveInQueue: (from: number, to: number) => void; requestSync: () => void;
    jumpToTrack: (uri: string) => void; seekTo: (ms: number) => void;
    kickMember: (id: string) => void; toggleGuestControls: () => void;
    play: () => void; pause: () => void; next: () => void; prev: () => void;
}

const fmtImg = (u?: string): string => {
    if (!u) return '';
    if (u.startsWith('https://')) return u;
    if (u.startsWith('spotify:image:')) return `https://i.scdn.co/image/${u.slice(14)}`;
    return '';
};

const getUser = () => {
    try {
        const user = (Spicetify as any).Platform?.Session?.getUser();
        return {
            name: user?.displayName || document.querySelector('[data-testid="user-widget-name"]')?.textContent?.trim() || 'Listener',
            image: user?.images?.[0]?.url || ''
        };
    } catch { return { name: 'Listener', image: '' }; }
};

const getTrack = (): TrackInfo | null => {
    const t = Spicetify.Player.data?.item;
    if (!t) return null;
    const meta = t.metadata || {};
    return {
        title: t.name || meta.title || 'Unknown',
        artist: t.artists?.[0]?.name || meta.artist_name || 'Unknown',
        artUrl: fmtImg(meta.image_xlarge_url || meta.image_large_url || meta.image_url || t.images?.[0]?.url),
        uri: t.uri
    };
};

const extractTrack = (t: any): TrackInfo => {
    const data = t?.contextTrack || t?.track || t || {};
    const meta = data?.metadata || t?.metadata || {};
    const title = data.name || meta.name || meta.title || t.name || '?';
    const artist = (data.artists?.[0]?.name) || meta.artist_name || meta.album_artist || t.artist_name || '?';
    const artUrl = fmtImg(meta.image_xlarge_url || meta.image_large_url || meta.image_url || data.album?.images?.[0]?.url || t.imageUrl || meta.thumbnail_url);
    const uri = data.uri || t.uri || '';
    return { title, artist, artUrl, uri };
};

const getQueue = (): TrackInfo[] => {
    try {
        const tracks = Spicetify.Queue?.nextTracks || [];
        const seen = new Set<string>();
        return tracks.map(extractTrack).filter((t: TrackInfo) => {
            if (!t.uri || seen.has(t.uri)) return false;
            if (t.title === '?' && t.artist === '?') return false;
            seen.add(t.uri); return true;
        }).slice(0, 20);
    } catch { return []; }
};

const Ctx = createContext<JamState | undefined>(undefined);

export const JamProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [isHost, setIsHost] = useState(false);
    const [jamId, setJamId] = useState('');
    const [members, setMembers] = useState<Member[]>([]);
    const [connected, setConnected] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [nowPlaying, setNowPlaying] = useState<TrackInfo | null>(null);
    const [hostName, setHostName] = useState('Host');
    const [queue, setQueue] = useState<TrackInfo[]>([]);
    const [guestControls, setGuestControls] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);
    const [progress, setProgress] = useState(0);
    const [duration, setDuration] = useState(0);
    const [ping, setPing] = useState(-1);

    const peerRef = useRef<Peer | null>(null);
    const conns = useRef<Map<string, DataConnection>>(new Map());
    const memberRegistry = useRef<Map<string, {name: string, image: string}>>(new Map());
    const refs = useRef({ isHost: false, connected: false, guestControls: false, jamId: '', targetUri: null as string | null, ignoreSync: false });

    useEffect(() => { refs.current.isHost = isHost; }, [isHost]);
    useEffect(() => { refs.current.connected = connected; }, [connected]);
    useEffect(() => { refs.current.guestControls = guestControls; }, [guestControls]);
    useEffect(() => { refs.current.jamId = jamId; }, [jamId]);

    const broadcast = useCallback((d: any) => conns.current.forEach(c => c.open && c.send(d)), []);
    const hostConn = useCallback(() => conns.current.get(refs.current.jamId) || Array.from(conns.current.values())[0], []);

    const buildMembers = useCallback((): Member[] => {
        const me = getUser();
        const result: Member[] = [{ id: 'host', name: me.name, image: me.image, isHost: true }];
        conns.current.forEach((_, pid) => {
            const m = memberRegistry.current.get(pid);
            result.push({ id: pid, name: m?.name || 'Listener', image: m?.image || '' });
        });
        return result;
    }, []);

    useEffect(() => {
        const id = setInterval(() => {
            if (refs.current.isHost) {
                try {
                    setIsPlaying(Spicetify.Player.isPlaying());
                    setProgress(Spicetify.Player.getProgress());
                    setDuration(Spicetify.Player.getDuration());
                } catch {}
            } else if (refs.current.connected) {
                const c = hostConn(); if (c?.open) c.send({ type: 'PING', ts: Date.now() });
            }
        }, 1000);
        return () => clearInterval(id);
    }, [hostConn]);

    // UI Feedback for bottom button
    useEffect(() => {
        const b = document.getElementById('jam-bottom-button');
        if (b) { b.style.color = connected ? '#1db954' : '#b3b3b3'; b.style.animation = connected ? 'jamPulse 2s infinite' : 'none'; }
    }, [connected]);

    const refreshQueue = useCallback(() => {
        if (!refs.current.isHost) return;
        const q = getQueue(); setQueue(q); broadcast({ type: 'Q', queue: q });
    }, [broadcast]);

    const addToQueue = useCallback(async (uri: string) => {
        if (refs.current.isHost) {
            try { await Spicetify.addToQueue([{ uri }]); Spicetify.showNotification('Added!'); setTimeout(refreshQueue, 1500); } catch { Spicetify.showNotification('Failed', true); }
        } else { const c = hostConn(); if (c?.open) { c.send({ type: 'ADD_Q', uri }); Spicetify.showNotification('Requested!'); } }
    }, [refreshQueue, hostConn]);

    const removeFromQueue = useCallback(async (uri: string) => {
        if (refs.current.isHost) {
            try { await Spicetify.removeFromQueue([{ uri }]); setTimeout(refreshQueue, 500); }
            catch { setQueue(p => p.filter(t => t.uri !== uri)); broadcast({ type: 'Q', queue: queue.filter(t => t.uri !== uri) }); }
        } else { const c = hostConn(); c?.open && c.send({ type: 'RM_Q', uri }); }
    }, [refreshQueue, hostConn, broadcast, queue]);

    const moveInQueue = useCallback((from: number, to: number) => {
        setQueue(p => { const u = [...p]; const [m] = u.splice(from, 1); u.splice(to, 0, m); broadcast({ type: 'Q', queue: u }); return u; });
    }, [broadcast]);

    const seekTo = useCallback((ms: number) => {
        if (refs.current.isHost) { Spicetify.Player.seek(ms); broadcast({ type: 'SEEK', pos: ms, ts: Date.now() }); }
        else if (refs.current.guestControls) { const c = hostConn(); c?.send({ type: 'CMD', a: 'seek', pos: ms }); }
    }, [broadcast, hostConn]);

    const jumpToTrack = useCallback((uri: string) => {
        if (refs.current.isHost) { refs.current.targetUri = uri; Spicetify.Player.playUri(uri); }
        else if (refs.current.guestControls) { const c = hostConn(); c?.send({ type: 'CMD', a: 'playuri', uri }); }
    }, [hostConn]);

    const toggleGuestControls = () => { if (!isHost) return; const v = !guestControls; setGuestControls(v); broadcast({ type: 'GCTRL', on: v }); };
    const play = () => { if (isHost) { Spicetify.Player.play(); setIsPlaying(true); } else if (guestControls) { const c = hostConn(); c?.send({ type: 'CMD', a: 'play' }); } };
    const pause = () => { if (isHost) { Spicetify.Player.pause(); setIsPlaying(false); } else if (guestControls) { const c = hostConn(); c?.send({ type: 'CMD', a: 'pause' }); } };
    const next = () => { if (isHost) Spicetify.Player.next(); else if (guestControls) { const c = hostConn(); c?.send({ type: 'CMD', a: 'next' }); } };
    const prev = () => { if (isHost) Spicetify.Player.back(); else if (guestControls) { const c = hostConn(); c?.send({ type: 'CMD', a: 'back' }); } };
    const requestSync = () => { if (!refs.current.isHost) { const c = hostConn(); c?.send({ type: 'SYNC' }); } };

    const leaveJam = useCallback(() => {
        conns.current.forEach(c => c.close()); conns.current.clear(); memberRegistry.current.clear(); peerRef.current?.destroy(); peerRef.current = null;
        setConnected(false); setJamId(''); setIsHost(false); setMembers([]); setQueue([]); setNowPlaying(null);
        refs.current.targetUri = null; setPing(-1);
    }, []);

    const kickMember = (id: string) => {
        if (!isHost) return;
        const c = conns.current.get(id);
        if (c) { c.send({ type: 'KICK' }); setTimeout(() => c.close(), 500); conns.current.delete(id); memberRegistry.current.delete(id); setMembers(buildMembers()); }
    };

    const onData = useCallback((d: any, conn: DataConnection) => {
        const r = refs.current;
        switch (d.type) {
            case 'JOIN':
                if (!r.isHost) return;
                memberRegistry.current.set(conn.peer, { name: d.name || 'Listener', image: d.image || '' });
                const all = buildMembers(); setMembers(all);
                conn.send({
                    type: 'INIT', np: getTrack(), queue: getQueue(), host: getUser().name,
                    gc: r.guestControls, playing: Spicetify.Player.isPlaying(), members: all,
                    progress: Spicetify.Player.getProgress(), duration: Spicetify.Player.getDuration()
                });
                if (Spicetify.Player.data?.item) conn.send({ type: 'PLAY', uri: Spicetify.Player.data.item.uri, pos: Spicetify.Player.getProgress(), ts: Date.now() });
                broadcast({ type: 'MEMBERS', members: all });
                break;
            case 'INIT':
                if (d.np) { setNowPlaying(d.np); r.targetUri = d.np.uri; }
                if (d.queue) setQueue(d.queue); if (d.host) setHostName(d.host);
                if (d.members) setMembers(d.members);
                if (d.gc !== undefined) setGuestControls(d.gc);
                if (d.playing !== undefined) setIsPlaying(d.playing);
                if (d.progress !== undefined) setProgress(d.progress);
                if (d.duration !== undefined) setDuration(d.duration);
                break;
            case 'MEMBERS': setMembers(d.members); break;
            case 'GCTRL': setGuestControls(d.on); break;
            case 'CMD':
                if (!r.isHost || !r.guestControls) return;
                if (d.a === 'play') Spicetify.Player.play(); else if (d.a === 'pause') Spicetify.Player.pause();
                else if (d.a === 'next') Spicetify.Player.next(); else if (d.a === 'back') Spicetify.Player.back();
                else if (d.a === 'seek') Spicetify.Player.seek(d.pos);
                else if (d.a === 'playuri') { refs.current.targetUri = d.uri; Spicetify.Player.playUri(d.uri); }
                break;
            case 'KICK': leaveJam(); setError('Removed from Jam'); Spicetify.showNotification('Kicked from Jam'); break;
            case 'PLAY':
                if (!r.isHost) {
                    r.targetUri = d.uri; r.ignoreSync = true; setIsPlaying(true);
                    Spicetify.Player.playUri(d.uri).then(() => { const delay = Date.now() - d.ts; setTimeout(() => Spicetify.Player.seek(d.pos + delay), 800); });
                }
                if (d.np) setNowPlaying(d.np);
                break;
            case 'PAUSE': if (!r.isHost) { Spicetify.Player.pause(); setIsPlaying(false); } break;
            case 'SEEK': if (!r.isHost) { const delay = Date.now() - d.ts; Spicetify.Player.seek(d.pos + delay); } break;
            case 'PS': if (!r.isHost) { setIsPlaying(d.p); if (d.pos !== undefined) setProgress(d.pos); if (d.dur !== undefined) setDuration(d.dur); } break;
            case 'ADD_Q': if (r.isHost) addToQueue(d.uri); break;
            case 'RM_Q': if (r.isHost) removeFromQueue(d.uri); break;
            case 'Q': setQueue(d.queue); break;
            case 'PING': conn.send({ type: 'PONG', ts: d.ts }); break;
            case 'PONG': setPing(Date.now() - d.ts); break;
            case 'SYNC': if (r.isHost && Spicetify.Player.data?.item) conn.send({ type: 'PLAY', uri: Spicetify.Player.data.item.uri, pos: Spicetify.Player.getProgress(), ts: Date.now(), np: getTrack() }); break;
        }
    }, [broadcast, leaveJam, addToQueue, removeFromQueue, buildMembers]);

    const setupConn = useCallback((conn: DataConnection) => {
        conn.on('open', () => conns.current.set(conn.peer, conn));
        conn.on('data', (d: any) => onData(d, conn));
        conn.on('close', () => { conns.current.delete(conn.peer); memberRegistry.current.delete(conn.peer); setMembers(buildMembers()); });
    }, [onData, buildMembers]);

    const startJam = async (): Promise<void> => {
        const genId = () => Math.random().toString(36).substring(2, 8).toUpperCase();
        const p = new Peer(genId()); peerRef.current = p;
        return new Promise<void>((res, rej) => {
            p.on('open', id => {
                setJamId(id); setIsHost(true); setConnected(true); setError(null);
                const me = getUser(); setHostName(me.name); setMembers([{ id: 'host', name: me.name, image: me.image, isHost: true }]);
                const t = getTrack(); if (t) { setNowPlaying(t); refs.current.targetUri = t.uri || null; }
                setIsPlaying(Spicetify.Player.isPlaying()); setProgress(Spicetify.Player.getProgress()); setDuration(Spicetify.Player.getDuration());
                setTimeout(refreshQueue, 500); res();
            });
            p.on('connection', setupConn);
            p.on('error', e => { if ((e as any).type === 'id-taken') { p.destroy(); startJam().then(res).catch(rej); } else { setError(`Connection error: ${(e as any).type}`); rej(e); } });
        });
    };

    const joinJam = async (id: string, name?: string): Promise<void> => {
        const cleanId = id.includes('jam=') ? id.split('jam=')[1] : id.trim();
        const me = getUser(); const p = new Peer(); peerRef.current = p;
        return new Promise<void>((res, rej) => {
            p.on('open', () => {
                const conn = p.connect(cleanId);
                conn.on('open', () => {
                    conns.current.set(cleanId, conn); setJamId(cleanId); setIsHost(false); setConnected(true); setError(null);
                    setMembers([{ id: cleanId, name: 'Host', isHost: true }, { id: 'me', name: me.name, image: me.image }]);
                    conn.send({ type: 'JOIN', name: me.name, image: me.image }); res();
                });
                conn.on('data', (d: any) => onData(d, conn));
                conn.on('close', () => { leaveJam(); setError('Host ended the session'); });
                conn.on('error', () => { setError('Could not connect'); rej(); });
            });
            p.on('error', e => { setError(`Error: ${(e as any).type}`); rej(e); });
        });
    };

    useEffect(() => {
        if (!connected) return;
        const onSong = () => {
            const uri = Spicetify.Player.data?.item?.uri;
            if (refs.current.isHost) {
                const t = getTrack(); if (t) setNowPlaying(t);
                refs.current.targetUri = uri || null; broadcast({ type: 'PLAY', uri: uri || '', pos: 0, ts: Date.now(), np: t });
                setTimeout(refreshQueue, 600);
            } else {
                if (refs.current.ignoreSync) { refs.current.ignoreSync = false; return; }
                if (uri && uri !== refs.current.targetUri && refs.current.targetUri) {
                    if (refs.current.guestControls) { const c = hostConn(); c?.send({ type: 'CMD', a: 'playuri', uri }); }
                    else { refs.current.ignoreSync = true; Spicetify.Player.playUri(refs.current.targetUri); Spicetify.showNotification('🔒 Locked to Jam'); }
                }
            }
        };
        const onPP = () => {
            const playing = Spicetify.Player.isPlaying();
            setIsPlaying(playing);
            
            if (refs.current.isHost) {
                const pos = Spicetify.Player.getProgress();
                const dur = Spicetify.Player.getDuration();
                broadcast({ type: 'PS', p: playing, pos, dur });
                if (playing) {
                    broadcast({ type: 'PLAY', uri: refs.current.targetUri || '', pos, ts: Date.now(), np: getTrack() });
                } else {
                    broadcast({ type: 'PAUSE' });
                }
            } else {
                // If guest resumes, ask host for current position immediately
                if (playing) {
                    const c = hostConn();
                    if (c?.open) c.send({ type: 'SYNC' });
                    
                    // Snap back if on wrong track
                    if (refs.current.targetUri && !refs.current.guestControls) {
                        const curUri = Spicetify.Player.data?.item?.uri;
                        if (curUri && curUri !== refs.current.targetUri) {
                            refs.current.ignoreSync = true;
                            Spicetify.Player.playUri(refs.current.targetUri);
                            Spicetify.showNotification('🔒 Locked to Jam');
                        }
                    }
                } else {
                    // Guest paused - notify that they are falling behind
                    if (!refs.current.guestControls) {
                        Spicetify.showNotification('⏸️ Jam is still playing - resume to sync');
                    }
                }
            }
        };
        Spicetify.Player.addEventListener('songchange', onSong); Spicetify.Player.addEventListener('onplaypause', onPP);
        const qi = refs.current.isHost ? setInterval(refreshQueue, 5000) : null;
        const driftI = !refs.current.isHost ? setInterval(() => { const c = hostConn(); if (c?.open) c.send({ type: 'SYNC' }); }, 15000) : null;
        let ctxMenu: any; try { ctxMenu = new (Spicetify as any).ContextMenu.Item('Add to Jam', (uris: string[]) => uris?.forEach(u => addToQueue(u)), () => refs.current.connected, 'plus2px'); ctxMenu.register(); } catch {}
        return () => { Spicetify.Player.removeEventListener('songchange', onSong); Spicetify.Player.removeEventListener('onplaypause', onPP); qi && clearInterval(qi); driftI && clearInterval(driftI); try { ctxMenu?.deregister(); } catch {} };
    }, [connected, isHost, broadcast, refreshQueue, addToQueue, hostConn]);

    useEffect(() => {
        const hash = window.location.hash.slice(1);
        if (hash.startsWith('jam=')) { const id = hash.split('=')[1]; if (id) joinJam(id); }
    }, []);

    return (
        <Ctx.Provider value={{
            isHost, jamId, members, connected, error, nowPlaying, hostName, queue,
            guestControls, isPlaying, progress, duration, ping,
            startJam, joinJam, leaveJam, addToQueue, removeFromQueue,
            moveInQueue, requestSync, jumpToTrack, seekTo, kickMember,
            toggleGuestControls, play, pause, next, prev
        }}>
            {children}
        </Ctx.Provider>
    );
};

export const useJam = () => { const c = useContext(Ctx); if (!c) throw new Error('useJam must be inside JamProvider'); return c; };
