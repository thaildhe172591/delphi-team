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


def _machine() -> str:
    if hasattr(os, "uname"):
        return os.uname().machine
    return os.environ.get("PROCESSOR_ARCHITECTURE", "unknown")


def _missing_binary_message(exe: Path) -> str:
    return (
        f"delphi-team has no compiled binary for this platform "
        f"({sys.platform}, {_machine()}).\n"
        f"Expected it at: {exe}\n\n"
        "Install the Node distribution instead:\n"
        "    npm install -g delphi-team\n\n"
        "If you believe this platform should be supported, please open an issue."
    )


def _unrunnable_binary_message(exe: Path, error: OSError) -> str:
    return (
        f"delphi-team found its binary but could not run it: {error}\n"
        f"    {exe}\n\n"
        "The file is usually not executable, or the install is incomplete. Try reinstalling:\n"
        "    pipx reinstall delphi-team\n\n"
        "Or use the Node distribution instead:\n"
        "    npm install -g delphi-team"
    )


def _fail(message: str) -> "NoReturn":  # noqa: F821 - quoted so Python 3.9 needs no import
    sys.stderr.write(message + "\n")
    raise SystemExit(1)


def main() -> None:
    exe = binary_path()
    if not exe.is_file():
        _fail(_missing_binary_message(exe))

    args = [str(exe), *sys.argv[1:]]
    try:
        if os.name == "nt":
            # Windows has no execv that replaces the process, so run the binary as a child.
            raise SystemExit(subprocess.run(args).returncode)
        sys.stdout.flush()
        sys.stderr.flush()
        os.execv(str(exe), args)
    except KeyboardInterrupt:
        # On Windows the console delivers Ctrl+C to both processes; without this the child
        # exits cleanly and the parent then dies with a traceback. 130 is the shell convention.
        raise SystemExit(130) from None
    except OSError as error:
        # A present but unrunnable binary: no execute bit, wrong architecture, truncated file.
        # Report it the way the missing case is reported rather than raising a traceback.
        _fail(_unrunnable_binary_message(exe, error))
