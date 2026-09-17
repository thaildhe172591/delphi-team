# WORKFLOW — delphi-team

Quy trình triển khai theo phase, đặc tả CLI, kiểm thử, rủi ro.
Thứ tự ưu tiên khi mâu thuẫn: REQUIREMENTS > HARNESS_DESIGN > ORCHESTRATION/MEMORY/ROLES/CUSTOMIZATION/PACKAGING > WORKFLOW.
Mọi mục **[VERIFY]** phải được xác minh với Claude Code bản đang cài trước khi code dựa vào nó.

---

## 1. Bối cảnh ngắn
- Vấn đề: làm việc nhiều phiên theo vai trò; vai trò trôi mất khi phiên đổi/resume/clear/compact; người dùng phải prompt vai trò thủ công cho từng phiên và làm "người đưa thư" giữa các phiên.
- Giải pháp: seat definitions + ledger dự án + Orchestrator tự lập phòng ban, bám tính năng gốc của Claude Code (HARNESS_DESIGN).
- Dự án tham khảo (học ý tưởng, không sao chép): BMAD-METHOD, ruflo, claude-mpm, aws-samples/sample-claude-code-agent-team, claude-squad, claude-team-mcp, awesome-claude-code-subagents.
- Khoảng trống lấp: nhẹ, không cần service nền, Windows-first, chạy được với CLI, VS Code extension, Claude Desktop; cài qua npm và PyPI.

---

## 2. Stack (agent kiểm tra phiên bản ổn định mới nhất trước khi cài)
- Node LTS (engines `>=22` — **amended 2026-09-17, see `.build/DECISIONS.md` ADR-0009**; originally `>=20`), TypeScript strict, ESM; build `tsup`; test `vitest`; lint/format `biome` (hoặc eslint+prettier).
- CLI `commander` hoặc `cac`; tương tác `@clack/prompts`; frontmatter `gray-matter` + `yaml`; schema `zod` (xuất JSON Schema vào `schemas/`).
- Tiến trình con `execa`; khóa file `proper-lockfile`.
- Release `changesets`; npm provenance; PyPI trusted publishing; binary độc lập cho wheel (chọn công cụ ở Phase 0); Python shim bằng `hatchling` (hoặc tương đương), không chứa logic.
- Cấu trúc repo: PACKAGING_SPEC §2.

---

## 3. Những gì `delphi init` tạo trong dự án người dùng
```
CLAUDE.md                                  # block <!-- delphi:start/end --> + dòng import @.delphi/PROTOCOL.md [VERIFY cú pháp import]
docs/project-context.md                    # khung, techlead hoàn thiện
.claude/agents/<seat>.md                   # sinh từ base role + capabilities (CUSTOMIZATION_SPEC)
.claude/skills/{dept,resume,seat,role,shift-end,checkpoint}/SKILL.md
.claude/settings.json                      # hooks delphi (merge có marker, idempotent)
.claude/settings.local.json                # tùy chọn: bật agent teams, teammateMode, cache TTL (chỉ khi người dùng đồng ý)
.delphi/                                   # PROTOCOL.md, config.yaml, teams/, capabilities/, assets/, index.yaml, projects/ (MEMORY_SPEC §2)
.gitignore                                 # thêm .delphi/logs/, .delphi/tmp/
```
Dữ liệu: ROLES_SPEC §1, CUSTOMIZATION_SPEC §1–6, MEMORY_SPEC §2–3, ORCHESTRATION_SPEC §4–5, §11–12.

---

## 4. Đặc tả CLI

Mọi lệnh: `--json` (đầu ra máy đọc), `--dry-run` cho lệnh ghi, `--project <slug>` khi cần, mã thoát rõ ràng.

| Nhóm | Lệnh | Hành vi | Phase |
|---|---|---|---|
| Cài đặt | `delphi init [--track quick\|standard\|enterprise] [--team <t>] [--yes] [--force]` | Scaffold §3, merge hooks, block CLAUDE.md | 2 |
| | `delphi doctor [--fix] [--score]` | Phiên bản Claude Code, frontmatter, trùng `name`, tổng description, hooks, keybinding Alt+V, `requires` của capability, lệnh `wt`/`tmux`/`git`, STATE/checkpoint cũ, xung đột `owns` | 2 (`--score`: 4) |
| | `delphi upgrade` | Sinh lại khối core/capabilities của vai trò sau khi nâng cấp package, giữ khối project | 4 |
| Vai trò | `delphi role list\|add\|edit\|remove\|build\|revert` | CUSTOMIZATION_SPEC §1–4 | 2 |
| | `delphi capability list\|add\|new` | Capability packs (mẫu Pythia) | 2 |
| | `delphi team list\|create` | Team templates | 3 |
| Dự án & bộ nhớ | `delphi project new\|list\|open\|close` | Ledger (MEMORY_SPEC §2) | 2 |
| | `delphi resume [slug]` | Xuất gói tái tạo ngữ cảnh + kiểm tra drift (dùng bởi skill `/resume`) | 2 |
| | `delphi state show` / `journal add` / `checkpoint [--note]` | Ghi/đọc STATE, JOURNAL, checkpoint | 2 |
| | `delphi memory show\|compact <seat>` | Trí nhớ seat | 4 |
| Công việc | `delphi story new` / `task add\|list\|move\|show` | Story/board, luật chuyển trạng thái | 2–3 |
| | `delphi handoff new\|list` / `inbox [seat]` | Bàn giao, hộp thư | 3 |
| | `delphi report <seat> <ID> <DONE\|BLOCKED\|DECISION\|RISK\|PROGRESS>` | Ghi report + in tin nhắn đúng khuôn | 3 |
| | `delphi next [--seat]` | Gợi ý việc tiếp theo | 3 |
| | `delphi snap [--to <seat>] [--story <ID>] [--note]` | Ảnh clipboard → `.delphi/assets/`, gắn story/inbox | 2 |
| Điều phối | `delphi dept up [--mode auto\|teams\|sessions\|manual] [--surface wt\|tmux\|vscode\|desktop] [--team] [--project] [--seats]` | Lập phòng ban (ORCHESTRATION_SPEC) · `delphi team up` = `--mode teams` | 2 (manual, sessions) · 3 (teams, wt, tmux) · 5 (vscode) |
| | `delphi dept status` / `delphi status [--json]` | Seat online/thiếu, trạng thái (gộp board + `claude agents --json --all`) | 3 |
| | `delphi dept down` / `delphi shift end [seat]` | Kết thúc ca (ORCHESTRATION_SPEC §7) | 3 |
| | `delphi dispatch <seat> <ID> [--model] [--effort]` | Chạy một seat dạng background session cho một story | 2 |
| | `delphi start <seat> [--resume]` | Mở phiên seat trong terminal hiện tại (mặc định phiên mới) | 2 |
| | `delphi watch [--web]` | Dashboard chỉ đọc: board, seat, report, ảnh | 3 (`--web`: 6) |
| Nâng cao | `delphi worktree create\|remove <seat>` | Worktree + copy file không track theo config | 4 |
| | `delphi export plugin` | Sinh plugin Claude Code | 4 |
| | `delphi meeting <seats…> --topic` | Họp nhiều vai trò, biên bản vào DECISIONS | 4 |
| | `delphi cost [--seat] [--since]` | Chi phí từ dữ liệu cục bộ **[VERIFY nguồn dữ liệu ổn định]** | 4 |
| | `delphi import bmad` | Nhập artifact BMAD | 4 |
| | `delphi loop <epic> [--max-stories N]` | Chuỗi create → dev → review tự động, dừng khi cần người | 5 |
| | `delphi mcp` | MCP server stdio | 5 |
| | `delphi hook <event>` | Điểm vào cho hooks (fail-open) | 2 |

---

## 5. Các phase

Mỗi phase: kế hoạch ngắn → làm → test → review (subagent read-only) → báo cáo (§8). Không nhảy phase.

### Phase 0 — Xác minh (không viết code sản phẩm)
1. `claude --version`, `claude --help`; đọc docs chính thức: sub-agents, agent-teams, agent-view, cross-session-messaging, sessions, hooks, skills, memory, settings, keybindings, model-config, prompt-caching, context-window, plugins, cli-reference.
2. Trả lời mọi [VERIFY] trong các spec, tối thiểu:
   - `--agent` + `--name` + `--resume`; `--bg` kèm `--agent/--model/--effort/--name`; chạy `claude --bg` từ Bash **bên trong** một phiên (CLI, Desktop, VS Code extension).
   - Agent Teams: trường definition áp dụng cho teammate (`memory`, `effort`, `hooks`, `skills`, `mcpServers`), model riêng, `subagentPromptCacheTtl`, payload `TaskCreated/TaskCompleted/TeammateIdle`, Agent Teams có khả dụng trong Desktop/extension không.
   - Cross-session messaging: phiên CLI Windows ↔ phiên Desktop ↔ phiên VS Code extension có thấy nhau không; luật inbound mặc định; `notify_when_idle`.
   - Hooks: SessionStart inject (stdout thường hay `additionalContext`), giới hạn độ dài; PreCompact; PreToolUse chặn ghi.
   - CLAUDE.md import cú pháp `@path`; giới hạn MEMORY.md nạp tự động; skill re-inject sau compact.
   - Alt+V trên Windows; Read đọc ảnh PNG/JPG; `wt split-pane` và `-w 0`; split-pane tmux trong WSL.
   - `claude agents --json --all` các trường; nguồn dữ liệu chi phí.
   - Đóng gói: công cụ binary (kích thước, khởi động, Windows x64/arm64, macOS, Linux), wheel theo platform tag, trusted publishing npm/PyPI, tạo được org `@delphi-team`, lệnh `delphi`/`dt` có xung đột không.
3. Spike thủ công trong thư mục tạm: 1 agent + 1 hook in MARKER; start → exit → resume → `/clear` → compact; teams 2 teammate; sessions 2 phiên nhắn tin.
4. Ghi `.build/VERIFY.md` (nguồn, phiên bản, ngày; VERIFIED/UNVERIFIED/NOT SUPPORTED) + bản công khai `docs/research/claude-code-capabilities.md`.
5. Tạo `.build/STATE.md`, `.build/DECISIONS.md` (ADR-0001 "Build on native Claude Code primitives").
**Dừng: báo cáo, nêu giả định phải đổi, chờ duyệt.**

### Phase 1 — Khung repo & chất lượng
Monorepo theo PACKAGING_SPEC §2; TS strict; lint/test; changesets; LICENSE MIT; README khung; CONTRIBUTING, SECURITY, CODE_OF_CONDUCT, issue/PR templates; `ci.yml` (Windows/macOS/Linux); khung `python/` (shim); binary thử cho Windows x64; `install-matrix.yml` bản đầu.
**Nghiệm thu:** `pnpm i && pnpm build && pnpm test` xanh; `delphi --version` chạy từ npm pack và từ wheel cài bằng pipx trên Windows.
**Dừng trước khi tạo repo GitHub public / push.**

### Phase 2 — MVP
1. `core/schema`, `core/roles` (đọc/ghi frontmatter giữ nguyên thân), `core/ledger` (khóa file), `core/adapters/claude` (lớp duy nhất gọi `claude`).
2. Templates: toàn bộ vai trò ROLES_SPEC §2 (viết mới), team templates ROLES_SPEC §3, capability có sẵn + mẫu `pythia-oracle`, PROTOCOL.md (ORCHESTRATION_SPEC §11), ledger templates (MEMORY_SPEC §3), artifact templates (brief, PRD, architecture, epic, story, project-context), config mẫu (CUSTOMIZATION_SPEC §6).
3. `init`, `doctor`, `role *`, `capability *`, `project *`, `resume`, `state/journal/checkpoint`, `story`, `task` (cơ bản), `snap`, `start`, `dispatch`, `hook`.
4. Skills `/dept` (chế độ `manual` + `sessions`), `/resume`, `/seat`, `/role`, `/shift-end`, `/checkpoint` (ORCHESTRATION_SPEC §12).
5. Hook SessionStart (4 source), PreCompact (nhắc checkpoint), PreToolUse cho orchestrator (chặn ghi ngoài `.delphi/`, `docs/`).
6. Orchestrator không có quyền sửa mã nguồn; `reviewer` read-only; không template nào đặt bypass permissions.
7. Dogfood: `delphi init` cho chính repo.
**Nghiệm thu:** unit/integration/snapshot (§6); `/resume` đúng trên ledger mẫu; build seat `dev-be + db-engineer + pythia-oracle` đúng; E2E thủ công ORCHESTRATION_SPEC §10 mục 1–4 ở chế độ `sessions` và `manual`, ghi `docs/research/e2e-manual.md`.

### Phase 3 — Điều phối đầy đủ
`dept up --mode teams` (in-process + tmux), hooks `TaskCreated/TaskCompleted/TeammateIdle`; `--surface wt|tmux|desktop`; `dept status/down`, `shift end`; `task/handoff/inbox/report/next/status/watch`; `team list/create`; luật chuyển trạng thái ở CLI và hook; checklist trước spawn (ORCHESTRATION_SPEC §4).
**Nghiệm thu:** test tranh chấp ghi; snapshot `--json`; E2E §10 mục 5 trên Windows native.

### Phase 4 — Quản lý nâng cao
`worktree`, `memory show/compact`, `upgrade`, `export plugin` (**[VERIFY schema]**; cảnh báo trường plugin bỏ qua), `meeting`, `cost`, `doctor --score`, `import bmad`.

### Phase 5 — Tự động hóa
`loop` (headless theo seat **[VERIFY]**, dừng khi `changes` lặp quá N lần, `blocked`, hoặc vượt ngân sách); MCP server (`task_list`, `task_claim`, `task_update`, `handoff_create`, `handoff_ack`, `state_read`, `journal_append`) dùng chung core và khóa file; companion extension VS Code (`--surface vscode`).

### Phase 6 — Trải nghiệm & cộng đồng
`watch --web`; site tài liệu; pack `software-team`, `solo-dev`, `content-team`; hướng dẫn đóng góp vai trò/capability; `docs/traceability.md` (R01–R24 → test/tài liệu).

### Phase 7 — Release
Theo PACKAGING_SPEC §6: changesets → binaries + checksums → npm `next` + TestPyPI → install matrix 6 cách → GitHub Release → plugin manifest → **dừng chờ duyệt** → npm `latest` + PyPI.

---

## 6. Kiểm thử bắt buộc
| Loại | Nội dung |
|---|---|
| Unit | schema; frontmatter round-trip; role build (base + capabilities + project block); merge settings idempotent; context builder cắt độ dài; luật chuyển trạng thái |
| Integration | init trên thư mục trống / đã có `.claude` / đã có CLAUDE.md; doctor phát hiện lỗi cố ý; ledger + rehydrate trên fixture |
| Hook | stdin 4 source; stdin hỏng → exit 0; timeout |
| Concurrency | 2 tiến trình cùng cập nhật task/journal |
| Cross-OS | Windows (ưu tiên), macOS, Linux; đường dẫn có dấu cách và tiếng Việt (`D:\dev-project\Dự án`) |
| Install | 6 cách cài (PACKAGING_SPEC §5); output npm và PyPI giống nhau |
| E2E thủ công | ORCHESTRATION_SPEC §10 |
Coverage `packages/core` ≥ 80%.

---

## 7. Rủi ro & giảm thiểu
| Rủi ro | Giảm thiểu |
|---|---|
| Claude Code đổi flag/field/hành vi | Phase 0; `doctor` kiểm tra phiên bản tối thiểu; một lớp adapter duy nhất |
| Agent Teams / agent view còn thử nghiệm | 3 chế độ dispatch; `auto` tự chọn; file là nguồn sự thật |
| Hook làm hỏng phiên | Fail-open, timeout ngắn, log ra file |
| Ghi đè cấu hình người dùng | Marker, `--dry-run`, diff, backup |
| Tràn ngữ cảnh / chi phí | Report khuôn ngắn, subagent đọc dài, ngữ cảnh sạch mỗi ca, giới hạn `max_active`, cảnh báo chi phí |
| Thao tác DB nguy hiểm | Capability mặc định chỉ đọc; ghi cần duyệt; không production nếu không cấu hình rõ |
| Thương hiệu | Không dùng Claude/Anthropic/BMAD trong tên; ghi "unofficial, works with Claude Code" |
| Chuỗi cung ứng | Không postinstall, lockfile, provenance, ít dependency |

---

## 8. Mẫu báo cáo cuối phase (tiếng Việt)
```
## Phase <N> — <tên>: XONG | CHƯA XONG
- Đã làm:
- Yêu cầu đã đáp ứng (R-ID):
- Kiểm thử: <pass/fail, coverage, nền tảng>
- Xác minh mới / giả định đã đổi:
- Mâu thuẫn spec & cách xử lý:
- Rủi ro còn lại:
- Cần anh/chị quyết định:
- Phase tiếp theo:
```
