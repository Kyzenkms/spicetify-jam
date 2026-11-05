import { version, patch } from '../manifest.json';

type Release = { version: string; patch?: number };

export function isNewerRelease(latest: unknown, current: Release = { version, patch }): boolean {
    if (!latest || typeof latest !== 'object') return false;
    const candidate = latest as Partial<Release>;
    if (typeof candidate.version !== 'string' || !/^\d+\.\d+\.\d+$/.test(candidate.version)) return false;
    if (candidate.patch !== undefined && (!Number.isSafeInteger(candidate.patch) || candidate.patch < 0)) return false;
    const next = candidate.version.split('.').map(Number);
    const installed = current.version.split('.').map(Number);
    if (!next.every(Number.isSafeInteger)) return false;
    const changed = next.findIndex((part, index) => part !== installed[index]);
    return changed < 0 ? (candidate.patch ?? 0) > (current.patch ?? 0) : next[changed] > installed[changed];
}

export function watchForUpdates(onUpdate: () => void): () => void {
    let active = true;
    let checking = false;
    let notified = false;
    const check = async () => {
        if (!active || checking || notified) return;
        checking = true;
        try {
            const response = await fetch('https://raw.githubusercontent.com/Kyzenkms/spicetify-jam/main/manifest.json', {
                cache: 'no-store', signal: AbortSignal.timeout(10000),
            });
            if (!response.ok) throw new Error(`Update check returned ${response.status}`);
            const latest = await response.json();
            if (active && isNewerRelease(latest)) {
                notified = true;
                onUpdate();
            }
        } catch (error) {
            console.warn('[Spicetify Jam] Failed to check for updates', error);
        } finally {
            checking = false;
        }
    };
    void check();
    const interval = window.setInterval(check, 30 * 60 * 1000);
    window.addEventListener('focus', check);
    return () => {
        active = false;
        window.clearInterval(interval);
        window.removeEventListener('focus', check);
    };
}
