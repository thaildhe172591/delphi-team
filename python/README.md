# delphi-team (Python distribution)

Run Claude Code as a department. Unofficial; works with Claude Code.

This wheel carries a compiled binary of the `delphi` CLI, so nothing here needs Node.
All logic lives in the TypeScript core — this package is a shim that hands over argv,
stdio and the exit code. See the project README for what the tool does.

```
pipx install delphi-team
uvx delphi-team --help
pip install delphi-team
```

Platforms without a published binary fail with an instruction to use `npm install -g delphi-team`
rather than silently downloading a Node runtime.
