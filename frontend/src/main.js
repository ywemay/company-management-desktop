/* Company Management Desktop — File Browser UI */
/* global api, callNative, escapeHtml, showMsg */

// ── State ──
const state = {
    currentDir: null,
    items: [],
    settings: { defaultDir: '', currency: 'USD', company: '' },
    galleryAbort: false,
    viewMode: 'grid',  // 'grid' or 'list'
};

// ── Init ──
document.addEventListener('DOMContentLoaded', async () => {
    try { setupMenuBar(); } catch(e) { console.error('setupMenuBar:', e); }
    try { setupContextMenu(); } catch(e) { console.error('setupContextMenu:', e); }
    try { setupSidebar(); } catch(e) { console.error('setupSidebar:', e); }
    try { setupModals(); } catch(e) { console.error('setupModals:', e); }
    try { setupGalleryEvents(); } catch(e) { console.error('setupGalleryEvents:', e); }
    initSettings().then(() => {
        if (state.settings.defaultDir) {
            loadDirectory(state.settings.defaultDir);
        } else {
            checkStartupDialog();
        }
    });
});

// ── Helpers ──
function escapeHtml(s) {
    if (typeof s !== 'string') return '';
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function basename(p) { return p.split('/').filter(Boolean).pop() || p; }
function dirname(p) {
    const parts = p.replace(/\/+$/, '').split('/');
    parts.pop();
    return parts.join('/') || '/';
}
function showMsg(msg, type) {
    const el = document.getElementById('messages');
    const div = document.createElement('div');
    div.className = 'msg msg-' + (type || 'info');
    div.textContent = msg;
    el.appendChild(div);
    setTimeout(() => { if (div.parentNode) div.remove(); }, 3000);
}
function showError(err) { showMsg(err.message || String(err), 'error'); }

// ── Settings ──
async function initSettings() {
    // Try injected settings first (server-side rendered)
    if (window.__INITIAL_SETTINGS__ && window.__INITIAL_SETTINGS__.defaultDir) {
        state.settings = window.__INITIAL_SETTINGS__;
    } else {
        // Fallback: fetch from API
        try {
            const apiResult = await api.getSettings();
            state.settings = apiResult || { defaultDir: '', currency: 'USD', company: '' };
        } catch (e) {
            state.settings = { defaultDir: '', currency: 'USD', company: '' };
        }
    }
    // Pre-fill Settings dialog fields
    const sd = document.getElementById('settings-dir');
    if (sd) sd.value = state.settings.defaultDir || '';
    const sc = document.getElementById('settings-company');
    if (sc) sc.value = state.settings.company || '';
    const scur = document.getElementById('settings-currency');
    if (scur) scur.value = state.settings.currency || 'USD';
}

// ── Directory Loading ──
async function loadDirectory(dir) {
    state.galleryAbort = true;
    state.currentDir = dir;
    try {
        const items = await api.listItems(dir);
        state.items = items;
        updateSidebarHeader(dir);
        renderSidebar(dir, items);
        if (state.viewMode === 'grid') {
            renderGallery(dir, items);
        } else {
            renderListView(dir, items);
        }
        renderBreadcrumb(dir);
        document.getElementById('empty-state').style.display = 'none';
        document.getElementById('browser-view').style.display = 'block';
    } catch (e) {
        showError(e);
    }
}

// ── Sidebar ──
function setupSidebar() {
    document.getElementById('sidebar-change-dir').addEventListener('click', async () => {
        try {
            const path = await callNative('pickDirectory');
            if (path) loadDirectory(path);
        } catch (e) { showError(e); }
    });
}
function updateSidebarHeader(dir) {
    document.getElementById('dir-label').textContent = basename(dir) || dir;
    document.getElementById('current-dir').textContent = dir;
}
function renderSidebar(dir, items) {
    const container = document.getElementById('file-list');
    const folders = items.filter(i => i.type === 'folder');
    const files = items.filter(i => i.type === 'file');
    let html = '';
    if (dir !== '/') {
        html += '<div class="file-item folder-item" data-path="' + escapeHtml(dirname(dir)) + '" data-type="folder">';
        html += '<span class="icon">📁</span><span class="name">..</span></div>';
    }
    folders.forEach(item => {
        html += '<div class="file-item folder-item" data-path="' + escapeHtml(item.path) + '" data-type="folder">';
        html += '<span class="icon">📁</span><span class="name">' + escapeHtml(item.name) + '</span></div>';
    });
    files.forEach(item => {
        const icon = item.subtype === 'deal' ? '🤝' : item.subtype === 'comp' ? '🏢' : '📄';
        const cls = item.subtype === 'deal' ? 'deal-item' : item.subtype === 'comp' ? 'comp-item' : 'prod-item';
        html += '<div class="file-item ' + cls + '" data-path="' + escapeHtml(item.path) + '" data-type="file" data-subtype="' + (item.subtype || '') + '">';
        html += '<span class="icon">' + icon + '</span><span class="name">' + escapeHtml(item.name) + '</span></div>';
    });
    if (!folders.length && !files.length) html = '<div class="empty-tab">Empty directory</div>';
    container.innerHTML = html;
    container.querySelectorAll('.file-item').forEach(el => {
        el.addEventListener('click', () => {
            const path = el.dataset.path;
            const type = el.dataset.type;
            if (type === 'folder') loadDirectory(path);
            else if (type === 'file') openFileInEditor(path, el.dataset.subtype);
        });
        el.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            showFileContextMenu(e, el.dataset.path, el.dataset.subtype);
        });
    });
}

// ── Gallery (Card Grid) ──
function setupGalleryEvents() {
    document.getElementById('gallery-grid').addEventListener('click', (e) => {
        const card = e.target.closest('.product-card');
        if (!card) return;
        if (card.dataset.folder) {
            loadDirectory(state.currentDir + '/' + card.dataset.folder);
            return;
        }
        if (card.dataset.compPath) {
            openFileInEditor(card.dataset.compPath, 'comp');
            return;
        }
        if (card.dataset.dealPath) {
            openFileInEditor(card.dataset.dealPath, 'deal');
            return;
        }
        const file = card.dataset.file;
        if (file) openFileInEditor(file, 'prod');
    });
    document.getElementById('gallery-grid').addEventListener('contextmenu', (e) => {
        const card = e.target.closest('.product-card');
        if (!card) {
            e.preventDefault();
            showNewItemContextMenu(e);
            return;
        }
        const file = card.dataset.file;
        const folder = card.dataset.folder;
        const compPath = card.dataset.compPath;
        const dealPath = card.dataset.dealPath;
        e.preventDefault();
        if (file) showFileContextMenu(e, file, 'prod');
        else if (compPath) showFileContextMenu(e, compPath, 'comp');
        else if (dealPath) showFileContextMenu(e, dealPath, 'deal');
        else showNewItemContextMenu(e);
    });
}

async function renderGallery(dir, items) {
    const grid = document.getElementById('gallery-grid');
    const progress = document.getElementById('gallery-progress');
    const progressText = document.getElementById('gallery-progress-text');
    const countEl = document.getElementById('gallery-count');
    state.galleryAbort = true;
    await new Promise(r => setTimeout(r, 10));
    state.galleryAbort = false;

    const folders = items.filter(i => i.type === 'folder');
    const compItems = items.filter(i => i.type === 'file' && i.subtype === 'comp');
    const dealItems = items.filter(i => i.type === 'file' && i.subtype === 'deal');
    const prodItems = items.filter(i => i.type === 'file' && i.subtype === 'prod');

    let cardData = [];
    folders.forEach(f => cardData.push({ kind: 'folder', data: f }));
    compItems.forEach(f => cardData.push({ kind: 'comp', data: f }));
    dealItems.forEach(f => cardData.push({ kind: 'deal', data: f }));
    prodItems.forEach(f => cardData.push({ kind: 'prod', data: f }));

    countEl.textContent = cardData.length + ' items';

    if (cardData.length === 0) {
        grid.innerHTML = '<div class="empty-tab" style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text-muted)">This directory is empty</div>';
        progress.style.display = 'none';
        return;
    }

    let html = '';
    const productFiles = [];
    cardData.forEach((entry) => {
        if (entry.kind === 'folder') {
            const d = entry.data;
            const ci = d.company || {};
            html += '<div class="product-card folder-card" data-folder="' + escapeHtml(d.name) + '">';
            html += '<div class="card-thumb" style="background:var(--bg-surface);display:flex;align-items:center;justify-content:center"><span style="font-size:40px">📁</span></div>';
            html += '<div class="card-body">';
            html += '<div class="card-title">' + escapeHtml(d.name) + '</div>';
            if (ci.name) {
                html += '<div class="card-code" style="font-size:12px;color:var(--accent);font-weight:500">' + escapeHtml(ci.name) + '</div>';
            } else {
                html += '<div class="card-code" style="font-size:12px;color:var(--text-muted)">Folder</div>';
            }
            if (ci.address) {
                html += '<div class="card-no-price" style="font-size:11px;color:var(--text-secondary)">📍 ' + escapeHtml(ci.address.substring(0, 40)) + '</div>';
            }
            html += '</div></div>';
        } else if (entry.kind === 'comp') {
            const ci = entry.data.company || {};
            html += '<div class="product-card comp-card" data-comp-path="' + escapeHtml(entry.data.path) + '">';
            html += '<div class="card-thumb" style="background:linear-gradient(135deg,var(--accent),var(--accent-hover));display:flex;align-items:center;justify-content:center"><span style="font-size:36px">🏢</span></div>';
            html += '<div class="card-body">';
            const compLabel = ci.company_type ? ci.company_type.replace(/_/g, ' ').replace(/\b\w/g, s => s.toUpperCase()) : 'Company';
            html += '<div class="card-title" style="color:var(--accent)">' + escapeHtml(ci.name || '(untitled)') + '</div>';
            html += '<div class="card-code" style="font-size:12px;color:var(--text-secondary);font-weight:500">' + escapeHtml(compLabel) + '</div>';
            if (ci.address) {
                html += '<div class="card-no-price" style="font-size:11px;color:var(--text-secondary)">📍 ' + escapeHtml(ci.address.substring(0, 40)) + '</div>';
            }
            html += '<div class="card-no-price" style="font-size:11px;color:var(--text-muted)">👤 ' + (ci.contactCount || 0) + ' contacts</div>';
            html += '</div></div>';
        } else if (entry.kind === 'deal') {
            const di = entry.data;
            const meta = di.deal_info || {};
            const statusEmoji = { pending: '⏳', confirmed: '✅', shipped: '🚚', completed: '🎉', cancelled: '🚫' }[meta.status] || '⏳';
            const statusColor = { confirmed: 'var(--accent-green)', shipped: 'var(--accent-orange, #d08770)', completed: 'var(--accent-green)', cancelled: 'var(--accent-red)' }[meta.status] || 'var(--text-muted)';
            html += '<div class="product-card deal-card" data-deal-path="' + escapeHtml(di.path) + '">';
            html += '<div class="card-thumb" style="background:var(--bg-surface);display:flex;align-items:center;justify-content:center"><span style="font-size:36px">📋</span></div>';
            html += '<div class="card-body">';
            html += '<div class="card-title">' + escapeHtml(meta.title || di.name.replace(/\.deal$/, '')) + '</div>';
            if (meta.status) html += '<div class="card-code" style="font-size:12px;color:' + statusColor + ';font-weight:500">' + statusEmoji + ' ' + escapeHtml(meta.status) + '</div>';
            if (meta.date) html += '<div class="card-no-price" style="font-size:11px;color:var(--text-secondary)">📅 ' + escapeHtml(meta.date) + '</div>';
            html += '<div class="card-no-price" style="font-size:11px;color:var(--text-muted)">📦 ' + (meta.order_count || 0) + ' items</div>';
            html += '</div></div>';
        } else if (entry.kind === 'prod') {
            productFiles.push(entry.data);
        }
    });

    productFiles.forEach((f) => {
        const name = f.name.replace(/\.prod$/, '');
        html += '<div class="product-card" data-file="' + escapeHtml(f.path) + '">' +
            '<div class="card-thumb"><span class="no-photo">📦</span></div>' +
            '<div class="card-body">' +
            '<div class="card-title">' + escapeHtml(name) + '</div>' +
            '<div class="card-code">loading...</div>' +
            '<div class="card-no-price">—</div>' +
            '</div></div>';
    });

    grid.innerHTML = html;

    if (productFiles.length > 0) {
        progress.style.display = 'flex';
        progressText.textContent = 'Loading products...';
        for (let i = 0; i < productFiles.length; i++) {
            if (state.galleryAbort) break;
            progressText.textContent = 'Loading ' + (i + 1) + '/' + productFiles.length + '...';
            try {
                const product = await api.openProduct(productFiles[i].path);
                if (state.galleryAbort) break;
                updateProductCard(productFiles[i].path, product);
            } catch (_) {}
        }
        progress.style.display = 'none';
    } else {
        progress.style.display = 'none';
    }
}

function updateProductCard(path, product) {
    const escapedFile = CSS.escape(path);
    const card = document.querySelector('.product-card[data-file="' + escapedFile + '"]');
    if (!card) return;
    const thumb = card.querySelector('.card-thumb');
    const titleEl = card.querySelector('.card-title');
    const codeEl = card.querySelector('.card-code');
    const priceEl = card.querySelector('.card-no-price');

    titleEl.textContent = product.title || path.split('/').pop().replace(/\.prod$/, '');
    codeEl.textContent = product.code || '—';

    if (product.photos && product.photos.length > 0) {
        thumb.innerHTML = '<img src="' + product.photos[0] + '" alt="' + escapeHtml(product.title) + '" loading="lazy">';
    } else {
        thumb.innerHTML = '<span class="no-photo">📦</span>';
    }

    if (product.priceCount > 0) {
        priceEl.className = 'card-price';
        priceEl.innerHTML = product.lastPrice !== undefined
            ? product.lastPrice.toFixed(2) + ' <span class="currency">' + escapeHtml(product.lastCurrency || state.settings.currency || 'USD') + '</span>'
            : 'Has prices';
    } else {
        priceEl.className = 'card-no-price';
        priceEl.textContent = '—';
    }
}

// ── List View ──
async function renderListView(dir, items) {
    const container = document.getElementById('list-view');
    const folders = items.filter(i => i.type === 'folder');
    const compItems = items.filter(i => i.type === 'file' && i.subtype === 'comp');
    const dealItems = items.filter(i => i.type === 'file' && i.subtype === 'deal');
    const prodItems = items.filter(i => i.type === 'file' && i.subtype === 'prod');

    let html = '<table class="list-table"><thead><tr>' +
        '<th class="col-icon"></th>' +
        '<th class="col-name">Name</th>' +
        '<th class="col-code">Code</th>' +
        '<th class="col-type">Type</th>' +
        '<th class="col-price">Price</th>' +
        '<th class="col-currency">Currency</th>' +
        '</tr></thead><tbody>';

    // Build flat list: up-folder → folders → comps → deals → prods
    let rows = [];
    if (dir !== '/') rows.push({ kind: 'up', dir: dirname(dir) });
    folders.forEach(f => rows.push({ kind: 'folder', data: f }));
    compItems.forEach(f => rows.push({ kind: 'comp', data: f }));
    dealItems.forEach(f => rows.push({ kind: 'deal', data: f }));
    prodItems.forEach(f => rows.push({ kind: 'prod', data: f }));

    rows.forEach(entry => {
        if (entry.kind === 'up') {
            html += '<tr class="list-row list-folder" data-action="open" data-path="' + escapeHtml(entry.dir) + '">' +
                '<td class="col-icon">📁</td><td class="col-name">..</td><td></td><td></td><td></td><td></td></tr>';
        } else if (entry.kind === 'folder') {
            const d = entry.data;
            const ci = d.company || {};
            const dirPath = state.currentDir + '/' + d.name;
            html += '<tr class="list-row list-folder" data-action="open" data-path="' + escapeHtml(dirPath) + '">' +
                '<td class="col-icon">📁</td>' +
                '<td class="col-name">' + escapeHtml(d.name) + '</td>' +
                '<td class="col-code"></td>' +
                '<td class="col-type">' + (ci.name ? escapeHtml(ci.name) : 'Folder') + '</td>' +
                '<td class="col-price"></td><td class="col-currency"></td></tr>';
        } else if (entry.kind === 'comp') {
            const d = entry.data;
            const ci = d.company || {};
            const label = ci.company_type ? ci.company_type.replace(/_/g, ' ').replace(/\b\w/g, s => s.toUpperCase()) : 'Company';
            html += '<tr class="list-row list-comp" data-action="edit" data-path="' + escapeHtml(d.path) + '" data-subtype="comp">' +
                '<td class="col-icon">🏢</td>' +
                '<td class="col-name">' + escapeHtml(ci.name || d.name) + '</td>' +
                '<td class="col-code"></td>' +
                '<td class="col-type">' + escapeHtml(label) + '</td>' +
                '<td class="col-price"></td><td class="col-currency"></td></tr>';
        } else if (entry.kind === 'deal') {
            const d = entry.data;
            const meta = d.deal_info || {};
            const statusEmoji = { pending: '⏳', confirmed: '✅', shipped: '🚚', completed: '🎉', cancelled: '🚫' }[meta.status] || '⏳';
            html += '<tr class="list-row list-deal" data-action="edit" data-path="' + escapeHtml(d.path) + '" data-subtype="deal">' +
                '<td class="col-icon">📋</td>' +
                '<td class="col-name">' + escapeHtml(meta.title || d.name.replace(/\.deal$/, '')) + '</td>' +
                '<td class="col-code"></td>' +
                '<td class="col-type">' + statusEmoji + ' ' + (meta.status || 'deal') + '</td>' +
                '<td class="col-price"></td><td class="col-currency"></td></tr>';
        } else if (entry.kind === 'prod') {
            const d = entry.data;
            const name = d.name.replace(/\.prod$/, '');
            html += '<tr class="list-row list-prod" data-action="edit" data-path="' + escapeHtml(d.path) + '" data-subtype="prod">' +
                '<td class="col-icon">📄</td>' +
                '<td class="col-name">' + escapeHtml(name) + '</td>' +
                '<td class="col-code">loading...</td>' +
                '<td class="col-type">Product</td>' +
                '<td class="col-price">—</td><td class="col-currency"></td></tr>';
        }
    });

    html += '</tbody></table>';
    container.innerHTML = html;

    // Event delegation: handle clicks on list-view rows
    container.addEventListener('click', function(e) {
        const row = e.target.closest('.list-row');
        if (!row) return;
        const action = row.dataset.action;
        const path = row.dataset.path;
        if (action === 'open') {
            loadDirectory(path);
        } else if (action === 'edit') {
            openFileInEditor(path, row.dataset.subtype);
        }
    });
    container.addEventListener('contextmenu', function(e) {
        const row = e.target.closest('.list-row');
        if (!row) return;
        e.preventDefault();
        const file = row.dataset.path;
        const subtype = row.dataset.subtype;
        if (file && subtype) showFileContextMenu(e, file, subtype);
        else showNewItemContextMenu(e);
    });

    // Load product details progressively
    const progress = document.getElementById('gallery-progress');
    const progressText = document.getElementById('gallery-progress-text');
    if (prodItems.length > 0) {
        progress.style.display = 'flex';
        progressText.textContent = 'Loading products...';
        for (let i = 0; i < prodItems.length; i++) {
            if (state.galleryAbort) break;
            progressText.textContent = 'Loading ' + (i + 1) + '/' + prodItems.length + '...';
            try {
                const product = await api.openProduct(prodItems[i].path);
                if (state.galleryAbort) break;
                updateListRow(prodItems[i].path, product);
            } catch (_) {}
        }
        progress.style.display = 'none';
    }
}

function updateListRow(path, product) {
    const escaped = CSS.escape(path);
    const row = document.querySelector('.list-row[data-path="' + escaped + '"]');
    if (!row) return;
    row.querySelector('.col-name').textContent = product.title || path.split('/').pop().replace(/\.prod$/, '');
    row.querySelector('.col-code').textContent = product.code || '—';
    const priceCell = row.querySelector('.col-price');
    const currencyCell = row.querySelector('.col-currency');
    if (product.priceCount > 0 && product.lastPrice !== undefined) {
        priceCell.textContent = product.lastPrice.toFixed(2);
        currencyCell.textContent = product.lastCurrency || state.settings.currency || 'USD';
    } else {
        priceCell.textContent = '—';
        currencyCell.textContent = '';
    }
}

// ── Breadcrumb ──
function renderBreadcrumb(dir) {
    const container = document.getElementById('breadcrumb') || createBreadcrumb();
    const parts = dir.split('/').filter(Boolean);
    let cum = '';
    let html = '<div class="crumb" data-path="/">🏠</div><span class="crumb-sep">/</span>';
    parts.forEach((p, i) => {
        cum += '/' + p;
        if (i === parts.length - 1) {
            html += '<span class="crumb-current">' + escapeHtml(p) + '</span>';
        } else {
            html += '<div class="crumb" data-path="' + escapeHtml(cum) + '">' + escapeHtml(p) + '</div><span class="crumb-sep">/</span>';
        }
    });
    container.innerHTML = html;
    container.querySelectorAll('.crumb').forEach(el => {
        el.addEventListener('click', () => loadDirectory(el.dataset.path));
    });
}
function createBreadcrumb() {
    const el = document.createElement('div');
    el.id = 'breadcrumb';
    const browserView = document.getElementById('browser-view');
    browserView.insertBefore(el, browserView.firstChild);
    return el;
}

// ── Open file in editor ──
function openFileInEditor(path, subtype) {
    if (subtype === 'prod') callNative('openProductEditor', path);
    else if (subtype === 'comp') callNative('openCompanyEditor', path);
    else if (subtype === 'deal') callNative('openDealEditor', path);
    else api.openSystem(path).catch(showError);
}

// ── Menu Bar ──
function setupMenuBar() {
    // Toggle menus on click
    document.querySelectorAll('.menu-item').forEach(el => {
        el.addEventListener('click', (e) => {
            document.querySelectorAll('.menu-item.active').forEach(m => { if (m !== el) m.classList.remove('active'); });
            el.classList.toggle('active');
            e.stopPropagation();
        });
    });
    // Close menus when clicking outside
    document.addEventListener('click', () => {
        document.querySelectorAll('.menu-item.active').forEach(m => m.classList.remove('active'));
    });
    // Dropdown items: handle action + close parent menu
    document.querySelectorAll('.menu-dropdown-item').forEach(el => {
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            // Close the parent menu
            const menuItem = el.closest('.menu-item');
            if (menuItem) menuItem.classList.remove('active');
            handleMenuAction(el.dataset.action);
        });
    });
    // Delegated toolbar/modal button clicks
    document.getElementById('app').addEventListener('click', (e) => {
        const el = e.target.closest('[data-action]');
        if (!el) return;
        // Skip dropdown items (they're handled above)
        if (el.closest('.menu-dropdown')) return;
        const a = el.dataset.action;
        if (['go-up','refresh','new-folder','change-dir','browse-startup-dir','browse-settings-dir',
             'set-startup-dir','skip-startup','cancel-createdir','do-create-dir',
             'cancel-settings','save-settings','close-about','toggle-view'].includes(a)) {
            e.stopPropagation();
            handleMenuAction(a);
        }
    });
}

async function handleMenuAction(action) {
    switch (action) {
        case 'new-folder': showCreateDirDialog(); break;
        case 'settings': showSettingsDialog(); break;
        case 'exit': window.close(); break;
        case 'new-product': await createNewItem('product'); break;
        case 'new-company': await createNewItem('company'); break;
        case 'new-deal': await createNewItem('deal'); break;
        case 'about': showAboutDialog(); break;
        case 'change-dir':
            try { const p = await callNative('pickDirectory'); if (p) loadDirectory(p); }
            catch (e) { showError(e); } break;
        case 'go-up': if (state.currentDir && state.currentDir !== '/') loadDirectory(dirname(state.currentDir)); break;
        case 'refresh': if (state.currentDir) loadDirectory(state.currentDir); break;
        case 'browse-startup-dir': case 'browse-settings-dir':
            try {
                const p = await callNative('pickDirectory');
                if (p) document.getElementById(action === 'browse-startup-dir' ? 'startup-dir-input' : 'settings-dir').value = p;
            } catch (e) { showError(e); } break;
        case 'set-startup-dir': {
            const d = document.getElementById('startup-dir-input').value.trim();
            if (d) {
                state.settings.defaultDir = d;
                try {
                    await api.saveSettings(state.settings);
                    showMsg('Default directory saved', 'success');
                } catch (e) {
                    showError(e);
                }
                document.getElementById('startup-overlay').classList.remove('show');
                document.getElementById('startup-overlay').style.display = 'none';
                loadDirectory(d);
            }
            break;
        }
        case 'skip-startup':
            document.getElementById('startup-overlay').classList.remove('show');
            document.getElementById('startup-overlay').style.display = 'none';
            break;
        case 'cancel-createdir':
            document.getElementById('createdir-overlay').classList.remove('show');
            document.getElementById('createdir-overlay').style.display = 'none';
            break;
        case 'do-create-dir': {
            const n = document.getElementById('createdir-name-input').value.trim();
            if (n && state.currentDir) {
                try {
                    await api.createSubdir(state.currentDir, n);
                    document.getElementById('createdir-overlay').classList.remove('show');
                    document.getElementById('createdir-overlay').style.display = 'none';
                    document.getElementById('createdir-name-input').value = '';
                    loadDirectory(state.currentDir);
                } catch (e) { showError(e); }
            } break;
        }
        case 'cancel-settings':
            document.getElementById('settings-overlay').classList.remove('show');
            document.getElementById('settings-overlay').style.display = 'none';
            break;
        case 'save-settings': {
            state.settings.defaultDir = document.getElementById('settings-dir').value.trim();
            state.settings.company = document.getElementById('settings-company').value.trim();
            state.settings.currency = document.getElementById('settings-currency').value.trim().toUpperCase();
            try {
                await api.saveSettings(state.settings);
                document.getElementById('settings-overlay').classList.remove('show');
                document.getElementById('settings-overlay').style.display = 'none';
                showMsg('Settings saved', 'success');
            } catch (e) {
                showError(e);
            } break;
        }
        case 'close-about':
            document.getElementById('about-overlay').classList.remove('show');
            document.getElementById('about-overlay').style.display = 'none';
            break;
        case 'toggle-view': {
            state.viewMode = state.viewMode === 'grid' ? 'list' : 'grid';
            document.getElementById('view-toggle').textContent = state.viewMode === 'grid' ? '☰' : '⊞';
            if (state.currentDir) {
                if (state.viewMode === 'grid') {
                    document.getElementById('list-view').style.display = 'none';
                    document.getElementById('gallery-grid').style.display = 'grid';
                    renderGallery(state.currentDir, state.items);
                } else {
                    document.getElementById('gallery-grid').style.display = 'none';
                    document.getElementById('list-view').style.display = 'block';
                    renderListView(state.currentDir, state.items);
                }
            }
            break;
        }
    }
}

async function createNewItem(type) {
    if (!state.currentDir) { showMsg('Please open a directory first', 'error'); return; }
    try {
        if (type === 'product') await callNative('openNewProductEditor', state.currentDir);
        else if (type === 'company') await callNative('openNewCompanyEditor', state.currentDir);
        else if (type === 'deal') await callNative('openNewDealEditor', state.currentDir);
        setTimeout(() => loadDirectory(state.currentDir), 500);
    } catch (e) { showError(e); }
}

// ── Context Menus ──
function setupContextMenu() {
    document.addEventListener('click', () => document.querySelectorAll('.context-menu').forEach(m => m.style.display = 'none'));
    document.getElementById('file-list').addEventListener('contextmenu', (e) => {
        if (e.target === document.getElementById('file-list') || e.target.closest('.empty-tab')) { e.preventDefault(); showNewItemContextMenu(e); }
    });
    document.getElementById('browser-grid').addEventListener('contextmenu', (e) => {
        if (e.target === document.getElementById('browser-grid') || e.target.closest('.empty-tab')) { e.preventDefault(); showNewItemContextMenu(e); }
    });
}
function showNewItemContextMenu(e) {
    hideAllContextMenus();
    const m = document.getElementById('context-menu');
    m.style.left = e.clientX + 'px'; m.style.top = e.clientY + 'px'; m.style.display = 'block';
}
function showFileContextMenu(e, path, subtype) {
    hideAllContextMenus();
    const m = document.getElementById('context-menu-file');
    m.dataset.path = path; m.dataset.subtype = subtype || '';
    m.style.left = e.clientX + 'px'; m.style.top = e.clientY + 'px'; m.style.display = 'block';
}
function hideAllContextMenus() { document.querySelectorAll('.context-menu').forEach(m => m.style.display = 'none'); }

document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('#context-menu .context-menu-item').forEach(el => {
        el.addEventListener('click', async () => {
            const a = el.dataset.action; hideAllContextMenus();
            if (a === 'new-folder') showCreateDirDialog();
            else if (a === 'new-product') await createNewItem('product');
            else if (a === 'new-company') await createNewItem('company');
            else if (a === 'new-deal') await createNewItem('deal');
        });
    });
    document.querySelectorAll('#context-menu-file .context-menu-item').forEach(el => {
        el.addEventListener('click', async () => {
            const a = el.dataset.action;
            const m = document.getElementById('context-menu-file');
            const path = m.dataset.path; const subtype = m.dataset.subtype;
            hideAllContextMenus();
            if (a === 'file-open') openFileInEditor(path, subtype);
            else if (a === 'file-delete') {
                if (confirm('Delete ' + basename(path) + '?')) {
                    try { await api.deleteFiles([path]); if (state.currentDir) loadDirectory(state.currentDir); showMsg('Deleted', 'info'); }
                    catch (e) { showError(e); }
                }
            }
        });
    });
});

// ── Dialogs ──
function setupModals() {
    document.getElementById('createdir-name-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') handleMenuAction('do-create-dir'); });
    document.getElementById('settings-dir').addEventListener('keydown', (e) => { if (e.key === 'Enter') handleMenuAction('save-settings'); });
}
function showCreateDirDialog() {
    const o = document.getElementById('createdir-overlay');
    o.style.display = 'flex'; o.classList.add('show');
    document.getElementById('createdir-name-input').value = '';
    setTimeout(() => document.getElementById('createdir-name-input').focus(), 100);
}
function showSettingsDialog() {
    const o = document.getElementById('settings-overlay');
    document.getElementById('settings-dir').value = state.settings.defaultDir || '';
    document.getElementById('settings-company').value = state.settings.company || '';
    document.getElementById('settings-currency').value = state.settings.currency || 'USD';
    o.style.display = 'flex'; o.classList.add('show');
}
function showAboutDialog() {
    const o = document.getElementById('about-overlay');
    o.style.display = 'flex'; o.classList.add('show');
}

// ── Startup dialog (called after settings are loaded) ──
function checkStartupDialog() {
    if (!state.settings.defaultDir) {
        const o = document.getElementById('startup-overlay');
        if (o && !state.currentDir) {
            o.style.display = 'flex'; o.classList.add('show');
            document.getElementById('startup-dir-input').value = state.settings.defaultDir || '';
        }
    }
}
