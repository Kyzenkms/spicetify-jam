const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { transformSync } = require('esbuild');
const manifest = require('./manifest.json');
const source = fs.readFileSync(path.join(__dirname, 'src/updateCheck.ts'), 'utf8');
const code = transformSync(source, { loader: 'ts', format: 'cjs' }).code;
const flush = () => new Promise(resolve => setImmediate(resolve));

async function main() {
    const browser = new EventTarget();
    let timer;
    browser.setInterval = (callback, delay) => { assert.equal(delay, 30 * 60 * 1000); timer = callback; return 1; };
    browser.clearInterval = id => { assert.equal(id, 1); timer = null; };
    let requests = 0;
    let response = manifest;
    let fail = false;
    let updates = 0;
    let pending;
    const moduleUnderTest = { exports: {} };
    vm.runInNewContext(code, {
        module: moduleUnderTest, exports: moduleUnderTest.exports,
        require: id => { assert.equal(id, '../manifest.json'); return manifest; },
        window: browser, AbortSignal, console: { warn() {} },
        fetch: async (url, options) => {
            requests++;
            assert.equal(url, 'https://raw.githubusercontent.com/Kyzenkms/spicetify-jam/main/manifest.json');
            assert.equal(options.cache, 'no-store');
            assert.ok(options.signal instanceof AbortSignal);
            if (pending) await pending;
            if (fail) throw new Error('Offline');
            return { ok: true, json: async () => response };
        },
    });
    const { isNewerRelease, watchForUpdates } = moduleUnderTest.exports;
    assert.equal(manifest.version, require('./package.json').version);
    assert.equal(manifest.version, require('./package-lock.json').version);
    assert.equal(manifest.version, require('./package-lock.json').packages[''].version);
    assert.equal(isNewerRelease(manifest, { version: '1.4.1', patch: 1 }), true);
    assert.equal(isNewerRelease(manifest), false);
    assert.equal(isNewerRelease({ version: '1.4.1', patch: 999 }), false);
    assert.equal(isNewerRelease({ version: '1.4.10' }, { version: '1.4.9' }), true);
    assert.equal(isNewerRelease({ version: '1.4.9' }, { version: '1.4.10' }), false);
    assert.equal(isNewerRelease({ version: '2.0.0' }, { version: '1.99.99' }), true);
    assert.equal(isNewerRelease({ ...manifest, patch: manifest.patch + 1 }), true);
    for (const invalid of [null, {}, { version: 142 }, { version: '1.4.2-beta' }, { ...manifest, patch: -1 }, { ...manifest, patch: '1' }]) {
        assert.equal(isNewerRelease(invalid), false);
    }

    const stop = watchForUpdates(() => updates++);
    browser.dispatchEvent(new Event('focus'));
    assert.equal(requests, 1, 'Overlapping checks should share the in-flight request');
    await flush();
    assert.equal(updates, 0, 'The installed version must not show its own update banner');
    fail = true;
    browser.dispatchEvent(new Event('focus'));
    await flush();
    assert.equal(updates, 0);
    fail = false;
    response = { ...manifest, patch: manifest.patch + 1 };
    await timer();
    assert.equal(updates, 1, 'A newer manifest must trigger the banner callback');
    const count = requests;
    browser.dispatchEvent(new Event('focus'));
    await timer();
    assert.equal(updates, 1, 'Notify once per session');
    assert.equal(requests, count);
    stop();
    assert.equal(timer, null);
    browser.dispatchEvent(new Event('focus'));
    assert.equal(requests, count, 'Cleanup must remove the focus listener');

    let resolve;
    pending = new Promise(done => { resolve = done; });
    const stopPending = watchForUpdates(() => updates++);
    stopPending();
    resolve();
    await flush();
    assert.equal(updates, 1, 'A completed request must not update an unmounted panel');
    console.log('Update checks passed: release versions, upgrade detection, startup/focus/polling, retries, notification, cleanup.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
