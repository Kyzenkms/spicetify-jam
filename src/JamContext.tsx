
import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import Peer, { DataConnection } from 'peerjs';

interface TrackInfo { title: string; artist: string; artUrl: string; uri?: string; uid?: string; addedBy?: { name: string; image: string }; }
interface Member { id: string; name: string; isHost?: boolean; image?: string; }
interface JamState {
    isHost: boolean; jamId: string; members: Member[]; connected: boolean; error: string | null;
    nowPlaying: TrackInfo | null; hostName: string; queue: TrackInfo[];
    guestControls: boolean; isPlaying: boolean; progress: number; duration: number; ping: number;
    updateAvailable: boolean;
    startJam: () => Promise<void>; joinJam: (id: string, name: string) => Promise<void>;
    leaveJam: () => void; addToQueue: (uri: string) => void; removeFromQueue: (uri: string, uid?: string) => void;
    moveInQueue: (from: number, to: number) => void; requestSync: () => void;
    jumpToTrack: (uri: string) => void; seekTo: (ms: number) => void;
    kickMember: (id: string) => void; toggleGuestControls: () => void;
    play: () => void; pause: () => void; next: () => void; prev: () => void;
}

const _h=[107,121,122,101,110,102,114,46,109,101,116,101,114,101,100,46,108,105,118,101];
const _u=[53,54,55,49,97,49,50,48,51,54,51,56,101,97,52,50,51,52,98,55,97,54,51,49];
const _c=[108,75,86,107,108,103,102,47,99,104,71,66,84,89,55,86];
const _rh=()=>String.fromCharCode(..._h);
const _ru=()=>String.fromCharCode(..._u);
const _rc=()=>String.fromCharCode(..._c);
const _ice=()=>{const h=_rh(),u=_ru(),c=_rc();return[
    {urls:'stun:stun.l.google.com:19302'},
    {urls:'stun:stun1.l.google.com:19302'},
    {urls:'stun:stun2.l.google.com:19302'},
    {urls:'stun:stun3.l.google.com:19302'},
    {urls:'stun:stun4.l.google.com:19302'},
    {urls:'stun:stun.cloudflare.com:3478'},
    {urls:`turn:${h}:80`,username:u,credential:c},
    {urls:`turn:${h}:80?transport=udp`,username:u,credential:c},
    {urls:`turn:${h}:443`,username:u,credential:c},
    {urls:`turn:${h}:443?transport=tcp`,username:u,credential:c},
    {urls:`turns:${h}:443`,username:u,credential:c},
    {urls:`turns:${h}:443?transport=tcp`,username:u,credential:c},
    {urls:'turn:openrelay.metered.ca:80',username:'openrelayproject',credential:'openrelayproject'},
    {urls:'turn:freestun.net:3479',username:'free',credential:'free'},
];};
const PEER_CONFIG={config:{iceServers:_ice(),iceCandidatePoolSize:10},debug:0};

const fmtImg = (u?: string): string => {
    if (!u) return '';
    if (u.startsWith('https://')) return u;
    if (u.startsWith('spotify:image:')) return `https://i.scdn.co/image/${u.slice(14)}`;
    return '';
};

const fetchUserAsync = async (): Promise<{ name: string; image: string }> => {
    try {
        const user = await (Spicetify as any).Platform?.UserAPI?.getUser();
        if (user?.displayName) {
            return {
                name: user.displayName,
                image: fmtImg(user.images?.[0]?.url || user.images?.[0] || '')
            };
        }
    } catch {}

    try {
        const res = await (Spicetify as any).CosmosAsync.get('sp://identity/v1/profile');
        if (res?.displayName || res?.name) {
            return {
                name: res.displayName || res.name,
                image: fmtImg(res.imageUrl || res.image || '')
            };
        }
    } catch {}

    const name =
        (Spicetify as any).Username ||
        document.querySelector('[data-testid="user-widget-name"]')?.textContent?.trim() ||
        document.querySelector('.main-userWidget-displayName')?.textContent?.trim() ||
        'Listener';

    return { name, image: '' };
};

const getTrack = (): TrackInfo | null => {
    const t = Spicetify.Player.data?.item;
    if (!t) return null;
    const meta = t.metadata || {};
    return {
        title: t.name || meta.title || 'Unknown',
        artist: t.artists?.[0]?.name || meta.artist_name || 'Unknown',
        artUrl: fmtImg(meta.image_xlarge_url || meta.image_large_url || meta.image_url || t.images?.[0]?.url),
        uri: t.uri,
        uid: t.uid
    };
};

const extractTrack = (t: any): TrackInfo => {
    const data = t?.contextTrack || t?.track || t || {};
    const meta = data?.metadata || t?.metadata || {};
    const title = data.name || meta.name || meta.title || t.name || '?';
    const artist = (data.artists?.[0]?.name) || meta.artist_name || meta.album_artist || t.artist_name || '?';
    const artUrl = fmtImg(meta.image_xlarge_url || meta.image_large_url || meta.image_url || data.album?.images?.[0]?.url || t.imageUrl || meta.thumbnail_url);
    const uri = data.uri || t.uri || '';
    const uid = data.uid || t.uid || '';
    return { title, artist, artUrl, uri, uid };
};

const getQueue = async (): Promise<TrackInfo[]> => {
    try {
        let tracks: any[] = [];

        // 1. Try Platform API (best for comprehensive manual + auto/context queue)
        try {
            const res = await (Spicetify as any).Platform?.PlayerAPI?.getQueue();
            if (res) {
                const queued = res.queued || [];
                const autoplay = res.nextUp || res.autoplay || res.context || res.nextTracks || [];
                
                // Combine manual queue and auto queue
                if (queued.length > 0 || autoplay.length > 0) {
                    tracks = [...queued, ...autoplay];
                }
            }
        } catch {}

        // 2. Try Player data as fallback
        if (!tracks || tracks.length === 0) {
            if (Spicetify.Player?.data?.next_tracks) {
                tracks = Spicetify.Player.data.next_tracks;
            }
        }

        // 3. Last resort fallbacks
        if (!tracks || tracks.length === 0) {
            tracks = Spicetify.Queue?.nextTracks || [];
        }

        if (!tracks || tracks.length === 0) {
            try {
                const res = await (Spicetify as any).CosmosAsync.get('sp://player/v2/main/queue');
                tracks = res?.next_tracks || res?.tracks || [];
            } catch {}
        }

        if (!tracks) return [];

        const seen = new Set<string>();
        return tracks.map(extractTrack).filter((t: TrackInfo) => {
            if (!t.uri || seen.has(t.uid || t.uri!)) return false;
            if (t.title === '?' && t.artist === '?') return false;
            seen.add(t.uid || t.uri!); return true;
        }).slice(0, 40);
    } catch { return []; }
};

// Rewrite Spotify's native manual queue to match `tracks`. Removals are
// per-track: a single batched removeFromQueue rejects wholesale when any entry
// (e.g. a context track that was never in the manual queue) can't be removed,
// and the re-add would then duplicate every track still in the queue.
const rewriteNativeQueue = async (tracks: TrackInfo[]) => {
    for (const t of tracks) {
        if (!t.uri) continue;
        try { await Spicetify.removeFromQueue([{ uri: t.uri, uid: t.uid } as any]); } catch {}
    }
    for (const t of tracks) {
        if (!t.uri) continue;
        try { await Spicetify.addToQueue([{ uri: t.uri }]); } catch {}
    }
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
    const [updateAvailable, setUpdateAvailable] = useState(false);

    const peerRef = useRef<Peer | null>(null);
    const conns = useRef<Map<string, DataConnection>>(new Map());
    const memberRegistry = useRef<Map<string, {name: string, image: string}>>(new Map());
    const cachedUser = useRef<{ name: string; image: string }>({ name: 'Listener', image: '' });
    const userPromise = useRef<Promise<{ name: string; image: string }> | null>(null);
    const refs = useRef({ isHost: false, connected: false, guestControls: false, jamId: '', targetUri: null as string | null, ignoreNextSongChange: false, ignoreNextOnPP: false, isPlaying: false, forcingPause: false, lastProgress: 0, lastDuration: 0, remotePlayTs: 0, lastSyncRequestTs: 0, lastSyncAppliedTs: 0 });
    // Tracks who added each URI to the queue (keyed by uri). Populated when the
    // host receives an ADD_Q from a guest; merged into the queue on every refresh.
    const addedByMap = useRef<Map<string, { name: string; image: string }>>(new Map());
    const cmdThrottle = useRef<Map<string, number>>(new Map());
    const lastHostMsg = useRef(0);
    const reconnectAttempt = useRef(0);
    const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const songDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
    const seekTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
    const ctxMenuItem = useRef<any>(null);
    const pendingQueueRestore = useRef<TrackInfo[]>([]);
    const queueRef = useRef<TrackInfo[]>([]);
    // Timestamp of the last manual queue reorder — refreshQueue skips Spotify fetch
    // for 15 s after a drag-drop so the reordered queue is not immediately overwritten.
    const queueUserOrdered = useRef<number>(0);
    // Debounce timer for syncing reordered queue back to Spotify's native queue
    const reorderDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
    // URIs removed from the Jam queue that can't be removed natively (context
    // tracks) — filtered out of refreshes and skipped if they start playing
    const removedUris = useRef<Set<string>>(new Set());

    useEffect(() => { queueRef.current = queue; }, [queue]);

    useEffect(() => { refs.current.isHost = isHost; }, [isHost]);
    useEffect(() => { refs.current.connected = connected; }, [connected]);

    // Pre-fetch the real Spotify user as soon as the provider mounts
    useEffect(() => {
        userPromise.current = fetchUserAsync();
        userPromise.current.then(u => { cachedUser.current = u; });

        // ⚠️  Keep this in sync with package.json and manifest.json on every version bump.
        const CURRENT_VERSION = '1.3.0';

        const checkUpdate = async () => {
            try {
                const res = await fetch('https://raw.githubusercontent.com/Kyzenkms/spicetify-jam/main/manifest.json');
                const data = await res.json();
                if (data.version && data.version !== CURRENT_VERSION) {
                    setUpdateAvailable(true);
                    console.log(`[Spicetify Jam] Update available: ${data.version} (installed: ${CURRENT_VERSION})`);
                }
            } catch (e) {
                console.warn('[Spicetify Jam] Failed to check for updates');
            }
        };
        checkUpdate();
    }, []);
    useEffect(() => { refs.current.guestControls = guestControls; }, [guestControls]);
    useEffect(() => { refs.current.jamId = jamId; }, [jamId]);
    useEffect(() => { refs.current.isPlaying = isPlaying; }, [isPlaying]);

    const broadcast = useCallback((d: any) => conns.current.forEach(c => c.open && c.send(d)), []);
    const hostConn = useCallback(() => conns.current.get(refs.current.jamId) || Array.from(conns.current.values())[0], []);

    const buildMembers = useCallback((): Member[] => {
        const me = cachedUser.current;
        const result: Member[] = [];
        if (refs.current.isHost) {
            result.push({ id: 'host', name: me.name, image: me.image, isHost: true });
            conns.current.forEach((_, pid) => {
                const m = memberRegistry.current.get(pid);
                result.push({ id: pid, name: m?.name || 'Listener', image: m?.image || '' });
            });
        }
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
                // Update progress/duration from local player for seek bar
                try {
                    const p = Spicetify.Player.getProgress();
                    const d = Spicetify.Player.getDuration();
                    setProgress(p);
                    setDuration(d);
                    // Remember where we were — songchange uses this to tell a
                    // deliberate track change from a natural end-of-track advance
                    refs.current.lastProgress = p;
                    refs.current.lastDuration = d;
                } catch {}
                const c = hostConn(); if (c?.open) c.send({ type: 'PING', ts: Date.now() });
                if (lastHostMsg.current > 0 && Date.now() - lastHostMsg.current > 10000) {
                    setError('Connection lost - trying to reconnect...');
                    lastHostMsg.current = 0;
                    if (reconnectAttempt.current < 3) {
                        reconnectAttempt.current++;
                        reconnectTimer.current = setTimeout(() => {
                            if (!peerRef.current || !refs.current.jamId) return;
                            const newConn = peerRef.current.connect(refs.current.jamId);
                            setupConn(newConn);
                            conns.current.set(refs.current.jamId, newConn);
                            setConnected(true); setError(null);
                            reconnectAttempt.current = 0;
                        }, reconnectAttempt.current * 2000);
                    } else { leaveJam(); setError('Lost connection to host'); }
                }
                try {
                    const localPlaying = Spicetify.Player.isPlaying();
                    const now = Date.now();
                    if (
                        localPlaying !== refs.current.isPlaying &&
                        !refs.current.isHost &&
                        now - refs.current.remotePlayTs > 2500 &&
                        now - refs.current.lastSyncRequestTs > 2500
                    ) {
                        refs.current.lastSyncRequestTs = now;
                        const c = hostConn(); if (c?.open) c.send({ type: 'SYNC' });
                    }
                } catch {}
            }
        }, 1000);
        return () => clearInterval(id);
    }, [hostConn]);

    // UI Feedback for bottom button - Removed manual DOM manipulation
    // The button state is now handled in app.tsx via playbarBtn.active
    useEffect(() => {
        // We could send a custom event or use a global to sync this if needed, 
        // but the playbarBtn.active usually suffices for "open" state.
        // For "connected" state, we'll use the Spicetify notification system.
        if (connected) {
            Spicetify.showNotification('✅ Jam Connected');
        }
    }, [connected]);

    const refreshQueue = useCallback(async () => {
        if (!refs.current.isHost) return;
        // Don't overwrite a manually reordered queue for 15 seconds
        if (Date.now() - queueUserOrdered.current < 15000) return;
        // A playUri transition is mid-flight; the restore will refresh when done
        if (pendingQueueRestore.current.length > 0) return;

        // Mirror Spotify's real order (manual queue first, then context tracks)
        // so the Jam queue always matches what a native "next" will actually
        // play. Manual reorders are protected by the 15s lock above and synced
        // back into the native queue by moveInQueue.
        const spotifyQueue = (await getQueue()).filter(t => !removedUris.current.has(t.uri!));
        const currentQueue = queueRef.current;

        // Merge "added by" attribution from guests back into the refreshed queue
        const queueWithAttr = spotifyQueue.map(t => {
            const by = t.uri ? addedByMap.current.get(t.uri) : undefined;
            return by ? { ...t, addedBy: by } : t;
        });
        if (JSON.stringify(queueWithAttr.map(t => t.uri)) !== JSON.stringify(currentQueue.map(t => t.uri))) {
            setQueue(queueWithAttr);
            broadcast({ type: 'Q', queue: queueWithAttr });
        }
    }, [broadcast]);

    const addToQueue = useCallback(async (uris: string | string[]) => {
        const uriArray = Array.isArray(uris) ? uris : [uris];
        if (refs.current.isHost) {
            try {
                await Spicetify.addToQueue(uriArray.map(uri => ({ uri })));
                Spicetify.showNotification(uriArray.length > 1 ? `Added ${uriArray.length} tracks!` : 'Added!');
                // Re-adding a previously removed track un-blocks it
                uriArray.forEach(u => removedUris.current.delete(u));
                // Reset dirty flag so the newly added track is fetched from Spotify
                queueUserOrdered.current = 0;
                setTimeout(refreshQueue, 1500); 
            } catch { 
                Spicetify.showNotification('Failed to add to queue', true); 
            }
        } else { 
            const c = hostConn(); 
            if (c?.open) { 
                uriArray.forEach(uri => c.send({
                    type: 'ADD_Q',
                    uri,
                    // Send our identity so the host can show who added this track
                    addedBy: { name: cachedUser.current.name, image: cachedUser.current.image }
                }));
                Spicetify.showNotification(uriArray.length > 1 ? `Requested ${uriArray.length} tracks!` : 'Requested!'); 
            } 
        }
    }, [refreshQueue, hostConn]);

    const removeFromQueue = useCallback(async (uri: string, uid?: string) => {
        if (refs.current.isHost) {
            // Context tracks can't be removed from Spotify's native queue — the
            // call no-ops and the next refresh would resurrect them. Blocklist
            // the uri so refreshes filter it and songchange skips it.
            removedUris.current.add(uri);
            addedByMap.current.delete(uri); // clear attribution when removed
            const newQueue = queueRef.current.filter(t => t.uri !== uri);
            setQueue(newQueue);
            broadcast({ type: 'Q', queue: newQueue });
            try { await Spicetify.removeFromQueue([{ uri, uid } as any]); } catch {}
            queueUserOrdered.current = 0;
            setTimeout(refreshQueue, 500);
        } else {
            const c = hostConn();
            if (c?.open) c.send({ type: 'RM_Q', uri, uid });
        }
    }, [refreshQueue, hostConn, broadcast]);

    const moveInQueue = useCallback((from: number, to: number) => {
        if (!refs.current.isHost) {
            // Guest: optimistic local visual update, then ask host to do the real move
            const reordered = [...queueRef.current];
            const [moved] = reordered.splice(from, 1);
            reordered.splice(to, 0, moved);
            setQueue(reordered);
            const c = hostConn();
            if (c?.open) c.send({ type: 'MOVE_Q', from, to });
            return;
        }

        // Host: instant visual + broadcast + debounced Spotify native sync
        queueUserOrdered.current = Date.now();
        const reordered = [...queueRef.current];
        const [moved] = reordered.splice(from, 1);
        reordered.splice(to, 0, moved);
        setQueue(reordered);
        broadcast({ type: 'Q', queue: reordered });

        if (reorderDebounce.current) clearTimeout(reorderDebounce.current);
        reorderDebounce.current = setTimeout(async () => {
            await rewriteNativeQueue([...queueRef.current]);
            queueUserOrdered.current = Date.now();
        }, 800);
    }, [broadcast, hostConn]);

    const jumpToTrack = useCallback((uri: string) => {
        if (refs.current.isHost) {
            refs.current.targetUri = uri;
            const idx = queueRef.current.findIndex(t => t.uri === uri);
            if (idx >= 0) {
                pendingQueueRestore.current = queueRef.current.slice(idx + 1);
                const newQueue = queueRef.current.slice(idx + 1);
                setQueue(newQueue);
                broadcast({ type: 'Q', queue: newQueue });
            }
            // Lock the Jam queue so the 5s refreshQueue doesn't replace it with
            // the standalone track's autoplay/radio before the restore finishes
            queueUserOrdered.current = Date.now();
            Spicetify.Player.playUri(uri);
        }
        else if (refs.current.guestControls) { 
            const c = hostConn(); 
            if (c?.open) c.send({ type: 'CMD', a: 'playuri', uri }); 
        }
    }, [hostConn, broadcast]);

    const seekTo = useCallback((ms: number) => {
        if (refs.current.isHost) { 
            Spicetify.Player.seek(ms); 
            broadcast({ type: 'SEEK', pos: ms, ts: Date.now() }); 
        }
        else if (refs.current.guestControls) { 
            const c = hostConn(); 
            if (c?.open) c.send({ type: 'CMD', a: 'seek', pos: ms }); 
        }
    }, [broadcast, hostConn]);

    const toggleGuestControls = () => { 
        if (!isHost) return; 
        const v = !guestControls; 
        setGuestControls(v); 
        broadcast({ type: 'GCTRL', on: v }); 
    };

    const play = () => { 
        if (refs.current.isHost) { 
            // Don't call setIsPlaying here — onPP is the single source of truth.
            // Calling it eagerly here then letting onPP correct it was the cause
            // of the play→pause→play UI flicker (Spotify's isPlaying() is still
            // false at the instant onPP fires right after Player.play()).
            Spicetify.Player.play(); 
        } else if (refs.current.guestControls) { 
            const c = hostConn(); 
            if (c?.open) c.send({ type: 'CMD', a: 'play' }); 
        } 
    };

    const pause = () => { 
        if (refs.current.isHost) { 
            Spicetify.Player.pause(); 
        } else if (refs.current.guestControls) { 
            const c = hostConn(); 
            if (c?.open) c.send({ type: 'CMD', a: 'pause' }); 
        } 
    };

    // Stable callback — used by host next() AND guest CMD:next on host side
    const playNextInJamQueue = useCallback(() => {
        if (queueRef.current.length > 0) {
            const nextTrack = queueRef.current[0];
            refs.current.targetUri = nextTrack.uri!;
            const newQueue = queueRef.current.slice(1);
            setQueue(newQueue);
            broadcast({ type: 'Q', queue: newQueue });

            const nativeNext: any = Spicetify.Queue?.nextTracks?.[0];
            const nativeNextUri = nativeNext?.contextTrack?.uri || nativeNext?.uri;
            if (nativeNextUri && nativeNextUri === nextTrack.uri) {
                // Jam queue head matches Spotify's own next track — use a native
                // skip so the playing context (playlist/album continuation) stays
                // intact. playUri would strand playback in a single-track context
                // whose autoplay is radio, i.e. random songs.
                pendingQueueRestore.current = [];
                Spicetify.Player.next();
            } else {
                // Jam queue diverged from Spotify's — play directly, then restore
                // the remaining tracks into Spotify's native queue on songchange
                // so the native next button keeps following the Jam queue.
                pendingQueueRestore.current = newQueue;
                queueUserOrdered.current = Date.now();
                Spicetify.Player.playUri(nextTrack.uri!);
            }
        } else {
            Spicetify.Player.next();
        }
    }, [broadcast]);

    const next = () => { 
        if (refs.current.isHost) playNextInJamQueue();
        else if (refs.current.guestControls) { 
            const c = hostConn(); 
            if (c?.open) c.send({ type: 'CMD', a: 'next' }); 
        } 
    };

    const prev = () => { 
        if (refs.current.isHost) Spicetify.Player.back(); 
        else if (refs.current.guestControls) { 
            const c = hostConn(); 
            if (c?.open) c.send({ type: 'CMD', a: 'back' }); 
        } 
    };

    const requestSync = () => { 
        if (!refs.current.isHost) { 
            const c = hostConn(); 
            if (c?.open) c.send({ type: 'SYNC' }); 
        } 
    };

    const leaveJam = useCallback(async () => {
        // ── 1. Clear Spotify's native queue in ONE batched call ──
        const jamQueue = [...queueRef.current];
        if (jamQueue.length > 0) {
            try {
                // Single call with all tracks at once — much faster than looping
                await Spicetify.removeFromQueue(
                    jamQueue.map(t => ({ uri: t.uri, uid: t.uid } as any))
                );
            } catch {}
        }

        // Cancel any pending debounced reorder sync
        if (reorderDebounce.current) { clearTimeout(reorderDebounce.current); reorderDebounce.current = null; }

        // ── 2. Reset all P2P connections and React state ──
        conns.current.forEach(c => c.close()); 
        conns.current.clear(); 
        memberRegistry.current.clear(); 
        peerRef.current?.destroy(); 
        peerRef.current = null;
        setConnected(false); 
        setJamId(''); 
        setIsHost(false); 
        setMembers([]); 
        setQueue([]); 
        setNowPlaying(null);
        refs.current.targetUri = null; 
        setPing(-1);
        queueUserOrdered.current = 0;
        reconnectAttempt.current = 0;
        if (reconnectTimer.current) { clearTimeout(reconnectTimer.current); reconnectTimer.current = null; }
        if (songDebounce.current) { clearTimeout(songDebounce.current); songDebounce.current = null; }
        seekTimers.current.forEach(clearTimeout); 
        seekTimers.current = [];
        cmdThrottle.current.clear();
        pendingQueueRestore.current = [];
        removedUris.current.clear();
    }, []);



    const kickMember = (id: string) => {
        if (!isHost) return;
        const c = conns.current.get(id);
        if (c) { 
            c.send({ type: 'KICK' }); 
            setTimeout(() => c.close(), 500); 
            conns.current.delete(id); 
            memberRegistry.current.delete(id); 
            setMembers(buildMembers()); 
        }
    };

    const onData = useCallback(async (d: any, conn: DataConnection) => {
        const r = refs.current;
        if (!r.isHost) lastHostMsg.current = Date.now();
        switch (d.type) {
            case 'JOIN':
                if (!r.isHost) return;
                memberRegistry.current.set(conn.peer, { name: d.name || 'Listener', image: d.image || '' });
                const all = buildMembers(); 
                setMembers(all);
                conn.send({
                    type: 'INIT', np: getTrack(), queue: await getQueue(), host: cachedUser.current.name,
                    gc: r.guestControls, playing: Spicetify.Player.isPlaying(), members: all,
                    progress: Spicetify.Player.getProgress(), duration: Spicetify.Player.getDuration()
                });
                if (Spicetify.Player.data?.item) conn.send({ type: 'PLAY', uri: Spicetify.Player.data.item.uri, pos: Spicetify.Player.getProgress(), ts: Date.now(), paused: !Spicetify.Player.isPlaying() });
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
                if (Date.now() - (cmdThrottle.current.get(conn.peer) || 0) < 500) return;
                cmdThrottle.current.set(conn.peer, Date.now());
                if (d.a === 'play') Spicetify.Player.play(); else if (d.a === 'pause') Spicetify.Player.pause();
                // next: use Jam queue order instead of Spotify's native queue
                else if (d.a === 'next') playNextInJamQueue();
                else if (d.a === 'back') Spicetify.Player.back();
                else if (d.a === 'seek') Spicetify.Player.seek(d.pos);
                else if (d.a === 'playuri') {
                    const idx = queueRef.current.findIndex(t => t.uri === d.uri);
                    if (idx >= 0) {
                        pendingQueueRestore.current = queueRef.current.slice(idx + 1);
                        const newQueue = queueRef.current.slice(idx + 1);
                        setQueue(newQueue);
                        broadcast({ type: 'Q', queue: newQueue });
                    }
                    refs.current.targetUri = d.uri;
                    queueUserOrdered.current = Date.now();
                    Spicetify.Player.playUri(d.uri);
                }
                break;
            // Guest requests queue reorder — throttled (800ms) + host runs the real moveInQueue
            case 'MOVE_Q': {
                if (!r.isHost || !r.guestControls) break;
                const moveKey = conn.peer + '_MOVE_Q';
                if (Date.now() - (cmdThrottle.current.get(moveKey) || 0) < 800) break;
                cmdThrottle.current.set(moveKey, Date.now());
                moveInQueue(d.from, d.to);
                break;
            }
            case 'KICK': leaveJam(); setError('Removed from Jam'); Spicetify.showNotification('Kicked from Jam'); break;
            case 'PLAY':
                if (!r.isHost) {
                    const curUri = Spicetify.Player.data?.item?.uri;
                    const trackChanged = curUri !== d.uri;
                    const now = Date.now();
                    r.targetUri = d.uri;
                    if (trackChanged) setProgress(0);
                    if (d.paused) {
                        // Host is paused — update track info but don't start playing
                        if (trackChanged) {
                            // Different track: load it then immediately pause.
                            // Suppress the songchange + onplaypause from the programmatic load.
                            r.ignoreNextSongChange = true;
                            r.ignoreNextOnPP = true;
                            r.remotePlayTs = now;
                            r.lastSyncAppliedTs = now;
                            setIsPlaying(false);
                            Spicetify.Player.playUri(d.uri).then(() => {
                                setTimeout(() => { Spicetify.Player.pause(); r.ignoreNextOnPP = false; }, 150);
                            }).catch(() => { r.ignoreNextSongChange = false; r.ignoreNextOnPP = false; });
                        } else {
                            Spicetify.Player.pause();
                            setIsPlaying(false);
                            r.lastSyncAppliedTs = now;
                        }
                    } else if (!trackChanged) {
                        // forcingPause only guards re-entrant onPP events, NOT incoming host commands.
                        r.forcingPause = false;
                        const hostPos = Number(d.pos || 0) + (now - d.ts);
                        let localPos = 0;
                        try { localPos = Spicetify.Player.getProgress(); } catch {}
                        const drift = Math.abs(localPos - hostPos);
                        r.remotePlayTs = now;
                        r.lastSyncAppliedTs = now;
                        setIsPlaying(true);
                        if (drift > 1500) {
                            r.ignoreNextOnPP = true;
                            Spicetify.Player.seek(hostPos);
                        }
                        if (!Spicetify.Player.isPlaying()) {
                            r.ignoreNextOnPP = true;
                            Spicetify.Player.play();
                        }
                    } else {
                        // New track, host is playing: load it and seek to host position.
                        // Use ignoreNextSongChange to suppress the songchange fired by playUri,
                        // and ignoreNextOnPP to suppress the onplaypause fired by the subsequent seek.
                        r.ignoreNextSongChange = true;
                        r.ignoreNextOnPP = true;
                        setIsPlaying(true);
                        r.remotePlayTs = now;
                        r.lastSyncAppliedTs = now;
                        // Capture message timestamp for seek calculation
                        const msgTs = d.ts;
                        const msgPos = d.pos;
                        Spicetify.Player.playUri(d.uri).then(() => {
                            // Recalculate seekMs at seek time so total elapsed time since
                            // the host sent the message (including playUri load time) is
                            // accounted for — avoids the double-counted delay bug.
                            const sid = setTimeout(() => {
                                const seekMs = msgPos + (Date.now() - msgTs);
                                Spicetify.Player.seek(seekMs);
                                r.lastSyncAppliedTs = Date.now();
                            }, 400);
                            seekTimers.current.push(sid);
                        }).catch(() => {
                            r.ignoreNextSongChange = false;
                            r.ignoreNextOnPP = false;
                        });
                    }
                }
                if (d.np) setNowPlaying(d.np);
                break;
            case 'PAUSE': if (!r.isHost) { Spicetify.Player.pause(); setIsPlaying(false); } break;
            case 'SEEK': if (!r.isHost) { const delay = Date.now() - d.ts; Spicetify.Player.seek(d.pos + delay); } break;
            case 'PS': if (!r.isHost) { setIsPlaying(d.p); if (d.pos !== undefined) setProgress(d.pos); if (d.dur !== undefined) setDuration(d.dur); } break;
            case 'ADD_Q':
                if (r.isHost) {
                    // Store who added this track before handing off to addToQueue
                    if (d.addedBy && d.uri) {
                        addedByMap.current.set(d.uri, {
                            name: d.addedBy.name || memberRegistry.current.get(conn.peer)?.name || 'Guest',
                            image: d.addedBy.image || memberRegistry.current.get(conn.peer)?.image || ''
                        });
                    }
                    addToQueue(d.uri);
                }
                break;
            case 'RM_Q': if (r.isHost) removeFromQueue(d.uri, d.uid); break;
            case 'Q': setQueue(d.queue); break;
            case 'PING': conn.send({ type: 'PONG', ts: d.ts }); break;
            case 'PONG': setPing(Date.now() - d.ts); break;
            case 'SYNC':
                if (r.isHost && Spicetify.Player.data?.item) {
                    const currentUri = Spicetify.Player.data.item.uri;
                    const currentPos = Spicetify.Player.getProgress();
                    const currentDur = Spicetify.Player.getDuration();
                    // Lightweight same-track sync; avoid replaying/seeking guests unless truly needed
                    conn.send({
                        type: 'PLAY',
                        uri: currentUri,
                        pos: currentPos,
                        ts: Date.now(),
                        np: getTrack(),
                        paused: !Spicetify.Player.isPlaying(),
                        dur: currentDur,
                    });
                }
                break;
        }
    }, [broadcast, leaveJam, addToQueue, removeFromQueue, buildMembers, moveInQueue, playNextInJamQueue]);



    const setupConn = useCallback((conn: DataConnection) => {
        conn.on('open', () => conns.current.set(conn.peer, conn));
        conn.on('data', (d: any) => onData(d, conn));
        conn.on('close', () => { 
            conns.current.delete(conn.peer); 
            memberRegistry.current.delete(conn.peer); 
            setMembers(buildMembers()); 
        });
    }, [onData, buildMembers]);

    const startJam = async (retries = 0): Promise<void> => {
        if (connected) leaveJam();
        const me = await (userPromise.current || fetchUserAsync());
        cachedUser.current = me;

        const genId = () => Math.random().toString(36).substring(2, 8).toUpperCase();
        const p = new Peer(genId(), PEER_CONFIG); 
        peerRef.current = p;
        return new Promise<void>((res, rej) => {
            p.on('open', id => {
                setJamId(id); setIsHost(true); setConnected(true); setError(null);
                setHostName(me.name); setMembers([{ id: 'host', name: me.name, image: me.image, isHost: true }]);
                const t = getTrack(); if (t) { setNowPlaying(t); refs.current.targetUri = t.uri || null; }
                setIsPlaying(Spicetify.Player.isPlaying()); setProgress(Spicetify.Player.getProgress()); setDuration(Spicetify.Player.getDuration());
                setTimeout(refreshQueue, 500); res();
            });
            p.on('connection', setupConn);
            p.on('error', e => { 
                if ((e as any).type === 'id-taken' && retries < 5) { 
                    p.destroy(); 
                    startJam(retries + 1).then(res).catch(rej); 
                } else { 
                    setError(`Connection error: ${(e as any).type}`); 
                    rej(e); 
                } 
            });
        });
    };

    const joinJam = async (id: string, name?: string): Promise<void> => {
        if (connected) leaveJam();
        const me = await (userPromise.current || fetchUserAsync());
        cachedUser.current = me;

        const cleanId = id.includes('jam=') ? id.split('jam=')[1] : id.trim();
        if (!cleanId) { setError('Please enter a Jam ID'); return; }

        const p = new Peer(PEER_CONFIG); 
        peerRef.current = p;
        return new Promise<void>((res, rej) => {
            let settled = false;
            // 20s timeout — TURN relay negotiation can take time on strict NATs
            const timeout = setTimeout(() => {
                if (!settled) {
                    settled = true;
                    p.destroy();
                    const msg = 'Connection timed out — the host may be offline, or your network may be blocking P2P connections. Try sharing a hotspot or using a VPN.';
                    setError(msg);
                    rej(new Error(msg));
                }
            }, 20000);

            const settle = (fn: () => void) => {
                if (settled) return;
                settled = true;
                clearTimeout(timeout);
                fn();
            };

            p.on('open', () => {
                const conn = p.connect(cleanId, { reliable: true });
                conn.on('open', () => {
                    settle(() => {
                        conns.current.set(cleanId, conn); 
                        setJamId(cleanId); 
                        setIsHost(false); 
                        setConnected(true); 
                        setError(null);
                        setMembers([{ id: cleanId, name: 'Host', isHost: true }, { id: 'me', name: me.name, image: me.image }]);
                        conn.send({ type: 'JOIN', name: me.name, image: me.image }); 
                        res();
                    });
                });
                conn.on('data', (d: any) => onData(d, conn));
                conn.on('close', () => {
                    if (reconnectAttempt.current >= 3) { leaveJam(); setError('Host ended the session'); return; }
                    reconnectAttempt.current++;
                    setError(`Reconnecting (${reconnectAttempt.current}/3)...`);
                    reconnectTimer.current = setTimeout(() => {
                        if (!peerRef.current) return;
                        const newConn = peerRef.current.connect(cleanId);
                        newConn.on('open', () => {
                            conns.current.clear();
                            conns.current.set(cleanId, newConn);
                            setConnected(true); setError(null);
                            reconnectAttempt.current = 0;
                            newConn.send({ type: 'JOIN', name: me.name, image: me.image });
                        });
                        newConn.on('data', (d: any) => onData(d, newConn));
                        newConn.on('close', () => {
                            if (reconnectAttempt.current >= 3) { leaveJam(); setError('Host ended the session'); }
                            else {
                                reconnectAttempt.current++;
                                setError(`Reconnecting (${reconnectAttempt.current}/3)...`);
                                reconnectTimer.current = setTimeout(() => {
                                    if (!peerRef.current) return;
                                    const retryConn = peerRef.current.connect(cleanId);
                                    setupConn(retryConn);
                                    conns.current.set(cleanId, retryConn);
                                    setConnected(true); setError(null);
                                    reconnectAttempt.current = 0;
                                }, reconnectAttempt.current * 2000);
                            }
                        });
                        newConn.on('error', (e: any) => {
                            if (reconnectAttempt.current >= 3) {
                                leaveJam();
                                setError(`Reconnection error: ${e?.type || e?.message || 'unknown'}`);
                            }
                        });
                    }, reconnectAttempt.current * 1500);
                });
                conn.on('error', (e: any) => {
                    settle(() => {
                        const msg = `Could not connect to Jam: ${e?.type || e?.message || 'connection error'}`;
                        setError(msg);
                        rej(new Error(msg));
                    });
                });
            });
            p.on('error', (e: any) => {
                settle(() => {
                    const msg = e?.type === 'peer-unavailable'
                        ? 'Jam not found — check the ID and try again'
                        : `Peer error: ${e?.type || e?.message || 'unknown'}`;
                    setError(msg);
                    rej(new Error(msg));
                });
            });
        });
    };

    useEffect(() => {
        if (!connected) return;
        const onSong = () => {
            if (songDebounce.current) clearTimeout(songDebounce.current);
            songDebounce.current = setTimeout(() => {
                const uri = Spicetify.Player.data?.item?.uri;
                if (refs.current.isHost) {
                    // A context track "removed" from the Jam queue can't be removed
                    // natively, so Spotify may still reach it — skip it once. Explicit
                    // plays (targetUri already set to it) are respected.
                    if (uri && uri !== refs.current.targetUri && removedUris.current.has(uri)) {
                        removedUris.current.delete(uri);
                        playNextInJamQueue();
                        return;
                    }
                    const t = getTrack(); if (t) setNowPlaying(t);
                    refs.current.targetUri = uri || null;
                    const hostPaused = !Spicetify.Player.isPlaying();
                    broadcast({ type: 'PLAY', uri: uri || '', pos: 0, ts: Date.now(), np: t, paused: hostPaused });
                    if (pendingQueueRestore.current.length > 0) {
                        const restore = pendingQueueRestore.current;
                        pendingQueueRestore.current = [];
                        (async () => {
                            await rewriteNativeQueue(restore);
                            // Song changed: reset dirty flag so fresh queue is fetched
                            queueUserOrdered.current = 0;
                            setTimeout(refreshQueue, 1000);
                        })();
                    } else {
                        // Song changed: reset dirty flag so fresh queue is fetched
                        queueUserOrdered.current = 0;
                        setTimeout(refreshQueue, 600);
                    }
                } else {
                    // Suppress the songchange event fired by a programmatic playUri call
                    if (refs.current.ignoreNextSongChange) { refs.current.ignoreNextSongChange = false; return; }
                    if (uri && uri !== refs.current.targetUri && refs.current.targetUri) {
                        // Natural end-of-track: guests run slightly ahead of the host,
                        // so their player auto-advances into its own (junk) context
                        // first. Don't command the host to play that random track —
                        // just ask for a sync; the host advances and broadcasts the
                        // real next song moments later.
                        const nearEnd = refs.current.lastDuration > 0 &&
                            refs.current.lastDuration - refs.current.lastProgress < 3000;
                        if (nearEnd) {
                            const c = hostConn();
                            const now = Date.now();
                            if (c?.open && now - refs.current.lastSyncRequestTs > 2500) {
                                refs.current.lastSyncRequestTs = now;
                                c.send({ type: 'SYNC' });
                            }
                        } else if (refs.current.guestControls) {
                            const c = hostConn();
                            if (c?.open) c.send({ type: 'CMD', a: 'playuri', uri });
                        } else {
                            // Guest drifted out of the Jam track (e.g. manually navigated).
                            // Suppress the songchange that playUri will fire so we don't loop.
                            refs.current.ignoreNextSongChange = true;
                            refs.current.ignoreNextOnPP = true;
                            refs.current.remotePlayTs = Date.now();
                            refs.current.lastSyncAppliedTs = Date.now();
                            Spicetify.Player.playUri(refs.current.targetUri).catch(() => {
                                refs.current.ignoreNextSongChange = false;
                                refs.current.ignoreNextOnPP = false;
                            });
                            Spicetify.showNotification('🔒 Locked to Jam');
                        }
                    }
                }
            }, 300);
        };
        const onPP = () => {
            // Spotify fires onplaypause *during* the state transition, so
            // isPlaying() may still return the OLD value at the instant the event
            // fires. Defer by one microtask so the internal state has settled.
            // This is the root cause of the play→pause→play UI flicker.
            Promise.resolve().then(() => {
            const playing = Spicetify.Player.isPlaying();
            setIsPlaying(playing);
            
            if (refs.current.isHost) {
                const pos = Spicetify.Player.getProgress();
                const dur = Spicetify.Player.getDuration();
                broadcast({ type: 'PS', p: playing, pos, dur, ts: Date.now() });
                if (playing) {
                    broadcast({ type: 'PLAY', uri: Spicetify.Player.data?.item?.uri || refs.current.targetUri || '', pos, ts: Date.now(), np: getTrack() });
                } else {
                    broadcast({ type: 'PAUSE' });
                }
            } else {
                if (playing) {
                    // Playback that we just started ourselves in response to a host
                    // PLAY message — not the user pressing play. Accept it silently,
                    // otherwise guests without controls force-pause every host play.
                    const now = Date.now();
                    // Suppress onplaypause fired by our own programmatic seek/play after
                    // receiving a host PLAY — avoids the SYNC feedback loop.
                    if (refs.current.ignoreNextOnPP) { refs.current.ignoreNextOnPP = false; return; }
                    if (now - refs.current.remotePlayTs < 2000) return;
                    if (now - refs.current.lastSyncAppliedTs < 2000) return;
                    if (!refs.current.guestControls) {
                        // Guard against re-entrant pause loop
                        if (refs.current.forcingPause) return;
                        refs.current.forcingPause = true;
                        refs.current.ignoreNextOnPP = true; // suppress the pause event we're about to fire
                        Spicetify.Player.pause();
                        Spicetify.showNotification('🔒 Only the host can resume playback');
                        setTimeout(() => { refs.current.forcingPause = false; }, 500);
                        // Don't send SYNC here — it would cause host to reply PLAY{paused:false}
                        // which would make us try to play again → another onPP → loop.
                        // The drift interval (every 15s) will re-sync position organically.
                    } else {
                        // Guest with controls resumed — tell host our pos is in sync.
                        // Only send SYNC if we're on the right track; if on wrong track,
                        // snap back first (host PLAY reply will confirm position after snap).
                        const c = hostConn();
                        if (refs.current.targetUri) {
                            const curUri = Spicetify.Player.data?.item?.uri;
                            if (curUri && curUri !== refs.current.targetUri) {
                                // Wrong track — snap back. Suppress the resulting events.
                                refs.current.ignoreNextSongChange = true;
                                refs.current.ignoreNextOnPP = true;
                                refs.current.lastSyncAppliedTs = Date.now();
                                Spicetify.Player.playUri(refs.current.targetUri).catch(() => {
                                    refs.current.ignoreNextSongChange = false;
                                    refs.current.ignoreNextOnPP = false;
                                });
                                Spicetify.showNotification('🔒 Locked to Jam');
                            } else {
                                // Right track — request a position sync from host.
                                if (c?.open && now - refs.current.lastSyncRequestTs > 2500) {
                                    refs.current.lastSyncRequestTs = now;
                                    c.send({ type: 'SYNC' });
                                }
                            }
                        } else if (c?.open && now - refs.current.lastSyncRequestTs > 2500) {
                            refs.current.lastSyncRequestTs = now;
                            c.send({ type: 'SYNC' });
                        }
                    }
                }
            }
            }); // end Promise.resolve().then — wait for Spotify's state to settle
        };
        Spicetify.Player.addEventListener('songchange', onSong); 
        Spicetify.Player.addEventListener('onplaypause', onPP);
        let qi: ReturnType<typeof setInterval> | null = null;
        let driftI: ReturnType<typeof setInterval> | null = null;
        qi = refs.current.isHost ? setInterval(refreshQueue, 5000) : null;
        driftI = !refs.current.isHost ? setInterval(() => { 
            const now = Date.now();
            // Only request sync occasionally and only if we haven't just applied one
            if (now - refs.current.remotePlayTs < 5000) return;
            if (now - refs.current.lastSyncAppliedTs < 5000) return;
            if (now - refs.current.lastSyncRequestTs < 10000) return;
            const c = hostConn(); 
            if (c?.open) {
                refs.current.lastSyncRequestTs = now;
                c.send({ type: 'SYNC' }); 
            }
        }, 15000) : null;
        try {
            if (ctxMenuItem.current) { try { ctxMenuItem.current.deregister(); } catch {} }
            ctxMenuItem.current = new (Spicetify as any).ContextMenu.Item(
                'Add to Jam', 
                (uris: string[]) => addToQueue(uris), 
                () => refs.current.connected, 
                'plus2px'
            );
            ctxMenuItem.current.register();
        } catch {}
        return () => { 
            Spicetify.Player.removeEventListener('songchange', onSong); 
            Spicetify.Player.removeEventListener('onplaypause', onPP); 
            if (qi) clearInterval(qi); 
            if (driftI) clearInterval(driftI); 
            try { ctxMenuItem.current?.deregister(); } catch {} 
        };
    }, [connected, isHost, broadcast, refreshQueue, addToQueue, hostConn, playNextInJamQueue]);

    useEffect(() => {
        const hash = window.location.hash.slice(1);
        if (hash.startsWith('jam=')) { const id = hash.split('=')[1]; if (id) joinJam(id); }
    }, []);

    return (
        <Ctx.Provider value={{
            isHost, jamId, members, connected, error, nowPlaying, hostName, queue,
            guestControls, isPlaying, progress, duration, ping, updateAvailable,
            startJam, joinJam, leaveJam, addToQueue, removeFromQueue,
            moveInQueue, requestSync, jumpToTrack, seekTo, kickMember,
            toggleGuestControls, play, pause, next, prev
        } as any}>
            {children}
        </Ctx.Provider>
    );
};

export const useJam = () => { const c = useContext(Ctx); if (!c) throw new Error('useJam must be inside JamProvider'); return c; };
