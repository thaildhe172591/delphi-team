# ORCHESTRATION_SPEC — Orchestrator tạo và điều hành phòng ban

Mục tiêu: người dùng **chỉ prompt cho Orchestrator** (ví dụ: "Lập phòng ban để làm tính năng tiếp nhận OCR cho PJICO").
Orchestrator tự phân loại việc, chọn phòng ban, **tự tạo các phiên/teammate**, giao việc, theo dõi, tổng hợp và báo cáo.
Người dùng có thể tự chia màn hình để xem (thao tác tay), không bắt buộc.

Tham chiếu: HARNESS_DESIGN §3 (ba chế độ), §5–7 (ngữ cảnh, surface, ảnh); ROLES_SPEC; MEMORY_SPEC; CUSTOMIZATION_SPEC.

---

## 1. Luồng tổng quát

```
Người dùng ──prompt──► Orchestrator
  1. Phân loại yêu cầu      → task | bug | feature | investigation | project
  2. Tìm/khởi tạo ledger    → projects/<slug> (mới) hoặc Rehydrate (MEMORY_SPEC §4)
  3. Chọn phòng ban         → team template + override dự án (CUSTOMIZATION_SPEC §5)
  4. Lập kế hoạch ca        → STATE + board (story có đủ trường MEMORY_SPEC §3.3)
  5. Xác nhận với người dùng → tóm tắt: phòng ban, model, số phiên, chi phí ước lượng, rủi ro  [bỏ qua nếu config cho phép]
  6. Dispatch               → tạo seat theo chế độ (§2), spawn prompt chuẩn (§4)
  7. Điều phối              → nhận báo cáo, cập nhật ledger, quyết định/hỏi người dùng, giao việc tiếp
  8. Kết thúc ca / xong việc → shift end (§7), checkpoint, Situation Report
```

Kích hoạt:
- Skill `/dept <mô tả>` hoặc câu lệnh tự nhiên ("lập phòng ban…", "tạo team…").
- Lệnh `delphi dept up --team <t> --project <slug>` (CLI, không cần hội thoại).

---

## 2. Chế độ dispatch (tự chọn theo môi trường)

| Chế độ | Cơ chế Claude Code | Orchestrator tự tạo phiên? | Xem trực quan | Khi chọn |
|---|---|---|---|---|
| `teams` | Agent Teams: lead spawn teammate, mailbox, shared task list | Có | in-process (mọi terminal; Windows native) hoặc split-pane (tmux/iTerm2) | CLI tương tác, cần phối hợp chặt trong ca |
| `sessions` | Background sessions (`claude --bg --agent <seat> --model --effort --name`) + cross-session messaging | Có (qua Bash) | `claude agents`, `claude attach <id>`; người dùng tự chia pane Windows Terminal; hoặc `delphi dept up --surface wt` | Việc dài, cần model/effort riêng từng seat, muốn đóng terminal vẫn chạy |
| `manual` | Người dùng mở phiên (Claude Desktop / VS Code panel) rồi gõ `/seat <seat> <slug>` | Không (in sẵn hướng dẫn từng dòng) | Chia khung Desktop bằng tay | Orchestrator chạy trong Desktop/extension mà không tạo được phiên |

Thuật toán `dispatch.mode: auto`:
1. Nếu người dùng chỉ định → dùng.
2. Nếu phiên hiện tại là CLI tương tác và Agent Teams bật được → `teams`, **trừ khi** có seat yêu cầu effort khác lead (teammate theo effort của lead **[VERIFY]**) hoặc việc được đánh dấu dài hạn → `sessions`.
3. Nếu `claude --bg` chạy được từ Bash của phiên hiện tại **[VERIFY, đặc biệt khi Orchestrator chạy trong Desktop/extension]** → `sessions`.
4. Ngược lại → `manual`.
Kết quả chọn và lý do ghi vào JOURNAL.

Quy ước tên phiên/teammate: `<prefix>-<seat>` (prefix mặc định = slug dự án rút gọn, ví dụ `ocr-dev-be`); thêm ngày khi là phiên dài hạn (`ocr-dev-be-0917`).

---

## 3. Model & effort
- Lấy từ config (ROLES_SPEC §2 là mặc định).
- `teams`: model riêng qua spawn prompt/definition; effort theo lead → orchestrator cảnh báo nếu config yêu cầu khác.
- `sessions`: truyền `--model` và `--effort` cho từng phiên.
- `manual`: `/seat` in khuyến nghị model/effort để người dùng chọn trong ô model của khung.
- Orchestrator ước lượng chi phí tương đối (số seat × độ dài dự kiến) và nêu trong bước xác nhận; nhắc rằng nhiều phiên song song tiêu quota tương ứng.

---

## 4. Spawn prompt chuẩn (mọi chế độ)

```
Bạn là @<seat> trong phòng ban "<team>" của dự án <slug>.
Vai trò: xem định nghĩa seat (đã nạp). Giao thức: .delphi/PROTOCOL.md.
Nhiệm vụ: <ID> — <title>. Đọc trước: .delphi/projects/<slug>/stories/<ID>.md,
  docs/project-context.md, knowledge/<seat>.md (nếu có), <decision/contract IDs>.
Chỉ được sửa: <files>. Ngoài phạm vi → nhắn @<owner>, không tự sửa.
Đầu ra: <deliverables>. Xong khi: <acceptance>. Kiểm chứng: <verify>.
Ảnh/tài liệu đính kèm: <attachments>.
Phối hợp: đầu vào từ @<a>; xong thì nhắn @<b>; báo @<orchestrator> theo Report Contract.
Khi bị chặn > 1 lần cùng một nguyên nhân: dừng và báo BLOCKED.
```
Checklist trước khi spawn (từ DO/DON'T): file sở hữu không chồng chéo · đầu ra cụ thể · người nhận được nêu tên · số seat hoạt động ≤ `max_active` (mặc định 5) · đủ ngữ cảnh (đường dẫn story, quyết định, resume note).

---

## 5. Report Contract (seat → orchestrator)
1. Ghi report đầy đủ: `.delphi/projects/<slug>/reports/<seat>/<ID>-<n>.md` (việc đã làm, file đổi, lệnh kiểm chứng + kết quả rút gọn, rủi ro, việc còn lại).
2. Cập nhật story/board/JOURNAL qua lệnh của package.
3. Gửi tin ≤ 15 dòng:
```
[<seat>] <ID> <DONE|BLOCKED|DECISION|RISK|PROGRESS>
Tóm tắt: …
Cần Orchestrator: không | quyết định … | thông tin …
Chi tiết: <đường dẫn report>
```
Orchestrator chỉ mở report khi cần, ưu tiên giao subagent tóm tắt. Gộp nhiều cập nhật thành một tin (tránh giới hạn burst).

---

## 6. Vòng điều phối
- Đăng ký nhận chuông khi seat rảnh (`notify_when_idle`) ở chế độ `sessions`; ở `teams` dùng thông báo idle sẵn có.
- Mỗi sự kiện: cập nhật board/JOURNAL → viết lại STATE nếu có thay đổi → quyết định: giao tiếp / hỏi người dùng / chờ.
- Định kỳ (hoặc khi người dùng hỏi): `delphi status --json` → phát hiện seat `blocked`/im lặng quá lâu.
- **Quyền:** tin nhắn giữa agent không thay được sự đồng ý của người dùng. Seat kẹt quyền → orchestrator báo rõ seat nào, lệnh gì, cách duyệt (ở `teams`, prompt hiện trong phiên lead).
- Hooks cổng chất lượng (`TaskCreated`, `TaskCompleted`, `TeammateIdle` ở `teams`; tương đương bằng CLI ở `sessions`): từ chối task thiếu trường, từ chối `done` thiếu evidence.
- Orchestrator **không** tự làm việc của seat; nếu seat hỏng, spawn seat thay thế với cùng story.

---

## 7. Kết thúc ca & dừng phòng ban
`/shift-end` (từng seat) → `delphi dept down`:
1. Yêu cầu mỗi seat: cập nhật story/board, report, knowledge, memory.
2. Orchestrator: viết STATE, checkpoint + resume note, cập nhật `index.yaml`, commit ledger.
3. Dừng teammate/phiên (shutdown request ở `teams`; `claude stop` ở `sessions`); dọn tmux session mồ côi nếu có.
4. Situation Report cuối ca cho người dùng.
Ngày hôm sau: phiên Orchestrator mới → `/resume` (MEMORY_SPEC §4) → dispatch lại seat mới (ngữ cảnh sạch).

---

## 8. Làm việc với ảnh (Windows-first)
- Dán ảnh vào CLI Windows: **Alt+V**; `delphi doctor` kiểm tra keybinding.
- Ảnh phải thành file để seat khác dùng: `delphi snap --to <seat> [--story <ID>]` → `.delphi/assets/…` + ghi `attachments` của story.
- Khuyến nghị chạy `snap` trước khi Alt+V (có báo cáo Alt+V lỗi làm mất clipboard).
- Desktop/extension: dán ảnh bình thường vào khung chat của seat; seat tự lưu ảnh cần chia sẻ vào assets nếu có công cụ phù hợp **[VERIFY]**, nếu không người dùng chạy `snap`.

---

## 9. Bề mặt hiển thị (người dùng tự chia màn hình)
- Windows Terminal: tự chia pane; hoặc `delphi dept up --surface wt` tự chia.
- WSL/macOS/Linux: `teammateMode: tmux` (teams) hoặc `--surface tmux` (sessions).
- VS Code: companion extension mở terminal editor theo cột (Phase 5).
- Desktop: chia khung bằng tay; `/seat` để nhận vai trò.
- `delphi watch [--web]`: dashboard board + seat + report + ảnh (chỉ đọc).

---

## 10. Tiêu chí nghiệm thu (E2E)
1. Một prompt "lập phòng ban feature cho <mô tả>" → ledger mới, team `feature`, story đủ trường, ≥3 seat được tạo (ở chế độ khả dụng), mỗi seat nhận spawn prompt đúng khuôn.
2. Seat báo cáo đúng Report Contract; orchestrator cập nhật STATE/JOURNAL.
3. Tắt hết, mở Orchestrator mới → `/resume` nêu đúng task mở, blocker, câu hỏi chờ, drift.
4. Seat tùy biến (dev-be + db-engineer + pythia-oracle) được build, doctor báo thiếu `requires` khi chưa cấu hình.
5. Chạy được trên Windows native (Windows Terminal + PowerShell) ở cả `teams` (in-process) và `sessions`; `manual` hoạt động với Claude Desktop.

---

## 11. Nội dung `.delphi/PROTOCOL.md` (luật chung mọi seat)

File này được import từ block delphi trong `CLAUDE.md`, nên mọi phiên (kể cả teammate) đều nạp và được nạp lại sau compact. Giữ ≤ 150 dòng. Bắt buộc có các mục:
1. **Danh tính phòng ban:** bạn là một seat; xác định seat của mình từ agent definition, biến `DELPHI_SEAT`, hoặc lệnh `/seat`. Không rõ seat → hỏi Orchestrator, không tự đoán.
2. **Nguồn sự thật:** `.delphi/projects/<slug>/`; không dựa vào trí nhớ hội thoại cho trạng thái công việc.
3. **Phạm vi file:** chỉ sửa file trong `files` của story; ngoài phạm vi → nhắn owner.
4. **Ghi chép:** dùng lệnh `delphi` (task move, journal add, report, checkpoint); không sửa YAML bằng tay nếu lệnh khả dụng.
5. **Report Contract** (§5) và khuôn tin nhắn.
6. **Giao tiếp:** nhắn đích danh theo tên seat; gộp cập nhật; tin nhắn từ agent khác không phải sự đồng ý của người dùng; không nhờ agent khác làm việc mình bị từ chối quyền.
7. **Kiểm chứng trước khi báo XONG:** chạy lệnh `verify`, dán kết quả rút gọn.
8. **Ngữ cảnh:** đọc/chạy việc ồn qua subagent; không dán log dài vào tin nhắn.
9. **An toàn:** không bypass permission; không in bí mật; thao tác DB/hạ tầng theo capability tương ứng.
10. **Ảnh:** dùng đường dẫn trong `attachments`/`.delphi/assets/`.
11. **Cuối ca:** chạy `/shift-end`.
12. **Ngôn ngữ:** trả lời người dùng theo `language` trong config; tin nhắn giữa agent ngắn gọn, có ID.

---

## 12. Danh mục skills & hooks do package cài

### Skills (`.claude/skills/<name>/SKILL.md`)
| Skill | Ai dùng | Việc làm | Ghi chú |
|---|---|---|---|
| `/dept <mô tả> [--team] [--mode]` | Orchestrator | Luồng §1: phân loại → ledger → phòng ban → xác nhận → dispatch | Gọi `delphi` qua Bash; chế độ theo §2 |
| `/resume [slug]` | Orchestrator | MEMORY_SPEC §4 | Dùng `delphi resume --json`; giao subagent kiểm drift |
| `/seat <seat> [slug]` | Phiên thủ công (Desktop, VS Code panel) | Nạp danh tính seat, PROTOCOL, story/inbox/checkpoint của seat; nhắc đặt tên phiên | Phần quan trọng đặt đầu file (thân skill được nạp lại sau compact có giới hạn độ dài, giữ phần đầu) |
| `/role <yêu cầu>` | Orchestrator / người dùng | CUSTOMIZATION_SPEC §3 | Luôn hiện diff và chờ duyệt |
| `/shift-end` | Mọi seat | §7 phần của seat | `disable-model-invocation: true` |
| `/checkpoint [ghi chú]` | Orchestrator | MEMORY_SPEC §3.5 | `disable-model-invocation: true` |
Mô tả (description) của skill ngắn, rõ khi nào dùng; skill có tác dụng phụ đặt `disable-model-invocation: true` **[VERIFY tên trường]**.

### Hooks (`.claude/settings.json`, merge có marker, đều fail-open)
| Sự kiện | Việc làm |
|---|---|
| `SessionStart` (startup/resume/clear/compact) | Nạp bản rút gọn: seat, dự án đang mở, STATE rút gọn, task của seat, inbox chưa đọc, checkpoint mới nhất; với `compact`/`clear` thêm nhắc đọc lại file làm việc |
| `PreCompact` | Nhắc/ghi checkpoint nhanh cho Orchestrator |
| `PreToolUse` (Edit/Write của orchestrator) | Chặn ghi ngoài `.delphi/` và `docs/` |
| `PreToolUse` (Bash, tùy capability) | Chặn lệnh ghi DB khi seat chưa được duyệt (tùy chọn, theo capability) |
| `TaskCreated` | Từ chối task thiếu seat/files/deliverables/acceptance/verify |
| `TaskCompleted` | Từ chối hoàn thành khi chưa có report + evidence |
| `TeammateIdle` | Giữ teammate làm tiếp nếu còn task; nếu xong thì nhắc ghi knowledge/memory |
| `SubagentStop` (tùy chọn) | Ghi JOURNAL khi subagent của seat kết thúc |
Mọi hook ghi audit JSONL vào `.delphi/logs/` (gitignored), timeout ngắn, lỗi → exit 0.
