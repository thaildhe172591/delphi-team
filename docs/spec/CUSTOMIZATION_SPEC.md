# CUSTOMIZATION_SPEC — Tùy biến vai trò, năng lực, phòng ban

Mục tiêu: người dùng (hoặc Orchestrator theo lệnh người dùng) có thể
- ghép vai trò (ví dụ **dev-be kiêm db-engineer**),
- thêm năng lực riêng (ví dụ **Pythia** để truy cập Oracle),
- tạo vai trò mới, sửa vai trò có sẵn,
- định nghĩa phòng ban riêng cho từng dự án,
mà **không mất thay đổi khi nâng cấp package**.

---

## 1. Mô hình: Base role + Capabilities + Project overrides

```
file vai trò cuối cùng (.claude/agents/<seat>.md)
  = base role          (.delphi/roles/<base>.md — do package cung cấp, có version)
  + capabilities       (.delphi/capabilities/<cap>.md — package hoặc người dùng)
  + project overrides  (khối delphi:project trong file cuối — người dùng sửa tự do)
  + frontmatter        (hợp nhất theo thứ tự ưu tiên §4)
```

Lệnh `delphi role build <seat>` sinh file cuối; `delphi role build --all` sinh toàn bộ.
Khi nâng cấp package: chỉ khối `core` và `capabilities` được sinh lại; khối `project` giữ nguyên; luôn có `--dry-run` và diff.

Định nghĩa seat trong `.delphi/config.yaml`:
```yaml
seats:
  dev-be:
    base: dev-be
    capabilities: [db-engineer, pythia-oracle]
    model: claude-opus-4-8
    effort: xhigh
    owns: ["src/api/**", "db/**"]
    description: "Backend + Oracle: API, thủ tục, package, truy vấn."
  ocr-reviewer:              # vai trò mới dựa trên base có sẵn
    base: reviewer
    capabilities: [ocr-domain]
```

---

## 2. Capability pack

Một capability là một file Markdown có frontmatter, mô tả **năng lực bổ sung** và **cách dùng công cụ**.

```markdown
---
id: <cap-id>
title: <tên>
version: 1
applies_to: [dev-be, db-engineer]      # base role được phép ghép (hoặc "*")
requires:
  tools: [Bash]                         # tool Claude Code cần có
  mcp_servers: []                       # tên MCP server phải được cấu hình ở project/user settings
  skills: []                            # tên skill cần có trong project/user
  commands: []                          # lệnh CLI cần có trong PATH (kiểm tra bằng doctor)
permissions:
  allow: []                             # quy tắc permission đề xuất thêm vào settings (người dùng duyệt)
  deny: []
risk: low|medium|high
conflicts_with: []
---

## Năng lực            (seat làm thêm được gì)
## Khi nào dùng
## Cách dùng công cụ     (bước cụ thể, ví dụ lệnh/MCP tool)
## Rào chắn an toàn      (điều cấm, điều phải xin duyệt)
## Bằng chứng khi báo cáo (phải dán gì vào report)
```

Quy tắc ghép:
- Nội dung capability chèn vào khối `delphi:capabilities` theo thứ tự khai báo, mỗi capability có marker riêng.
- `requires` được `delphi doctor` kiểm tra; thiếu thì cảnh báo, không âm thầm bỏ qua.
- `permissions` **không** tự ghi vào settings; `delphi role build` in ra đề xuất và chỉ ghi khi có `--apply-permissions`.
- Vì teammate có thể không nhận `mcpServers`/`skills` từ frontmatter, server/skill cần thiết phải được cấu hình ở project hoặc user settings; capability chỉ hướng dẫn cách dùng.

### 2.1 Capability có sẵn trong package
`db-engineer`, `api-contract`, `security-review`, `perf-review`, `ui-visual-check` (dùng ảnh trong assets), `data-migration`, `docs-writer`.

### 2.2 Ví dụ: Pythia (kit truy cập Oracle của người dùng)

Package chỉ cung cấp **mẫu có chỗ trống**; người dùng điền theo cách Pythia thực sự được cài
(MCP server, skill, CLI hay script). Agent build **không được đoán** chi tiết Pythia.

```markdown
---
id: pythia-oracle
title: Pythia — hiểu và thao tác Oracle
version: 1
applies_to: [dev-be, db-engineer, techlead, qa]
requires:
  mcp_servers: [<TÊN_SERVER_PYTHIA_NẾU_LÀ_MCP>]
  skills: [<TÊN_SKILL_PYTHIA_NẾU_LÀ_SKILL>]
  commands: [<LỆNH_PYTHIA_NẾU_LÀ_CLI>]
risk: high
---
## Năng lực
- Khám phá schema, bảng, view, package, thủ tục, phụ thuộc.
- Đọc dữ liệu mẫu để hiểu hình dạng dữ liệu thật.
- (Chỉ với quyền được cấp) chạy script thay đổi đã được duyệt.

## Khi nào dùng
- Trước khi viết/sửa API, thủ tục, truy vấn có liên quan bảng Oracle.
- Khi story có tham chiếu bảng/package hoặc lỗi dữ liệu.

## Cách dùng công cụ
<!-- người dùng điền: lệnh/tool cụ thể, tham số kết nối theo envcode, v.v. -->

## Rào chắn an toàn
- Mặc định chỉ đọc. Mọi DDL/DML: viết script → nêu môi trường + phạm vi + rollback → orchestrator xin người dùng duyệt → mới chạy.
- Không in thông tin đăng nhập/chuỗi kết nối vào chat, report hay file.
- Giới hạn số dòng khi đọc dữ liệu; che dữ liệu cá nhân trong report.

## Bằng chứng khi báo cáo
- Đối tượng DB đã xem (tên đầy đủ), câu truy vấn chính, số dòng/kết quả rút gọn, script đã chạy (nếu có) và kết quả.
```

Kết hợp với `knowledge/<seat>.md` (MEMORY_SPEC): hiểu biết về schema thu được qua Pythia được ghi lại để phiên sau không phải khám phá lại từ đầu.

---

## 3. Sửa vai trò bằng lời (qua Orchestrator)

Skill `/role` (và lệnh `delphi role …`) hỗ trợ:
| Yêu cầu người dùng | Hành động |
|---|---|
| "Cho dev-be kiêm DB engineer" | thêm capability `db-engineer` vào seat → build → hiển thị diff → chờ duyệt |
| "Thêm khả năng dùng Pythia cho techlead" | thêm `pythia-oracle` → doctor kiểm tra requires → build |
| "Tạo vai trò OCR analyst" | tạo seat mới từ base gần nhất (`ba`) + khối project → build |
| "dev-fe không được sửa thư mục api" | cập nhật `owns` / thêm rule vào khối project |
| "Đổi model tester sang Sonnet" | sửa `model` trong config → build |
| "Tạo capability mới từ quy trình này" | sinh file capability từ mẫu §2, người dùng điền phần cụ thể |

Mọi thay đổi: ghi DECISIONS (`D-…: role change`), commit riêng, có thể hoàn tác bằng `delphi role revert <seat>`.
Phiên đang chạy **không** tự nhận thay đổi vai trò; orchestrator thông báo seat nào cần khởi động lại.

---

## 4. Thứ tự ưu tiên khi hợp nhất
1. Tham số dòng lệnh / yêu cầu dispatch (model, effort cho một lần chạy)
2. `team.yaml` của dự án (override theo dự án)
3. `config.yaml` → `seats.<seat>`
4. Frontmatter của capability (chỉ các trường được phép: `tools` bổ sung, `color` không)
5. Base role của package

Xung đột (`conflicts_with`, `owns` chồng chéo, `disallowedTools` với `requires.tools`) → build thất bại với thông báo rõ.

---

## 5. Phòng ban tùy biến

`.delphi/teams/<name>.yaml`:
```yaml
name: ocr-oracle
description: Tính năng OCR có đụng Oracle
seats:
  - seat: orchestrator
  - seat: ba
  - seat: techlead
  - seat: dev-be          # đã kiêm db-engineer + pythia trong config
  - seat: dev-fe
  - seat: qa
    when: phase in [build, verify]     # chỉ spawn khi tới giai đoạn này
limits:
  max_active: 5
dispatch:
  mode: auto               # auto | teams | sessions | manual
```
`delphi team create <name> --from feature` tạo template mới; Orchestrator chọn template theo mô tả yêu cầu
hoặc theo `--team`. Dự án lưu thành phần thực tế vào `projects/<slug>/team.yaml`.

---

## 6. `.delphi/config.yaml` mẫu đầy đủ

```yaml
version: 1
language: vi                      # ngôn ngữ trả lời người dùng
project_prefix_len: 8             # độ dài prefix tên phiên
defaults:
  team: feature
  track: standard                 # quick | standard | enterprise
dispatch:
  mode: auto                      # auto | teams | sessions | manual
  surface: wt                     # wt | tmux | vscode | desktop | none
  max_active: 5
  hard_limit: 8
  confirm_before_dispatch: true
  teams:
    teammate_mode: in-process     # in-process | tmux | auto
    subagent_cache_ttl: 1h
models:                           # mặc định theo seat (ROLES_SPEC §2)
  orchestrator: { model: fable, effort: high }
  ba:           { model: opus, effort: xhigh }
  pm:           { model: opus, effort: xhigh }
  techlead:     { model: opus, effort: xhigh }
  dev-be:       { model: claude-opus-4-8, effort: xhigh }
  dev-fe:       { model: opus, effort: xhigh }
  db-engineer:  { model: opus, effort: xhigh }
  qa:           { model: opus, effort: high }
  tester:       { model: opus, effort: high }
  reviewer:     { model: opus, effort: high }
seats:                            # override/ghép capability (§1)
  dev-be:
    base: dev-be
    capabilities: [db-engineer, pythia-oracle]
    owns: ["src/api/**", "db/**"]
context:
  orchestrator_autocompact: 400k
  session_start_budget_kb: 4
  resume_budget_tokens: 12000
resume:
  auto_continue: false
  journal_tail: 50
  decisions_tail: 10
memory:
  compact_threshold_lines: 180
assets:
  dir: .delphi/assets
  max_mb: 10
safety:
  db_default: read-only
  allow_production: false
  redact_patterns: []             # regex che dữ liệu nhạy cảm trong report
worktree:
  copy_untracked: [".env"]
privacy:
  commit_ledger: true
  private_paths: []               # đường dẫn trong ledger không commit
budget:
  warn_parallel_sessions: 4
```
Schema kiểm tra bằng zod; `delphi doctor` báo trường lạ/thiếu.
