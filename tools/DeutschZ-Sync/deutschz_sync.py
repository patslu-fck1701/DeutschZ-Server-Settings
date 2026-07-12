from __future__ import annotations

import argparse
import fnmatch
import ftplib
import json
import os
import pathlib
import queue
import shutil
import sys
import threading
import time
import traceback
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from datetime import datetime
from tkinter import messagebox, scrolledtext, ttk
import tkinter as tk
from typing import Callable


APP_NAME = "DeutschZ Settings Sync"
BASE_DIR = pathlib.Path(__file__).resolve().parent
EXAMPLE_CONFIG = BASE_DIR / "config.example.json"
LOCAL_CONFIG = BASE_DIR / "config.local.json"
RUNTIME_DIR = pathlib.Path(os.environ.get("LOCALAPPDATA", BASE_DIR)) / "DeutschZ" / "SettingsSync"
STATE_FILE = RUNTIME_DIR / "state.json"
LOG_FILE = RUNTIME_DIR / "sync.log"
BACKUP_DIR = RUNTIME_DIR / "backups"
EDITABLE_EXTENSIONS = {
    ".bat", ".c", ".cfg", ".csv", ".ini", ".json", ".map", ".md", ".txt", ".xml", ".yml", ".yaml"
}
MAX_EDITOR_BYTES = 10 * 1024 * 1024


@dataclass(frozen=True)
class FileState:
    size: int
    mtime_ns: int

    def to_json(self) -> dict[str, int]:
        return {"size": self.size, "mtime_ns": self.mtime_ns}


def read_json(path: pathlib.Path) -> dict:
    raw = path.read_bytes()
    if raw.startswith(b"\xef\xbb\xbf"):
        raise ValueError(f"UTF-8 BOM ist nicht erlaubt: {path}")
    return json.loads(raw.decode("utf-8"))


def write_json(path: pathlib.Path, value: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(path.suffix + ".tmp")
    temp.write_text(json.dumps(value, indent=2, ensure_ascii=True) + "\n", encoding="utf-8", newline="\n")
    os.replace(temp, path)


def ensure_local_config() -> None:
    if LOCAL_CONFIG.exists():
        return
    config = read_json(EXAMPLE_CONFIG)
    write_json(LOCAL_CONFIG, config)


def matches(path: str, patterns: list[str]) -> bool:
    normalized = path.replace("\\", "/")
    return any(fnmatch.fnmatch(normalized, pattern) for pattern in patterns)


class SyncError(RuntimeError):
    pass


class DeutschZSync:
    def __init__(self, config_path: pathlib.Path, emit: Callable[[str], None] | None = None):
        self.config_path = config_path
        self.config = read_json(config_path)
        self.source = pathlib.Path(self.config["source_root"]).resolve()
        self.includes = list(self.config.get("include", []))
        self.excludes = list(self.config.get("exclude", []))
        self.poll_seconds = max(1.0, float(self.config.get("poll_seconds", 5)))
        self.debounce_seconds = max(1.0, float(self.config.get("debounce_seconds", 4)))
        self.baseline_on_first_run = bool(self.config.get("baseline_on_first_run", True))
        self.emit_callback = emit
        self.stop_event = threading.Event()
        self.pending: dict[str, tuple[FileState, float]] = {}
        self.state = self._load_state()
        self._validate_config()

    def emit(self, text: str) -> None:
        line = f"{datetime.now():%Y-%m-%d %H:%M:%S} | {text}"
        RUNTIME_DIR.mkdir(parents=True, exist_ok=True)
        with LOG_FILE.open("a", encoding="utf-8", newline="\n") as handle:
            handle.write(line + "\n")
        if self.emit_callback:
            self.emit_callback(line)
        else:
            print(line, flush=True)

    def _validate_config(self) -> None:
        if not self.source.is_dir():
            raise SyncError(f"Quellordner fehlt: {self.source}")
        if not self.includes:
            raise SyncError("Die Include-Liste ist leer.")
        enabled = [target for target in self.config.get("targets", []) if target.get("enabled", False)]
        if not enabled:
            raise SyncError("Kein Ziel ist aktiviert.")
        for target in enabled:
            target_type = str(target.get("type", "")).lower()
            if target_type not in {"local", "ftp"}:
                raise SyncError(f"Unbekannter Zieltyp: {target_type}")
            if target_type == "local":
                root = pathlib.Path(target.get("root", ""))
                if not str(root).strip():
                    raise SyncError(f"Leerer Zielpfad bei {target.get('name', 'LOCAL')}")
                try:
                    if root.resolve() == self.source:
                        raise SyncError("Quelle und Ziel duerfen nicht identisch sein.")
                except OSError:
                    pass

    def _load_state(self) -> dict[str, dict]:
        if not STATE_FILE.exists():
            return {}
        try:
            payload = read_json(STATE_FILE)
            saved_source = pathlib.Path(payload.get("source_root", "")).resolve()
            if saved_source != self.source:
                return {}
            return payload.get("files", {})
        except Exception:
            return {}

    def _save_state(self, snapshot: dict[str, FileState]) -> None:
        self._save_state_records({name: value.to_json() for name, value in snapshot.items()})

    def _save_state_records(self, records: dict[str, dict]) -> None:
        payload = {
            "source_root": str(self.source),
            "updated_at": datetime.now().isoformat(timespec="seconds"),
            "files": {name: value for name, value in sorted(records.items())},
        }
        write_json(STATE_FILE, payload)
        self.state = payload["files"]

    def snapshot(self) -> dict[str, FileState]:
        result: dict[str, FileState] = {}
        for path in self.source.rglob("*"):
            if not path.is_file():
                continue
            rel = path.relative_to(self.source).as_posix()
            if not matches(rel, self.includes) or matches(rel, self.excludes):
                continue
            stat = path.stat()
            result[rel] = FileState(stat.st_size, stat.st_mtime_ns)
        return result

    @staticmethod
    def _same(saved: dict | None, current: FileState) -> bool:
        if not saved:
            return False
        return int(saved.get("size", -1)) == current.size and int(saved.get("mtime_ns", -1)) == current.mtime_ns

    def validate_file(self, path: pathlib.Path) -> None:
        suffix = path.suffix.lower()
        raw = path.read_bytes()
        if suffix in {".json", ".xml"} and raw.startswith(b"\xef\xbb\xbf"):
            raise SyncError(f"BOM blockiert Deployment: {path}")
        if suffix == ".json":
            json.loads(raw.decode("utf-8"))
        elif suffix == ".xml":
            ET.fromstring(raw)

    def editable_files(self) -> list[str]:
        return sorted(
            rel for rel in self.snapshot()
            if pathlib.PurePosixPath(rel).suffix.lower() in EDITABLE_EXTENSIONS
        )

    def _editable_path(self, rel: str) -> pathlib.Path:
        normalized = pathlib.PurePosixPath(rel.replace("\\", "/"))
        if normalized.is_absolute() or ".." in normalized.parts:
            raise SyncError("Ungueltiger relativer Dateipfad.")
        rel_posix = normalized.as_posix()
        if not matches(rel_posix, self.includes) or matches(rel_posix, self.excludes):
            raise SyncError("Datei liegt ausserhalb der freigegebenen Settings.")
        if normalized.suffix.lower() not in EDITABLE_EXTENSIONS:
            raise SyncError("Dieser Dateityp ist im Editor nicht freigegeben.")
        path = (self.source / normalized).resolve()
        if not path.is_relative_to(self.source):
            raise SyncError("Dateipfad verlaesst den Quellordner.")
        return path

    def read_text(self, rel: str) -> str:
        path = self._editable_path(rel)
        if not path.is_file():
            raise SyncError(f"Datei fehlt: {rel}")
        if path.stat().st_size > MAX_EDITOR_BYTES:
            raise SyncError("Datei ist fuer den integrierten Editor zu gross.")
        raw = path.read_bytes()
        if raw.startswith(b"\xef\xbb\xbf"):
            raise SyncError(f"UTF-8 BOM ist nicht erlaubt: {rel}")
        try:
            return raw.decode("utf-8")
        except UnicodeDecodeError as exc:
            raise SyncError(f"Datei ist nicht UTF-8: {rel}: {exc}") from exc

    def validate_text(self, rel: str, text: str) -> None:
        suffix = pathlib.PurePosixPath(rel).suffix.lower()
        if suffix == ".json":
            json.loads(text)
        elif suffix == ".xml":
            ET.fromstring(text.encode("utf-8"))

    def save_text(self, rel: str, text: str) -> pathlib.Path:
        path = self._editable_path(rel)
        self.validate_text(rel, text)
        backup_root = BACKUP_DIR / datetime.now().strftime("%Y%m%d_%H%M%S_%f")
        backup = backup_root / pathlib.PurePosixPath(rel)
        if path.exists():
            backup.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(path, backup)
        path.parent.mkdir(parents=True, exist_ok=True)
        temp = path.with_name(path.name + ".dzsync-edit.tmp")
        temp.write_text(text, encoding="utf-8", newline="\n")
        os.replace(temp, path)
        self.emit(f"Gespeichert: {rel}; Backup: {backup}")
        return backup

    def _local_copy(self, source: pathlib.Path, root: pathlib.Path, rel: str) -> None:
        destination = root / pathlib.PurePosixPath(rel)
        destination.parent.mkdir(parents=True, exist_ok=True)
        temp = destination.with_name(destination.name + ".dzsync.tmp")
        shutil.copy2(source, temp)
        os.replace(temp, destination)

    @staticmethod
    def _ftp_connect(target: dict) -> ftplib.FTP:
        host = os.environ.get(target.get("host_env", ""), target.get("host", "")).strip()
        username = os.environ.get(target.get("username_env", ""), target.get("username", "")).strip()
        password = os.environ.get(target.get("password_env", ""), target.get("password", ""))
        if not host or not username or not password:
            raise SyncError(f"FTP-Zugangsdaten fehlen fuer {target.get('name', 'FTP')}.")
        timeout = int(target.get("timeout_seconds", 30))
        client: ftplib.FTP
        if target.get("tls", True):
            tls_client = ftplib.FTP_TLS(timeout=timeout)
            tls_client.connect(host, int(target.get("port", 21)))
            tls_client.login(username, password)
            tls_client.prot_p()
            client = tls_client
        else:
            client = ftplib.FTP(timeout=timeout)
            client.connect(host, int(target.get("port", 21)))
            client.login(username, password)
        return client

    @staticmethod
    def _ftp_ensure_dir(client: ftplib.FTP, remote_dir: str) -> None:
        current = ""
        for part in [item for item in remote_dir.split("/") if item]:
            current += "/" + part
            try:
                client.mkd(current)
            except ftplib.all_errors:
                pass

    def _ftp_upload(self, client: ftplib.FTP, source: pathlib.Path, target: dict, rel: str) -> None:
        root = "/" + str(target.get("root", "/")).strip("/")
        remote = root.rstrip("/") + "/" + rel.replace("\\", "/")
        remote_dir, filename = remote.rsplit("/", 1)
        self._ftp_ensure_dir(client, remote_dir)
        temporary = remote_dir + "/." + filename + ".dzsync.tmp"
        with source.open("rb") as handle:
            client.storbinary("STOR " + temporary, handle)
        try:
            client.rename(temporary, remote)
            return
        except ftplib.all_errors:
            pass
        try:
            client.delete(remote)
        except ftplib.all_errors:
            pass
        client.rename(temporary, remote)

    def deploy(self, files: list[str]) -> bool:
        if not files:
            return True
        for rel in files:
            self.validate_file(self.source / pathlib.PurePosixPath(rel))
        targets = [target for target in self.config.get("targets", []) if target.get("enabled", False)]
        for target in targets:
            name = target.get("name", target.get("type", "Ziel"))
            target_type = str(target.get("type", "")).lower()
            self.emit(f"Deploy nach {name}: {len(files)} Datei(en)")
            if target_type == "local":
                root = pathlib.Path(target["root"])
                if not root.exists():
                    raise SyncError(f"Ziel nicht erreichbar: {root}")
                for rel in files:
                    self._local_copy(self.source / pathlib.PurePosixPath(rel), root, rel)
            else:
                client = self._ftp_connect(target)
                try:
                    for rel in files:
                        self._ftp_upload(client, self.source / pathlib.PurePosixPath(rel), target, rel)
                finally:
                    try:
                        client.quit()
                    except ftplib.all_errors:
                        client.close()
            self.emit(f"Ziel fertig: {name}")
        return True

    def scan(self, force_all: bool = False) -> tuple[int, int]:
        current = self.snapshot()
        if not self.state and self.baseline_on_first_run and not force_all:
            self._save_state(current)
            self.emit(f"Baseline erstellt: {len(current)} Dateien, kein Deployment.")
            return 0, 0

        changed = []
        for rel, file_state in current.items():
            if force_all or not self._same(self.state.get(rel), file_state):
                changed.append(rel)
        deleted = sorted(set(self.state) - set(current))
        if deleted:
            self.emit(f"Geloescht erkannt: {len(deleted)} Datei(en); keine Ziel-Loeschung.")

        if force_all:
            self.deploy(sorted(changed))
            self._save_state(current)
            self.emit(f"Vollsync abgeschlossen: {len(changed)} Datei(en).")
            return len(changed), len(deleted)

        now = time.time()
        for rel in changed:
            state = current[rel]
            pending = self.pending.get(rel)
            if not pending or pending[0] != state:
                self.pending[rel] = (state, now)
        ready = sorted(rel for rel, (_, since) in self.pending.items() if rel in current and now - since >= self.debounce_seconds)
        if ready:
            self.deploy(ready)
            for rel in ready:
                self.pending.pop(rel, None)
            updated_state = dict(self.state)
            for rel in ready:
                updated_state[rel] = current[rel].to_json()
            for rel in deleted:
                updated_state.pop(rel, None)
            self._save_state_records(updated_state)
            self.emit(f"Inkrementeller Sync abgeschlossen: {len(ready)} Datei(en).")
        return len(ready), len(deleted)

    def monitor(self) -> None:
        self.emit("Monitor gestartet.")
        while not self.stop_event.is_set():
            try:
                self.scan()
            except Exception as exc:
                self.emit(f"FEHLER: {exc}")
                self.emit(traceback.format_exc().rstrip())
            self.stop_event.wait(self.poll_seconds)
        self.emit("Monitor gestoppt.")


class SyncGui(tk.Tk):
    def __init__(self, config_path: pathlib.Path):
        super().__init__()
        self.title(APP_NAME)
        self.geometry("940x620")
        self.minsize(780, 500)
        self.configure(bg="#080c08")
        self.messages: queue.Queue[str] = queue.Queue()
        self.worker: threading.Thread | None = None
        self.current_file: str | None = None
        self.file_items: dict[str, str] = {}
        self.sync = DeutschZSync(config_path, self.messages.put)
        self._build()
        self.after(100, self._drain_messages)
        self.protocol("WM_DELETE_WINDOW", self._close)

    def _build(self) -> None:
        style = ttk.Style(self)
        style.theme_use("clam")
        style.configure("TFrame", background="#080c08")
        style.configure("TLabel", background="#080c08", foreground="#d7e5d7")
        style.configure("TButton", background="#162416", foreground="#b7ff32", padding=8)
        style.map("TButton", background=[("active", "#244024")])
        style.configure("Treeview", background="#080c08", fieldbackground="#080c08", foreground="#d7e5d7", rowheight=24)
        style.configure("Treeview.Heading", background="#162416", foreground="#b7ff32")
        style.map("Treeview", background=[("selected", "#244024")], foreground=[("selected", "#ffffff")])
        style.configure("TNotebook", background="#080c08", borderwidth=0)
        style.configure("TNotebook.Tab", background="#162416", foreground="#d7e5d7", padding=(12, 7))
        style.map("TNotebook.Tab", background=[("selected", "#244024")], foreground=[("selected", "#b7ff32")])

        main = ttk.Frame(self, padding=14)
        main.pack(fill="both", expand=True)
        ttk.Label(main, text="DEUTSCHZ SETTINGS SYNC", font=("Segoe UI", 18, "bold"), foreground="#8ee000").pack(anchor="w")
        ttk.Label(main, text=f"Quelle: {self.sync.source}").pack(anchor="w", pady=(4, 10))

        notebook = ttk.Notebook(main)
        notebook.pack(fill="both", expand=True)
        sync_tab = ttk.Frame(notebook, padding=10)
        editor_tab = ttk.Frame(notebook, padding=10)
        notebook.add(sync_tab, text="Synchronisation")
        notebook.add(editor_tab, text="Settings bearbeiten")

        controls = ttk.Frame(sync_tab)
        controls.pack(fill="x", pady=(0, 10))
        self.start_button = ttk.Button(controls, text="Monitor starten", command=self.start_monitor)
        self.start_button.pack(side="left", padx=(0, 8))
        self.stop_button = ttk.Button(controls, text="Monitor stoppen", command=self.stop_monitor, state="disabled")
        self.stop_button.pack(side="left", padx=(0, 8))
        ttk.Button(controls, text="Jetzt pruefen", command=self.scan_once).pack(side="left", padx=(0, 8))
        ttk.Button(controls, text="Vollsync", command=self.full_sync).pack(side="left")
        self.status = ttk.Label(controls, text="Bereit", foreground="#8ee000")
        self.status.pack(side="right")

        self.log = scrolledtext.ScrolledText(sync_tab, bg="#050705", fg="#d7e5d7", insertbackground="#8ee000", font=("Consolas", 10))
        self.log.pack(fill="both", expand=True)
        self.log.configure(state="disabled")

        self._build_editor(editor_tab)

    def _build_editor(self, parent: ttk.Frame) -> None:
        filter_bar = ttk.Frame(parent)
        filter_bar.pack(fill="x", pady=(0, 8))
        ttk.Label(filter_bar, text="Suche").pack(side="left")
        self.editor_filter = tk.StringVar()
        filter_entry = ttk.Entry(filter_bar, textvariable=self.editor_filter, width=38)
        filter_entry.pack(side="left", padx=(8, 12))
        filter_entry.bind("<KeyRelease>", lambda _event: self.refresh_editor_files())
        ttk.Label(filter_bar, text="Bereich").pack(side="left")
        self.editor_scope = tk.StringVar(value="Alle")
        scope = ttk.Combobox(
            filter_bar,
            textvariable=self.editor_scope,
            values=("Alle", "Profiles", "Mission", "Root"),
            state="readonly",
            width=12,
        )
        scope.pack(side="left", padx=(8, 8))
        scope.bind("<<ComboboxSelected>>", lambda _event: self.refresh_editor_files())
        ttk.Button(filter_bar, text="Liste neu laden", command=self.refresh_editor_files).pack(side="right")

        panes = ttk.Panedwindow(parent, orient="horizontal")
        panes.pack(fill="both", expand=True)
        tree_frame = ttk.Frame(panes)
        edit_frame = ttk.Frame(panes)
        panes.add(tree_frame, weight=1)
        panes.add(edit_frame, weight=3)

        self.file_tree = ttk.Treeview(tree_frame, show="tree", selectmode="browse")
        tree_scroll = ttk.Scrollbar(tree_frame, orient="vertical", command=self.file_tree.yview)
        self.file_tree.configure(yscrollcommand=tree_scroll.set)
        self.file_tree.pack(side="left", fill="both", expand=True)
        tree_scroll.pack(side="right", fill="y")
        self.file_tree.bind("<<TreeviewSelect>>", self._editor_selection_changed)

        editor_bar = ttk.Frame(edit_frame)
        editor_bar.pack(fill="x", pady=(0, 8))
        self.editor_file_label = ttk.Label(editor_bar, text="Keine Datei gewaehlt", foreground="#8ee000")
        self.editor_file_label.pack(side="left", fill="x", expand=True)
        ttk.Button(editor_bar, text="Pruefen", command=self.validate_editor).pack(side="right", padx=(8, 0))
        ttk.Button(editor_bar, text="JSON formatieren", command=self.format_json).pack(side="right", padx=(8, 0))
        ttk.Button(editor_bar, text="Neu laden", command=self.reload_editor).pack(side="right", padx=(8, 0))
        ttk.Button(editor_bar, text="Speichern + Sync", command=self.save_editor).pack(side="right", padx=(8, 0))

        self.editor_text = scrolledtext.ScrolledText(
            edit_frame,
            bg="#050705",
            fg="#e5eee5",
            insertbackground="#8ee000",
            selectbackground="#315b18",
            undo=True,
            wrap="none",
            font=("Consolas", 10),
        )
        self.editor_text.pack(fill="both", expand=True)
        self.editor_text.bind("<Control-s>", lambda _event: self.save_editor())
        self.editor_status = ttk.Label(edit_frame, text="Bereit", foreground="#8ee000")
        self.editor_status.pack(anchor="w", pady=(6, 0))
        self.refresh_editor_files()

    def _scope_allows(self, rel: str) -> bool:
        scope = self.editor_scope.get()
        if scope == "Profiles":
            return rel.startswith("profiles/")
        if scope == "Mission":
            return rel.startswith("mpmissions/")
        if scope == "Root":
            return "/" not in rel
        return True

    def refresh_editor_files(self) -> None:
        selected = self.current_file
        self.file_tree.delete(*self.file_tree.get_children())
        self.file_items.clear()
        query = self.editor_filter.get().strip().lower()
        directories: dict[str, str] = {}
        for rel in self.sync.editable_files():
            if query and query not in rel.lower():
                continue
            if not self._scope_allows(rel):
                continue
            parts = pathlib.PurePosixPath(rel).parts
            parent = ""
            built = []
            for part in parts[:-1]:
                built.append(part)
                key = "/".join(built)
                if key not in directories:
                    directories[key] = self.file_tree.insert(parent, "end", text=part, open=len(built) == 1)
                parent = directories[key]
            item = self.file_tree.insert(parent, "end", text=parts[-1], values=(rel,))
            self.file_items[item] = rel
            if rel == selected:
                self.file_tree.selection_set(item)
                self.file_tree.see(item)

    def _editor_selection_changed(self, _event=None) -> None:
        selection = self.file_tree.selection()
        if not selection:
            return
        rel = self.file_items.get(selection[0])
        if not rel:
            return
        self.load_editor_file(rel)

    def load_editor_file(self, rel: str) -> None:
        try:
            text = self.sync.read_text(rel)
        except Exception as exc:
            messagebox.showerror(APP_NAME, str(exc))
            return
        self.current_file = rel
        self.editor_text.delete("1.0", "end")
        self.editor_text.insert("1.0", text)
        self.editor_text.edit_reset()
        self.editor_file_label.configure(text=rel)
        self.editor_status.configure(text=f"Geladen: {len(text)} Zeichen")

    def reload_editor(self) -> None:
        if self.current_file:
            self.load_editor_file(self.current_file)

    def validate_editor(self) -> None:
        if not self.current_file:
            return
        try:
            self.sync.validate_text(self.current_file, self.editor_text.get("1.0", "end-1c"))
            self.editor_status.configure(text="Syntax gueltig", foreground="#8ee000")
        except Exception as exc:
            self.editor_status.configure(text=f"Ungueltig: {exc}", foreground="#ff5a5a")
            messagebox.showerror(APP_NAME, str(exc))

    def format_json(self) -> None:
        if not self.current_file or pathlib.PurePosixPath(self.current_file).suffix.lower() != ".json":
            messagebox.showinfo(APP_NAME, "JSON-Formatierung ist nur fuer JSON-Dateien verfuegbar.")
            return
        try:
            value = json.loads(self.editor_text.get("1.0", "end-1c"))
            formatted = json.dumps(value, indent=2, ensure_ascii=False) + "\n"
            self.editor_text.delete("1.0", "end")
            self.editor_text.insert("1.0", formatted)
            self.editor_status.configure(text="JSON formatiert, noch nicht gespeichert")
        except Exception as exc:
            messagebox.showerror(APP_NAME, str(exc))

    def save_editor(self) -> str:
        if not self.current_file:
            return "break"
        rel = self.current_file
        text = self.editor_text.get("1.0", "end-1c")
        try:
            backup = self.sync.save_text(rel, text)
            self.editor_status.configure(text=f"Gespeichert. Backup: {backup}", foreground="#8ee000")
        except Exception as exc:
            self.editor_status.configure(text=f"Speichern blockiert: {exc}", foreground="#ff5a5a")
            messagebox.showerror(APP_NAME, str(exc))
            return "break"

        def sync_saved_file() -> None:
            self.sync.scan()
            if self.sync.pending:
                time.sleep(self.sync.debounce_seconds)
                self.sync.scan()

        if not (self.worker and self.worker.is_alive()):
            self._run(sync_saved_file, "Synchronisiere...")
        self.refresh_editor_files()
        return "break"

    def _run(self, action: Callable[[], object], label: str) -> None:
        if self.worker and self.worker.is_alive():
            messagebox.showwarning(APP_NAME, "Es laeuft bereits eine Aktion.")
            return
        self.status.configure(text=label)

        def wrapped() -> None:
            try:
                action()
            except Exception as exc:
                self.messages.put(f"{datetime.now():%Y-%m-%d %H:%M:%S} | FEHLER: {exc}")
            finally:
                self.after(0, lambda: self.status.configure(text="Bereit"))

        self.worker = threading.Thread(target=wrapped, daemon=True)
        self.worker.start()

    def start_monitor(self) -> None:
        if self.worker and self.worker.is_alive():
            return
        self.sync.stop_event.clear()
        self.worker = threading.Thread(target=self.sync.monitor, daemon=True)
        self.worker.start()
        self.start_button.configure(state="disabled")
        self.stop_button.configure(state="normal")
        self.status.configure(text="Monitor aktiv")

    def stop_monitor(self) -> None:
        self.sync.stop_event.set()
        self.start_button.configure(state="normal")
        self.stop_button.configure(state="disabled")
        self.status.configure(text="Stoppt...")

    def scan_once(self) -> None:
        self._run(self.sync.scan, "Pruefe...")

    def full_sync(self) -> None:
        if not messagebox.askyesno(APP_NAME, "Wirklich alle freigegebenen Dateien auf alle aktiven Ziele kopieren?"):
            return
        self._run(lambda: self.sync.scan(force_all=True), "Vollsync...")

    def _drain_messages(self) -> None:
        while True:
            try:
                line = self.messages.get_nowait()
            except queue.Empty:
                break
            self.log.configure(state="normal")
            self.log.insert("end", line + "\n")
            self.log.see("end")
            self.log.configure(state="disabled")
        self.after(100, self._drain_messages)

    def _close(self) -> None:
        self.sync.stop_event.set()
        self.destroy()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=APP_NAME)
    parser.add_argument("--config", type=pathlib.Path, default=LOCAL_CONFIG)
    parser.add_argument("--once", action="store_true")
    parser.add_argument("--headless", action="store_true")
    parser.add_argument("--full-sync", action="store_true")
    return parser.parse_args()


def main() -> int:
    ensure_local_config()
    args = parse_args()
    if args.once or args.headless or args.full_sync:
        sync = DeutschZSync(args.config)
        if args.full_sync:
            sync.scan(force_all=True)
        elif args.once:
            sync.scan()
            if sync.pending:
                time.sleep(sync.debounce_seconds)
                sync.scan()
        else:
            try:
                sync.monitor()
            except KeyboardInterrupt:
                sync.stop_event.set()
        return 0
    SyncGui(args.config).mainloop()
    return 0


if __name__ == "__main__":
    sys.exit(main())
