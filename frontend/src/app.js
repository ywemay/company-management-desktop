/* Company Management Desktop — API client */
/* global window: false */

/* ── Debug logger (piped to server) ── */
const apiDbg = {
    _send: function(level, msg) {
        try {
            fetch('/api/log-client-error', {
                method: 'POST', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({level: level || 'log', msg: String(msg).substring(0, 500), url: location.href})
            }).catch(function(){});
        } catch(e) {}
    },
    log: function(msg) { console.log('[api-dbg]', msg); this._send('log', msg); },
    error: function(msg) { console.error('[api-dbg]', msg); this._send('error', msg); },
};
apiDbg.log('app.js loaded');

async function apiCall(method, url, body) {
    apiDbg.log('apiCall ' + method + ' ' + url + ' body=' + (body ? JSON.stringify(body).substring(0, 200) : 'null'));
    try {
        const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: body ? JSON.stringify(body) : undefined,
        });
        apiDbg.log('apiCall response status: ' + res.status);
        const data = await res.json();
        apiDbg.log('apiCall response body: ' + JSON.stringify(data).substring(0, 300));
        if (!data.ok) throw new Error(data.error || 'Request failed');
        return data.data;
    } catch (e) {
        apiDbg.error('apiCall FAILED: ' + (e.message || String(e)));
        throw e;
    }
}

const api = {
    // File browser
    listItems:      (dir) => apiCall('POST', '/api/list-items', { dir }),
    listSubdirs:    (dir) => apiCall('POST', '/api/list-subdirs', { dir }),
    listProducts:   (dir) => apiCall('POST', '/api/list-products', { dir }),
    createSubdir:   (dir, name) => apiCall('POST', '/api/create-subdir', { dir, name }),

    // Product CRUD
    openProduct:    (p) => apiCall('POST', '/api/open', { path: p }),
    createProduct:  (p, title, code, desc) => apiCall('POST', '/api/create', { path: p, title, code, description: desc }),
    saveProduct:    (p, product) => apiCall('POST', '/api/save', { path: p, product }),
    addPrice:       (p, currency, variation, price) => apiCall('POST', '/api/add-price', { path: p, currency, variation, price }),
    addPhoto:       (p, photoPath) => apiCall('POST', '/api/add-photo', { path: p, photoPath }),
    removePhoto:    (p, index) => apiCall('POST', '/api/remove-photo', { path: p, index }),
    editPrice:      (p, index, price, currency) => apiCall('POST', '/api/price/edit', { path: p, index, price, currency }),
    deletePrice:    (p, index) => apiCall('POST', '/api/price/delete', { path: p, index }),
    movePhoto:      (p, index, direction) => apiCall('POST', '/api/photo/move', { path: p, index, direction }),
    exportPhoto:    (p, index) => apiCall('POST', '/api/photo/export', { path: p, index }),

    // Company CRUD
    getCompany:     (dir) => apiCall('POST', '/api/company', { dir }),
    saveCompany:    (dir, company) => apiCall('POST', '/api/company/save', { dir, company }),
    addContact:     (dir, contact) => apiCall('POST', '/api/company/contact/add', { dir, contact }),
    updateContact:  (dir, index, contact) => apiCall('POST', '/api/company/contact/update', { dir, index, contact }),
    deleteContact:  (dir, index) => apiCall('POST', '/api/company/contact/delete', { dir, index }),

    // Deal CRUD
    listDeals:      (dir) => apiCall('POST', '/api/deals/list', { dir }),
    getDeal:        (dir, filename) => apiCall('POST', '/api/deals/get', { dir, filename }),
    saveDeal:       (dir, deal) => apiCall('POST', '/api/deals/save', { dir, deal }),
    deleteDeal:     (dir, filename) => apiCall('POST', '/api/deals/delete', { dir, filename }),

    // Settings
    getSettings:    () => apiCall('GET', '/api/settings'),
    saveSettings:   (s) => apiCall('POST', '/api/settings', s),

    // Misc
    deleteFiles:    (paths) => apiCall('POST', '/api/delete-products', { paths }),
    openSystem:     (path) => apiCall('POST', '/api/open-system', { path }),
};

// PyWebView bridge — call native API from JS
// DO NOT cache window.pywebview at load time; pywebview may populate it after page load.
function callNative(method, ...args) {
    const api = window.pywebview && window.pywebview.api;
    if (api && typeof api[method] === 'function') {
        console.log('[app] Calling pywebview.api.' + method + '()');
        return api[method](...args);
    }
    console.warn('[app] pywebview.api.' + method + ' not available');
    return Promise.resolve(null);
}
