/* Company Management Desktop — API client */
/* global window: false */

async function apiCall(method, url, body) {
    const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Request failed');
    return data.data;
}

const api = {
    // File browser
    listItems:      (dir) => apiCall('POST', '/api/list-items', { dir }),
    listSubdirs:    (dir) => apiCall('POST', '/api/list-subdirs', { dir }),
    listProducts:   (dir) => apiCall('POST', '/api/list-products', { dir }),

    // Product
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

    // Company
    getCompany:     (dir) => apiCall('POST', '/api/company', { dir }),
    saveCompany:    (dir, company) => apiCall('POST', '/api/company/save', { dir, company }),
    addContact:     (dir, contact) => apiCall('POST', '/api/company/contact/add', { dir, contact }),
    updateContact:  (dir, index, contact) => apiCall('POST', '/api/company/contact/update', { dir, index, contact }),
    deleteContact:  (dir, index) => apiCall('POST', '/api/company/contact/delete', { dir, index }),

    // Deal
    getDeal:        (d) => apiCall('POST', '/api/deal', { path: d }),
    saveDeal:       (d, deal) => apiCall('POST', '/api/deal/save', { path: d, deal }),

    // Search
    searchItems:    (dir, query) => apiCall('POST', '/api/search', { dir, query }),

    // Recursive listing
    listItemsRecursive: (dir) => apiCall('POST', '/api/list-items-recursive', { dir }),

    // Copy / Move
    copyItems:      (sourcePaths, destDir) => apiCall('POST', '/api/copy-items', { sourcePaths, destDir }),
    moveItems:      (sourcePaths, destDir) => apiCall('POST', '/api/move-items', { sourcePaths, destDir }),

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
