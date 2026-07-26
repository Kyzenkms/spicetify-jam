
import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import Peer, { DataConnection } from 'peerjs';

interface TrackInfo { title: string; artist: string; artUrl: string; uri?: string; uid?: string; addedBy?: { name: string; image?: string }; }
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

const _ice=()=>[
    {urls:'stun:stun.l.google.com:19302'},
    {urls:'stun:stun1.l.google.com:19302'},
    {urls:'stun:stun.relay.metered.ca:80'},
    {urls:'turn:global.relay.metered.ca:80',username:'94458f086148dec1462e0426',credential:'FZ7jHqVwCJ71wV35'},
    {urls:'turn:global.relay.metered.ca:80?transport=tcp',username:'94458f086148dec1462e0426',credential:'FZ7jHqVwCJ71wV35'},
    {urls:'turn:global.relay.metered.ca:443',username:'94458f086148dec1462e0426',credential:'FZ7jHqVwCJ71wV35'},
    {urls:'turns:global.relay.metered.ca:443?transport=tcp',username:'94458f086148dec1462e0426',credential:'FZ7jHqVwCJ71wV35'},
    {urls:'turn:103.165.11.129:3478',username:'kyzenjam',credential:'KyzenJamPass2026!'},
    {urls:'turn:103.165.11.129:3478?transport=tcp',username:'kyzenjam',credential:'KyzenJamPass2026!'},
];

const PEER_CONFIG={
    host: '0.peerjs.com',
    port: 443,
    path: '/',
    key: 'peerjs',
    secure: true,
    config:{iceServers:_ice(),iceCandidatePoolSize:10},
    debug:0
};

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
        uri: (t.uri || '').split('?')[0],
        uid: t.uid
    };
};

const extractTrack = (t: any): TrackInfo => {
    const data = t?.contextTrack || t?.track || t || {};
    const meta = data?.metadata || t?.metadata || {};
    const title = data.name || meta.name || meta.title || t.name || '?';
    const artist = (data.artists?.[0]?.name) || meta.artist_name || meta.album_artist || t.artist_name || '?';
    const artUrl = fmtImg(meta.image_xlarge_url || meta.image_large_url || meta.image_url || data.album?.images?.[0]?.url || t.imageUrl || meta.thumbnail_url);
    const uri = (data.uri || t.uri || '').split('?')[0];
    const uid = data.uid || t.uid || '';
    return { title, artist, artUrl, uri, uid };
};

const getQueue = async (): Promise<TrackInfo[]> => {
    try {
        // Only return the MANUAL queue (tracks explicitly added by the user).
        // Context/autoplay tracks from playlists and albums are NOT included —
        // natural playback flow is already synced to guests via the onSong PLAY
        // broadcast. Merging context tracks into the Jam queue caused them to be
        // injected into Spotify's manual queue, breaking natural flow and causing
        // conflicts when tracks played outside the explicit queue.
        try {
            const res = await (Spicetify as any).Platform?.PlayerAPI?.getQueue();
            if (res) {
                const queued: any[] = res.queued || [];
                if (queued.length > 0) {
                    const seen = new Set<string>();
                    return queued.map(extractTrack).filter((t: TrackInfo) => {
                        if (!t.uri || seen.has(t.uid || t.uri!)) return false;
                        if (t.title === '?' && t.artist === '?') return false;
                        seen.add(t.uid || t.uri!); return true;
                    }).slice(0, 40);
                }
            }
        } catch {}

        return [];
    } catch { return []; }
};

// Rewrite Spotify's native manual queue to exactly match `tracks`.
// Strategy: pass the Jam queue's own uids in a single removeFromQueue call
// (the same uids Spotify assigned to those context/manual tracks) so Spotify
// clears them all in one atomic operation — giving the instant all-at-once
// animation the old code had. Then follow up by fetching any remaining
// manually-queued items (e.g. tracks added via "Add to Jam" that weren't in
// the tracked Jam queue list) and removing those too, also in one call.
const rewriteNativeQueue = async (tracks: TrackInfo[]) => {
    // 1. Primary clear — use the Jam queue's own uids for a single atomic remove
    //    (this is what gives the one-shot "whole queue disappears" animation)
    if (tracks.length > 0) {
        const toRemove = tracks
            .filter(t => t.uri)
            .map(t => ({ uri: t.uri!, uid: t.uid }));
        if (toRemove.length > 0) try { await Spicetify.removeFromQueue(toRemove as any); } catch {}
    }

    // 2. Safety sweep — clear any remaining manual-queue items not tracked in
    //    the Jam queue (e.g. orphaned entries from previous operations)
    try {
        const res = await (Spicetify as any).Platform?.PlayerAPI?.getQueue();
        const manualItems: any[] = res?.queued || [];
        if (manualItems.length > 0) {
            const toRemove = manualItems
                .map((item: any) => ({ uri: item.uri || item.contextTrack?.uri, uid: item.uid || item.contextTrack?.uid }))
                .filter((x: any) => x.uri);
            if (toRemove.length > 0) try { await Spicetify.removeFromQueue(toRemove as any); } catch {}
        }
    } catch {}

    // 3. Re-add in the desired Jam order — single batched call
    const toAdd = tracks.filter(t => !!t.uri).map(t => ({ uri: t.uri! }));
    if (toAdd.length > 0) try { await Spicetify.addToQueue(toAdd as any); } catch {}
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
    const refs = useRef({ isHost: false, connected: false, guestControls: false, jamId: '', targetUri: null as string | null, ignoreSync: false, isPlaying: false, forcingPause: false, lastProgress: 0, lastDuration: 0, remotePlayTs: 0 });
    const cmdThrottle = useRef<Map<string, number>>(new Map());
    const lastHostMsg = useRef(0);
    const reconnectAttempt = useRef(0);
    const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const trackAttribution = useRef<Record<string, { name: string; image?: string }>>({});
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

    useEffect(() => { 
        queueRef.current = queue; 
        if (refs.current.connected) {
            try { 
                localStorage.setItem('jam_crash_queue', JSON.stringify(queue));
                localStorage.setItem('jam_track_attr', JSON.stringify(trackAttribution.current));
            } catch {}
        }
    }, [queue]);

    useEffect(() => { refs.current.isHost = isHost; }, [isHost]);
    useEffect(() => { refs.current.connected = connected; }, [connected]);

    // Pre-fetch the real Spotify user as soon as the provider mounts
    useEffect(() => {
        userPromise.current = fetchUserAsync();
        userPromise.current.then(u => { cachedUser.current = u; });

        const CURRENT_VERSION = '1.3.1';

        const isNewerVersion = (latest: string, installed: string): boolean => {
            const l = latest.split('.').map(Number);
            const inst = installed.split('.').map(Number);
            for (let i = 0; i < Math.max(l.length, inst.length); i++) {
                const a = l[i] || 0;
                const b = inst[i] || 0;
                if (a > b) return true;
                if (a < b) return false;
            }
            return false;
        };

        const checkUpdate = async () => {
            try {
                const res = await fetch('https://raw.githubusercontent.com/Kyzenkms/spicetify-jam/main/manifest.json');
                const data = await res.json();
                if (data.version && isNewerVersion(data.version, CURRENT_VERSION)) {
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
                    if (localPlaying !== refs.current.isPlaying && !refs.current.isHost) {
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
        // An inject-and-next transition is mid-flight; the restore will refresh when done
        if (pendingQueueRestore.current.length > 0) return;

        // Sync Jam queue to Spotify's manual queue. Context/autoplay tracks are
        // intentionally excluded — natural playback is synced via PLAY broadcast.
        const spotifyQueue = (await getQueue()).filter(t => !removedUris.current.has(t.uri!));
        
        // Attach attribution metadata (defaulting unassigned/pre-existing tracks to Host)
        spotifyQueue.forEach(t => {
            const cleanUri = t.uri ? t.uri.split('?')[0] : '';
            if (cleanUri && trackAttribution.current[cleanUri]) {
                t.addedBy = trackAttribution.current[cleanUri];
            } else if (cachedUser.current) {
                const hostAttr = { name: cachedUser.current.name, image: cachedUser.current.image };
                t.addedBy = hostAttr;
                if (cleanUri) trackAttribution.current[cleanUri] = hostAttr;
            }
        });

        const currentQueue = queueRef.current;
        const urisChanged = JSON.stringify(spotifyQueue.map(t => t.uri)) !== JSON.stringify(currentQueue.map(t => t.uri));
        const attrChanged = JSON.stringify(spotifyQueue.map(t => t.addedBy)) !== JSON.stringify(currentQueue.map(t => t.addedBy));

        // Always update local state so attribution data is never discarded
        setQueue(spotifyQueue);
        // Only broadcast to guests when the queue content actually changed
        if (urisChanged || attrChanged) {
            broadcast({ type: 'Q', queue: spotifyQueue });
        }
    }, [broadcast]);

    const addToQueue = useCallback(async (uris: string | string[], addedBy?: Member) => {
        const uriArray = Array.isArray(uris) ? uris : [uris];
        if (refs.current.isHost) {
            uriArray.forEach(rawUri => {
                const uri = (typeof rawUri === 'string' ? rawUri : ((rawUri as any).uri || '')).split('?')[0];
                if (addedBy) {
                    trackAttribution.current[uri] = { name: addedBy.name, image: addedBy.image };
                } else if (cachedUser.current) {
                    trackAttribution.current[uri] = { name: cachedUser.current.name, image: cachedUser.current.image };
                }
            });
            try {
                // Ensure we pass string URIs to native addToQueue
                const toAdd = uriArray.map(rawUri => {
                    if (typeof rawUri === 'string') return { uri: rawUri };
                    return rawUri;
                });
                await Spicetify.addToQueue(toAdd);
                Spicetify.showNotification(uriArray.length > 1 ? `Added ${uriArray.length} tracks!` : 'Added!');
                // Re-adding a previously removed track un-blocks it
                uriArray.forEach(u => removedUris.current.delete(u));
                
                // Keep the queue locked so background syncs don't fetch a stale state
                // while Spotify is processing the addition. Unlock after 1.5s and refresh.
                queueUserOrdered.current = Date.now();
                setTimeout(() => {
                    queueUserOrdered.current = 0;
                    refreshQueue();
                }, 1500);
            } catch (err) { 
                console.error("Spicetify.addToQueue error:", err);
                Spicetify.showNotification('Failed to add to queue', true); 
            }
        } else { 
            const c = hostConn(); 
            if (c?.open) { 
                uriArray.forEach(uri => c.send({ type: 'ADD_Q', uri }));
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
            const newQueue = queueRef.current.filter(t => t.uri !== uri);
            setQueue(newQueue);
            broadcast({ type: 'Q', queue: newQueue });
            
            try { await Spicetify.removeFromQueue([{ uri, uid } as any]); } catch {}
            
            // Only unlock refreshQueue if no reorder is pending
            if (!reorderDebounce.current) queueUserOrdered.current = 0;
            setTimeout(refreshQueue, 500);
        } else {
            const c = hostConn();
            if (c?.open) c.send({ type: 'RM_Q', uri, uid });
        }
    }, [broadcast, hostConn, refreshQueue]);

    const debounceQueueSync = useCallback(() => {
        if (reorderDebounce.current) clearTimeout(reorderDebounce.current);
        reorderDebounce.current = setTimeout(async () => {
            await rewriteNativeQueue([...queueRef.current]);
            queueUserOrdered.current = Date.now();
        }, 800);
    }, []);

    const clearQueue = useCallback(async () => {
        if (!refs.current.isHost) {
            const c = hostConn();
            if (c?.open) c.send({ type: 'CLEAR_Q' });
            return;
        }

        // Host: instant visual clear + broadcast
        queueUserOrdered.current = Date.now();
        const jamQueue = [...queueRef.current];
        setQueue([]);
        broadcast({ type: 'Q', queue: [] });

        // Batch remove all tracks natively instantly (no need to debounce a clear)
        if (jamQueue.length > 0) {
            try {
                // Single call with all tracks at once — much faster than looping
                await Spicetify.removeFromQueue(
                    jamQueue.map(t => ({ uri: t.uri, uid: t.uid } as any))
                );
            } catch {}
        }
        try { localStorage.removeItem('jam_crash_queue'); } catch {}    queueUserOrdered.current = 0;
            setTimeout(refreshQueue, 500);
    }, [broadcast, refreshQueue]);

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

        debounceQueueSync();
    }, [broadcast, hostConn, debounceQueueSync]);

    const jumpToTrack = useCallback((uri: string) => {
        if (refs.current.isHost) {
            refs.current.targetUri = uri;
            const idx = queueRef.current.findIndex(t => t.uri === uri);
            if (idx >= 0) {
                const newQueue = queueRef.current.slice(idx + 1);
                pendingQueueRestore.current = newQueue;
                setQueue(newQueue);
                broadcast({ type: 'Q', queue: newQueue });
            }
            queueUserOrdered.current = Date.now();
            // Inject track into manual queue front then skip — keeps playlist context
            (async () => {
                try {
                    const res = await (Spicetify as any).Platform?.PlayerAPI?.getQueue();
                    const manualItems: any[] = res?.queued || [];
                    if (manualItems.length > 0) {
                        const toRemove = manualItems
                            .map((item: any) => ({ uri: item.uri || item.contextTrack?.uri, uid: item.uid || item.contextTrack?.uid }))
                            .filter((x: any) => x.uri);
                        if (toRemove.length > 0) try { await Spicetify.removeFromQueue(toRemove as any); } catch {}
                    }
                } catch {}
                try { await Spicetify.addToQueue([{ uri }]); } catch {}
                Spicetify.Player.next();
            })();
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
            Spicetify.Player.play(); 
            setIsPlaying(true); 
        } else if (refs.current.guestControls) { 
            const c = hostConn(); 
            if (c?.open) c.send({ type: 'CMD', a: 'play' }); 
        } 
    };

    const pause = () => { 
        if (refs.current.isHost) { 
            Spicetify.Player.pause(); 
            setIsPlaying(false); 
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
                // Jam queue head already matches Spotify's native next — a plain
                // skip keeps the playlist/album context alive with no queue churn.
                pendingQueueRestore.current = [];
                Spicetify.Player.next();
            } else {
                // The desired next track differs from Spotify's native next.
                // Instead of playUri (which nukes the current context and causes
                // Spotify to fall into a radio/autoplay context, making the queue
                // look like it has been reset), we:
                //   1. Clear the current manual queue so there's nothing in front.
                //   2. Prepend exactly the target track to the manual queue.
                //   3. Call native next() — Spotify plays the manually-queued
                //      track first, then continues the original context.
                // pendingQueueRestore will rewrite the rest of the Jam queue into
                // the manual queue once the new track's songchange fires.
                pendingQueueRestore.current = newQueue;
                queueUserOrdered.current = Date.now();
                (async () => {
                    // Clear current manual queue in one batched call
                    try {
                        const res = await (Spicetify as any).Platform?.PlayerAPI?.getQueue();
                        const manualItems: any[] = res?.queued || [];
                        if (manualItems.length > 0) {
                            const toRemove = manualItems
                                .map((item: any) => ({ uri: item.uri || item.contextTrack?.uri, uid: item.uid || item.contextTrack?.uid }))
                                .filter((x: any) => x.uri);
                            if (toRemove.length > 0) try { await Spicetify.removeFromQueue(toRemove as any); } catch {}
                        }
                    } catch {}
                    // Inject our desired next track into the manual queue front
                    try { await Spicetify.addToQueue([{ uri: nextTrack.uri! }]); } catch {}
                    // Native next plays the manually-queued track, context stays alive
                    Spicetify.Player.next();
                })();
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
        // ── 1. Clear Spotify's native manual queue ──
        // Fetch the actual manual-queue items so we only remove tracks that are
        // genuinely in the manual queue — not context tracks from a playlist/album.
        try {
            const res = await (Spicetify as any).Platform?.PlayerAPI?.getQueue();
            const manualItems: any[] = res?.queued || [];
            if (manualItems.length > 0) {
                const toRemove = manualItems
                    .map((item: any) => ({ uri: item.uri || item.contextTrack?.uri, uid: item.uid || item.contextTrack?.uid }))
                    .filter((x: any) => x.uri);
                if (toRemove.length > 0) try { await Spicetify.removeFromQueue(toRemove as any); } catch {}
            }
        } catch {}
        try { localStorage.removeItem('jam_crash_queue'); } catch {}

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
                    const newQueue = idx >= 0 ? queueRef.current.slice(idx + 1) : queueRef.current;
                    pendingQueueRestore.current = newQueue;
                    setQueue(newQueue);
                    broadcast({ type: 'Q', queue: newQueue });
                    refs.current.targetUri = d.uri;
                    queueUserOrdered.current = Date.now();
                    // Use inject-and-next to keep context alive (same as jumpToTrack)
                    (async () => {
                        try {
                            const res = await (Spicetify as any).Platform?.PlayerAPI?.getQueue();
                            const manualItems: any[] = res?.queued || [];
                            if (manualItems.length > 0) {
                                const toRemove = manualItems
                                    .map((item: any) => ({ uri: item.uri || item.contextTrack?.uri, uid: item.uid || item.contextTrack?.uid }))
                                    .filter((x: any) => x.uri);
                                if (toRemove.length > 0) try { await Spicetify.removeFromQueue(toRemove as any); } catch {}
                            }
                        } catch {}
                        try { await Spicetify.addToQueue([{ uri: d.uri }]); } catch {}
                        Spicetify.Player.next();
                    })();
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
                    r.targetUri = d.uri;
                    if (trackChanged) setProgress(0);
                    if (d.paused) {
                        // Host is paused — update track info but don't start playing
                        if (trackChanged) {
                            // Different track: load it then immediately pause
                            r.ignoreSync = true;
                            r.remotePlayTs = Date.now();
                            setIsPlaying(false);
                            Spicetify.Player.playUri(d.uri).then(() => {
                                setTimeout(() => { Spicetify.Player.pause(); r.ignoreSync = false; }, 150);
                            }).catch(() => { r.ignoreSync = false; });
                        } else {
                            Spicetify.Player.pause();
                            setIsPlaying(false);
                        }
                    } else if (!trackChanged) {
                        // Don't undo our own force-pause when the host's SYNC reply (PLAY{paused:false}) bounces back
                        if (refs.current.forcingPause) break;
                        const delay = Date.now() - d.ts;
                        Spicetify.Player.seek(d.pos + delay);
                        setIsPlaying(true);
                        r.remotePlayTs = Date.now();
                        if (!Spicetify.Player.isPlaying()) Spicetify.Player.play();
                    } else {
                        r.ignoreSync = true;
                        setIsPlaying(true);
                        r.remotePlayTs = Date.now();
                        const playTs = Date.now();
                        Spicetify.Player.playUri(d.uri).then(() => {
                            const delay = Date.now() - playTs + (Date.now() - d.ts);
                            const seekMs = d.pos + (Date.now() - d.ts);
                            const sid = setTimeout(() => Spicetify.Player.seek(seekMs), Math.max(300, delay));
                            seekTimers.current.push(sid);
                        }).catch(() => {
                            r.ignoreSync = false;
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
                    const member = memberRegistry.current.get(conn.peer);
                    addToQueue(d.uri, member);
                }
                break;
            case 'RM_Q': if (r.isHost) removeFromQueue(d.uri, d.uid); break;
            case 'CLEAR_Q': if (r.isHost) clearQueue(); break;
            case 'Q': setQueue(d.queue); break;
            case 'PING': conn.send({ type: 'PONG', ts: d.ts }); break;
            case 'PONG': setPing(Date.now() - d.ts); break;
            case 'SYNC': if (r.isHost && Spicetify.Player.data?.item) conn.send({ type: 'PLAY', uri: Spicetify.Player.data.item.uri, pos: Spicetify.Player.getProgress(), ts: Date.now(), np: getTrack(), paused: !Spicetify.Player.isPlaying() }); break;
        }
    }, [broadcast, leaveJam, addToQueue, removeFromQueue, clearQueue, buildMembers, moveInQueue, playNextInJamQueue]);



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
                    const hostPos = Spicetify.Player.getProgress();
                    broadcast({ type: 'PLAY', uri: uri || '', pos: hostPos, ts: Date.now(), np: t, paused: hostPaused });
                    if (pendingQueueRestore.current.length > 0) {
                        const restore = pendingQueueRestore.current;
                        pendingQueueRestore.current = [];
                        (async () => {
                            // The inject-and-next path already cleared the manual queue before
                            // calling next(), so the queue is empty here — just re-add the
                            // restore tracks directly. Calling rewriteNativeQueue would do a
                            // remove+add cycle causing a visual flash.
                            const toAdd = restore.filter(t => !!t.uri).map(t => ({ uri: t.uri! }));
                            if (toAdd.length > 0) try { await Spicetify.addToQueue(toAdd as any); } catch {}
                            // Only unlock if no reorder is pending
                            if (!reorderDebounce.current) queueUserOrdered.current = 0;
                            setTimeout(refreshQueue, 1000);
                        })();
                    } else {
                        // Song changed naturally — only unlock refreshQueue if no
                        // reorder is pending (resetting mid-rewrite causes stale read)
                        if (!reorderDebounce.current) queueUserOrdered.current = 0;
                        setTimeout(refreshQueue, 600);
                    }
                } else {
                    if (refs.current.ignoreSync) { refs.current.ignoreSync = false; return; }
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
                            if (c?.open) c.send({ type: 'SYNC' });
                        } else if (refs.current.guestControls) {
                            const c = hostConn();
                            if (c?.open) c.send({ type: 'CMD', a: 'playuri', uri });
                        } else {
                            refs.current.ignoreSync = true;
                            refs.current.remotePlayTs = Date.now();
                            Spicetify.Player.playUri(refs.current.targetUri).catch(() => {
                                refs.current.ignoreSync = false;
                            });
                            Spicetify.showNotification('🔒 Locked to Jam');
                        }
                    }
                }
            }, 300);
        };
        const onPP = () => {
            const playing = Spicetify.Player.isPlaying();
            setIsPlaying(playing);
            
            if (refs.current.isHost) {
                const pos = Spicetify.Player.getProgress();
                const dur = Spicetify.Player.getDuration();
                broadcast({ type: 'PS', p: playing, pos, dur });
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
                    if (Date.now() - refs.current.remotePlayTs < 2000) return;
                    if (!refs.current.guestControls) {
                        // Guard against re-entrant pause loop
                        if (refs.current.forcingPause) return;
                        refs.current.forcingPause = true;
                        Spicetify.Player.pause();
                        Spicetify.showNotification('🔒 Only the host can resume playback');
                        setTimeout(() => { refs.current.forcingPause = false; }, 500);
                        const c = hostConn();
                        if (c?.open) c.send({ type: 'SYNC' });
                    } else {
                        const c = hostConn();
                        if (c?.open) c.send({ type: 'SYNC' });
                        if (refs.current.targetUri) {
                            const curUri = Spicetify.Player.data?.item?.uri;
                            if (curUri && curUri !== refs.current.targetUri) {
                                refs.current.ignoreSync = true;
                                Spicetify.Player.playUri(refs.current.targetUri).catch(() => {
                                    refs.current.ignoreSync = false;
                                });
                                Spicetify.showNotification('🔒 Locked to Jam');
                            }
                        }
                    }
                }
            }
        };
        Spicetify.Player.addEventListener('songchange', onSong); 
        Spicetify.Player.addEventListener('onplaypause', onPP);
        let qi: ReturnType<typeof setInterval> | null = null;
        let driftI: ReturnType<typeof setInterval> | null = null;
        qi = refs.current.isHost ? setInterval(refreshQueue, 5000) : null;
        driftI = !refs.current.isHost ? setInterval(() => { 
            const c = hostConn(); 
            if (c?.open) c.send({ type: 'SYNC' }); 
        }, 15000) : null;

        // Monkeypatch native addToQueue to intercept the UI '+' button
        const originalAddToQueue = Spicetify.addToQueue;
        const originalPlayerAdd = (Spicetify as any).Platform?.PlayerAPI?.addToQueue;
        
        const interceptAdd = async (uris: any[], orig: any) => {
            if (refs.current.connected) {
                if (refs.current.isHost) {
                    if (cachedUser.current) {
                        uris.forEach((t: any) => {
                            const uri = (t.uri || (typeof t === 'string' ? t : '')).split('?')[0];
                            if (uri && !trackAttribution.current[uri]) {
                                trackAttribution.current[uri] = { name: cachedUser.current!.name, image: cachedUser.current!.image };
                            }
                        });
                        try { localStorage.setItem('jam_track_attr', JSON.stringify(trackAttribution.current)); } catch {}
                    }
                    return orig ? orig.call((Spicetify as any).Platform?.PlayerAPI || Spicetify, uris) : Promise.resolve();
                } else {
                    const c = hostConn(); 
                    if (c?.open) { 
                        uris.forEach((t: any) => {
                            const uri = typeof t === 'string' ? t : t.uri;
                            if (uri) c.send({ type: 'ADD_Q', uri });
                        });
                        Spicetify.showNotification(uris.length > 1 ? `Requested ${uris.length} tracks!` : 'Requested!'); 
                    }
                    return Promise.resolve();
                }
            }
            return orig ? orig.call((Spicetify as any).Platform?.PlayerAPI || Spicetify, uris) : Promise.resolve();
        };

        Spicetify.addToQueue = (uris: any[]) => interceptAdd(uris, originalAddToQueue);
        if ((Spicetify as any).Platform?.PlayerAPI) {
            (Spicetify as any).Platform.PlayerAPI.addToQueue = (uris: any[]) => interceptAdd(uris, originalPlayerAdd);
        }

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
            Spicetify.addToQueue = originalAddToQueue;
            if ((Spicetify as any).Platform?.PlayerAPI) {
                (Spicetify as any).Platform.PlayerAPI.addToQueue = originalPlayerAdd;
            }
            try { ctxMenuItem.current?.deregister(); } catch {} 
        };
    }, [connected, isHost, broadcast, refreshQueue, addToQueue, hostConn, playNextInJamQueue]);

    useEffect(() => {
        // Crash Recovery: If Spicetify was force-closed during an active Jam, 
        // clean up the orphaned tracks from the native queue.
        try {
            const attrStr = localStorage.getItem('jam_track_attr');
            if (attrStr) trackAttribution.current = JSON.parse(attrStr);
            
            const crashedQueueStr = localStorage.getItem('jam_crash_queue');
            if (crashedQueueStr) {
                const crashedQueue: TrackInfo[] = JSON.parse(crashedQueueStr);
                if (crashedQueue.length > 0) {
                    Spicetify.removeFromQueue(crashedQueue.map(t => ({ uri: t.uri, uid: t.uid } as any))).catch(() => {});
                }
                localStorage.removeItem('jam_crash_queue');
                console.log("Spicetify Jam: Cleaned up orphaned tracks from previous crash.");
            }
        } catch {}

        const hash = window.location.hash.slice(1);
        if (hash.startsWith('jam=')) { const id = hash.split('=')[1]; if (id) joinJam(id); }
    }, []);

    return (
        <Ctx.Provider value={{
            isHost, jamId, members, connected, error, nowPlaying, hostName, queue,
            guestControls, isPlaying, progress, duration, ping, updateAvailable,
            startJam, joinJam, leaveJam, addToQueue, removeFromQueue, clearQueue,
            moveInQueue, requestSync, jumpToTrack, seekTo, kickMember,
            toggleGuestControls, play, pause, next, prev
        } as any}>
            {children}
        </Ctx.Provider>
    );
};

export const useJam = () => { const c = useContext(Ctx); if (!c) throw new Error('useJam must be inside JamProvider'); return c; };
