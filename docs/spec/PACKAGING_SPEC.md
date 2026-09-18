# PACKAGING_SPEC — Phân phối qua npm, PyPI và Claude Code plugin

Mục tiêu: người dùng cài bằng **một** trong các cách sau và có trải nghiệm giống hệt nhau:
```
npm i -g delphi-team      |  npx delphi-team init      |  pnpm dlx delphi-team init
pipx install delphi-team  |  uvx delphi-team init      |  pip install delphi-team
/plugin marketplace add <owner>/delphi-team  (bản nhẹ: agents + skills + hooks)
```
Tên `delphi-team` còn trống trên npm và PyPI tại thời điểm 17/09/2026 — **kiểm tra lại trước khi publish**.

---

## 0. Tên
| Thứ | Giá trị |
|---|---|
| Repo GitHub | `delphi-team` |
| Package npm | `delphi-team` (scope phụ `@delphi-team/*` khi tách package — **[VERIFY tạo được org npm]**) |
| Package PyPI | `delphi-team` (module Python `delphi_team`) |
| Lệnh CLI | `delphi-team` (trùng tên package để `npx`/`uvx` chạy thẳng), `delphi` (ngắn), `dt` (alias) — **[VERIFY không xung đột lệnh phổ biến; nếu có, bỏ alias đó]** |
| Thư mục trong dự án người dùng | `.delphi/` |
| Biến môi trường | tiền tố `DELPHI_` (ví dụ `DELPHI_SEAT`) |
| Marker trong file sinh ra | `<!-- delphi:… -->` |
| Plugin Claude Code | `delphi-team` |
| Companion VS Code | `delphi-team-vscode` |

Kit Pythia (Oracle) của chủ dự án là **capability tùy chọn**, không phải phụ thuộc.

## 1. Chiến lược: một lõi, nhiều kênh

- **Một mã nguồn lõi** bằng TypeScript (`packages/core`, `packages/cli`).
- **Một nguồn template** (`packages/templates`: roles, capabilities, teams, skills, hooks, ledger templates, PROTOCOL.md) được nhúng vào mọi bản phân phối.
- **npm:** package `delphi-team` (JS thuần, Node LTS ≥ 20, ESM), không `postinstall`.
- **PyPI:** package `delphi-team` gồm
  1. **wheel theo nền tảng** chứa binary độc lập của CLI (không cần Node) + shim Python (`delphi-team` console script gọi binary, chuyển tiếp args/stdin/stdout/exit code);
  2. **sdist/`py3-none-any` fallback**: shim gọi `npx --yes delphi-team@<cùng version>`; nếu không có Node thì báo lỗi hướng dẫn rõ ràng.
- **Binary độc lập:** chọn công cụ ở Phase 0 (ứng viên: `bun build --compile`, Node SEA) **[VERIFY: kích thước, khởi động, ký số trên Windows/macOS, hỗ trợ ARM]**.
- **Claude Code plugin:** thư mục `plugin/` (sinh từ templates) cho người chỉ cần agents/skills/hooks, không cần CLI. Ghi rõ giới hạn: plugin agents bỏ qua `hooks`, `mcpServers`, `permissionMode`.
- **Version lockstep:** cùng một số version cho npm, PyPI, plugin, GitHub release.

Không viết lại logic bằng Python (tránh hai mã nguồn lệch nhau).

---

## 2. Cấu trúc repo

```
delphi-team/
├─ packages/
│  ├─ core/          # logic: schema, roles build, ledger, tasks, dispatch adapters, doctor
│  ├─ cli/           # bin: delphi-team, delphi, dt
│  ├─ templates/     # nguồn duy nhất của mọi file .md/.yaml/.json được sinh
│  ├─ mcp/           # @delphi-team/mcp (Phase 5)
│  └─ vscode/        # delphi-team-vscode companion extension (Phase 5)
├─ python/
│  ├─ pyproject.toml # build backend: hatchling (hoặc tương đương) — [VERIFY cách đóng wheel kèm binary theo platform tag]
│  └─ src/delphi_team/{__init__.py, __main__.py, _shim.py, bin/}
├─ plugin/           # sinh tự động, không sửa tay
├─ scripts/          # build-binaries, build-wheels, sync-version, gen-plugin
├─ examples/
├─ docs/
└─ .github/workflows/{ci.yml, release.yml, install-matrix.yml}
```

---

## 3. Nền tảng mục tiêu

| OS | Kiến trúc | npm | PyPI wheel (binary) | Ưu tiên |
|---|---|---|---|---|
| Windows | x64 | ✔ | ✔ | **1** (môi trường chính của chủ dự án) |
| Windows | arm64 | ✔ | tùy công cụ | 3 |
| macOS | arm64, x64 | ✔ | ✔ | 2 |
| Linux (glibc) | x64, arm64 | ✔ | ✔ (`manylinux`) | 2 |
| Linux (musl) | x64 | ✔ | tùy công cụ | 3 |
| WSL 2 | x64 | ✔ (như Linux) | ✔ | 2 |

---

## 4. Yêu cầu về đường dẫn và shell
- Dùng `node:path`/`pathlib`, không hard-code `/`; test đường dẫn có dấu cách và tiếng Việt (`D:\dev-project\Dự án`).
- Gọi tiến trình con không qua shell khi có thể; khi cần shell trên Windows, dùng PowerShell và escape đúng.
- Kiểm tra `claude` trong PATH (Windows native installer và npm), `wt`, `tmux`, `git`.
- Không sửa file cấu hình toàn cục của người dùng (`~/.claude/settings.json`, `~/.tmux.conf`) nếu không có cờ rõ ràng; ưu tiên `.claude/settings.local.json` của dự án.

---

## 5. CI

`ci.yml` (mọi PR): lint, typecheck, unit/integration test, build binaries (không publish), build wheel, `plugin` sinh ra không đổi (git diff sạch), test template snapshot.

`install-matrix.yml` (trước release, trên windows-latest, macos-latest, ubuntu-latest):
- `npm i -g ./packed.tgz` → `delphi --version`, `delphi init --yes` trong repo tạm, `delphi doctor`.
- `npx`, `pnpm dlx` tương tự.
- `pipx install dist/*.whl` và `uvx --from dist/*.whl delphi-team …` tương tự.
- Wheel fallback trên máy có Node và không có Node (kỳ vọng lỗi hướng dẫn).

---

## 6. Release

`release.yml` (khi tạo tag `v*` sau khi chủ dự án duyệt):
1. `changesets` → version + CHANGELOG; `scripts/sync-version` cập nhật `pyproject.toml`, plugin manifest.
2. Build binaries theo ma trận; tạo checksum SHA-256.
3. Publish npm với provenance (trusted publishing nếu khả dụng) — ~~dist-tag `next` trước, `latest` sau khi duyệt~~
   → **sửa đổi C-020 (2026-09-18): `npm stage publish`, chủ dự án duyệt trên npmjs bằng 2FA.**
   OIDC chỉ ký `npm publish` và `npm stage publish`; `npm dist-tag add` sẽ cần token dài hạn trong repo.
4. Build wheels + sdist; publish PyPI bằng **trusted publishing (OIDC)**; TestPyPI trước.
5. GitHub Release: binaries, checksums, SBOM, ghi chú phát hành.
6. Cập nhật plugin marketplace manifest.
**Điểm dừng:** mọi bước publish cần chủ dự án duyệt (environment protection rule).

---

## 7. Bảo mật chuỗi cung ứng
- Không `postinstall`, không tải gì lúc cài.
- Lockfile bắt buộc; Dependabot/Renovate; ít dependency.
- Binary tải xuống (nếu có) kiểm tra checksum; ưu tiên nhúng sẵn trong wheel.
- Không telemetry. Không gửi dữ liệu dự án ra ngoài.
- Tên thương hiệu: không dùng "Claude"/"Anthropic"/"BMAD" trong tên package; README ghi "unofficial, works with Claude Code".

---

## 8. Tiêu chí nghiệm thu
- Cài bằng cả 6 cách ở đầu tài liệu trên Windows x64 → `delphi init` → `doctor` sạch → `dept up` chạy được ít nhất một chế độ.
- Output CLI giống hệt nhau giữa bản npm và bản PyPI (so sánh snapshot `--help`, `init --dry-run --json`).
- Gỡ cài đặt không để lại file ngoài thư mục dự án (trừ cache của trình quản lý gói).
