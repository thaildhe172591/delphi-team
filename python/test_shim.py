"""Self-check for the delphi-team shim. Run it directly: `python python/test_shim.py`.

Plain asserts, no test framework — the Python side is a shim, not a codebase, and a
dependency here would have to be installed on every runner just to check three branches.
"""

import os
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "src"))

from delphi_team import _shim  # noqa: E402


def _run_main(tmp_bin: Path, monkey_argv=("delphi",)):
    """Call main() with the shim pointed at tmp_bin, returning (exit_code, stderr)."""
    original_binary_path = _shim.binary_path
    original_argv = sys.argv
    original_stderr = sys.stderr

    class Capture:
        def __init__(self):
            self.text = ""

        def write(self, s):
            self.text += s

        def flush(self):
            pass

    captured = Capture()
    _shim.binary_path = lambda: tmp_bin
    sys.argv = list(monkey_argv)
    sys.stderr = captured
    try:
        _shim.main()
    except SystemExit as exc:
        return exc.code, captured.text
    finally:
        _shim.binary_path = original_binary_path
        sys.argv = original_argv
        sys.stderr = original_stderr
    raise AssertionError("main() returned instead of exiting")


def test_missing_binary_refuses_loudly(tmp: Path):
    """ADR-0005: no npx fallback. A platform with no binary gets an install hint."""
    code, err = _run_main(tmp / "nope")
    assert code == 1, code
    assert "no compiled binary for this platform" in err, err
    assert "npm install -g delphi-team" in err, err
    assert "npx" not in err, "the shim must not suggest or use npx"


def test_unrunnable_binary_reports_instead_of_crashing(tmp: Path):
    """A present-but-unrunnable binary must not surface as a traceback."""
    if os.name == "nt":
        # Windows has no execute bit; an empty .exe is rejected by CreateProcess instead.
        fake = tmp / "delphi.exe"
    else:
        fake = tmp / "delphi"
    fake.write_bytes(b"not an executable")
    if os.name != "nt":
        fake.chmod(0o644)

    code, err = _run_main(fake)
    assert code == 1, code
    assert "could not run it" in err, err
    assert "pipx reinstall delphi-team" in err, err


def test_real_binary_passes_through_argv_and_exit_code():
    """The happy path, using this Python interpreter as a stand-in for the compiled CLI."""
    script = "import sys; sys.stdout.write(' '.join(sys.argv[1:])); sys.exit(7)"
    result = subprocess.run(
        [sys.executable, "-c", script, "alpha", "beta"], capture_output=True, text=True
    )
    assert result.stdout == "alpha beta", result.stdout
    assert result.returncode == 7, result.returncode


def main():
    import tempfile

    tmp = Path(tempfile.mkdtemp())
    for name, fn in sorted(globals().items()):
        if not name.startswith("test_"):
            continue
        fn(tmp) if fn.__code__.co_argcount else fn()
        print(f"ok  {name}")
    print("\nall shim checks passed")


if __name__ == "__main__":
    main()
