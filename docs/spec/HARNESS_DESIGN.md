# HARNESS_DESIGN — Kiến trúc "Phòng ban" cho Claude Code

Tài liệu kiến trúc cấp cao của **delphi-team**. Chi tiết nằm ở các spec:
ORCHESTRATION_SPEC (điều phối) · MEMORY_SPEC (bộ nhớ, đường dẫn dữ liệu) · ROLES_SPEC (vai trò) ·
CUSTOMIZATION_SPEC (tùy biến) · PACKAGING_SPEC (phân phối). Mọi mục **[VERIFY]** phải được xác minh ở Phase 0.

Quy ước thống nhất cho mọi tài liệu:
- Seat IDs: `orchestrator`, `ba`, `pm`, `techlead`, `dev-be`, `dev-fe`, `db-engineer`, `qa`, `tester`, `reviewer` (+ tùy chọn `devops`, `security`, `ux`, `tech-writer`, `data-analyst`).
- CLI: `delphi` (kèm `delphi-team`, alias `dt`). Thư mục dữ liệu: `.delphi/`. Biến môi trường: `DELPHI_SEAT`, `DELPHI_PROJECT`.
- Tên phiên/teammate: `<prefix>-<seat>` (phiên dài hạn thêm `-<MMDD>`), `prefix` mặc định = slug dự án rút gọn.

---

## 1. Mục tiêu & nguyên tắc

Người dùng làm việc như một **phòng ban**: một Orchestrator (bộ não) và các vị trí chuyên môn, mỗi vị trí có vai trò, trí nhớ, phạm vi riêng.
Người dùng **chỉ nói chuyện với Orchestrator**; Orchestrator tự lập phòng ban, tạo phiên, giao việc, tổng hợp, xin quyết định.

Nguyên tắc:
1. **Bám tính năng gốc của Claude Code** (subagent definitions, `--agent`, `memory`, `--name`/`--resume`, hooks, skills, Agent Teams, background sessions, cross-session messaging, plugins). Không tự xây lại.
2. **File là nguồn sự thật**; hội thoại là tạm thời; tin nhắn giữa agent chỉ là "chuông báo".
3. **Ngữ cảnh sạch**: mỗi ca/mỗi story là phiên mới; tính liên tục nằm ở ledger + memory.
4. **Windows native trước tiên**, sau đó macOS/Linux/WSL.
5. **An toàn mặc định**: không bypass permission, DB chỉ đọc, hooks fail-open, không telemetry.

---

## 2. Khái niệm Seat

> **Phiên có thể mới, vị trí thì bền.**

| Thành phần của seat | Nơi lưu | Cơ chế |
|---|---|---|
| Danh tính, phạm vi, luật | `.claude/agents/<seat>.md` (sinh từ base role + capabilities) | `claude --agent <seat>`, teammate definition, hoặc skill `/seat` |
| Trí nhớ bền theo vai | `.claude/agent-memory/<seat>/MEMORY.md` | frontmatter `memory: project` (hoặc thân file hướng dẫn tự đọc/ghi) |
| Kiến thức theo dự án | `.delphi/projects/<slug>/knowledge/<seat>.md` | seat tự ghi |
| Hộp thư | `.delphi/projects/<slug>/inbox/<seat>/` | lệnh `inbox`, hook SessionStart |
| Artifact sở hữu | theo ROLES_SPEC §2 | `owns` trong config |
| Không gian làm việc | worktree riêng khi sửa code (tùy chọn) | worktree isolation của Claude Code / `delphi worktree` |

Loại seat:
- **Orchestrator**: phiên người dùng chat trực tiếp; không sửa mã nguồn.
- **Worker seats** (mọi vị trí còn lại): nhận việc từ Orchestrator, mỗi story một ngữ cảnh mới, cùng danh tính và trí nhớ.

---

## 3. Kiến trúc: Orchestrator + phòng ban

```
                 Người dùng
                    │  (chỉ nói chuyện với Orchestrator)
                    ▼
        ┌─────────────────────────┐
        │ ORCHESTRATOR            │  fable · high|xhigh · không sửa mã nguồn
        └──┬──────┬──────┬──────┬─┘
           ▼      ▼      ▼      ▼
        ┌────┐◄►┌────┐◄►┌──────┐◄►┌──────┐   mỗi seat một context window
        │ BA │  │ TL │  │DEV-BE│  │ QA   │   nhắn trực tiếp cho nhau
        └────┘  └────┘  └──────┘  └──────┘   + danh sách task dùng chung
           ▲______________________________▲
   ── .delphi/projects/<slug>: STATE · JOURNAL · DECISIONS · board · stories · reports ──  (bền qua ngày)
```

Ba chế độ dispatch trên **cùng một bộ seat definitions** (chi tiết ORCHESTRATION_SPEC §2):

| | `teams` (Agent Teams) | `sessions` (background sessions) | `manual` (Desktop / VS Code panel) |
|---|---|---|---|
| Ai tạo seat | Orchestrator (lead) spawn teammate | Orchestrator chạy `claude --bg --agent …` qua Bash **[VERIFY từ Desktop/extension]** | Người dùng mở phiên, gõ `/seat <seat>` |
| Agent ↔ agent | Mailbox + shared task list | `SendMessage` / `ListAgents` / `notify_when_idle` | Cross-session messaging (đã quan sát hoạt động giữa các phiên Claude Desktop trên Windows) |
| Duyệt quyền | Prompt của teammate hiện ở phiên lead | Seat kẹt quyền → người dùng peek/attach | Người dùng duyệt trong khung của seat |
| Model riêng | Có (spawn prompt / definition) | Có (`--model`) | Người dùng chọn trong khung |
| Effort riêng | Theo lead **[VERIFY frontmatter `effort`]** | Có (`--effort`) | Người dùng chọn trong khung |
| Resume | Không khôi phục teammate in-process → dựng lại đội mỗi ca từ ledger | Có (giữ agent, model, effort) | Theo Desktop/extension |
| Cache TTL (subscription) | 5 phút mặc định → đặt `subagentPromptCacheTtl: "1h"` | 1 giờ (hội thoại chính) | Theo surface |
| Trạng thái tính năng | Experimental | Research preview | Ổn định |
| Hợp với | Phối hợp chặt trong ca, CLI | Việc dài, cần model/effort riêng | Người dùng thích Desktop/extension |

Điểm mấu chốt: hạn chế "không resume teammate" trùng với nguyên tắc ngữ cảnh sạch, nên mỗi ca Orchestrator mới
**tái tạo ngữ cảnh từ ledger** (MEMORY_SPEC §4) rồi dispatch lại.

---

## 4. Model & effort (mặc định, đổi trong config)

| Seat | Model | Effort |
|---|---|---|
| orchestrator | `fable` | `high` (lập kế hoạch lớn: `xhigh`) |
| ba, pm, techlead, db-engineer | `opus` | `xhigh` |
| dev-be | `claude-opus-4-8` hoặc `opus` | `xhigh` (story khó: `max`) |
| dev-fe | `opus` | `xhigh` |
| qa, tester, reviewer | `opus` | `high` |

Ghi chú: tài liệu Claude Code cảnh báo `max` có thể lợi ích giảm dần và dễ nghĩ quá mức; Fable có thể tính vào usage credits tùy gói **[VERIFY]**; nhiều phiên song song tiêu quota tương ứng.

---

## 5. Chống tràn ngữ cảnh & chu kỳ ca

**Orchestrator**: không đọc code/log dài (giao subagent tóm tắt); đọc report theo khuôn ≤ 15 dòng; ghi quyết định ngay vào DECISIONS; hạ ngưỡng auto-compact theo config (ví dụ `--autocompact 400k`); checkpoint trước `/compact` chủ động.
**Worker**: một story một phiên; story là gói bàn giao đủ ngữ cảnh; test/log qua subagent; xong story thì dừng phiên.
**Tin nhắn**: gộp cập nhật; tôn trọng giới hạn burst/kích thước của messaging.
**Hook SessionStart** (`startup|resume|clear|compact`): nạp bản rút gọn STATE + task của seat + inbox (≤ 4 KB) qua `hookSpecificOutput.additionalContext` **[VERIFY cách inject]**.
**`delphi doctor`**: cảnh báo phiên quá lớn, resume qua đêm, STATE/checkpoint cũ.

Chu kỳ ca:
- **Cuối ca** (`/shift-end` mỗi seat → `delphi dept down`): cập nhật story/board, report, knowledge, memory; Orchestrator viết STATE + checkpoint (kèm resume note ≤ 30 dòng); commit ledger; dừng seat.
- **Đầu ca**: phiên Orchestrator **mới** → `/resume` → Situation Report → dispatch seat mới.
- **Trong ca**: `/clear` khi đổi chủ đề, `/compact <trọng tâm>` ở điểm dừng tự nhiên, `/context` để theo dõi.
- `delphi start <seat> --resume` chỉ khi cùng ngày và đang dở một luồng mà resume note chưa diễn đạt hết.

---

## 6. Hiển thị & surface

| Surface | Mức tự động | Cách làm |
|---|---|---|
| Windows Terminal (CLI native) | Tự động | `teams`: in-process (↑/↓ chọn teammate, Enter xem, Ctrl+T task list). `sessions`: `delphi dept up --surface wt` dùng `wt -w 0 split-pane …` mỗi pane một `claude --agent …` **[VERIFY cú pháp]**; hoặc người dùng tự chia pane |
| tmux / iTerm2 (macOS, Linux, WSL 2) | Tự động | `teams`: `teammateMode: "tmux"` (split-pane gốc). `sessions`: `--surface tmux` (`split-window` + `select-layout tiled`) |
| VS Code | Tự động qua companion extension (Phase 5) | Terminal ở vùng editor theo cột; mở panel chat Claude Code theo seat nếu extension có lệnh phù hợp **[VERIFY]** |
| Claude Desktop | Bán tự động | Người dùng New + chia khung + `/seat`; Orchestrator phát hiện bằng `ListAgents`. Không giả lập click |
| Mọi nơi | — | `delphi watch` (terminal) / `delphi watch --web` (localhost, mở trong trình duyệt hoặc Simple Browser của VS Code) |

Ghi chú từ tài liệu: split-pane của Agent Teams cần tmux hoặc iTerm2, không hỗ trợ terminal tích hợp VS Code, Windows Terminal, Ghostty.
Với Windows, split-pane gốc chỉ có khi chạy **cả tmux và Claude Code bên trong WSL** (cấu hình và đăng nhập riêng; phiên WSL và phiên Windows không nhắn tin được cho nhau).
`delphi team up` là alias của `delphi dept up --mode teams`. Không dùng bypass permissions để "cho mượt".

---

## 7. Windows & ảnh

- Dán ảnh trong CLI Windows: **Alt+V** (mặc định `chat:imagePaste`); Ctrl+V bị terminal giữ. `delphi doctor` kiểm tra `~/.claude/keybindings.json`.
- Đã có báo cáo Alt+V lỗi và làm mất clipboard → khuyến nghị chạy `delphi snap` **trước**.
- Tin nhắn giữa agent chỉ là văn bản → ảnh phải thành file: `delphi snap [--to <seat>] [--story <ID>] [--note]` lưu `.delphi/assets/<ts>.png` (Windows: PowerShell `Get-Clipboard -Format Image`; macOS/Linux/WSL: công cụ tương ứng), ghi `attachments` vào story và thư vào inbox.
- Seat đọc ảnh bằng công cụ Read theo đường dẫn **[VERIFY]**.
- Quy trình fix UI: Win+Shift+S → `delphi snap --to dev-fe --story <ID>` → Alt+V vào Orchestrator (để nó nhìn) → dispatch/nhắn `dev-fe`.
- Desktop/extension: dán ảnh trực tiếp vào khung seat; nếu cần chia sẻ thì chạy `snap`.

---

## 8. Tinh túy từ các dự án tham khảo (học ý tưởng, tự viết)

**BMAD-METHOD**: tài liệu là nguồn sự thật (brief → PRD → architecture → epics → stories); story là gói bàn giao; `sprint-status` → `board.yaml`; `project-context.md`; ngữ cảnh sạch cho từng workflow; quy trình co giãn (`--track quick|standard|enterprise`); `bmad-help` → `delphi next`; Party Mode → `delphi meeting`; ý tưởng tự động chuỗi create → dev → review → `delphi loop`.
**ruflo**: hooks tự động; memory theo namespace; theo dõi chi phí → `delphi cost`; MetaHarness → `delphi doctor --score`; hai đường cài (plugin nhẹ / CLI đầy đủ).
Bài học tránh từ issue công khai của ruflo: trạng thái giữ trong bộ nhớ MCP server mất khi resume → mọi trạng thái trong file; native module lệch phiên bản Node → lõi không dùng native dependency; prompt hard-code sai tên tool → tên tool sinh từ một nguồn và có test.
**aws-samples agent-team**: hook kiểm tra task (seat, files, acceptance, lệnh chạy), audit JSONL, fail-open.
**claude-squad / ccmux**: worktree theo phiên, bước `post_create` (copy `.env`, liên kết `node_modules`).
**claude-team-mcp**: nhận biết phiên rảnh, khôi phục phiên mồ côi.
**bmad-studio**: board trực quan, sổ chi phí.

---

## 9. Tương thích BMAD
`delphi import bmad` đọc artifact BMAD có sẵn (PRD, architecture, epics, sprint-status) và map vào ledger.
Không dùng tên "BMad/BMAD" ngoài mô tả tương thích; không sao chép prompt/template (tôn trọng TRADEMARK của họ).

---

## 10. Ngoài phạm vi v1
Swarm tự tổ chức/consensus · đa nhà cung cấp LLM trong lõi · daemon bắt buộc · telemetry · giả lập click để điều khiển Claude Desktop · vector memory trong lõi (để plugin tùy chọn sau này).
