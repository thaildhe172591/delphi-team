# MEMORY_SPEC — Bộ nhớ dự án & tái tạo ngữ cảnh

Mục tiêu: mở một phiên Orchestrator **mới** bất kỳ lúc nào (hôm sau, tuần sau, máy khác sau khi pull repo)
và tái tạo **chính xác** hiện trạng để làm tiếp, với lượng token nhỏ nhất.

Nguyên tắc:
1. **Hội thoại là tạm thời, file là vĩnh viễn.** Mọi thứ cần nhớ phải nằm trong file có cấu trúc.
2. **Ghi ngay khi xảy ra** (event-sourced), không đợi cuối ca.
3. **Tóm tắt có nguồn gốc:** mỗi dòng trong STATE trỏ về task/decision/report ID.
4. **Tin nhưng kiểm chứng:** khi tái tạo, đối chiếu ledger với thực tế (git, file, lệnh kiểm tra) trước khi hành động.
5. **Ngân sách token cố định** cho việc khởi động.

---

## 1. Các tầng bộ nhớ

| Tầng | Vị trí | Nội dung | Ai ghi | Ai đọc |
|---|---|---|---|---|
| L0 Luật chung | `CLAUDE.md` (block delphi-team) + `@.delphi/PROTOCOL.md` | Giao thức, quy ước | init | mọi phiên |
| L1 Ngữ cảnh dự án | `docs/project-context.md` | Stack, lệnh build/test, quy ước code | techlead | mọi seat |
| L2 Ledger dự án | `.delphi/projects/<slug>/` | Trạng thái công việc | orchestrator (chính), seat (report/story) | orchestrator, seat liên quan |
| L3 Trí nhớ vai trò | `.claude/agent-memory/<seat>/MEMORY.md` | Bài học bền, không phụ thuộc dự án | chính seat | chính seat |
| L4 Kiến thức dự án theo vai trò | `.delphi/projects/<slug>/knowledge/<seat>.md` | Hiểu biết riêng dự án (bảng DB, module...) | chính seat | seat đó + orchestrator khi cần |
| L5 Tìm kiếm (tùy chọn) | plugin | Truy vấn ngữ nghĩa trên ledger/knowledge | tự động | theo truy vấn |

Ghi chú: `memory: project` trong frontmatter chỉ bảo đảm khi chạy dạng subagent/`--agent`. Với teammate hoặc `/seat`,
thân file vai trò phải hướng dẫn tự đọc/ghi L3 **[VERIFY ở Phase 0]**.

---

## 2. Cấu trúc project ledger

```
.delphi/
├─ PROTOCOL.md                  # giao thức chung (được import từ CLAUDE.md)
├─ config.yaml                  # model/effort/dispatch/giới hạn (CUSTOMIZATION_SPEC §6)
├─ logs/                        # audit hooks (gitignored)
├─ teams/                       # team templates (có thể tự tạo)
├─ capabilities/                # capability packs (CUSTOMIZATION_SPEC)
├─ assets/                      # ảnh, file đính kèm
├─ index.yaml                   # danh sách dự án: slug, tiêu đề, trạng thái, cập nhật lần cuối
└─ projects/<slug>/
   ├─ BRIEF.md                  # mục tiêu, phạm vi, tiêu chí thành công, ràng buộc (ít thay đổi)
   ├─ STATE.md                  # ẢNH CHỤP hiện trạng (viết lại, ≤ 120 dòng)
   ├─ JOURNAL.md                # nhật ký sự kiện (chỉ thêm, có timestamp + ID)
   ├─ DECISIONS.md              # ADR ngắn (chỉ thêm; sửa = thêm bản ghi thay thế)
   ├─ board.yaml                # task/story, trạng thái, owner, phụ thuộc
   ├─ team.yaml                 # thành phần phòng ban của dự án + override
   ├─ stories/<ID>.md           # gói bàn giao cho từng việc
   ├─ reports/<seat>/<ID>-<n>.md
   ├─ handoffs/<ts>-<from>-<to>.md
   ├─ inbox/<seat>/<ts>-<from>.md   # thư chưa đọc/đã đọc (frontmatter status)
   ├─ knowledge/<seat>.md
   ├─ checkpoints/<yyyymmdd-hhmm>.md
   └─ sessions.log              # lịch sử dispatch: thời điểm, seat, chế độ, tên phiên, model
```

Toàn bộ `.delphi/projects/` được commit vào git (trừ file người dùng đánh dấu riêng tư trong config),
để máy khác hoặc đồng đội tái tạo được.

---

## 3. Định dạng dữ liệu

### 3.1 STATE.md (bắt buộc đủ các mục, theo thứ tự)
```markdown
# STATE — <tên dự án>        cập nhật: <ISO time> bởi <seat>
## Mục tiêu hiện tại            (1–3 dòng, trỏ BRIEF)
## Giai đoạn                    (ví dụ: Thiết kế → Xây dựng [đang] → Kiểm thử → Bàn giao)
## Việc đang làm                (ID · owner · trạng thái · bước tiếp theo)
## Đang chặn / rủi ro            (ID · nguyên nhân · cần ai)
## Quyết định gần nhất           (D-ID · 1 dòng)
## Chờ người dùng quyết định     (câu hỏi · lựa chọn · khuyến nghị)
## Bước tiếp theo đề xuất        (tối đa 5)
## Kiểm chứng nhanh              (lệnh để xác nhận hiện trạng, ví dụ test/verify script)
```

### 3.2 JOURNAL.md (một dòng một sự kiện)
```
2026-09-17T10:42+07:00 | T-012 | dev-be | status doing→review | report: reports/dev-be/T-012-1.md
2026-09-17T10:55+07:00 | D-007 | orchestrator | decision | chọn phương án B cho claim_form
```

### 3.3 Story (`stories/<ID>.md`) — gói bàn giao
Frontmatter bắt buộc: `id, title, type (feature|bug|spike|chore), owner, status, priority, depends_on, files (glob sở hữu), deliverables, acceptance[], verify (lệnh), attachments[], report_to, handoff_to, created, updated`.
Thân: Bối cảnh · Yêu cầu · Ràng buộc · Tham chiếu (requirement/decision/contract IDs) · Ghi chú triển khai · Lịch sử.

### 3.4 board.yaml
Trạng thái: `backlog → ready → doing → review → done`, cộng `blocked`, `cancelled`.
Luật chuyển: `ready` cần acceptance + files; `done` cần report có evidence + verdict `pass` (nếu có reviewer).

### 3.5 Checkpoint
Tạo khi: kết thúc ca, trước khi compact chủ động, trước thay đổi lớn, khi người dùng yêu cầu.
Nội dung: bản sao STATE tại thời điểm đó + git HEAD + danh sách phiên đang chạy + "resume note" ≤ 30 dòng
(những điều chưa kịp ghi vào ledger, giả thuyết đang theo đuổi).

---

## 4. Quy trình Rehydrate (Orchestrator mới)

Kích hoạt: skill `/resume [slug]`, hoặc hook SessionStart phát hiện dự án đang mở.

1. **Chọn dự án:** đọc `index.yaml`; nếu nhiều dự án đang mở và người dùng không chỉ định → hỏi.
2. **Nạp theo thứ tự và ngân sách** (mặc định tổng ≤ 12k token, cấu hình được):
   BRIEF (tóm tắt) → STATE → checkpoint mới nhất → DECISIONS (10 bản ghi gần nhất) → board (chỉ task chưa `done`) → JOURNAL (50 dòng cuối).
   Không đọc code, không đọc report đầy đủ ở bước này.
3. **Đối chiếu thực tế** (giao subagent để giữ ngữ cảnh gọn):
   - git: HEAD, nhánh, commit từ checkpoint gần nhất, thay đổi chưa commit.
   - Với mỗi task `doing/review`: file trong `files` có thay đổi không; chạy `verify` nếu rẻ.
   - Phiên còn sống: liệt kê seat online (ListAgents / agent list).
   - Ghi mọi sai lệch thành "Drift" (ledger nói X, thực tế Y).
4. **Situation Report** gửi người dùng (định dạng ROLES_SPEC §2.1) + danh sách Drift + đề xuất cách xử lý.
5. **Chờ xác nhận** trước khi dispatch lại (trừ khi config `resume.auto_continue: true`).
6. Ghi JOURNAL: `session start · rehydrate · drift=<n>`.

Tiêu chí đạt (có test): với một ledger mẫu, orchestrator mới nêu đúng 100% task đang mở, blocker và câu hỏi chờ người dùng.

---

## 5. Kỷ luật ghi (mọi seat)

| Sự kiện | Ai ghi | Ghi vào |
|---|---|---|
| Nhận/đổi trạng thái task | seat thực hiện (qua lệnh/tool của package) | board + JOURNAL |
| Hoàn thành/kẹt | seat | report + story + JOURNAL + tin nhắn orchestrator |
| Quyết định | orchestrator (hoặc techlead với quyết định kỹ thuật) | DECISIONS + JOURNAL |
| Hiểu biết mới về dự án | seat | knowledge/<seat>.md |
| Bài học dùng lại được mọi dự án | seat | agent-memory/<seat>/MEMORY.md |
| Sau mỗi lượt điều phối có thay đổi | orchestrator | viết lại STATE |

Ghi qua lệnh của package (`delphi task move`, `delphi journal add`, …) hoặc MCP tool tương ứng để có khóa file và định dạng chuẩn;
không để agent tự sửa YAML bằng tay trừ khi công cụ không khả dụng.

---

## 6. Bảo vệ ngữ cảnh
- Hook SessionStart (`startup|resume|clear|compact`): nạp lại bản rút gọn STATE + task của seat + inbox (≤ 4 KB).
- Orchestrator hạ ngưỡng auto-compact theo config; checkpoint trước khi `/compact` chủ động.
- `delphi doctor` cảnh báo: STATE quá dài, JOURNAL không cập nhật > N giờ khi có task `doing`, checkpoint quá cũ, memory vượt giới hạn nạp.
- `delphi memory compact <seat>`: gọn MEMORY.md, giữ bài học, bỏ chi tiết lỗi thời.
