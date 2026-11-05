function render() {
    const h = Spicetify.React.createElement;
    return h('section', { className: 'contentSpacing', style: { padding: 40, maxWidth: 640 } },
        h('h1', null, 'Spicetify Jam'),
        h('p', { role: 'status', style: { margin: '24px 0' } }, 'Opening your Jam in the side panel…'),
        h('p', null, 'If the panel does not open, update Spicetify Jam to install the matching extension.'),
        h('a', { href: 'https://github.com/Kyzenkms/spicetify-jam#installation', target: '_blank', rel: 'noopener noreferrer' }, 'Installation guide')
    );
}
