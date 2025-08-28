// Visual debugging helpers: draw overlays around an element and its ancestors
(function () {
    const containerId = 'visual-debug-overlays';
    function ensureContainer() {
        let c = document.getElementById(containerId);
        if (!c) {
            c = document.createElement('div');
            c.id = containerId;
            c.style.position = 'fixed';
            c.style.left = '0';
            c.style.top = '0';
            c.style.width = '100%';
            c.style.height = '100%';
            c.style.pointerEvents = 'none';
            c.style.zIndex = '99999';
            document.body.appendChild(c);
        }
        return c;
    }

    function clear() {
        const c = document.getElementById(containerId);
        if (c) c.innerHTML = '';
    }

    function drawRect(rect, label, color) {
        const o = document.createElement('div');
        o.style.position = 'absolute';
        o.style.left = rect.left + 'px';
        o.style.top = rect.top + 'px';
        o.style.width = rect.width + 'px';
        o.style.height = rect.height + 'px';
        o.style.border = `2px solid ${color}`;
        o.style.background = `${color}22`;
        o.style.boxSizing = 'border-box';
        o.style.pointerEvents = 'none';
        const t = document.createElement('div');
        t.textContent = label;
        t.style.position = 'absolute';
        t.style.left = '2px';
        t.style.top = '2px';
        t.style.fontSize = '12px';
        t.style.color = '#fff';
        t.style.background = '#0008';
        t.style.padding = '2px 4px';
        t.style.borderRadius = '4px';
        o.appendChild(t);
        return o;
    }

    window.DebugVisual = {
        visualizeElement(el) {
            try {
                clear();
                const c = ensureContainer();
                let node = el;
                const colors = ['#ff3333', '#ff9933', '#ffcc33', '#33cc33', '#33cccc', '#3399ff', '#9933ff'];
                let i = 0;
                while (node && node.getBoundingClientRect) {
                    const r = node.getBoundingClientRect();
                    const label = `${node.tagName}${node.id ? '#'+node.id:''} ${node.className?'.'+node.className:''} ${Math.round(r.width)}x${Math.round(r.height)}`;
                    const overlay = drawRect(r, label, colors[i % colors.length]);
                    c.appendChild(overlay);
                    i++;
                    if (node.tagName === 'BODY') break;
                    node = node.parentElement;
                }
                // auto-clear after 6s
                setTimeout(() => { clear(); }, 6000);
            } catch (e) { console.warn('DebugVisual failed', e); }
        }
    };
})();
