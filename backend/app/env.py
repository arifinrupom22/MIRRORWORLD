"""Minimal ``.env`` loader for the backend.

Python does not read ``.env`` files by default, and MIRRORWORLD deliberately
avoids adding a dependency for something this small. Without this module a key
placed in ``backend/.env`` is simply never seen: the process would report
"deterministic mode" while a perfectly good key sat on disk.

Rules honoured here:

* Real environment variables always win. A key exported by the shell, a
  container or the OS is never overwritten by a file.
* Only ``KEY=VALUE`` lines are read; ``#`` comments, blank lines and an
  optional ``export`` prefix are handled.
* Values are never logged. :func:`status` reports which names were loaded,
  never what they contain.
* The file is optional; a missing file is not an error.
"""

from __future__ import annotations

import os
from pathlib import Path

__all__ = ["DEFAULT_ENV_PATH", "load_env", "loaded_names"]

#: ``backend/.env`` — resolved from this file so it works from any cwd.
DEFAULT_ENV_PATH = Path(__file__).resolve().parent.parent / ".env"

_LOADED: list[str] = []
_READ_PATH: str | None = None


def _parse(text: str) -> dict[str, str]:
    values: dict[str, str] = {}
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if line.lower().startswith("export "):
            line = line[7:].strip()
        if "=" not in line:
            continue
        name, _, value = line.partition("=")
        name = name.strip()
        if not name or not name.replace("_", "").isalnum():
            continue
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {'"', "'"}:
            value = value[1:-1]
        else:
            # Strip a trailing inline comment only for unquoted values.
            hash_index = value.find(" #")
            if hash_index != -1:
                value = value[:hash_index].rstrip()
        values[name] = value
    return values


def load_env(path: str | Path | None = None) -> dict[str, str]:
    """Load a ``.env`` file into ``os.environ`` without overriding real vars.

    Returns the file's values (empty if the file is absent), which callers may
    use for diagnostics. Never returns or logs the values it wrote.
    """
    global _READ_PATH
    env_path = Path(path) if path is not None else DEFAULT_ENV_PATH
    if not env_path.is_file():
        return {}
    try:
        text = env_path.read_text(encoding="utf-8-sig")
    except OSError:
        return {}
    values = _parse(text)
    for name, value in values.items():
        if value and not os.environ.get(name):
            os.environ[name] = value
            if name not in _LOADED:
                _LOADED.append(name)
    _READ_PATH = str(env_path)
    return values


def loaded_names() -> list[str]:
    """Names imported from the file this process. Values are never exposed."""
    return list(_LOADED)


def read_path() -> str | None:
    return _READ_PATH
