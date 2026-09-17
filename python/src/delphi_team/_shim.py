"""Hand argv, stdin, stdout, stderr and the exit code to the bundled delphi binary.

On POSIX the process is replaced outright, so streams and signals are inherited and the
exit code is the binary's own. Windows has no real ``execv``, so the binary is run as a
child and its return code is propagated.

There is deliberately no fallback to ``npx`` (ADR-0005): it would reintroduce a Node
requirement for exactly the pip and uv users these wheels exist to serve. A platform with
no binary gets a clear message instead of a silent download.
"""

import os
import subprocess
import sys
from pathlib import Path

_BIN_DIR = Path(__file__).resolve().parent / "bin"


def binary_path() -> Path:
    """Where the compiled CLI lives inside the installed wheel."""
    return _BIN_DIR / ("delphi.exe" if os.name == "nt" else "delphi")


def _missing_binary_message(exe: Path) -> str:
    return (
        f"delphi-team has no compiled binary for this platform "
        f"({sys.platform}, {os.uname().machine if hasattr(os, 'uname') else os.environ.get('PROCESSOR_ARCHITECTURE', 'unknown')}).\n"
        f"Expected it at: {exe}\n\n"
        "Install the Node distribution instead:\n"
        "    npm install -g delphi-team\n\n"
        "If you believe this platform should be supported, please open an issue."
    )


def main() -> None:
    exe = binary_path()
    if not exe.is_file():
        sys.stderr.write(_missing_binary_message(exe) + "\n")
        raise SystemExit(1)

    args = [str(exe), *sys.argv[1:]]
    if os.name == "nt":
        raise SystemExit(subprocess.run(args).returncode)
    sys.stdout.flush()
    sys.stderr.flush()
    os.execv(str(exe), args)
