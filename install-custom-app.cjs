const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const config = execFileSync('spicetify', ['-c'], { encoding: 'utf8' }).trim();
const destination = path.join(path.dirname(config), 'CustomApps', 'spicetify-jam');
fs.mkdirSync(destination, { recursive: true });
for (const name of ['index.js', 'manifest.json']) {
    fs.copyFileSync(path.join(__dirname, 'custom-app', name), path.join(destination, name));
}
console.log('Installed Spicetify Jam direct app route.');
