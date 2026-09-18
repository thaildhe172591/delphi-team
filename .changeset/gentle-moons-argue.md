---
'delphi-team': patch
---

Standalone binaries in the GitHub release now carry their platform in the filename —
`delphi-linux-x64`, `delphi-windows-x64.exe` and so on, where every one of them used to be
called `delphi`. Only one of the six ever reached a release before, because GitHub names an
asset after its file and the rest collided.

`SHA256SUMS` lists those same names, so `sha256sum -c SHA256SUMS` now verifies what you
actually downloaded. It could not before.

The CLI itself is unchanged.
