// Lightweight API helpers for Rush-Maximizer
(function () {
    const safeFetchJson = async (url, opts) => {
        const res = await fetch(url, opts);
        const text = await res.text();
        try { return JSON.parse(text); } catch (e) { return { raw: text, status: res.status }; }
    };

    window.GameAPI = {
        // Try a list of candidate servers for /status and return first that responds
        async checkStatus(preferred) {
            const tryServers = [preferred || '', 'http://localhost:8000', 'http://127.0.0.1:8000'].map(s => s.replace(/\/$/, '')).filter(Boolean);
            let info = null, chosen = null;
            for (const s of tryServers) {
                try {
                    const data = await safeFetchJson(`${s}/status`);
                    if (data && (data.server_id || data.message)) {
                        info = data;
                        chosen = s;
                        break;
                    }
                } catch (e) {
                    console.warn('[GameAPI] status check failed for', s, e);
                }
            }
            if (!info) throw new Error('no_server');
            return { info, chosenServer: chosen };
        },

        async probeLM(server, lm_url) {
            if (!lm_url) return { ok: false, error: 'no_lm' };
            const base = server.replace(/\/$/, '');
            return await safeFetchJson(`${base}/probe_lm`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ lm_server: lm_url }) });
        },

        async register(server, nickname) {
            const base = server.replace(/\/$/, '');
            return await safeFetchJson(`${base}/register`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ nickname }) });
        },

        async fetchSoloQuestions(server, n, filters = {}) {
            const base = server.replace(/\/$/, '');
            let url = `${base}/solo/questions?n=${encodeURIComponent(n)}`;
            
            // Add filter parameters
            if (filters.category && filters.category !== 'all') {
                url += `&category=${encodeURIComponent(filters.category)}`;
            }
            if (filters.difficulty && filters.difficulty !== 'all') {
                url += `&difficulty=${encodeURIComponent(filters.difficulty)}`;
            }
            
            return await safeFetchJson(url);
        }
    };
})();
