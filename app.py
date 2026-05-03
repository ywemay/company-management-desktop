#!/usr/bin/env python3
"""Company Management Desktop — PyWebView desktop application with inline editors.

A unified file browser/editor for .prod, .comp, and .deal files.
Features menu bar, right-click context menu, and inline editors.
"""

import json
import os
import random
import sys
import threading
import traceback


# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
def log(msg):
    print(f"[company-management-desktop] {msg}", file=sys.stderr, flush=True)


def log_error(msg):
    print(f"[company-management-desktop ERROR] {msg}", file=sys.stderr, flush=True)
    traceback.print_exc(file=sys.stderr)


import webview
from bottle import Bottle, response, request, static_file, run as bottle_run

import prodlib.store as store
from prodlib.core import Product
from prodlib.company import Company, Contact

# ---------------------------------------------------------------------------
# Bottle HTTP API
# ---------------------------------------------------------------------------
bottle_app = Bottle()

_api_port = 18000
FRONTEND_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "frontend")
SETTINGS_DIR = os.path.join(os.path.expanduser("~"), ".config", "company-management-desktop")
SETTINGS_PATH = os.path.join(SETTINGS_DIR, "settings.json")


def set_api_port(p):
    global _api_port
    _api_port = p


def json_ok(data):
    response.content_type = "application/json"
    return json.dumps({"ok": True, "data": data})


def json_err(msg, status=400):
    response.status = status
    response.content_type = "application/json"
    return json.dumps({"error": msg})


# ---------------------------------------------------------------------------
# CORS
# ---------------------------------------------------------------------------
@bottle_app.hook('after_request')
def enable_cors():
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type'


@bottle_app.route('/api/<:re:.*>', method='OPTIONS')
def handle_options():
    return


# ---------------------------------------------------------------------------
# Settings (persist to ~/.config/company-management-desktop/settings.json)
# ---------------------------------------------------------------------------
def _load_settings_file():
    if os.path.exists(SETTINGS_PATH):
        try:
            with open(SETTINGS_PATH, "r") as f:
                return json.load(f)
        except (json.JSONDecodeError, OSError):
            return {}
    return {}


def _save_settings_file(data):
    os.makedirs(SETTINGS_DIR, exist_ok=True)
    with open(SETTINGS_PATH, "w") as f:
        json.dump(data, f, indent=2)


@bottle_app.get("/api/settings")
def api_get_settings():
    s = _load_settings_file()
    return json_ok({
        "defaultDir": s.get("defaultDir", ""),
        "currency": s.get("currency", "USD"),
        "company": s.get("company", ""),
    })


@bottle_app.post("/api/settings")
def api_save_settings():
    try:
        data = request.json
    except Exception:
        return json_err("invalid JSON body")
    if not data:
        return json_err("no data")
    existing = _load_settings_file()
    for k in ("defaultDir", "currency", "company"):
        if k in data:
            existing[k] = data[k]
    _save_settings_file(existing)
    return json_ok(None)


# ---------------------------------------------------------------------------
# Static files
# ---------------------------------------------------------------------------
@bottle_app.route("/")
def serve_index():
    with open(os.path.join(FRONTEND_DIR, "index.html"), "r") as f:
        html = f.read()
    settings = _load_settings_file()
    settings_json = json.dumps({
        "defaultDir": settings.get("defaultDir", ""),
        "currency": settings.get("currency", "USD"),
        "company": settings.get("company", ""),
    })
    inject = (
        f'<script>window.API_PORT = {_api_port};</script>\n'
        f'<script>window.__INITIAL_SETTINGS__ = {settings_json};</script>\n'
        f'<script src="src/app.js"></script>'
    )
    html = html.replace('<script src="src/app.js"></script>', inject)
    response.content_type = "text/html"
    return html


@bottle_app.route("/src/<filename:path>")
def serve_static(filename):
    resp = static_file(filename, root=os.path.join(FRONTEND_DIR, "src"))
    if hasattr(resp, 'set_header'):
        resp.set_header("Cache-Control", "no-cache, no-store, must-revalidate")
        resp.set_header("Pragma", "no-cache")
        resp.set_header("Expires", "0")
    return resp


# ---------------------------------------------------------------------------
# Directory / Navigation
# ---------------------------------------------------------------------------
@bottle_app.post("/api/list-products")
def api_list_products():
    body = request.json or {}
    return json_ok(store.list_products(body.get("dir", "")))


@bottle_app.post("/api/list-subdirs")
def api_list_subdirs():
    body = request.json or {}
    return json_ok(store.list_subdirs(body.get("dir", "")))


@bottle_app.post("/api/list-items")
def api_list_items():
    body = request.json or {}
    return json_ok(store.list_items(body.get("dir", "")))


@bottle_app.post("/api/search")
def api_search():
    body = request.json or {}
    dir_path = body.get("dir", "")
    query = body.get("query", "").strip()
    if not query:
        return json_ok(store.list_items(dir_path))
    if not dir_path:
        return json_err("dir is required")
    items = store.list_items(dir_path)
    q = query.lower()
    results = []
    for item in items:
        name_match = q in item.get("name", "").lower()
        # For folders, include if name matches
        if item["type"] == "folder":
            if name_match:
                results.append(item)
            continue
        # For files, try name match
        if name_match:
            results.append(item)
            continue
        # For .prod files, try loading product data to search code/title
        if item.get("subtype") == "prod":
            try:
                prod = store.open_product(item["path"])
                if q in prod.get("code", "").lower() or q in prod.get("title", "").lower():
                    item["_product"] = prod
                    results.append(item)
            except Exception:
                pass
    return json_ok(results)


@bottle_app.post("/api/create-subdir")
def api_create_subdir():
    body = request.json or {}
    parent = body.get("dir", "")
    name = body.get("name", "")
    if not parent or not name:
        return json_err("dir and name are required")
    try:
        result = store.create_subdir(parent, name)
        return json_ok(result)
    except OSError as e:
        return json_err(str(e))


# ---------------------------------------------------------------------------
# Products CRUD
# ---------------------------------------------------------------------------
@bottle_app.post("/api/open")
def api_open_product():
    body = request.json or {}
    path = body.get("path", "")
    if not path:
        return json_err("path is required")
    try:
        return json_ok(store.open_product(path))
    except (ValueError, OSError) as e:
        return json_err(str(e))


@bottle_app.post("/api/create")
def api_create_product():
    body = request.json or {}
    path = body.get("path", "")
    title = body.get("title", "")
    code = body.get("code", "")
    description = body.get("description", "")
    if not path:
        return json_err("path is required")
    try:
        return json_ok(store.create_product(path, title, code, description))
    except (ValueError, OSError) as e:
        return json_err(str(e))


@bottle_app.post("/api/add-price")
def api_add_price():
    body = request.json or {}
    path = body.get("path")
    if not path:
        return json_err("path is required")
    try:
        store.add_price(path, body.get("currency", "USD"),
                        body.get("variation", ""), float(body.get("price", 0)))
        return json_ok(None)
    except (ValueError, OSError) as e:
        return json_err(str(e))


@bottle_app.post("/api/add-photo")
def api_add_photo():
    body = request.json or {}
    path = body.get("path")
    photo_path = body.get("photoPath")
    if not path or not photo_path:
        return json_err("path and photoPath are required")
    try:
        store.add_photo(path, photo_path)
        return json_ok(None)
    except (ValueError, OSError) as e:
        return json_err(str(e))


@bottle_app.post("/api/upload-photos")
def api_upload_photos():
    path = request.forms.get("path")
    if not path:
        return json_err("path is required")
    photos = request.files.getall("photos") or []
    if not photos:
        return json_err("no photos uploaded")
    try:
        for photo in photos:
            data = photo.file.read()
            p = Product.open(path)
            p.add_photo(data)
            p.save(path)
        return json_ok(None)
    except (ValueError, OSError) as e:
        return json_err(str(e))


@bottle_app.post("/api/remove-photo")
def api_remove_photo():
    body = request.json or {}
    path = body.get("path")
    index = body.get("index")
    if path is None or index is None:
        return json_err("path and index are required")
    try:
        store.remove_photo(path, int(index))
        return json_ok(None)
    except (ValueError, OSError, IndexError) as e:
        return json_err(str(e))


@bottle_app.post("/api/price/edit")
def api_price_edit():
    body = request.json or {}
    path = body.get("path", "")
    index = body.get("index", -1)
    if not path or index < 0:
        return json_err("path and index are required")
    try:
        store.edit_price(path, index, body.get("price", None), body.get("currency", None))
        return json_ok(store.get_price_history(path))
    except Exception as e:
        return json_err(str(e))


@bottle_app.post("/api/price/delete")
def api_price_delete():
    body = request.json or {}
    path = body.get("path", "")
    index = body.get("index", -1)
    if not path or index < 0:
        return json_err("path and index are required")
    try:
        store.delete_price(path, index)
        return json_ok(store.get_price_history(path))
    except Exception as e:
        return json_err(str(e))


@bottle_app.post("/api/photo/export")
def api_photo_export():
    body = request.json or {}
    path = body.get("path", "")
    index = body.get("index", -1)
    if not path or index < 0:
        return json_err("path and index are required")
    try:
        result = store.export_photo(path, index)
        return json_ok(result)
    except Exception as e:
        return json_err(str(e))


@bottle_app.post("/api/photo/move")
def api_photo_move():
    body = request.json or {}
    path = body.get("path", "")
    index = body.get("index", -1)
    direction = body.get("direction", 0)
    if not path or index < 0 or direction == 0:
        return json_err("path, index, and direction are required")
    try:
        store.move_photo(path, index, direction)
        return json_ok(store.open_product(path))
    except Exception as e:
        return json_err(str(e))


@bottle_app.post("/api/save")
def api_save_product():
    body = request.json or {}
    path = body.get("path", "")
    if not path:
        return json_err("path is required")
    try:
        result = store.save_product(path, body.get("product", {}))
        result["filepath"] = path
        return json_ok(result)
    except Exception as e:
        return json_err(str(e))


@bottle_app.post("/api/delete-products")
def api_delete_products():
    body = request.json or {}
    paths = body.get("paths", [])
    if not paths:
        return json_err("paths is required")
    deleted = []
    errors = []
    for p in paths:
        try:
            os.remove(p)
            deleted.append(p)
        except OSError as e:
            errors.append({"path": p, "error": str(e)})
    return json_ok({"deleted": deleted, "errors": errors})


# ---------------------------------------------------------------------------
# Copy / Move / Paste
# ---------------------------------------------------------------------------
def _handle_collision(dest_path):
    """If dest_path exists, return a non-conflicting path by appending '(copy)'."""
    if not os.path.exists(dest_path):
        return dest_path
    base, ext = os.path.splitext(dest_path)
    counter = 1
    while True:
        candidate = f"{base} (copy){ext}"
        if not os.path.exists(candidate):
            return candidate
        counter += 1
        base = f"{base} (copy)"
        ext = ""


def _copy_item(src, dest_dir):
    """Copy a single file or directory to dest_dir. Returns (dest_path, error_msg)."""
    name = os.path.basename(src)
    dest = os.path.join(dest_dir, name)
    dest = _handle_collision(dest)
    try:
        if os.path.isdir(src):
            import shutil
            shutil.copytree(src, dest)
        else:
            import shutil
            shutil.copy2(src, dest)
        return dest, None
    except Exception as e:
        return None, str(e)


def _move_item(src, dest_dir):
    """Move a single file or directory to dest_dir. Returns (dest_path, error_msg)."""
    name = os.path.basename(src)
    dest = os.path.join(dest_dir, name)
    # If source and dest are the same, just return
    if os.path.normpath(src) == os.path.normpath(dest):
        return dest, None
    dest = _handle_collision(dest)
    try:
        import shutil
        shutil.move(src, dest)
        return dest, None
    except Exception as e:
        return None, str(e)


@bottle_app.post("/api/copy-items")
def api_copy_items():
    body = request.json or {}
    source_paths = body.get("sourcePaths", [])
    dest_dir = body.get("destDir", "")
    if not source_paths or not dest_dir:
        return json_err("sourcePaths and destDir are required")
    if not os.path.isdir(dest_dir):
        return json_err(f"destination directory not found: {dest_dir}")
    copied = []
    errors = []
    for src in source_paths:
        if not os.path.exists(src):
            errors.append({"path": src, "error": "not found"})
            continue
        dest, err = _copy_item(src, dest_dir)
        if err:
            errors.append({"path": src, "error": err})
        else:
            copied.append({"source": src, "dest": dest})
    return json_ok({"copied": copied, "errors": errors})


@bottle_app.post("/api/move-items")
def api_move_items():
    body = request.json or {}
    source_paths = body.get("sourcePaths", [])
    dest_dir = body.get("destDir", "")
    if not source_paths or not dest_dir:
        return json_err("sourcePaths and destDir are required")
    if not os.path.isdir(dest_dir):
        return json_err(f"destination directory not found: {dest_dir}")
    moved = []
    errors = []
    for src in source_paths:
        if not os.path.exists(src):
            errors.append({"path": src, "error": "not found"})
            continue
        dest, err = _move_item(src, dest_dir)
        if err:
            errors.append({"path": src, "error": err})
        else:
            moved.append({"source": src, "dest": dest})
    return json_ok({"moved": moved, "errors": errors})


@bottle_app.post("/api/open-system")
def api_open_system():
    body = request.json or {}
    path = body.get("path", "")
    if not path:
        return json_err("path is required")
    try:
        import subprocess
        import platform
        system = platform.system()
        if system == "Darwin":
            subprocess.Popen(["open", path])
        elif system == "Windows":
            os.startfile(path)
        else:
            subprocess.Popen(["xdg-open", path])
        return json_ok({"opened": True})
    except Exception as e:
        return json_err(str(e))


# ---------------------------------------------------------------------------
# Company CRUD
# ---------------------------------------------------------------------------
@bottle_app.post("/api/company")
def api_get_company():
    body = request.json or {}
    directory = body.get("dir", "")
    if not directory:
        return json_err("dir is required")
    try:
        c = Company.load(directory)
        return json_ok(c.to_dict())
    except Exception as e:
        return json_err(str(e))


@bottle_app.post("/api/company/save")
def api_save_company():
    body = request.json or {}
    directory = body.get("dir", "")
    if not directory:
        return json_err("dir is required")
    try:
        company_data = body.get("company", {})
        c = Company(directory)
        c.name = company_data.get("name", "")
        c.address = company_data.get("address", "")
        c.website = company_data.get("website", "")
        c.company_type = company_data.get("company_type", "")
        c.emails = company_data.get("emails", [])
        c.phones = company_data.get("phones", [])
        for cd in company_data.get("contacts", []):
            c.contacts.append(Contact.from_dict(cd))
        c.save()
        return json_ok(c.to_dict())
    except Exception as e:
        return json_err(str(e))


@bottle_app.post("/api/company/contact/add")
def api_add_contact():
    body = request.json or {}
    directory = body.get("dir", "")
    if not directory:
        return json_err("dir is required")
    try:
        c = Company.load(directory)
        contact_data = body.get("contact", {})
        contact = Contact.from_dict(contact_data)
        c.contacts.append(contact)
        c.save()
        return json_ok(c.to_dict())
    except Exception as e:
        return json_err(str(e))


@bottle_app.post("/api/company/contact/update")
def api_update_contact():
    body = request.json or {}
    directory = body.get("dir", "")
    index = body.get("index")
    if not directory or index is None:
        return json_err("dir and index are required")
    try:
        c = Company.load(directory)
        idx = int(index)
        if idx < 0 or idx >= len(c.contacts):
            return json_err(f"contact index {idx} out of range")
        contact_data = body.get("contact", {})
        c.contacts[idx] = Contact.from_dict(contact_data)
        c.save()
        return json_ok(c.to_dict())
    except Exception as e:
        return json_err(str(e))


@bottle_app.post("/api/company/contact/delete")
def api_delete_contact():
    body = request.json or {}
    directory = body.get("dir", "")
    index = body.get("index")
    if not directory or index is None:
        return json_err("dir and index are required")
    try:
        c = Company.load(directory)
        idx = int(index)
        if idx < 0 or idx >= len(c.contacts):
            return json_err(f"contact index {idx} out of range")
        c.contacts.pop(idx)
        c.save()
        return json_ok(c.to_dict())
    except Exception as e:
        return json_err(str(e))


# ---------------------------------------------------------------------------
# Deals CRUD
# ---------------------------------------------------------------------------
@bottle_app.post("/api/deals/list")
def api_list_deals():
    body = request.json or {}
    directory = body.get("dir", "")
    if not directory:
        return json_err("dir is required")
    try:
        return json_ok(store.list_deals(directory))
    except Exception as e:
        return json_err(str(e))


@bottle_app.post("/api/deals/get")
def api_get_deal():
    body = request.json or {}
    directory = body.get("dir", "")
    filename = body.get("filename", "")
    if not directory or not filename:
        return json_err("dir and filename are required")
    try:
        return json_ok(store.get_deal(directory, filename))
    except Exception as e:
        return json_err(str(e))


@bottle_app.post("/api/deals/save")
def api_save_deal():
    body = request.json or {}
    directory = body.get("dir", "")
    deal_data = body.get("deal", {})
    if not directory:
        return json_err("dir is required")
    try:
        return json_ok(store.save_deal(directory, deal_data))
    except Exception as e:
        return json_err(str(e))


@bottle_app.post("/api/deals/delete")
def api_delete_deal():
    body = request.json or {}
    directory = body.get("dir", "")
    filename = body.get("filename", "")
    if not directory or not filename:
        return json_err("dir and filename are required")
    try:
        store.delete_deal(directory, filename)
        return json_ok(None)
    except Exception as e:
        return json_err(str(e))


# ---------------------------------------------------------------------------
# Editor routes — serve self-contained HTML pages for new PyWebView windows
# ---------------------------------------------------------------------------
def _read_editor_page(name):
    """Read an editor HTML file and inject the API port."""
    path = os.path.join(FRONTEND_DIR, name)
    with open(path, "r", encoding="utf-8") as f:
        html = f.read()
    html = html.replace('</head>', f'<script>window.API_PORT = {_api_port};</script></head>', 1)
    return html


@bottle_app.route("/editor/product")
def editor_product():
    return _read_editor_page("editor_product.html")


@bottle_app.route("/editor/company")
def editor_company():
    return _read_editor_page("editor_company.html")


@bottle_app.route("/editor/deal")
def editor_deal():
    return _read_editor_page("editor_deal.html")


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------
@bottle_app.get("/api/health")
def api_health():
    return json_ok("ok")


@bottle_app.post("/api/log-client-error")
def api_log_client_error():
    try:
        data = request.json
        log(f"[CLIENT {data.get('level', 'log')}] {data.get('msg', '')}")
        if data.get('stack'):
            log(f"  stack: {data['stack']}")
    except Exception:
        pass
    return json_ok(None)


# ---------------------------------------------------------------------------
# PyWebView JS API — native dialogs
# ---------------------------------------------------------------------------
class Api:
    def pickDirectory(self):
        log("pickDirectory: opening GTK folder chooser...")
        import webview
        result = webview.windows[0].create_file_dialog(webview.FOLDER_DIALOG)
        path = result[0] if result else None
        log(f"pickDirectory: selected '{path}'")
        return path

    def pickPhotos(self):
        log("pickPhotos: opening GTK file chooser...")
        import webview
        result = webview.windows[0].create_file_dialog(
            webview.OPEN_DIALOG,
            allow_multiple=True
        )
        log(f"pickPhotos: selected {len(result) if result else 0} file(s)")
        return result or []

    # ── Editor Window Launchers ──
    def _launch_editor(self, title, url):
        """Open editor in a new PyWebView window (thread-safe via GUI dispatch)."""
        log(f"Launching editor: {title} -> {url}")
        try:
            import webview
            webview.create_window(
                title,
                url=url,
                width=800, height=700, resizable=True,
            )
            return True
        except Exception as e:
            log_error(f"Failed to create editor window: {e}")
            return False

    def openProductEditor(self, path):
        """Open a product editor in a new PyWebView window."""
        log(f"openProductEditor: {path}")
        return self._launch_editor(
            f"Product - {os.path.basename(path)}",
            f"http://127.0.0.1:{_api_port}/editor/product?path={path}"
        )

    def openCompanyEditor(self, path):
        """Open a company editor in a new PyWebView window."""
        log(f"openCompanyEditor: {path}")
        return self._launch_editor(
            f"Company - {os.path.basename(path)}",
            f"http://127.0.0.1:{_api_port}/editor/company?path={path}"
        )

    def openDealEditor(self, path):
        """Open a deal editor in a new PyWebView window."""
        log(f"openDealEditor: {path}")
        return self._launch_editor(
            f"Deal - {os.path.basename(path)}",
            f"http://127.0.0.1:{_api_port}/editor/deal?path={path}"
        )

    def openNewProductEditor(self, dir_path):
        """Create a new .prod file and open its editor in a new window."""
        log(f"openNewProductEditor: {dir_path}")
        from prodlib.core import Product
        import uuid
        p = Product()
        if not p.header.uuid:
            p.header.uuid = str(uuid.uuid4())
        filename = f"{p.header.uuid[:8] if p.header.uuid else 'new'}.prod"
        full_path = os.path.join(dir_path, filename)
        p.title = "New Product"
        p.save(full_path)
        return self.openProductEditor(full_path)

    def openNewCompanyEditor(self, dir_path):
        """Create a new company directory and open its editor in a new window."""
        log(f"openNewCompanyEditor: {dir_path}")
        from prodlib.company import Company
        c = Company(dir_path)
        c.name = os.path.basename(dir_path)
        c.save()
        comp_path = os.path.join(dir_path, c.filename)
        return self.openCompanyEditor(comp_path)

    def openNewDealEditor(self, dir_path):
        """Create a new .deal file and open its editor in a new window."""
        log(f"openNewDealEditor: {dir_path}")
        from prodlib.deal import Deal
        import time
        deal = Deal(directory=dir_path)
        deal.title = "New Deal"
        deal.date = time.strftime("%Y-%m-%d")
        deal.filename = f"{deal.date}-new_deal.deal"
        deal.save()
        return self.openDealEditor(deal.filepath)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
def start_server(port: int):
    bottle_run(bottle_app, host="127.0.0.1", port=port, quiet=True)


def main():
    port = random.randint(18000, 18999)
    log(f"Starting server on 127.0.0.1:{port}")
    set_api_port(port)

    server_thread = threading.Thread(target=start_server, args=(port,), daemon=True)
    server_thread.start()
    log("Server thread started")

    api = Api()
    log("Creating WebView window...")
    webview.create_window(
        "Company Management Desktop",
        url=f"http://127.0.0.1:{port}/",
        width=1200,
        height=800,
        resizable=True,
        js_api=api,
    )

    log("Starting GTK main loop...")
    webview.start(gui="gtk", private_mode=False)
    log("Application closed.")


if __name__ == "__main__":
    try:
        main()
    except Exception:
        log_error("Fatal crash in main()")
        sys.exit(1)
