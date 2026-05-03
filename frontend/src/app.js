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
const pywebviewApi = window.pywebview ? window.pywebview.api : null;

function callNative(method, ...args) {
    if (!pywebviewApi || !pywebviewApi[method]) {
        console.warn('pywebview not available for', method);
        return Promise.resolve(null);
    }
    return pywebviewApi[method](...args);
}
