from __future__ import annotations

import argparse
import fnmatch
import ftplib
import json
import os
import pathlib
import queue
import re
import shutil
import subprocess
import sys
import threading
import time
import traceback
import xml.etree.ElementTree as ET
import urllib.error
import urllib.request
from dataclasses import dataclass
from datetime import datetime
from tkinter import filedialog, messagebox, scrolledtext, ttk
import tkinter as tk
from typing import Callable

try:
    from tkinterdnd2 import DND_FILES, TkinterDnD

    DND_AVAILABLE = True
    TkBase = TkinterDnD.Tk
except ImportError:
    DND_FILES = None
    DND_AVAILABLE = False
    TkBase = tk.Tk


APP_NAME = "DeutschZ Server Control"
BASE_DIR = pathlib.Path(__file__).resolve().parent
EXAMPLE_CONFIG = BASE_DIR / "config.example.json"
LOCAL_CONFIG = BASE_DIR / "config.local.json"
RUNTIME_DIR = pathlib.Path(os.environ.get("LOCALAPPDATA", BASE_DIR)) / "DeutschZ" / "SettingsSync"
STATE_FILE = RUNTIME_DIR / "state.json"
WORKSHOP_STATE_FILE = RUNTIME_DIR / "workshop_state.json"
LOG_FILE = RUNTIME_DIR / "sync.log"
BACKUP_DIR = RUNTIME_DIR / "backups"
EDITABLE_EXTENSIONS = {
    ".bat", ".c", ".cfg", ".csv", ".ini", ".json", ".map", ".md", ".txt", ".xml", ".yml", ".yaml"
}
MAX_EDITOR_BYTES = 10 * 1024 * 1024
PROVIDERS = ("Auto", "Nitrado", "Windows / Lokal", "Linux / VPS", "Benutzerdefiniert")
PROFILE_CANDIDATES = {
    "Nitrado": ("configs", "config", "profiles", "profile"),
    "Windows / Lokal": ("profiles", "profile", "config", "configs"),
    "Linux / VPS": ("profiles", "config", "configs", "profile"),
    "Auto": ("profiles", "configs", "config", "profile"),
    "Benutzerdefiniert": ("profiles", "configs", "config", "profile"),
}
MISSION_CANDIDATES = ("mpmissions", "missions")
SERVER_ROOT_CANDIDATES = ("dayzstandalone", "serverfiles", "DayZServer", "server")
DEFAULT_CORE_MOD_ORDER = (
    "@CF",
    "@Dabs Framework",
    "@Community-Online-Tools",
    "@DayZ-Expansion-Licensed",
    "@DayZ-Expansion-Bundle",
    "@VPPAdminTools",
)
LOG_TEXT_PATTERNS = ("*.RPT", "*.rpt", "*.ADM", "*.adm", "*.log")
LOG_CLEANUP_PATTERNS = LOG_TEXT_PATTERNS + ("*.mdmp", "*.bidmp", "*.dmp")
LOG_RELEVANT_WORDS = ("error", "warning", "exception", "crash", "failed", "cannot", "not found", "script stack", "compile")


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
        current = read_json(LOCAL_CONFIG)
        defaults = read_json(EXAMPLE_CONFIG)
        changed = False
        for key in ("source_paths", "branding", "log_sources", "auto_cleanup_logs", "log_retention_days", "auto_start_monitor", "workshop", "server_control"):
            if key not in current:
                current[key] = defaults[key]
                changed = True
        default_targets = {target["name"]: target for target in defaults.get("targets", [])}
        for target in current.get("targets", []):
            default = default_targets.get(target.get("name"), {})
            for key, value in default.items():
                if key not in target:
                    target[key] = value
                    changed = True
        if changed:
            write_json(LOCAL_CONFIG, current)
        return
    write_json(LOCAL_CONFIG, read_json(EXAMPLE_CONFIG))


def matches(path: str, patterns: list[str]) -> bool:
    normalized = path.replace("\\", "/")
    return any(fnmatch.fnmatch(normalized, pattern) for pattern in patterns)


def detect_local_layout(root_value: str, provider: str = "Auto") -> tuple[pathlib.Path, pathlib.Path, pathlib.Path]:
    requested = pathlib.Path(root_value).expanduser()
    candidates = [requested]
    for name in SERVER_ROOT_CANDIDATES:
        nested = requested / name
        if nested.is_dir():
            candidates.append(nested)

    def score(path: pathlib.Path) -> int:
        if not path.is_dir():
            return -1
        names = {child.name.lower() for child in path.iterdir()}
        value = 0
        if "serverdz.cfg" in names:
            value += 5
        if any(name.lower() in names for name in MISSION_CANDIDATES):
            value += 4
        if any(name.lower() in names for name in PROFILE_CANDIDATES.get(provider, PROFILE_CANDIDATES["Auto"])):
            value += 3
        return value

    root = max(candidates, key=score)
    children = {child.name.lower(): child for child in root.iterdir()} if root.is_dir() else {}
    profile_names = PROFILE_CANDIDATES.get(provider, PROFILE_CANDIDATES["Auto"])
    profile = next((children[name.lower()] for name in profile_names if name.lower() in children), None)
    mission = next((children[name.lower()] for name in MISSION_CANDIDATES if name.lower() in children), None)
    if profile is None:
        profile = root / ("configs" if provider == "Nitrado" else "profiles")
    if mission is None:
        mission = root / "mpmissions"
    return root, profile, mission


def collect_logs(config: dict, errors_only: bool = False, max_files: int = 16, tail_lines: int = 2000) -> str:
    found: dict[str, pathlib.Path] = {}
    for path in iter_log_files(config, include_dumps=False):
        found[str(path.resolve()).lower()] = path
    files = sorted(found.values(), key=lambda path: path.stat().st_mtime_ns, reverse=True)[:max_files]
    sections = []
    for path in files:
        size = path.stat().st_size
        with path.open("rb") as handle:
            if size > 2 * 1024 * 1024:
                handle.seek(size - 2 * 1024 * 1024)
            raw = handle.read()
        text = raw.decode("utf-8", errors="replace")
        lines = text.splitlines()[-tail_lines:]
        if errors_only:
            lines = [line for line in lines if any(word in line.lower() for word in LOG_RELEVANT_WORDS)]
        if not lines:
            continue
        stamp = datetime.fromtimestamp(path.stat().st_mtime).isoformat(timespec="seconds")
        sections.append(
            "=" * 96 + "\n"
            + f"DATEI: {path}\nGEAENDERT: {stamp}\n"
            + "=" * 96 + "\n"
            + "\n".join(lines)
        )
    header = f"DEUTSCHZ LOG-SAMMLUNG | {datetime.now().isoformat(timespec='seconds')} | DATEIEN: {len(sections)}\n\n"
    return header + "\n\n".join(sections) + "\n"


def iter_log_files(config: dict, include_dumps: bool = False):
    seen = set()
    for source in config.get("log_sources", []):
        if not source.get("enabled", False):
            continue
        root = pathlib.Path(source.get("path", ""))
        if not root.is_dir():
            continue
        recursive = bool(source.get("recursive", False))
        patterns = LOG_CLEANUP_PATTERNS if include_dumps else LOG_TEXT_PATTERNS
        for pattern in patterns:
            iterator = root.rglob(pattern) if recursive else root.glob(pattern)
            for path in iterator:
                if not path.is_file():
                    continue
                key = str(path.resolve()).lower()
                if key in seen:
                    continue
                seen.add(key)
                yield path


def cleanup_old_logs(config: dict) -> list[pathlib.Path]:
    if not config.get("auto_cleanup_logs", True):
        return []
    retention_days = max(1, int(config.get("log_retention_days", 5)))
    cutoff = time.time() - retention_days * 86400
    deleted = []
    for path in iter_log_files(config, include_dumps=True):
        try:
            if path.stat().st_mtime < cutoff:
                path.unlink()
                deleted.append(path)
        except OSError:
            continue
    return deleted


class SyncError(RuntimeError):
    pass


class DeutschZSync:
    def __init__(self, config_path: pathlib.Path, emit: Callable[[str], None] | None = None):
        self.config_path = config_path
        self.config = read_json(config_path)
        self.source = pathlib.Path(self.config["source_root"]).resolve()
        source_paths = self.config.get("source_paths", {})
        self.profiles_source = pathlib.Path(source_paths.get("profiles", self.source / "profiles")).resolve()
        self.missions_source = pathlib.Path(source_paths.get("missions", self.source / "mpmissions")).resolve()
        self.keys_source = pathlib.Path(source_paths.get("keys", self.source / "keys")).resolve()
        self.includes = list(self.config.get("include", []))
        self.excludes = list(self.config.get("exclude", []))
        self.poll_seconds = max(1.0, float(self.config.get("poll_seconds", 5)))
        self.debounce_seconds = max(1.0, float(self.config.get("debounce_seconds", 4)))
        self.baseline_on_first_run = bool(self.config.get("baseline_on_first_run", True))
        self.emit_callback = emit
        self.stop_event = threading.Event()
        self.deploy_lock = threading.Lock()
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
        if not self.profiles_source.is_dir():
            raise SyncError(f"Profiles-Quellordner fehlt: {self.profiles_source}")
        if not self.missions_source.is_dir():
            raise SyncError(f"Missions-Quellordner fehlt: {self.missions_source}")
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

        areas = [
            ("profiles", self.profiles_source),
            ("mpmissions", self.missions_source),
            ("keys", self.keys_source),
        ]
        for canonical, area_root in areas:
            if not area_root.is_dir():
                continue
            for path in area_root.rglob("*"):
                if not path.is_file():
                    continue
                tail = path.relative_to(area_root).as_posix()
                rel = f"{canonical}/{tail}"
                if not matches(rel, self.includes) or matches(rel, self.excludes):
                    continue
                stat = path.stat()
                result[rel] = FileState(stat.st_size, stat.st_mtime_ns)

        for path in self.source.iterdir():
            if not path.is_file():
                continue
            rel = path.name
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
        path = self.source_path(rel_posix)
        return path

    def source_path(self, rel: str) -> pathlib.Path:
        normalized = pathlib.PurePosixPath(rel.replace("\\", "/"))
        if normalized.is_absolute() or ".." in normalized.parts:
            raise SyncError("Ungueltiger relativer Dateipfad.")
        parts = normalized.parts
        if parts and parts[0] == "profiles":
            root = self.profiles_source
            tail = pathlib.PurePosixPath(*parts[1:])
        elif parts and parts[0] == "mpmissions":
            root = self.missions_source
            tail = pathlib.PurePosixPath(*parts[1:])
        elif parts and parts[0] == "keys":
            root = self.keys_source
            tail = pathlib.PurePosixPath(*parts[1:])
        else:
            root = self.source
            tail = normalized
        path = (root / tail).resolve()
        if not path.is_relative_to(root):
            raise SyncError("Dateipfad verlaesst den freigegebenen Quellordner.")
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
        destination = self.local_destination(root, {}, rel)
        destination.parent.mkdir(parents=True, exist_ok=True)
        temp = destination.with_name(destination.name + ".dzsync.tmp")
        shutil.copy2(source, temp)
        os.replace(temp, destination)

    @staticmethod
    def local_destination(root: pathlib.Path, target: dict, rel: str) -> pathlib.Path:
        parts = pathlib.PurePosixPath(rel).parts
        if parts and parts[0] == "profiles" and target.get("profiles_root"):
            return pathlib.Path(target["profiles_root"]) / pathlib.PurePosixPath(*parts[1:])
        if parts and parts[0] == "mpmissions" and target.get("missions_root"):
            return pathlib.Path(target["missions_root"]) / pathlib.PurePosixPath(*parts[1:])
        return root / pathlib.PurePosixPath(rel)

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
        parts = pathlib.PurePosixPath(rel).parts
        tail = pathlib.PurePosixPath(*parts[1:]).as_posix() if len(parts) > 1 else ""
        if parts and parts[0] == "profiles" and target.get("profiles_root"):
            base = str(target["profiles_root"])
            remote = "/" + "/".join([base.strip("/"), tail]).strip("/")
        elif parts and parts[0] == "mpmissions" and target.get("missions_root"):
            base = str(target["missions_root"])
            remote = "/" + "/".join([base.strip("/"), tail]).strip("/")
        else:
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
        with self.deploy_lock:
            return self._deploy_files(files)

    def _deploy_files(self, files: list[str]) -> bool:
        if not files:
            return True
        for rel in files:
            self.validate_file(self.source_path(rel))
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
                    source = self.source_path(rel)
                    destination = self.local_destination(root, target, rel)
                    destination.parent.mkdir(parents=True, exist_ok=True)
                    temp = destination.with_name(destination.name + ".dzsync.tmp")
                    shutil.copy2(source, temp)
                    os.replace(temp, destination)
            else:
                client = self._ftp_connect(target)
                try:
                    for rel in files:
                        self._ftp_upload(client, self.source_path(rel), target, rel)
                finally:
                    try:
                        client.quit()
                    except ftplib.all_errors:
                        client.close()
            self.emit(f"Ziel fertig: {name}")
        return True

    def deploy_now(self, files: list[str]) -> None:
        unique = sorted(set(files))
        if not unique:
            return
        current = self.snapshot()
        existing = [rel for rel in unique if rel in current]
        self.deploy(existing)
        updated_state = dict(self.state)
        for rel in existing:
            updated_state[rel] = current[rel].to_json()
            self.pending.pop(rel, None)
        self._save_state_records(updated_state)
        self.emit(f"Sofort-Sync abgeschlossen: {len(existing)} Datei(en).")

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


class WorkshopWatcher:
    def __init__(self, config: dict, emit: Callable[[str], None]):
        self.config = config
        workshop = config.get("workshop", {})
        self.source = pathlib.Path(workshop.get("source_dir", "")).resolve()
        self.poll_seconds = max(5.0, float(workshop.get("poll_seconds", 60)))
        self.debounce_seconds = max(10.0, float(workshop.get("debounce_seconds", 90)))
        self.copy_keys = bool(workshop.get("copy_keys_to_server", True))
        self.enabled_mod_order = list(workshop.get("enabled_mods", []))
        self.enabled_mods = set(self.enabled_mod_order)
        self.mod_paths = dict(workshop.get("mod_paths", {}))
        self.emit = emit
        self.stop_event = threading.Event()
        self.pending: dict[str, tuple[dict, float]] = {}
        self.state = self._load_state()

    def _load_state(self) -> dict[str, dict]:
        if not WORKSHOP_STATE_FILE.exists():
            return {}
        try:
            payload = read_json(WORKSHOP_STATE_FILE)
            if pathlib.Path(payload.get("source_dir", "")).resolve() != self.source:
                return {}
            return payload.get("mods", {})
        except Exception:
            return {}

    def _save_state(self) -> None:
        write_json(
            WORKSHOP_STATE_FILE,
            {
                "source_dir": str(self.source),
                "updated_at": datetime.now().isoformat(timespec="seconds"),
                "mods": self.state,
            },
        )

    @staticmethod
    def fingerprint(path: pathlib.Path) -> dict:
        files = 0
        total = 0
        latest = 0
        for item in path.rglob("*"):
            if not item.is_file() or item.suffix.lower() in {".part", ".download", ".tmp"}:
                continue
            try:
                stat = item.stat()
            except OSError:
                continue
            files += 1
            total += stat.st_size
            latest = max(latest, stat.st_mtime_ns)
        return {"files": files, "bytes": total, "latest_mtime_ns": latest}

    def mods(self) -> list[pathlib.Path]:
        if not self.source.is_dir():
            raise SyncError(f"Workshop-Ordner fehlt: {self.source}")
        if self.enabled_mod_order:
            ordered = []
            for name in self.enabled_mod_order:
                path = pathlib.Path(self.mod_paths.get(name, self.source / name))
                if path.is_dir():
                    ordered.append(path)
            return ordered
        mods = [path for path in self.source.iterdir() if path.is_dir() and path.name.startswith("@")]
        return sorted(mods, key=lambda path: path.name.lower())

    @staticmethod
    def _copy_mod_local(mod: pathlib.Path, target: dict, copy_keys: bool) -> tuple[int, int]:
        destination = pathlib.Path(target["root"]) / mod.name
        count = 0
        total = 0
        for source in mod.rglob("*"):
            if not source.is_file():
                continue
            rel = source.relative_to(mod)
            output = destination / rel
            output.parent.mkdir(parents=True, exist_ok=True)
            temp = output.with_name(output.name + ".dzsync.tmp")
            shutil.copy2(source, temp)
            os.replace(temp, output)
            count += 1
            total += source.stat().st_size
        if copy_keys:
            keys_target = pathlib.Path(target["root"]) / "keys"
            keys_target.mkdir(parents=True, exist_ok=True)
            for key in mod.rglob("*.bikey"):
                shutil.copy2(key, keys_target / key.name)
        return count, total

    @staticmethod
    def _upload_mod_ftp(mod: pathlib.Path, target: dict, copy_keys: bool) -> tuple[int, int]:
        client = DeutschZSync._ftp_connect(target)
        count = 0
        total = 0
        root = "/" + str(target.get("root", "/")).strip("/")
        try:
            for source in mod.rglob("*"):
                if not source.is_file():
                    continue
                tail = source.relative_to(mod).as_posix()
                remote = "/" + "/".join([root.strip("/"), mod.name, tail]).strip("/")
                remote_dir = remote.rsplit("/", 1)[0]
                DeutschZSync._ftp_ensure_dir(client, remote_dir)
                with source.open("rb") as handle:
                    client.storbinary("STOR " + remote, handle)
                count += 1
                total += source.stat().st_size
            if copy_keys:
                for key in mod.rglob("*.bikey"):
                    remote = "/" + "/".join([root.strip("/"), "keys", key.name]).strip("/")
                    DeutschZSync._ftp_ensure_dir(client, remote.rsplit("/", 1)[0])
                    with key.open("rb") as handle:
                        client.storbinary("STOR " + remote, handle)
        finally:
            try:
                client.quit()
            except ftplib.all_errors:
                client.close()
        return count, total

    def deploy_mod(self, mod: pathlib.Path) -> None:
        targets = [target for target in self.config.get("targets", []) if target.get("enabled", False)]
        for target in targets:
            name = target.get("name", "Ziel")
            self.emit(f"Workshop-Deploy: {mod.name} -> {name}")
            if target.get("type") == "ftp":
                count, total = self._upload_mod_ftp(mod, target, self.copy_keys)
            else:
                count, total = self._copy_mod_local(mod, target, self.copy_keys)
            self.emit(f"Workshop-Deploy fertig: {mod.name} -> {name} | {count} Dateien | {total} Bytes")

    def scan(self) -> None:
        mods = self.mods()
        current = {mod.name: self.fingerprint(mod) for mod in mods}
        if not self.state:
            self.state = current
            self._save_state()
            self.emit(f"Workshop-Baseline erstellt: {len(current)} Mods, kein Deployment.")
            return
        now = time.time()
        for mod in mods:
            fingerprint = current[mod.name]
            if self.state.get(mod.name) == fingerprint:
                self.pending.pop(mod.name, None)
                continue
            pending = self.pending.get(mod.name)
            if not pending or pending[0] != fingerprint:
                self.pending[mod.name] = (fingerprint, now)
                self.emit(f"Workshop-Aenderung erkannt: {mod.name}; warte auf Steam.")
                continue
            if now - pending[1] < self.debounce_seconds:
                continue
            self.deploy_mod(mod)
            self.state[mod.name] = fingerprint
            self.pending.pop(mod.name, None)
            self._save_state()

    def monitor(self) -> None:
        self.emit(f"Workshop-Ueberwachung gestartet: {self.source}")
        while not self.stop_event.is_set():
            try:
                self.scan()
            except Exception as exc:
                self.emit(f"Workshop-FEHLER: {exc}")
            self.stop_event.wait(self.poll_seconds)
        self.emit("Workshop-Ueberwachung gestoppt.")


class ServerController:
    def __init__(self, config: dict, emit: Callable[[str], None]):
        self.config = config.get("server_control", {})
        self.emit = emit

    def local_status(self) -> bool:
        process_name = self.config.get("local_process_name", "DayZServer_x64.exe")
        result = subprocess.run(
            ["tasklist", "/FI", f"IMAGENAME eq {process_name}", "/FO", "CSV", "/NH"],
            capture_output=True,
            text=True,
            timeout=15,
            check=False,
        )
        return process_name.lower() in result.stdout.lower()

    def start_local(self) -> None:
        start_file = pathlib.Path(self.config.get("local_start_file", ""))
        if not start_file.is_file():
            raise SyncError(f"Lokale Startdatei fehlt: {start_file}")
        if self.local_status():
            self.emit("Lokaler Server laeuft bereits.")
            return
        if start_file.suffix.lower() in {".bat", ".cmd"}:
            subprocess.Popen(
                ["cmd.exe", "/c", "start", "", str(start_file)],
                cwd=str(start_file.parent),
                creationflags=getattr(subprocess, "CREATE_NEW_CONSOLE", 0),
            )
        else:
            subprocess.Popen(
                [str(start_file)],
                cwd=str(start_file.parent),
                creationflags=getattr(subprocess, "CREATE_NEW_CONSOLE", 0),
            )
        self.emit(f"Lokaler Serverstart ausgeloest: {start_file}")

    def stop_local(self) -> None:
        process_name = self.config.get("local_process_name", "DayZServer_x64.exe")
        if not self.local_status():
            self.emit("Lokaler Server ist bereits gestoppt.")
            return
        result = subprocess.run(
            ["taskkill", "/IM", process_name, "/T"],
            capture_output=True,
            text=True,
            timeout=30,
            check=False,
        )
        if result.returncode != 0:
            raise SyncError(f"Server konnte nicht gestoppt werden: {result.stderr.strip() or result.stdout.strip()}")
        self.emit("Lokaler Server wurde gestoppt.")

    def restart_local(self) -> None:
        self.stop_local()
        delay = max(1, int(self.config.get("restart_delay_seconds", 15)))
        self.emit(f"Lokaler Restart: warte {delay} Sekunden.")
        time.sleep(delay)
        self.start_local()

    def _remote_url(self, action: str) -> tuple[str, str]:
        mode = self.config.get("remote_mode", "Generische Webhooks")
        if mode == "Nitrado":
            service_id = str(self.config.get("nitrado_service_id", "")).strip()
            token = str(self.config.get("nitrado_token", "")).strip()
            if not service_id or not token:
                raise SyncError("Nitrado Service-ID oder API-Token fehlt.")
            return f"https://api.nitrado.net/services/{service_id}/gameservers/{action}", token
        url = str(self.config.get(f"remote_{action}_url", "")).strip()
        token = str(self.config.get("remote_bearer_token", "")).strip()
        if not url:
            raise SyncError(f"Remote-{action}-URL fehlt.")
        return url, token

    def remote_action(self, action: str) -> str:
        if action not in {"start", "stop", "restart"}:
            raise SyncError("Unbekannte Remote-Aktion.")
        url, token = self._remote_url(action)
        headers = {"Accept": "application/json", "User-Agent": "DeutschZ-Server-Control/1.0"}
        if token:
            headers["Authorization"] = "Bearer " + token
        request = urllib.request.Request(url, data=b"", headers=headers, method="POST")
        try:
            with urllib.request.urlopen(request, timeout=45) as response:
                body = response.read().decode("utf-8", errors="replace")
                self.emit(f"Remote-{action} erfolgreich: HTTP {response.status}")
                return body
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            raise SyncError(f"Remote-{action} fehlgeschlagen: HTTP {exc.code}: {detail[:500]}") from exc


class SyncGui(TkBase):
    def __init__(self, config_path: pathlib.Path):
        super().__init__()
        self.title(APP_NAME)
        self.geometry("1180x760")
        self.minsize(960, 620)
        self.configure(bg="#010201")
        self.messages: queue.Queue[str] = queue.Queue()
        self.worker: threading.Thread | None = None
        self.action_worker: threading.Thread | None = None
        self.workshop_worker: threading.Thread | None = None
        self.current_file: str | None = None
        self.file_items: dict[str, str] = {}
        self.mod_order: list[str] = []
        self.mod_paths: dict[str, str] = {}
        self.path_vars: dict[str, tk.Variable] = {}
        self.logo_image = None
        self.sync = DeutschZSync(config_path, self.messages.put)
        self.workshop = WorkshopWatcher(self.sync.config, self.messages.put)
        self.server_controller = ServerController(self.sync.config, self.messages.put)
        self._load_mod_order()
        self.resolve_mod_dependencies()
        self._build()
        self.after(100, self._drain_messages)
        self.after(1000, lambda: self.cleanup_logs(schedule_next=True))
        if self.sync.config.get("auto_start_monitor", True):
            self.after(1500, self.start_monitor)
        if self.sync.config.get("workshop", {}).get("enabled", True):
            self.after(2000, self.start_workshop_monitor)
        self.protocol("WM_DELETE_WINDOW", self._close)

    def _build(self) -> None:
        style = ttk.Style(self)
        style.theme_use("clam")
        style.configure("TFrame", background="#030503")
        style.configure("Glass.TFrame", background="#071008", relief="solid", borderwidth=1)
        style.configure("TLabel", background="#030503", foreground="#cbd8cb")
        style.configure("TCheckbutton", background="#030503", foreground="#cbd8cb", indicatorcolor="#071008")
        style.map("TCheckbutton", foreground=[("active", "#a6ff00")], background=[("active", "#030503")])
        style.configure("TEntry", fieldbackground="#050a06", foreground="#e7f2e7", insertcolor="#a6ff00", bordercolor="#1d3a20")
        style.configure("TCombobox", fieldbackground="#050a06", background="#071008", foreground="#e7f2e7", arrowcolor="#a6ff00")
        style.configure("TButton", background="#071008", foreground="#a6ff00", padding=8, bordercolor="#2f6925")
        style.map("TButton", background=[("active", "#10220b"), ("pressed", "#173614")], foreground=[("active", "#d7ff72")])
        style.configure("Treeview", background="#020403", fieldbackground="#020403", foreground="#d6e2d6", rowheight=24, bordercolor="#173614")
        style.configure("Treeview.Heading", background="#071008", foreground="#a6ff00")
        style.map("Treeview", background=[("selected", "#173614")], foreground=[("selected", "#d7ff72")])
        style.configure("TNotebook", background="#010201", borderwidth=0)
        style.configure("TNotebook.Tab", background="#050a06", foreground="#a8b6a8", padding=(14, 8), borderwidth=1)
        style.map("TNotebook.Tab", background=[("selected", "#10220b")], foreground=[("selected", "#a6ff00")])

        main = ttk.Frame(self, padding=14)
        main.pack(fill="both", expand=True)
        header = ttk.Frame(main)
        header.pack(fill="x", pady=(0, 10))
        self.logo_label = ttk.Label(header)
        self.logo_label.pack(side="left", padx=(0, 12))
        header_text = ttk.Frame(header)
        header_text.pack(side="left", fill="x", expand=True)
        ttk.Label(header_text, text="DEUTSCHZ SERVER CONTROL", font=("Segoe UI", 18, "bold"), foreground="#a6ff00").pack(anchor="w")
        self.source_label = ttk.Label(header_text, text=f"Quelle: {self.sync.source}")
        self.source_label.pack(anchor="w", pady=(4, 0))
        self._load_logo()

        notebook = ttk.Notebook(main)
        self.main_notebook = notebook
        notebook.pack(fill="both", expand=True)
        paths_tab = ttk.Frame(notebook, padding=10)
        sync_tab = ttk.Frame(notebook, padding=10)
        control_tab = ttk.Frame(notebook, padding=10)
        editor_tab = ttk.Frame(notebook, padding=10)
        logs_tab = ttk.Frame(notebook, padding=10)
        notebook.add(paths_tab, text="Pfade & Ziele")
        notebook.add(sync_tab, text="Synchronisation")
        notebook.add(control_tab, text="Serversteuerung")
        notebook.add(editor_tab, text="Settings bearbeiten")
        notebook.add(logs_tab, text="Log-Zentrale")

        workshop_controls = ttk.Frame(sync_tab, style="Glass.TFrame")
        workshop_controls.pack(fill="x", pady=(0, 10))
        ttk.Label(workshop_controls, text="WORKSHOP AUTO-DEPLOY", font=("Segoe UI", 10, "bold"), foreground="#a6ff00").pack(side="left", padx=10)
        self.workshop_start_button = ttk.Button(workshop_controls, text="Workshop-Ueberwachung fortsetzen", command=self.start_workshop_monitor)
        self.workshop_start_button.pack(side="left", padx=6, pady=8)
        self.workshop_stop_button = ttk.Button(workshop_controls, text="Workshop-Ueberwachung pausieren", command=self.stop_workshop_monitor, state="disabled")
        self.workshop_stop_button.pack(side="left", padx=6, pady=8)
        ttk.Button(workshop_controls, text="Workshop jetzt pruefen", command=self.scan_workshop_once).pack(side="left", padx=6, pady=8)
        self.workshop_status = ttk.Label(workshop_controls, text="Bereit", foreground="#a6ff00")
        self.workshop_status.pack(side="right", padx=10)

        controls = ttk.Frame(sync_tab, style="Glass.TFrame")
        controls.pack(fill="x", pady=(0, 10))
        ttk.Label(controls, text="SETTINGS-SYNC", font=("Segoe UI", 10, "bold"), foreground="#a6ff00").pack(side="left", padx=10)
        self.start_button = ttk.Button(controls, text="Ordner-Automatik fortsetzen", command=self.start_monitor)
        self.start_button.pack(side="left", padx=(0, 8))
        self.stop_button = ttk.Button(controls, text="Ordner-Automatik pausieren", command=self.stop_monitor, state="disabled")
        self.stop_button.pack(side="left", padx=(0, 8))
        ttk.Button(controls, text="Jetzt pruefen", command=self.scan_once).pack(side="left", padx=(0, 8))
        ttk.Button(controls, text="Vollsync", command=self.full_sync).pack(side="left")
        self.status = ttk.Label(controls, text="Bereit", foreground="#8ee000")
        self.status.pack(side="right")

        self.log = scrolledtext.ScrolledText(sync_tab, bg="#010301", fg="#d7e5d7", insertbackground="#a6ff00", highlightbackground="#173614", highlightthickness=1, font=("Consolas", 10))
        self.log.pack(fill="both", expand=True)
        self.log.configure(state="disabled")

        self._build_paths(paths_tab)
        self._build_server_control(control_tab)
        self._build_editor(editor_tab)
        self._build_logs(logs_tab)

    def _load_logo(self) -> None:
        path = pathlib.Path(self.sync.config.get("branding", {}).get("logo_path", ""))
        try:
            image = tk.PhotoImage(file=str(path))
            factor = max(1, (image.width() + 89) // 90, (image.height() + 79) // 80)
            if factor > 1:
                image = image.subsample(factor, factor)
            self.logo_image = image
            self.logo_label.configure(image=image, text="")
        except Exception:
            self.logo_image = None
            self.logo_label.configure(image="", text="DZ", foreground="#8ee000", font=("Segoe UI", 22, "bold"))

    def _config_target(self, name: str) -> dict:
        for target in self.sync.config.get("targets", []):
            if target.get("name") == name:
                return target
        return {}

    def _path_row(self, parent: ttk.Frame, row: int, key: str, label: str, value: str, browse: bool = True) -> None:
        ttk.Label(parent, text=label).grid(row=row, column=0, sticky="w", padx=8, pady=5)
        variable = tk.StringVar(value=value)
        self.path_vars[key] = variable
        ttk.Entry(parent, textvariable=variable, width=90).grid(row=row, column=1, sticky="ew", padx=8, pady=5)
        if browse:
            ttk.Button(parent, text="Ordner...", command=lambda: self._browse_path(key)).grid(row=row, column=2, padx=8, pady=5)
        parent.grid_columnconfigure(1, weight=1)

    def _browse_path(self, key: str) -> None:
        current = str(self.path_vars[key].get())
        selected = filedialog.askdirectory(initialdir=current if pathlib.Path(current).is_dir() else None)
        if selected:
            self.path_vars[key].set(selected)

    def _browse_logo(self) -> None:
        selected = filedialog.askopenfilename(filetypes=(("PNG-Bilder", "*.png"), ("Alle Dateien", "*.*")))
        if selected:
            self.path_vars["logo"].set(selected)

    def _browse_start_file(self) -> None:
        selected = filedialog.askopenfilename(filetypes=(("Startdateien", "*.bat *.cmd *.exe"), ("Alle Dateien", "*.*")))
        if selected:
            self.path_vars["local_start_file"].set(selected)

    def _build_paths(self, parent: ttk.Frame) -> None:
        tabs = ttk.Notebook(parent)
        tabs.pack(fill="both", expand=True)
        source_tab = ttk.Frame(tabs, padding=12)
        local_tab = ttk.Frame(tabs, padding=12)
        live_tab = ttk.Frame(tabs, padding=12)
        ftp_tab = ttk.Frame(tabs, padding=12)
        control_tab = ttk.Frame(tabs, padding=12)
        tabs.add(source_tab, text="Quellen")
        tabs.add(local_tab, text="Lokaler Server")
        tabs.add(live_tab, text="Live / Freigabe")
        tabs.add(ftp_tab, text="FTP / FTPS")
        tabs.add(control_tab, text="Serversteuerung")

        self._path_row(source_tab, 0, "source_root", "Repo / Settings Root", str(self.sync.source))
        self._path_row(source_tab, 1, "source_profiles", "Profiles Quelle", str(self.sync.profiles_source))
        self._path_row(source_tab, 2, "source_missions", "Mission Quelle", str(self.sync.missions_source))
        self._path_row(source_tab, 3, "source_keys", "Keys Quelle", str(self.sync.keys_source))
        ttk.Label(source_tab, text="Logo").grid(row=4, column=0, sticky="w", padx=8, pady=5)
        self.path_vars["logo"] = tk.StringVar(value=self.sync.config.get("branding", {}).get("logo_path", ""))
        ttk.Entry(source_tab, textvariable=self.path_vars["logo"], width=90).grid(row=4, column=1, sticky="ew", padx=8, pady=5)
        ttk.Button(source_tab, text="Bild...", command=self._browse_logo).grid(row=4, column=2, padx=8, pady=5)
        self.path_vars["auto_cleanup_logs"] = tk.BooleanVar(value=self.sync.config.get("auto_cleanup_logs", True))
        self.path_vars["log_retention_days"] = tk.StringVar(value=str(self.sync.config.get("log_retention_days", 5)))
        self.path_vars["auto_start_monitor"] = tk.BooleanVar(value=self.sync.config.get("auto_start_monitor", True))
        workshop = self.sync.config.get("workshop", {})
        self.path_vars["workshop_enabled"] = tk.BooleanVar(value=workshop.get("enabled", True))
        self.path_vars["workshop_source"] = tk.StringVar(value=workshop.get("source_dir", ""))
        self.path_vars["workshop_poll"] = tk.StringVar(value=str(workshop.get("poll_seconds", 60)))
        self.path_vars["workshop_debounce"] = tk.StringVar(value=str(workshop.get("debounce_seconds", 90)))
        ttk.Checkbutton(source_tab, text="Alte Logs automatisch loeschen", variable=self.path_vars["auto_cleanup_logs"]).grid(row=5, column=0, sticky="w", padx=8, pady=5)
        ttk.Entry(source_tab, textvariable=self.path_vars["log_retention_days"], width=8).grid(row=5, column=1, sticky="w", padx=8, pady=5)
        ttk.Label(source_tab, text="Tage Aufbewahrung").grid(row=5, column=1, sticky="w", padx=(80, 8), pady=5)
        ttk.Checkbutton(source_tab, text="Ordner-Automatik beim Programmstart", variable=self.path_vars["auto_start_monitor"]).grid(row=6, column=0, columnspan=2, sticky="w", padx=8, pady=5)
        ttk.Checkbutton(source_tab, text="Workshop automatisch ueberwachen", variable=self.path_vars["workshop_enabled"]).grid(row=7, column=0, sticky="w", padx=8, pady=5)
        ttk.Entry(source_tab, textvariable=self.path_vars["workshop_source"], width=90).grid(row=7, column=1, sticky="ew", padx=8, pady=5)
        ttk.Button(source_tab, text="Ordner...", command=lambda: self._browse_path("workshop_source")).grid(row=7, column=2, padx=8, pady=5)
        ttk.Label(source_tab, text="Workshop Pruefintervall / Steam-Wartezeit").grid(row=8, column=0, sticky="w", padx=8, pady=5)
        ttk.Entry(source_tab, textvariable=self.path_vars["workshop_poll"], width=8).grid(row=8, column=1, sticky="w", padx=8, pady=5)
        ttk.Entry(source_tab, textvariable=self.path_vars["workshop_debounce"], width=8).grid(row=8, column=1, sticky="w", padx=(80, 8), pady=5)

        local = self._config_target("Lokaler DayZServer")
        self.path_vars["local_enabled"] = tk.BooleanVar(value=local.get("enabled", True))
        self.path_vars["local_provider"] = tk.StringVar(value=local.get("provider", "Windows / Lokal"))
        ttk.Checkbutton(local_tab, text="Ziel aktiv", variable=self.path_vars["local_enabled"]).grid(row=0, column=0, sticky="w", padx=8, pady=5)
        ttk.Combobox(local_tab, textvariable=self.path_vars["local_provider"], values=PROVIDERS, state="readonly").grid(row=0, column=1, sticky="w", padx=8, pady=5)
        ttk.Button(local_tab, text="Automatisch erkennen", command=lambda: self._detect_target("local")).grid(row=0, column=2, padx=8, pady=5)
        self._path_row(local_tab, 1, "local_root", "Server Root", local.get("root", ""))
        self._path_row(local_tab, 2, "local_profiles", "Profiles / Configs Ziel", local.get("profiles_root", str(pathlib.Path(local.get("root", "")) / "profiles")))
        self._path_row(local_tab, 3, "local_missions", "Mission Ziel", local.get("missions_root", str(pathlib.Path(local.get("root", "")) / "mpmissions")))
        local_logs = next((item.get("path", "") for item in self.sync.config.get("log_sources", []) if item.get("name") in {"Lokaler Server", "Lokaler Server Logs"}), "")
        self._path_row(local_tab, 4, "local_logs", "Log-Ordner", local_logs)

        live = self._config_target("Live-Freigabe")
        self.path_vars["live_enabled"] = tk.BooleanVar(value=live.get("enabled", True))
        self.path_vars["live_provider"] = tk.StringVar(value=live.get("provider", "Auto"))
        ttk.Checkbutton(live_tab, text="Ziel aktiv", variable=self.path_vars["live_enabled"]).grid(row=0, column=0, sticky="w", padx=8, pady=5)
        ttk.Combobox(live_tab, textvariable=self.path_vars["live_provider"], values=PROVIDERS, state="readonly").grid(row=0, column=1, sticky="w", padx=8, pady=5)
        ttk.Button(live_tab, text="Automatisch erkennen", command=lambda: self._detect_target("live")).grid(row=0, column=2, padx=8, pady=5)
        self._path_row(live_tab, 1, "live_root", "Server / Freigabe Root", live.get("root", ""))
        self._path_row(live_tab, 2, "live_profiles", "Profiles / Configs Ziel", live.get("profiles_root", str(pathlib.Path(live.get("root", "")) / "profiles")))
        self._path_row(live_tab, 3, "live_missions", "Mission Ziel", live.get("missions_root", str(pathlib.Path(live.get("root", "")) / "mpmissions")))
        live_logs = next((item.get("path", "") for item in self.sync.config.get("log_sources", []) if item.get("name") in {"Live-Freigabe", "Live Logs"}), "")
        self._path_row(live_tab, 4, "live_logs", "Log-Ordner", live_logs)

        ftp = self._config_target("Live-FTP")
        self.path_vars["ftp_enabled"] = tk.BooleanVar(value=ftp.get("enabled", False))
        self.path_vars["ftp_tls"] = tk.BooleanVar(value=ftp.get("tls", True))
        self.path_vars["ftp_provider"] = tk.StringVar(value=ftp.get("provider", "Auto"))
        self.path_vars["ftp_host"] = tk.StringVar(value=ftp.get("host", ""))
        self.path_vars["ftp_port"] = tk.StringVar(value=str(ftp.get("port", 21)))
        self.path_vars["ftp_user"] = tk.StringVar(value=ftp.get("username", ""))
        self.path_vars["ftp_password"] = tk.StringVar(value=ftp.get("password", ""))
        ttk.Checkbutton(ftp_tab, text="FTP-Ziel aktiv", variable=self.path_vars["ftp_enabled"]).grid(row=0, column=0, sticky="w", padx=8, pady=5)
        ttk.Combobox(ftp_tab, textvariable=self.path_vars["ftp_provider"], values=PROVIDERS, state="readonly").grid(row=0, column=1, sticky="w", padx=8, pady=5)
        ttk.Checkbutton(ftp_tab, text="FTPS / TLS", variable=self.path_vars["ftp_tls"]).grid(row=0, column=2, sticky="w", padx=8, pady=5)
        ttk.Button(ftp_tab, text="FTP verbinden und Pfade erkennen", command=self.detect_ftp_paths).grid(row=0, column=3, padx=8, pady=5)
        for row, key, label in ((1, "ftp_host", "Host"), (2, "ftp_port", "Port"), (3, "ftp_user", "Benutzer"), (4, "ftp_password", "Passwort")):
            ttk.Label(ftp_tab, text=label).grid(row=row, column=0, sticky="w", padx=8, pady=5)
            show = "*" if key == "ftp_password" else ""
            ttk.Entry(ftp_tab, textvariable=self.path_vars[key], show=show, width=50).grid(row=row, column=1, sticky="ew", padx=8, pady=5)
        self._path_row(ftp_tab, 5, "ftp_root", "Remote Server Root", ftp.get("root", "/dayzstandalone"), browse=False)
        self._path_row(ftp_tab, 6, "ftp_profiles", "Remote Profiles / Configs", ftp.get("profiles_root", "/dayzstandalone/profiles"), browse=False)
        self._path_row(ftp_tab, 7, "ftp_missions", "Remote Mission", ftp.get("missions_root", "/dayzstandalone/mpmissions"), browse=False)

        server_control = self.sync.config.get("server_control", {})
        self.path_vars["local_start_file"] = tk.StringVar(value=server_control.get("local_start_file", ""))
        self.path_vars["local_process_name"] = tk.StringVar(value=server_control.get("local_process_name", "DayZServer_x64.exe"))
        self.path_vars["restart_delay"] = tk.StringVar(value=str(server_control.get("restart_delay_seconds", 15)))
        self.path_vars["remote_mode"] = tk.StringVar(value=server_control.get("remote_mode", "Generische Webhooks"))
        self.path_vars["nitrado_service_id"] = tk.StringVar(value=server_control.get("nitrado_service_id", ""))
        self.path_vars["nitrado_token"] = tk.StringVar(value=server_control.get("nitrado_token", ""))
        self.path_vars["remote_start_url"] = tk.StringVar(value=server_control.get("remote_start_url", ""))
        self.path_vars["remote_stop_url"] = tk.StringVar(value=server_control.get("remote_stop_url", ""))
        self.path_vars["remote_restart_url"] = tk.StringVar(value=server_control.get("remote_restart_url", ""))
        self.path_vars["remote_bearer_token"] = tk.StringVar(value=server_control.get("remote_bearer_token", ""))
        ttk.Label(control_tab, text="Lokale Startdatei").grid(row=0, column=0, sticky="w", padx=8, pady=5)
        ttk.Entry(control_tab, textvariable=self.path_vars["local_start_file"], width=85).grid(row=0, column=1, sticky="ew", padx=8, pady=5)
        ttk.Button(control_tab, text="Datei...", command=self._browse_start_file).grid(row=0, column=2, padx=8, pady=5)
        for row, key, label in (
            (1, "local_process_name", "Lokaler Prozessname"),
            (2, "restart_delay", "Restart-Wartezeit in Sekunden"),
        ):
            ttk.Label(control_tab, text=label).grid(row=row, column=0, sticky="w", padx=8, pady=5)
            ttk.Entry(control_tab, textvariable=self.path_vars[key], width=45).grid(row=row, column=1, sticky="w", padx=8, pady=5)
        ttk.Label(control_tab, text="Remote-Steuerung").grid(row=3, column=0, sticky="w", padx=8, pady=5)
        ttk.Combobox(control_tab, textvariable=self.path_vars["remote_mode"], values=("Nitrado", "Generische Webhooks"), state="readonly", width=28).grid(row=3, column=1, sticky="w", padx=8, pady=5)
        for row, key, label, secret in (
            (4, "nitrado_service_id", "Nitrado Service-ID", False),
            (5, "nitrado_token", "Nitrado API-Token", True),
            (6, "remote_start_url", "Generische Start-URL", False),
            (7, "remote_stop_url", "Generische Stop-URL", False),
            (8, "remote_restart_url", "Generische Restart-URL", False),
            (9, "remote_bearer_token", "Generischer Bearer-Token", True),
        ):
            ttk.Label(control_tab, text=label).grid(row=row, column=0, sticky="w", padx=8, pady=5)
            ttk.Entry(control_tab, textvariable=self.path_vars[key], show="*" if secret else "", width=85).grid(row=row, column=1, sticky="ew", padx=8, pady=5)
        control_tab.grid_columnconfigure(1, weight=1)

        actions = ttk.Frame(parent)
        actions.pack(fill="x", pady=(10, 0))
        ttk.Button(actions, text="Pfade speichern und anwenden", command=self.save_paths).pack(side="left", padx=(0, 8))
        ttk.Button(actions, text="Aktive Ziele pruefen", command=self.test_targets).pack(side="left")
        self.path_status = ttk.Label(actions, text="Pfade koennen jederzeit geaendert werden.", foreground="#8ee000")
        self.path_status.pack(side="right")

    def _detect_target(self, prefix: str) -> None:
        try:
            root, profiles, missions = detect_local_layout(
                str(self.path_vars[f"{prefix}_root"].get()),
                str(self.path_vars[f"{prefix}_provider"].get()),
            )
            self.path_vars[f"{prefix}_root"].set(str(root))
            self.path_vars[f"{prefix}_profiles"].set(str(profiles))
            self.path_vars[f"{prefix}_missions"].set(str(missions))
            log_candidates = (root / "logs", root / "Logs", root / "profiles", root / "Neuer Ordner")
            log_path = next((path for path in log_candidates if path.is_dir()), root / "logs")
            self.path_vars[f"{prefix}_logs"].set(str(log_path))
            self.path_status.configure(text=f"Erkannt: {root}", foreground="#8ee000")
        except Exception as exc:
            messagebox.showerror(APP_NAME, f"Erkennung fehlgeschlagen: {exc}")

    def detect_ftp_paths(self) -> None:
        target = {
            "name": "Live-FTP",
            "host": str(self.path_vars["ftp_host"].get()).strip(),
            "port": int(str(self.path_vars["ftp_port"].get()).strip()),
            "username": str(self.path_vars["ftp_user"].get()).strip(),
            "password": str(self.path_vars["ftp_password"].get()),
            "tls": bool(self.path_vars["ftp_tls"].get()),
        }
        root = str(self.path_vars["ftp_root"].get()).strip() or "/"
        provider = str(self.path_vars["ftp_provider"].get())
        client = None
        try:
            client = DeutschZSync._ftp_connect(target)
            client.cwd(root)
            names = set()
            for value in client.nlst():
                names.add(value.replace("\\", "/").rstrip("/").split("/")[-1].lower())
            profile_name = next((name for name in PROFILE_CANDIDATES.get(provider, PROFILE_CANDIDATES["Auto"]) if name.lower() in names), None)
            mission_name = next((name for name in MISSION_CANDIDATES if name.lower() in names), None)
            if profile_name is None:
                profile_name = "configs" if provider == "Nitrado" else "profiles"
            if mission_name is None:
                mission_name = "mpmissions"
            self.path_vars["ftp_profiles"].set("/" + "/".join([root.strip("/"), profile_name]).strip("/"))
            self.path_vars["ftp_missions"].set("/" + "/".join([root.strip("/"), mission_name]).strip("/"))
            self.path_status.configure(text=f"FTP-Layout erkannt: {profile_name}, {mission_name}", foreground="#8ee000")
        except Exception as exc:
            messagebox.showerror(APP_NAME, f"FTP-Erkennung fehlgeschlagen: {exc}")
        finally:
            if client:
                try:
                    client.quit()
                except ftplib.all_errors:
                    client.close()

    def save_paths(self) -> None:
        try:
            config = read_json(self.sync.config_path)
            config["source_root"] = str(self.path_vars["source_root"].get()).strip()
            config["source_paths"] = {
                "profiles": str(self.path_vars["source_profiles"].get()).strip(),
                "missions": str(self.path_vars["source_missions"].get()).strip(),
                "keys": str(self.path_vars["source_keys"].get()).strip(),
            }
            config["branding"] = {"logo_path": str(self.path_vars["logo"].get()).strip()}
            config["auto_cleanup_logs"] = bool(self.path_vars["auto_cleanup_logs"].get())
            config["log_retention_days"] = max(1, int(str(self.path_vars["log_retention_days"].get()).strip()))
            config["auto_start_monitor"] = bool(self.path_vars["auto_start_monitor"].get())
            workshop = config.setdefault("workshop", {})
            workshop["enabled"] = bool(self.path_vars["workshop_enabled"].get())
            workshop["source_dir"] = str(self.path_vars["workshop_source"].get()).strip()
            workshop["poll_seconds"] = max(5, int(str(self.path_vars["workshop_poll"].get()).strip()))
            workshop["debounce_seconds"] = max(10, int(str(self.path_vars["workshop_debounce"].get()).strip()))
            workshop.setdefault("copy_keys_to_server", True)
            workshop["enabled_mods"] = list(self.mod_order)
            workshop["mod_paths"] = dict(self.mod_paths)
            for target in config.get("targets", []):
                name = target.get("name")
                if name == "Lokaler DayZServer":
                    prefix = "local"
                elif name == "Live-Freigabe":
                    prefix = "live"
                elif name == "Live-FTP":
                    prefix = "ftp"
                else:
                    continue
                target["enabled"] = bool(self.path_vars[f"{prefix}_enabled"].get())
                target["provider"] = str(self.path_vars[f"{prefix}_provider"].get())
                target["root"] = str(self.path_vars[f"{prefix}_root"].get()).strip()
                target["profiles_root"] = str(self.path_vars[f"{prefix}_profiles"].get()).strip()
                target["missions_root"] = str(self.path_vars[f"{prefix}_missions"].get()).strip()
                if prefix == "ftp":
                    target["host"] = str(self.path_vars["ftp_host"].get()).strip()
                    target["port"] = int(str(self.path_vars["ftp_port"].get()).strip())
                    target["username"] = str(self.path_vars["ftp_user"].get()).strip()
                    target["password"] = str(self.path_vars["ftp_password"].get())
                    target["tls"] = bool(self.path_vars["ftp_tls"].get())
            config["log_sources"] = [
                {"name": "Lokaler Server Logs", "enabled": True, "recursive": True, "path": str(self.path_vars["local_logs"].get()).strip()},
                {"name": "Lokale Profiles und Mod-Logs", "enabled": True, "recursive": True, "path": str(self.path_vars["local_profiles"].get()).strip()},
                {"name": "Live Logs", "enabled": True, "recursive": True, "path": str(self.path_vars["live_logs"].get()).strip()},
                {"name": "Live Profiles und Mod-Logs", "enabled": True, "recursive": True, "path": str(self.path_vars["live_profiles"].get()).strip()},
            ]
            config["server_control"] = {
                "local_start_file": str(self.path_vars["local_start_file"].get()).strip(),
                "local_process_name": str(self.path_vars["local_process_name"].get()).strip() or "DayZServer_x64.exe",
                "restart_delay_seconds": max(1, int(str(self.path_vars["restart_delay"].get()).strip())),
                "remote_mode": str(self.path_vars["remote_mode"].get()),
                "nitrado_service_id": str(self.path_vars["nitrado_service_id"].get()).strip(),
                "nitrado_token": str(self.path_vars["nitrado_token"].get()),
                "remote_start_url": str(self.path_vars["remote_start_url"].get()).strip(),
                "remote_stop_url": str(self.path_vars["remote_stop_url"].get()).strip(),
                "remote_restart_url": str(self.path_vars["remote_restart_url"].get()).strip(),
                "remote_bearer_token": str(self.path_vars["remote_bearer_token"].get()),
            }
            write_json(self.sync.config_path, config)
            was_monitoring = bool(self.worker and self.worker.is_alive() and not self.sync.stop_event.is_set())
            was_workshop_monitoring = bool(self.workshop_worker and self.workshop_worker.is_alive() and not self.workshop.stop_event.is_set())
            self.sync.stop_event.set()
            self.workshop.stop_event.set()
            if self.worker and self.worker.is_alive():
                self.worker.join(timeout=2)
            self.worker = None
            if self.workshop_worker and self.workshop_worker.is_alive():
                self.workshop_worker.join(timeout=2)
            self.workshop_worker = None
            self.sync = DeutschZSync(self.sync.config_path, self.messages.put)
            self.workshop = WorkshopWatcher(self.sync.config, self.messages.put)
            self.server_controller = ServerController(self.sync.config, self.messages.put)
            self.source_label.configure(text=f"Quelle: {self.sync.source}")
            self._load_logo()
            self.refresh_editor_files()
            self.path_status.configure(text="Pfade gespeichert und angewendet.", foreground="#8ee000")
            if was_monitoring:
                self.start_monitor()
            if was_workshop_monitoring:
                self.start_workshop_monitor()
        except Exception as exc:
            self.path_status.configure(text=f"Fehler: {exc}", foreground="#ff5a5a")
            messagebox.showerror(APP_NAME, str(exc))

    def test_targets(self) -> None:
        results = []
        for prefix, label in (("local", "Lokaler Server"), ("live", "Live / Freigabe")):
            if not bool(self.path_vars[f"{prefix}_enabled"].get()):
                continue
            for part, title in (("root", "Root"), ("profiles", "Profiles/Configs"), ("missions", "Mission")):
                path = pathlib.Path(str(self.path_vars[f"{prefix}_{part}"].get()))
                results.append(f"{label} {title}: {'OK' if path.is_dir() else 'FEHLT'} | {path}")
        messagebox.showinfo(APP_NAME, "\n".join(results) if results else "Keine lokalen Ziele aktiviert.")

    def _build_server_control(self, parent: ttk.Frame) -> None:
        local = ttk.Frame(parent, style="Glass.TFrame", padding=14)
        local.pack(fill="x", pady=(0, 12))
        ttk.Label(local, text="LOKALER DAYZ SERVER", foreground="#a6ff00", font=("Segoe UI", 12, "bold")).pack(anchor="w", pady=(0, 10))
        local_buttons = ttk.Frame(local)
        local_buttons.pack(fill="x")
        ttk.Button(local_buttons, text="Starten", command=lambda: self._server_action("local_start")).pack(side="left")
        ttk.Button(local_buttons, text="Stoppen", command=lambda: self._server_action("local_stop", confirm=True)).pack(side="left", padx=8)
        ttk.Button(local_buttons, text="Neu starten", command=lambda: self._server_action("local_restart", confirm=True)).pack(side="left")
        ttk.Button(local_buttons, text="Status pruefen", command=self.refresh_local_server_status).pack(side="left", padx=8)
        self.local_server_status = ttk.Label(local_buttons, text="Status unbekannt", foreground="#a6ff00")
        self.local_server_status.pack(side="right")

        remote = ttk.Frame(parent, style="Glass.TFrame", padding=14)
        remote.pack(fill="x")
        ttk.Label(remote, text="REMOTE / HOSTER", foreground="#a6ff00", font=("Segoe UI", 12, "bold")).pack(anchor="w", pady=(0, 10))
        remote_buttons = ttk.Frame(remote)
        remote_buttons.pack(fill="x")
        ttk.Button(remote_buttons, text="Remote starten", command=lambda: self._server_action("remote_start", confirm=True)).pack(side="left")
        ttk.Button(remote_buttons, text="Remote stoppen", command=lambda: self._server_action("remote_stop", confirm=True)).pack(side="left", padx=8)
        ttk.Button(remote_buttons, text="Remote neu starten", command=lambda: self._server_action("remote_restart", confirm=True)).pack(side="left")
        self.remote_server_status = ttk.Label(remote_buttons, text="Remote-Aktionen verwenden das konfigurierte Anbieterprofil.", foreground="#a6ff00")
        self.remote_server_status.pack(side="right")

        ttk.Label(
            parent,
            text="Stop und Restart werden niemals automatisch durch einen Datei-Sync ausgeloest.",
            foreground="#849184",
        ).pack(anchor="w", pady=(12, 0))

    def _server_action(self, action: str, confirm: bool = False) -> None:
        if confirm and not messagebox.askyesno(APP_NAME, f"Serveraktion wirklich ausfuehren: {action}?"):
            return

        def run() -> None:
            try:
                if action == "local_start":
                    self.server_controller.start_local()
                elif action == "local_stop":
                    self.server_controller.stop_local()
                elif action == "local_restart":
                    self.server_controller.restart_local()
                elif action.startswith("remote_"):
                    self.server_controller.remote_action(action.removeprefix("remote_"))
                self.after(0, self.refresh_local_server_status)
            except Exception as exc:
                self.messages.put(f"{datetime.now():%Y-%m-%d %H:%M:%S} | SERVERSTEUERUNG FEHLER: {exc}")
                try:
                    self.after(0, lambda: messagebox.showerror(APP_NAME, str(exc)))
                except RuntimeError:
                    pass

        threading.Thread(target=run, daemon=True).start()

    def refresh_local_server_status(self) -> None:
        try:
            running = self.server_controller.local_status()
            self.local_server_status.configure(
                text="LAEUFT" if running else "GESTOPPT",
                foreground="#a6ff00" if running else "#ff6b6b",
            )
        except Exception as exc:
            self.local_server_status.configure(text=f"Statusfehler: {exc}", foreground="#ff6b6b")

    def _build_logs(self, parent: ttk.Frame) -> None:
        controls = ttk.Frame(parent)
        controls.pack(fill="x", pady=(0, 8))
        self.logs_errors_only = tk.BooleanVar(value=False)
        ttk.Checkbutton(controls, text="Nur Fehler und Warnungen", variable=self.logs_errors_only).pack(side="left")
        ttk.Button(controls, text="Logs aktualisieren", command=self.refresh_logs).pack(side="left", padx=8)
        ttk.Button(controls, text="Alles kopieren", command=self.copy_logs).pack(side="left", padx=(0, 8))
        ttk.Button(controls, text="Als Datei speichern", command=self.save_logs).pack(side="left")
        ttk.Button(controls, text="Alte Logs jetzt loeschen", command=self.cleanup_logs).pack(side="left", padx=8)
        self.logs_status = ttk.Label(controls, text="Bereit", foreground="#8ee000")
        self.logs_status.pack(side="right")
        self.logs_text = scrolledtext.ScrolledText(parent, bg="#010301", fg="#d9e6d9", insertbackground="#a6ff00", selectbackground="#173614", highlightbackground="#173614", highlightthickness=1, wrap="none", font=("Consolas", 9))
        self.logs_text.pack(fill="both", expand=True)

    def refresh_logs(self) -> None:
        try:
            combined = collect_logs(self.sync.config, bool(self.logs_errors_only.get()))
            self.logs_text.delete("1.0", "end")
            self.logs_text.insert("1.0", combined)
            self.logs_status.configure(text=f"{len(combined):,} Zeichen geladen", foreground="#8ee000")
        except Exception as exc:
            self.logs_status.configure(text=f"Fehler: {exc}", foreground="#ff5a5a")

    def cleanup_logs(self, schedule_next: bool = False) -> None:
        try:
            deleted = cleanup_old_logs(self.sync.config)
            days = int(self.sync.config.get("log_retention_days", 5))
            self.logs_status.configure(text=f"Cleanup: {len(deleted)} Datei(en) aelter als {days} Tage geloescht")
            if deleted:
                self.sync.emit(f"Log-Cleanup: {len(deleted)} alte Logdatei(en) geloescht.")
        except Exception as exc:
            self.logs_status.configure(text=f"Cleanup-Fehler: {exc}", foreground="#ff5a5a")
        finally:
            if schedule_next:
                self.after(3600000, lambda: self.cleanup_logs(schedule_next=True))

    def copy_logs(self) -> None:
        text = self.logs_text.get("1.0", "end-1c")
        self.clipboard_clear()
        self.clipboard_append(text)
        self.logs_status.configure(text="In Zwischenablage kopiert")

    def save_logs(self) -> None:
        path = filedialog.asksaveasfilename(
            defaultextension=".txt",
            initialfile=f"DeutschZ_Diagnose_{datetime.now():%Y%m%d_%H%M%S}.txt",
            filetypes=(("Textdatei", "*.txt"), ("Alle Dateien", "*.*")),
        )
        if not path:
            return
        pathlib.Path(path).write_text(self.logs_text.get("1.0", "end-1c"), encoding="utf-8", newline="\n")
        self.logs_status.configure(text=f"Gespeichert: {path}")

    def _build_editor(self, parent: ttk.Frame) -> None:
        drop_row = ttk.Frame(parent)
        drop_row.pack(fill="x", pady=(0, 8))
        mod_bar = ttk.Frame(drop_row, style="Glass.TFrame")
        mod_bar.pack(side="left", fill="both", expand=True, padx=(0, 4))
        ttk.Label(mod_bar, text="MOD HINZUFUEGEN", foreground="#a6ff00", font=("Segoe UI", 9, "bold")).pack(anchor="w", padx=8, pady=(6, 0))
        self.mod_drop_zone = tk.Label(
            mod_bar,
            text="@MOD-ORDNER HIER ABLEGEN",
            bg="#010301",
            fg="#a6ff00",
            relief="solid",
            borderwidth=1,
            padx=18,
            pady=10,
            font=("Segoe UI", 10, "bold"),
        )
        self.mod_drop_zone.pack(fill="x", padx=8, pady=5)
        mod_actions = ttk.Frame(mod_bar)
        mod_actions.pack(fill="x", padx=8, pady=(0, 6))
        ttk.Button(mod_actions, text="Mod-Ordner waehlen", command=self.select_mod_folder).pack(side="left")
        ttk.Button(mod_actions, text="Reihenfolge bearbeiten", command=self.open_mod_order).pack(side="left", padx=6)
        self.mod_count_label = ttk.Label(mod_actions, text=f"{len(self.mod_order)} Mods", foreground="#a6ff00")
        self.mod_count_label.pack(side="right")

        import_bar = ttk.Frame(drop_row, style="Glass.TFrame")
        import_bar.pack(side="left", fill="both", expand=True, padx=(4, 0))
        settings_head = ttk.Frame(import_bar)
        settings_head.pack(fill="x", padx=8, pady=(6, 0))
        ttk.Label(settings_head, text="SETTING HINZUFUEGEN", foreground="#a6ff00", font=("Segoe UI", 9, "bold")).pack(side="left")
        ttk.Label(settings_head, text="Ziel").pack(side="left", padx=(16, 4))
        self.import_target = tk.StringVar(value="Aktueller Ordner")
        ttk.Combobox(
            settings_head,
            textvariable=self.import_target,
            values=("Aktueller Ordner", "Profiles", "Mission", "Server-Root"),
            state="readonly",
            width=18,
        ).pack(side="left", padx=4)
        self.drop_zone = tk.Label(
            import_bar,
            text="SETTING-DATEIEN HIER ABLEGEN",
            bg="#020403",
            fg="#a6ff00",
            activebackground="#10220b",
            activeforeground="#d7ff72",
            relief="solid",
            borderwidth=1,
            padx=26,
            pady=10,
            font=("Segoe UI", 10, "bold"),
        )
        self.drop_zone.pack(fill="x", expand=True, padx=8, pady=5)
        ttk.Button(import_bar, text="Setting-Dateien waehlen", command=self.select_import_files).pack(anchor="w", padx=8, pady=(0, 6))
        if DND_AVAILABLE:
            self.mod_drop_zone.drop_target_register(DND_FILES)
            self.mod_drop_zone.dnd_bind("<<Drop>>", self._mods_dropped)
            self.drop_zone.drop_target_register(DND_FILES)
            self.drop_zone.dnd_bind("<<Drop>>", self._files_dropped)
        else:
            self.drop_zone.configure(text="DRAG & DROP NICHT INSTALLIERT - DATEIEN AUSWAEHLEN")

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
            bg="#010301",
            fg="#e5eee5",
            insertbackground="#8ee000",
            selectbackground="#173614",
            undo=True,
            wrap="none",
            font=("Consolas", 10),
        )
        self.editor_text.pack(fill="both", expand=True)
        self.editor_text.bind("<Control-s>", lambda _event: self.save_editor())
        self.editor_status = ttk.Label(edit_frame, text="Bereit", foreground="#8ee000")
        self.editor_status.pack(anchor="w", pady=(6, 0))
        self.refresh_editor_files()

    def _load_mod_order(self) -> None:
        self.mod_order = []
        self.mod_paths = dict(self.sync.config.get("workshop", {}).get("mod_paths", {}))
        path = self.sync.source / "modlist.txt"
        if path.is_file():
            try:
                text = path.read_text(encoding="utf-8").strip()
                self.mod_order = [name.strip() for name in text.split(";") if name.strip()]
            except OSError:
                self.mod_order = []
        if not self.mod_order:
            self.mod_order = list(self.sync.config.get("workshop", {}).get("enabled_mods", []))
        self.workshop.enabled_mod_order = list(self.mod_order)
        self.workshop.enabled_mods = set(self.mod_order)
        self.workshop.mod_paths.update(self.mod_paths)

    def select_mod_folder(self) -> None:
        initial = str(self.path_vars.get("workshop_source", tk.StringVar(value=str(self.workshop.source))).get())
        selected = filedialog.askdirectory(initialdir=initial if pathlib.Path(initial).is_dir() else None)
        if selected:
            self.add_mod_folders([pathlib.Path(selected)])

    def _mods_dropped(self, event):
        paths = [pathlib.Path(value) for value in self.tk.splitlist(event.data)]
        self.add_mod_folders(paths)
        return "break"

    def add_mod_folders(self, paths: list[pathlib.Path]) -> None:
        added = []
        for path in paths:
            if not path.is_dir() or not path.name.startswith("@"):
                continue
            name = path.name
            self.mod_paths[name] = str(path.resolve())
            if name not in self.mod_order:
                self.mod_order.append(name)
                added.append(name)
        if not added:
            messagebox.showwarning(APP_NAME, "Kein neuer gueltiger @Mod-Ordner erkannt.")
            return
        self.resolve_mod_dependencies()
        self.mod_count_label.configure(text=f"{len(self.mod_order)} Mods")
        self.save_mod_order(show_message=False)
        messagebox.showinfo(APP_NAME, f"Hinzugefuegt: {', '.join(added)}")

    def resolve_mod_dependencies(self) -> None:
        id_to_name = {}
        dependencies: dict[str, list[str]] = {}
        workshop_variable = self.path_vars.get("workshop_source")
        workshop_root = pathlib.Path(str(workshop_variable.get())) if workshop_variable else self.workshop.source
        for name in self.mod_order:
            mod_path = pathlib.Path(self.mod_paths.get(name, workshop_root / name))
            meta = mod_path / "meta.cpp"
            if not meta.is_file():
                continue
            try:
                text = meta.read_text(encoding="utf-8", errors="ignore")
            except OSError:
                continue
            published = re.search(r"(?i)publishedid\s*=\s*[\"']?(\d+)", text)
            if published:
                id_to_name[published.group(1)] = name
            dep_block = re.search(r"(?is)dependencies\s*\[\s*\]\s*=\s*\{(.*?)\}", text)
            if dep_block:
                dependencies[name] = re.findall(r"[\"'](\d+)[\"']", dep_block.group(1))

        graph: dict[str, set[str]] = {name: set() for name in self.mod_order}
        for name, ids in dependencies.items():
            for workshop_id in ids:
                dependency_name = id_to_name.get(workshop_id)
                if dependency_name and dependency_name != name:
                    graph[name].add(dependency_name)
        present_core = [name for name in DEFAULT_CORE_MOD_ORDER if name in graph]
        for index in range(1, len(present_core)):
            graph[present_core[index]].add(present_core[index - 1])

        original_index = {name: index for index, name in enumerate(self.mod_order)}
        resolved = []
        visiting = set()
        visited = set()

        def visit(name: str) -> None:
            if name in visited or name in visiting:
                return
            visiting.add(name)
            for dependency in sorted(graph.get(name, set()), key=lambda item: original_index.get(item, 999999)):
                visit(dependency)
            visiting.remove(name)
            visited.add(name)
            resolved.append(name)

        for name in self.mod_order:
            visit(name)
        self.mod_order = resolved
        self.workshop.enabled_mod_order = list(self.mod_order)
        self.workshop.enabled_mods = set(self.mod_order)

    def save_mod_order(self, show_message: bool = True) -> None:
        modlist = self.sync.source / "modlist.txt"
        if modlist.exists():
            backup = BACKUP_DIR / datetime.now().strftime("%Y%m%d_%H%M%S_%f") / "modlist.txt"
            backup.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(modlist, backup)
        temp = modlist.with_name("modlist.txt.dzsync.tmp")
        temp.write_text(";".join(self.mod_order) + "\n", encoding="utf-8", newline="\n")
        os.replace(temp, modlist)
        config = read_json(self.sync.config_path)
        workshop = config.setdefault("workshop", {})
        workshop["enabled_mods"] = list(self.mod_order)
        workshop["mod_paths"] = dict(self.mod_paths)
        write_json(self.sync.config_path, config)
        was_running = bool(self.workshop_worker and self.workshop_worker.is_alive() and not self.workshop.stop_event.is_set())
        self.workshop.stop_event.set()
        if self.workshop_worker and self.workshop_worker.is_alive():
            self.workshop_worker.join(timeout=2)
        self.workshop_worker = None
        self.workshop = WorkshopWatcher(config, self.messages.put)
        if was_running:
            self.start_workshop_monitor()
        threading.Thread(target=lambda: self.sync.deploy_now(["modlist.txt"]), daemon=True).start()
        self.sync.emit(f"Modreihenfolge gespeichert: {len(self.mod_order)} Mods.")
        if show_message:
            messagebox.showinfo(APP_NAME, "Modliste gespeichert und auf die aktiven Ziele verteilt.")

    def open_mod_order(self) -> None:
        window = tk.Toplevel(self)
        window.title("DeutschZ Modreihenfolge")
        window.geometry("620x620")
        window.configure(bg="#010201")
        frame = ttk.Frame(window, padding=12)
        frame.pack(fill="both", expand=True)
        ttk.Label(frame, text="MODLISTE UND LADE-REIHENFOLGE", foreground="#a6ff00", font=("Segoe UI", 13, "bold")).pack(anchor="w", pady=(0, 8))
        listing = tk.Listbox(frame, bg="#010301", fg="#d9e6d9", selectbackground="#173614", selectforeground="#d7ff72", font=("Consolas", 10), exportselection=False)
        listing.pack(fill="both", expand=True)

        def refresh() -> None:
            listing.delete(0, "end")
            for index, name in enumerate(self.mod_order, 1):
                listing.insert("end", f"{index:02d}  {name}")
            self.mod_count_label.configure(text=f"{len(self.mod_order)} Mods")

        def move(delta: int) -> None:
            selection = listing.curselection()
            if not selection:
                return
            index = selection[0]
            new_index = index + delta
            if new_index < 0 or new_index >= len(self.mod_order):
                return
            self.mod_order[index], self.mod_order[new_index] = self.mod_order[new_index], self.mod_order[index]
            refresh()
            listing.selection_set(new_index)

        def remove() -> None:
            selection = listing.curselection()
            if not selection:
                return
            self.mod_order.pop(selection[0])
            refresh()

        buttons = ttk.Frame(frame)
        buttons.pack(fill="x", pady=(8, 0))
        ttk.Button(buttons, text="Nach oben", command=lambda: move(-1)).pack(side="left")
        ttk.Button(buttons, text="Nach unten", command=lambda: move(1)).pack(side="left", padx=6)
        ttk.Button(buttons, text="Entfernen", command=remove).pack(side="left")
        ttk.Button(buttons, text="Standard + Abhaengigkeiten", command=lambda: (self.resolve_mod_dependencies(), refresh())).pack(side="left", padx=6)
        ttk.Button(buttons, text="Speichern", command=lambda: (self.save_mod_order(), window.destroy())).pack(side="right")
        refresh()

    def _import_base(self) -> tuple[pathlib.Path, pathlib.PurePosixPath]:
        target = self.import_target.get()
        if target == "Profiles":
            return self.sync.profiles_source, pathlib.PurePosixPath("profiles")
        if target == "Mission":
            return self.sync.missions_source, pathlib.PurePosixPath("mpmissions")
        if target == "Server-Root":
            return self.sync.source, pathlib.PurePosixPath("")
        if self.current_file:
            parent = pathlib.PurePosixPath(self.current_file).parent
            if parent.as_posix() == ".":
                return self.sync.source, pathlib.PurePosixPath("")
            return self.sync.source_path(parent.as_posix()), parent
        return self.sync.profiles_source, pathlib.PurePosixPath("profiles")

    def select_import_files(self) -> None:
        paths = filedialog.askopenfilenames(
            filetypes=(("Server-Settings", "*.json *.xml *.cfg *.ini *.map *.c *.txt *.csv *.yml *.yaml *.bat"), ("Alle Dateien", "*.*"))
        )
        if paths:
            self.import_external_files([pathlib.Path(path) for path in paths])

    def _files_dropped(self, event):
        paths = [pathlib.Path(value) for value in self.tk.splitlist(event.data)]
        self.import_external_files(paths)
        return "break"

    def import_external_files(self, dropped: list[pathlib.Path]) -> None:
        base, canonical = self._import_base()
        candidates: list[tuple[pathlib.Path, pathlib.Path, pathlib.PurePosixPath]] = []
        for path in dropped:
            if path.is_file():
                candidates.append((path, base / path.name, canonical / path.name))
            elif path.is_dir():
                for child in path.rglob("*"):
                    if child.is_file():
                        tail = pathlib.Path(path.name) / child.relative_to(path)
                        candidates.append((child, base / tail, canonical / pathlib.PurePosixPath(tail.as_posix())))
        imported = []
        try:
            for source, destination, canonical_rel in candidates:
                if source.suffix.lower() not in EDITABLE_EXTENSIONS:
                    continue
                self.sync.validate_file(source)
                canonical_text = canonical_rel.as_posix().lstrip("./")
                if not matches(canonical_text, self.sync.includes) or matches(canonical_text, self.sync.excludes):
                    raise SyncError(f"Importziel ist nicht freigegeben: {canonical_text}")
                if destination.exists():
                    backup = BACKUP_DIR / datetime.now().strftime("%Y%m%d_%H%M%S_%f") / canonical_rel
                    backup.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(destination, backup)
                destination.parent.mkdir(parents=True, exist_ok=True)
                temp = destination.with_name(destination.name + ".dzsync-import.tmp")
                shutil.copy2(source, temp)
                os.replace(temp, destination)
                imported.append(canonical_text)
                self.sync.emit(f"Importiert: {source} -> {canonical_text}")
        except Exception as exc:
            messagebox.showerror(APP_NAME, f"Import blockiert: {exc}")
            return
        self.refresh_editor_files()
        if not imported:
            messagebox.showwarning(APP_NAME, "Keine freigegebene Settings-Datei gefunden.")
            return

        self._run(lambda: self.sync.deploy_now(imported), "Import wird verteilt...")
        messagebox.showinfo(APP_NAME, f"{len(imported)} Datei(en) importiert und fuer den Sync vorgemerkt.")

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

        self._run(lambda: self.sync.deploy_now([rel]), "Synchronisiere...")
        self.refresh_editor_files()
        return "break"

    def _run(self, action: Callable[[], object], label: str) -> None:
        if self.action_worker and self.action_worker.is_alive():
            messagebox.showwarning(APP_NAME, "Es laeuft bereits eine Aktion.")
            return
        self.status.configure(text=label)

        def wrapped() -> None:
            try:
                action()
            except Exception as exc:
                self.messages.put(f"{datetime.now():%Y-%m-%d %H:%M:%S} | FEHLER: {exc}")
            finally:
                try:
                    self.after(0, lambda: self.status.configure(text="Bereit"))
                except RuntimeError:
                    pass

        self.action_worker = threading.Thread(target=wrapped, daemon=True)
        self.action_worker.start()

    def start_monitor(self) -> None:
        if self.worker and self.worker.is_alive():
            return
        self.sync.stop_event.clear()
        self.worker = threading.Thread(target=self.sync.monitor, daemon=True)
        self.worker.start()
        self.start_button.configure(state="disabled")
        self.stop_button.configure(state="normal")
        self.status.configure(text="Monitor aktiv")

    def start_workshop_monitor(self) -> None:
        if self.workshop_worker and self.workshop_worker.is_alive():
            return
        self.workshop.stop_event.clear()
        self.workshop_worker = threading.Thread(target=self.workshop.monitor, daemon=True)
        self.workshop_worker.start()
        self.workshop_start_button.configure(state="disabled")
        self.workshop_stop_button.configure(state="normal")
        self.workshop_status.configure(text="Workshop wird ueberwacht")

    def stop_workshop_monitor(self) -> None:
        self.workshop.stop_event.set()
        self.workshop_start_button.configure(state="normal")
        self.workshop_stop_button.configure(state="disabled")
        self.workshop_status.configure(text="Pausiert")

    def scan_workshop_once(self) -> None:
        if self.workshop_worker and self.workshop_worker.is_alive():
            self.messages.put(f"{datetime.now():%Y-%m-%d %H:%M:%S} | Workshop wird bereits automatisch ueberwacht.")
            return

        def run_scan() -> None:
            self.workshop.scan()
            self.after(0, lambda: self.workshop_status.configure(text="Pruefung abgeschlossen"))

        self.workshop_status.configure(text="Pruefe Workshop...")
        threading.Thread(target=run_scan, daemon=True).start()

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
        self.workshop.stop_event.set()
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
