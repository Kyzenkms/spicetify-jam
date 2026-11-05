export const jamInviteLink = (id: string): string => `https://kyzenkms.github.io/spicetify-jam/?jam=${id}`;
export const jamAppUri = (id: string): string => `spotify:app:spicetify-jam:${id}`;

export function parseJamId(input: string, linkOnly = false): string | null {
    let value = input.trim();
    try { value = decodeURIComponent(value); } catch { return null; }

    const direct = value.match(/^(?:spotify:app:spicetify-jam:|\/spicetify-jam\/)([a-z0-9]{6})\/?(?:[?#].*)?$/i);
    const legacy = value.match(/(?:^|[?#&])jam=([a-z0-9]{6})(?=$|[&#])/i);
    const id = direct?.[1] || legacy?.[1] || (!linkOnly && /^[a-z0-9]{6}$/i.test(value) ? value : '');
    return id ? id.toUpperCase() : null;
}

type InviteLocation = { pathname?: string; search?: string; hash?: string; key?: string };

export function listenForJamInvites(history: {
    location: InviteLocation;
    listen: (listener: (location: InviteLocation) => void) => () => void;
    replace: (location: InviteLocation) => void;
}, onInvite: (input: string) => void): () => void {
    let previous: InviteLocation = { pathname: '/', search: '', hash: '' };
    let lastRequest = '';
    let active = true;
    const receive = (location: InviteLocation) => {
        const path = location.pathname || '';
        const value = `${path}${location.search || ''}${location.hash || ''}`;
        const isApp = /^\/spicetify-jam(?:\/|$)/.test(path);
        if (!isApp) { previous = location; lastRequest = ''; return; }
        const id = parseJamId(value, true);
        const request = location.key || value;
        if (request === lastRequest) return;
        lastRequest = request;
        const returnTo = previous;
        onInvite(id || (/^\/spicetify-jam\/?$/.test(path) ? '' : value));
        // Finish the current router notification before restoring the music page.
        Promise.resolve().then(() => {
            if (active && history.location === location) history.replace(returnTo);
        });
    };
    const onHashChange = () => {
        const id = parseJamId(window.location.hash, true);
        if (!id) return;
        window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}`);
        onInvite(id);
    };
    const unlisten = history.listen(receive);
    window.addEventListener('hashchange', onHashChange);
    receive(history.location);
    if (!lastRequest) onHashChange();

    return () => {
        active = false;
        unlisten();
        window.removeEventListener('hashchange', onHashChange);
    };
}
