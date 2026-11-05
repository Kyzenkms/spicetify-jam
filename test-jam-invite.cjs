const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { transformSync } = require('esbuild');

async function checkInvites() {
    const browser = new EventTarget();
    browser.location = { pathname: '/index.html', search: '', hash: '' };
    browser.history = { replaceState() { browser.location.hash = ''; } };
    const moduleUnderTest = { exports: {} };
    const source = fs.readFileSync(path.join(__dirname, 'src/jamInvite.ts'), 'utf8');
    vm.runInNewContext(transformSync(source, { loader: 'ts', format: 'cjs' }).code, {
        module: moduleUnderTest, exports: moduleUnderTest.exports, window: browser,
    });
    const { jamInviteLink, jamAppUri, parseJamId, listenForJamInvites } = moduleUnderTest.exports;
    for (const input of [
        ' YYSMBM ', 'yysmbm', jamInviteLink('YYSMBM'), jamAppUri('YYSMBM'),
        '/spicetify-jam/YYSMBM', '/spicetify-jam/%59YSMBM', '/spicetify-jam/yysmbm/',
        'https://xpui.app.spotify.com/index.html#jam=YYSMBM',
        'https://example.com/?jam=YYSMBM&source=invite',
    ]) assert.equal(parseJamId(input), 'YYSMBM', input);
    for (const input of ['', 'YYSMB', 'YYSMBMX', 'spotify:jam:YYSMBM',
        'spotify:search:spicetify-jam:YYSMBM', '/search/spicetify-jam:YYSMBM',
        'spotify:track:YYSMBM', '/spicetify-jam/YYSMBM-extra',
        '/spicetify-jam/YYSMBM/other', '%ZZ#jam=YYSMBM']) {
        assert.equal(parseJamId(input), null, input);
    }
    assert.equal(parseJamId('YYSMBM', true), null);
    assert.equal(jamInviteLink('YYSMBM'), 'https://kyzenkms.github.io/spicetify-jam/?jam=YYSMBM');
    assert.equal(jamAppUri('YYSMBM'), 'spotify:app:spicetify-jam:YYSMBM');

    let listener = null;
    let key = 0;
    const history = {
        location: { pathname: '/spicetify-jam/YYSMBM', key: 'startup' },
        listen(receive) { listener = receive; return () => { listener = null; }; },
        replace(location) { this.location = location; listener?.(location); },
    };
    const navigate = pathname => history.replace({ pathname, key: String(++key) });
    const joined = [];
    const stop = listenForJamInvites(history, id => joined.push(id));
    listener(history.location);
    assert.deepEqual(joined, ['YYSMBM']);
    await Promise.resolve();
    assert.equal(history.location.pathname, '/');
    navigate('/album/music');
    navigate('/spicetify-jam/AB12CD');
    await Promise.resolve();
    assert.equal(history.location.pathname, '/album/music');
    assert.deepEqual(joined, ['YYSMBM', 'AB12CD']);
    navigate('/spicetify-jam/AB12CD');
    await Promise.resolve();
    assert.equal(joined.length, 3, 'The same invite can be opened again after leaving its route');
    navigate('/search/spicetify-jam:YYSMBM');
    assert.equal(joined.length, 3, 'Search is not an invite transport');
    navigate('/spicetify-jam');
    await Promise.resolve();
    assert.equal(joined.at(-1), '', 'The app icon opens the panel without joining');
    navigate('/spicetify-jam/BAD');
    await Promise.resolve();
    assert.equal(joined.at(-1), '/spicetify-jam/BAD', 'Malformed app links reach input validation');
    navigate('/spicetify-jam/ZZ99AA');
    navigate('/playlist/new-choice');
    await Promise.resolve();
    assert.equal(history.location.pathname, '/playlist/new-choice', 'Do not undo a newer user navigation');
    browser.location.hash = '#jam=QQ11AA';
    browser.dispatchEvent(new Event('hashchange'));
    assert.equal(joined.at(-1), 'QQ11AA');
    assert.equal(browser.location.hash, '');
    const count = joined.length;
    browser.dispatchEvent(new Event('hashchange'));
    assert.equal(joined.length, count);
    navigate('/spicetify-jam/YYSMBM');
    stop();
    await Promise.resolve();
    assert.equal(listener, null);
    assert.equal(history.location.pathname, '/spicetify-jam/YYSMBM', 'Cleanup cancels pending navigation');
    browser.location.hash = '#jam=ZZ99AA';
    browser.dispatchEvent(new Event('hashchange'));
    assert.equal(joined.length, count + 1, 'Cleanup removes the hash listener');
    history.location = { pathname: '/' };
    const stopFallback = listenForJamInvites(history, id => joined.push(id));
    assert.equal(joined.at(-1), 'ZZ99AA');
    assert.equal(browser.location.hash, '');
    stopFallback();
}

function checkInvitePage() {
    const html = fs.readFileSync(path.join(__dirname, 'docs/index.html'), 'utf8');
    const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
    const visit = (search, userAgent = 'Windows') => {
        const elements = Object.fromEntries(['heading', 'description', 'status', 'invite', 'code', 'open', 'copy'].map(id => [id, { hidden: id === 'invite', addEventListener() {} }]));
        const location = { search, href: 'https://example.com/' };
        vm.runInNewContext(script, {
            window: { location }, URLSearchParams,
            document: { getElementById: id => elements[id] },
            navigator: { userAgent, platform: 'Win32', maxTouchPoints: 0 },
        });
        return { elements, location };
    };
    const desktop = visit('?jam=yysmbm');
    assert.equal(desktop.location.href, 'spotify:app:spicetify-jam:YYSMBM');
    assert.equal(desktop.elements.open.href, desktop.location.href);
    assert.equal(desktop.elements.code.value, 'YYSMBM');
    assert.equal(desktop.elements.invite.hidden, false);
    for (const query of ['', '?jam=YYSMB', '?jam=YYSMBMX', '?jam=YYSMBM&jam=AB12CD', '?jam=%3Cscript%3E']) {
        const invalid = visit(query);
        assert.equal(invalid.location.href, 'https://example.com/', query);
        assert.equal(invalid.elements.invite.hidden, true);
    }
    const mobile = visit('?jam=YYSMBM', 'iPhone');
    assert.equal(mobile.location.href, 'https://example.com/');
    assert.equal(mobile.elements.open.hidden, true);
    assert.match(mobile.elements.status.textContent, /computer/);
}

checkInvites().then(() => {
    checkInvitePage();
    console.log('Jam invite checks passed: direct routes, page restoration, reopens, validation, cleanup, HTTPS handoff.');
}).catch(error => { console.error(error); process.exitCode = 1; });
