/* Company Management Desktop — File Browser UI */
/* global api, callNative, escapeHtml, showMsg */

// ── State ──
const state = {
    currentDir: null,
    items: [],
    settings: { defaultDir: '', currency: 'USD', company: '' },
};

// ── Init ──
document.addEventListener('DOMContentLoaded', async () => {
    setupMenuBar();
    setupContextMenu();
    setupSidebar();
    setupModals();
    loadSettings().then(() => {
        if (state.settings.defaultDir) {
            loadDirectory(state.settings.defaultDir);
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
async function loadSettings() {
    try {
        state.settings = await api.getSettings();
    } catch (e) {
        state.settings = { defaultDir: '', currency: 'USD', company: '' };
    }
}

// ── Directory Loading ──
async function loadDirectory(dir) {
    state.currentDir = dir;
    try {
        const items = await api.listItems(dir);
        state.items = items;
        renderSidebar(dir, items);
        renderBrowser(dir, items);
        renderBreadcrumb(dir);
        updateSidebarHeader(dir);
        // Show browser view, hide empty state
        document.getElementById('empty-state').style.display = 'none';
        document.getElementById('browser-view').style.display = 'flex';

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
    // Parent dir link
    if (dir !== '/') {
        html += '<div class="file-item" data-path="' + escapeHtml(dirname(dir)) + '" data-type="folder">';
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
    if (!folders.length && !files.length) {
        html = '<div class="empty-tab">Empty directory</div>';
    }
    container.innerHTML = html;

    // Wire click events for sidebar items
    container.querySelectorAll('.file-item').forEach(el => {
        el.addEventListener('click', () => {
            const path = el.dataset.path;
            const type = el.dataset.type;
            if (type === 'folder') {
                loadDirectory(path);
            } else if (type === 'file') {
                openFileInEditor(path, el.dataset.subtype);
            }
        });
        // Right-click context menu on items
        el.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            showFileContextMenu(e, el.dataset.path, el.dataset.subtype);
        });
    });
}

// ── Browser Grid ──
function renderBrowser(dir, items) {
    const container = document.getElementById('browser-grid');
    const folders = items.filter(i => i.type === 'folder');
    const files = items.filter(i => i.type === 'file');

    let html = '';
    // Parent dir
    if (dir !== '/') {
        html += '<div class="file-item folder-item" data-path="' + escapeHtml(dirname(dir)) + '" data-type="folder">';
        html += '<span class="icon">📁</span><span class="name">..</span></div>';
    }
    folders.forEach(item => {
        let extra = '';
        if (item.company && item.company.name) {
            extra = '<span class="badge">' + escapeHtml(item.company.name) + '</span>';
        }
        html += '<div class="file-item folder-item" data-path="' + escapeHtml(item.path) + '" data-type="folder">';
        html += '<span class="icon">📁</span><span class="name">' + escapeHtml(item.name) + '</span>' + extra + '</div>';
    });
    files.forEach(item => {
        const icon = item.subtype === 'deal' ? '🤝' : item.subtype === 'comp' ? '🏢' : '📄';
        const cls = item.subtype === 'deal' ? 'deal-item' : item.subtype === 'comp' ? 'comp-item' : 'prod-item';
        let extra = '';
        html += '<div class="file-item ' + cls + '" data-path="' + escapeHtml(item.path) + '" data-type="file" data-subtype="' + (item.subtype || '') + '">';
        html += '<span class="icon">' + icon + '</span><span class="name">' + escapeHtml(item.name) + '</span>' + extra + '</div>';
    });
    if (!folders.length && !files.length) {
        html = '<div class="empty-tab" style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text-muted)">Empty directory</div>';
    }
    container.innerHTML = html;

    // Wire clicks
    container.querySelectorAll('.file-item').forEach(el => {
        el.addEventListener('click', () => {
            const path = el.dataset.path;
            const type = el.dataset.type;
            if (type === 'folder') {
                loadDirectory(path);
            } else if (type === 'file') {
                openFileInEditor(path, el.dataset.subtype);
            }
        });
        el.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            showFileContextMenu(e, el.dataset.path, el.dataset.subtype);
        });
    });

    // Empty area right-click → folder context menu
    container.addEventListener('contextmenu', (e) => {
        if (e.target === container || e.target.classList.contains('empty-tab')) {
            e.preventDefault();
            showNewItemContextMenu(e);
        }
    });
}

// ── Breadcrumb ──
function renderBreadcrumb(dir) {
    const container = document.getElementById('breadcrumb') || createBreadcrumb();
    const parts = dir.split('/').filter(Boolean);
    let cum = '';
    let html = '<div class="crumb" data-path="/">🏠</div><span class="crumb-sep">/</span>';
    parts.forEach((p, i) => {
        cum += '/' + p;
        const isLast = i === parts.length - 1;
        if (isLast) {
            html += '<span class="crumb-current">' + escapeHtml(p) + '</span>';
        } else {
            html += '<div class="crumb" data-path="' + escapeHtml(cum) + '">' + escapeHtml(p) + '</div>';
            html += '<span class="crumb-sep">/</span>';
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

// ── Open file in editor (new window) ──
function openFileInEditor(path, subtype) {
    if (subtype === 'prod') {
        callNative('openProductEditor', path);
    } else if (subtype === 'comp') {
        callNative('openCompanyEditor', path);
    } else if (subtype === 'deal') {
        callNative('openDealEditor', path);
    } else {
        // Unknown type, try system open
        api.openSystem(path).catch(showError);
    }
}

// ── Menu Bar ──
function setupMenuBar() {
    // Menu item click to toggle dropdown
    document.querySelectorAll('.menu-item').forEach(el => {
        el.addEventListener('click', (e) => {
            // Close other menus
            document.querySelectorAll('.menu-item.active').forEach(m => {
                if (m !== el) m.classList.remove('active');
            });
            el.classList.toggle('active');
            e.stopPropagation();
        });
    });

    // Close menus on click outside
    document.addEventListener('click', () => {
        document.querySelectorAll('.menu-item.active').forEach(m => m.classList.remove('active'));
    });

    // Menu actions
    document.querySelectorAll('.menu-dropdown-item').forEach(el => {
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            const action = el.dataset.action;
            handleMenuAction(action);
        });
    });

    // Delegate all [data-action] clicks on the whole app container
    document.getElementById('app').addEventListener('click', (e) => {
        const el = e.target.closest('[data-action]');
        if (!el) return;
        const action = el.dataset.action;
        const allowed = ['go-up', 'refresh', 'new-folder', 'change-dir',
                         'browse-startup-dir', 'browse-settings-dir',
                         'set-startup-dir', 'skip-startup',
                         'cancel-createdir', 'do-create-dir',
                         'cancel-settings', 'save-settings',
                         'close-about'];
        if (allowed.includes(action)) {
            e.stopPropagation();
            handleMenuAction(action);
        }
    });
}

async function handleMenuAction(action) {
    switch (action) {
        case 'new-folder':
            showCreateDirDialog();
            break;
        case 'settings':
            showSettingsDialog();
            break;
        case 'exit':
            window.close();
            break;
        case 'new-product':
            await createNewItem('product');
            break;
        case 'new-company':
            await createNewItem('company');
            break;
        case 'new-deal':
            await createNewItem('deal');
            break;
        case 'about':
            showAboutDialog();
            break;
        case 'change-dir':
            try {
                const path = await callNative('pickDirectory');
                if (path) loadDirectory(path);
            } catch (e) { showError(e); }
            break;
        case 'go-up':
            if (state.currentDir && state.currentDir !== '/') {
                loadDirectory(dirname(state.currentDir));
            }
            break;
        case 'refresh':
            if (state.currentDir) loadDirectory(state.currentDir);
            break;
        case 'browse-startup-dir':
        case 'browse-settings-dir': {
            try {
                const path = await callNative('pickDirectory');
                if (path) {
                    const inputId = action === 'browse-startup-dir' ? 'startup-dir-input' : 'settings-dir';
                    document.getElementById(inputId).value = path;
                }
            } catch (e) { showError(e); }
            break;
        }
        case 'set-startup-dir': {
            const dir = document.getElementById('startup-dir-input').value.trim();
            if (dir) {
                state.settings.defaultDir = dir;
                await api.saveSettings(state.settings);
                document.getElementById('startup-overlay').classList.remove('show');
                document.getElementById('startup-overlay').style.display = 'none';
                loadDirectory(dir);
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
            const name = document.getElementById('createdir-name-input').value.trim();
            if (name && state.currentDir) {
                try {
                    await api.createSubdir(state.currentDir, name);
                    document.getElementById('createdir-overlay').classList.remove('show');
                    document.getElementById('createdir-overlay').style.display = 'none';
                    document.getElementById('createdir-name-input').value = '';
                    loadDirectory(state.currentDir);
                } catch (e) { showError(e); }
            }
            break;
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
            } catch (e) { showError(e); }
            break;
        }
        case 'close-about':
            document.getElementById('about-overlay').classList.remove('show');
            document.getElementById('about-overlay').style.display = 'none';
            break;
    }
}

// ── Create New Items ──
async function createNewItem(type) {
    if (!state.currentDir) {
        showMsg('Please open a directory first', 'error');
        return;
    }
    try {
        if (type === 'product') {
            await callNative('openNewProductEditor', state.currentDir);
        } else if (type === 'company') {
            await callNative('openNewCompanyEditor', state.currentDir);
        } else if (type === 'deal') {
            await callNative('openNewDealEditor', state.currentDir);
        }
        // Refresh to show new file
        setTimeout(() => loadDirectory(state.currentDir), 500);
    } catch (e) {
        showError(e);
    }
}

// ── Context Menus ──
function setupContextMenu() {
    document.addEventListener('click', () => {
        document.querySelectorAll('.context-menu').forEach(m => m.style.display = 'none');
    });
    // Empty area in file list
    document.getElementById('file-list').addEventListener('contextmenu', (e) => {
        if (e.target === document.getElementById('file-list') || e.target.closest('.empty-tab')) {
            e.preventDefault();
            showNewItemContextMenu(e);
        }
    });
    // Browser grid empty area
    document.getElementById('browser-grid').addEventListener('contextmenu', (e) => {
        if (e.target === document.getElementById('browser-grid') || e.target.closest('.empty-tab')) {
            e.preventDefault();
            showNewItemContextMenu(e);
        }
    });
}

function showNewItemContextMenu(e) {
    hideAllContextMenus();
    const menu = document.getElementById('context-menu');
    menu.style.left = e.clientX + 'px';
    menu.style.top = e.clientY + 'px';
    menu.style.display = 'block';
}

function showFileContextMenu(e, path, subtype) {
    hideAllContextMenus();
    const menu = document.getElementById('context-menu-file');
    menu.dataset.path = path;
    menu.dataset.subtype = subtype || '';
    menu.style.left = e.clientX + 'px';
    menu.style.top = e.clientY + 'px';
    menu.style.display = 'block';
}

function hideAllContextMenus() {
    document.querySelectorAll('.context-menu').forEach(m => m.style.display = 'none');
}

// Wire context menu items
document.addEventListener('DOMContentLoaded', () => {
    // Folder area context menu
    document.querySelectorAll('#context-menu .context-menu-item').forEach(el => {
        el.addEventListener('click', async () => {
            const action = el.dataset.action;
            hideAllContextMenus();
            if (action === 'new-folder') showCreateDirDialog();
            else if (action === 'new-product') await createNewItem('product');
            else if (action === 'new-company') await createNewItem('company');
            else if (action === 'new-deal') await createNewItem('deal');
        });
    });

    // File context menu
    document.querySelectorAll('#context-menu-file .context-menu-item').forEach(el => {
        el.addEventListener('click', async () => {
            const action = el.dataset.action;
            const menu = document.getElementById('context-menu-file');
            const path = menu.dataset.path;
            const subtype = menu.dataset.subtype;
            hideAllContextMenus();
            if (action === 'file-open') {
                openFileInEditor(path, subtype);
            } else if (action === 'file-delete') {
                if (confirm('Delete ' + basename(path) + '?')) {
                    try {
                        await api.deleteFiles([path]);
                        if (state.currentDir) loadDirectory(state.currentDir);
                        showMsg('Deleted', 'info');
                    } catch (e) { showError(e); }
                }
            }
        });
    });
});

// ── Dialogs ──
function setupModals() {
    // Enter key for create dir dialog
    document.getElementById('createdir-name-input').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleMenuAction('do-create-dir');
    });
    // Enter key for settings dir
    document.getElementById('settings-dir').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleMenuAction('save-settings');
    });
}

function showCreateDirDialog() {
    const overlay = document.getElementById('createdir-overlay');
    overlay.style.display = 'flex';
    overlay.classList.add('show');
    document.getElementById('createdir-name-input').value = '';
    setTimeout(() => document.getElementById('createdir-name-input').focus(), 100);
}

function showSettingsDialog() {
    const overlay = document.getElementById('settings-overlay');
    document.getElementById('settings-dir').value = state.settings.defaultDir || '';
    document.getElementById('settings-company').value = state.settings.company || '';
    document.getElementById('settings-currency').value = state.settings.currency || 'USD';
    overlay.style.display = 'flex';
    overlay.classList.add('show');
}

function showAboutDialog() {
    const overlay = document.getElementById('about-overlay');
    overlay.style.display = 'flex';
    overlay.classList.add('show');
}

// ── Startup dialog ──
// Show startup if no default dir
if (!state.settings.defaultDir) {
    setTimeout(() => {
        const overlay = document.getElementById('startup-overlay');
        if (overlay && !state.currentDir) {
            overlay.style.display = 'flex';
            overlay.classList.add('show');
            // Pre-fill with home dir
            document.getElementById('startup-dir-input').value =
                state.settings.defaultDir || '';
        }
    }, 200);
}
