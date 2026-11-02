"""Write the Mirror AI provider key into ``backend/.env`` without echoing it.

The key is read with :func:`getpass`, so it never appears in the terminal, in
shell history, or in a chat transcript. An existing ``MIRROR_AI_API_KEY`` line
is replaced in place (comments and every other setting are preserved) instead
of appending a duplicate.

Usage, from the ``backend`` directory::

    .venv/Scripts/python.exe set_ai_key.py
"""

from __future__ import annotations

import getpass
import pathlib
import sys

ENV_PATH = pathlib.Path(__file__).resolve().parent / ".env"
NAME = "MIRROR_AI_API_KEY"


def main() -> int:
    if not ENV_PATH.exists():
        print(f"No env file at {ENV_PATH}. Copy .env.example to .env first.")
        return 1

    try:
        raw = getpass.getpass(f"Paste {NAME} (input is hidden): ")
    except (KeyboardInterrupt, EOFError):
        print("\nCancelled; nothing was written.")
        return 1

    key = raw.strip().strip('"').strip("'").strip()
    if not key:
        print("The key was empty; nothing was written.")
        return 1
    if any(character.isspace() for character in key):
        print("The key contains whitespace, which is never valid. Re-run and paste it again.")
        return 1

    lines = ENV_PATH.read_text(encoding="utf-8-sig").splitlines()
    written: list[str] = []
    replaced = False
    for line in lines:
        if line.strip().startswith(f"{NAME}="):
            written.append(f"{NAME}={key}")
            replaced = True
        else:
            written.append(line)
    if not replaced:
        written.append(f"{NAME}={key}")

    ENV_PATH.write_text("\n".join(written) + "\n", encoding="utf-8")
    print(f"Key written to {ENV_PATH} (length {len(key)}).")
    print("Next: restart the backend, then press Validate in the Mirror AI panel.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
