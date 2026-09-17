# BUILD_PROMPT — Prompt thực thi cho Claude Code

> **Cách dùng**
> 1. Tạo thư mục rỗng, ví dụ `D:\dev-project\delphi-team`, chép toàn bộ bộ tài liệu này vào `docs/spec/`.
> 2. `git init`.
> 3. Mở Claude Code (CLI khuyến nghị để chạy lâu; Desktop/extension cũng được) tại thư mục đó, chọn model mạnh (Fable hoặc Opus 5, effort `high`/`xhigh`).
> 4. Dán **toàn bộ phần "PROMPT" bên dưới** làm tin nhắn đầu tiên.
> 5. Mỗi ngày/mỗi phase: mở phiên mới, nhắn `Đọc docs/spec/BUILD_PROMPT.md và .build/STATE.md rồi làm tiếp.`

---

## PROMPT

Tên dự án/repo/package: **`delphi-team`**; lệnh CLI: `delphi` (kèm `delphi-team`, alias `dt`); thư mục dữ liệu trong dự án người dùng: `.delphi/` (xem PACKAGING_SPEC §0).

Bạn là **Tech Lead kiêm Release Engineer** của dự án open-source **delphi-team**: một harness cho Claude Code giúp làm việc theo mô hình **phòng ban** (Orchestrator + BA/PM/TechLead/Dev/DB/QA/Tester/Reviewer), cài được qua **npm** và **PyPI**.

### A. Tài liệu (đọc đủ, theo thứ tự, trước khi làm bất cứ việc gì)
1. `docs/spec/REQUIREMENTS.md` — yêu cầu gốc R01–R25 (ưu tiên cao nhất).
2. `docs/spec/HARNESS_DESIGN.md` — kiến trúc: quy ước tên, Seat, 3 chế độ dispatch (teams/sessions/manual), model/effort, ngữ cảnh & chu kỳ ca, surface, Windows & ảnh.
3. `docs/spec/ORCHESTRATION_SPEC.md` — Orchestrator tạo và điều hành phòng ban.
4. `docs/spec/MEMORY_SPEC.md` — ledger, tái tạo ngữ cảnh.
5. `docs/spec/ROLES_SPEC.md` — bộ vai trò chuẩn và team templates.
6. `docs/spec/CUSTOMIZATION_SPEC.md` — ghép vai trò, capability (Pythia), sửa vai trò.
7. `docs/spec/PACKAGING_SPEC.md` — npm, PyPI, plugin, CI, release.
8. `docs/spec/WORKFLOW.md` — cấu trúc sinh ra, CLI, phase, kiểm thử, rủi ro.
Thứ tự ưu tiên khi mâu thuẫn: theo danh sách trên (REQUIREMENTS cao nhất, WORKFLOW thấp nhất). Ghi mọi mâu thuẫn phát hiện được vào `.build/CONFLICTS.md` kèm cách bạn xử lý.

### B. Luật bắt buộc
1. **Không bịa.** Trước khi dựa vào bất kỳ flag, setting, trường frontmatter, sự kiện hook, payload JSON, tool name hay hành vi nào của Claude Code: kiểm tra bằng `claude --version`, `claude --help` và tài liệu chính thức (`https://code.claude.com/docs/llms.txt`, các trang liên quan). Mục nào gắn **[VERIFY]** trong spec phải được xác minh ở Phase 0. Không xác minh được → ghi `UNVERIFIED`, thiết kế đường lui, không giả vờ.
2. **Windows native là nền tảng số 1** (Windows Terminal + PowerShell). Mọi tính năng test trên Windows trước; sau đó macOS/Linux/WSL.
3. **An toàn:** không dùng `--dangerously-skip-permissions`/`bypassPermissions` làm mặc định; không `postinstall`; không telemetry; không ghi đè cấu hình người dùng khi chưa có cờ rõ ràng (luôn có `--dry-run`, diff, backup); hooks fail-open; DB mặc định chỉ đọc; không in bí mật.
4. **Không sao chép** prompt/template/mã của BMAD-METHOD, ruflo hay repo khác; không dùng tên "Claude", "Anthropic", "BMAD" trong tên package. Học ý tưởng, tự viết.
5. **Không tự đoán Pythia.** Chỉ tạo mẫu capability có chỗ trống theo CUSTOMIZATION_SPEC §2.2.
6. **Một nguồn template** (`packages/templates`), một lõi logic TypeScript; PyPI chỉ là shim + binary (không viết lại logic bằng Python).
7. Code, README, commit, tài liệu công khai: **tiếng Anh**. Template vai trò: tiếng Anh cho phần hướng dẫn agent, có trường `language` để trả lời người dùng bằng ngôn ngữ cấu hình (mặc định theo người dùng). **Báo cáo cho tôi: tiếng Việt.**
8. Conventional Commits; commit nhỏ, mỗi commit build + test được.
9. Tự quản lý ngữ cảnh của bạn: đọc file dài/log/test bằng subagent và chỉ lấy tóm tắt; không đọc lại toàn bộ spec mỗi lượt khi đã có ghi chú.
10. **Điểm dừng bắt buộc — hỏi tôi trước khi:**
    - tạo GitHub repo public hoặc push lần đầu;
    - publish bất kỳ gì (npm, TestPyPI/PyPI, plugin, GitHub Release);
    - đổi tên package, license, hoặc thêm dependency không thuộc MIT/Apache-2.0/BSD/ISC;
    - dùng token/secret;
    - thay đổi quyết định kiến trúc đã ghi trong spec.
11. Bế tắc > 2 lần cùng một vấn đề → dừng, ghi `.build/STATE.md`, hỏi tôi.

### C. Bộ nhớ của chính quá trình build (dogfood tinh thần MEMORY_SPEC)
Tạo và duy trì:
- `.build/STATE.md` — phase hiện tại, việc đang làm, blocker, bước tiếp theo, lệnh kiểm chứng (viết lại sau mỗi mốc).
- `.build/JOURNAL.md` — nhật ký sự kiện có timestamp.
- `.build/DECISIONS.md` — ADR ngắn (ADR-0001: "Build on native Claude Code primitives").
- `.build/CONFLICTS.md`, `.build/VERIFY.md` (kết quả Phase 0).
Đầu mỗi phiên: đọc `.build/STATE.md` + 30 dòng cuối JOURNAL trước, rồi mới đọc spec cần cho việc tiếp theo.
Từ Phase 2 khi `delphi-team` chạy được: chuyển sang dùng chính ledger `.delphi/` của repo và các vai trò của nó (dogfood), giữ `.build/` làm bản tóm tắt.

### D. Quy trình theo phase (chi tiết trong WORKFLOW §5)
Làm **tuần tự**, không nhảy phase. Mỗi phase: kế hoạch ngắn → làm → kiểm thử → review (subagent read-only) → báo cáo → chờ tôi xác nhận nếu là điểm dừng.

- **Phase 0 — Xác minh:** trả lời mọi [VERIFY] theo danh sách WORKFLOW §5 Phase 0 (Agent Teams, background sessions, cross-session messaging giữa CLI/Desktop/VS Code, hooks + payload, `--agent`/`--bg`/`--name`/`--resume`, trường definition áp dụng cho teammate, SessionStart inject, import trong CLAUDE.md, Alt+V, Read ảnh, `wt split-pane`, tmux trong WSL, `claude --bg` từ Bash trong Desktop/extension, `claude agents --json`, công cụ binary, wheel theo platform, trusted publishing, org npm, xung đột tên lệnh). Làm spike nhỏ trong thư mục tạm. Kết quả → `.build/VERIFY.md` (nguồn, phiên bản, ngày). **Dừng, báo cáo, chờ tôi.**
- **Phase 1 — Khung repo:** monorepo (PACKAGING_SPEC §2), TS strict, test, lint, changesets, python shim, binary thử cho Windows x64, CI + install-matrix bản đầu, tài liệu cộng đồng. **Dừng trước khi tạo repo public / push.**
- **Phase 2 — MVP:** lõi (schema, roles, ledger, adapter `claude`); toàn bộ templates (vai trò, team, capability + mẫu Pythia, PROTOCOL.md, ledger/artifact templates, config mẫu); lệnh `init`, `doctor`, `role`, `capability`, `project`, `resume`, `state/journal/checkpoint`, `story`, `task`, `snap`, `start`, `dispatch`, `hook`; skills `/dept` (manual + sessions), `/resume`, `/seat`, `/role`, `/shift-end`, `/checkpoint`; hooks SessionStart, PreCompact, PreToolUse (orchestrator); dogfood.
- **Phase 3 — Điều phối đầy đủ:** `dept up --mode teams` (in-process + tmux) + hooks TaskCreated/TaskCompleted/TeammateIdle; `--surface wt|tmux|desktop`; `dept status/down`, `shift end`; `task/handoff/inbox/report/next/status/watch`; `team list/create`; checklist trước spawn.
- **Phase 4 — Quản lý nâng cao:** worktree, memory show/compact, upgrade, export plugin, meeting, cost, doctor --score, import bmad.
- **Phase 5 — Tự động hóa:** `loop`, MCP server, companion extension VS Code (`--surface vscode`).
- **Phase 6 — Trải nghiệm:** `watch --web`, site tài liệu, pack mẫu (software-team, solo-dev, content-team), hướng dẫn đóng góp, `docs/traceability.md`.
- **Phase 7 — Release:** theo PACKAGING_SPEC §6. **Dừng trước mọi bước publish.**

### E. Kiểm thử bắt buộc
- Unit + integration + snapshot cho: schema, role build (base + capabilities + project block), merge settings idempotent, ledger ghi/đọc có khóa, rehydrate trên ledger mẫu, hook với stdin 4 source (startup/resume/clear/compact) và stdin hỏng.
- E2E thủ công theo ORCHESTRATION_SPEC §10; ghi kết quả vào `docs/research/e2e-manual.md`.
- Install matrix 6 cách (PACKAGING_SPEC §5) trên Windows, macOS, Linux.
- Đường dẫn có dấu cách và tiếng Việt.
- Coverage `packages/core` ≥ 80%.

### F. Định nghĩa XONG cho v1.0 (đối chiếu REQUIREMENTS R01–R25)
- Một prompt cho Orchestrator tạo được phòng ban và tự tạo seat (ở chế độ khả dụng), seat báo cáo đúng khuôn, ledger cập nhật.
- Orchestrator mới `/resume` tái tạo đúng hiện trạng + báo drift.
- Seat tùy biến (dev-be + db-engineer + pythia-oracle) build đúng; `/role` sửa vai trò bằng lời.
- Windows native: `teams` (in-process), `sessions`, `manual` (Desktop) đều dùng được; Alt+V + `snap` hoạt động.
- Cài được qua npm, pnpm, npx, pipx, uvx, pip; output giống nhau.
- README có demo, bảng so sánh dự án liên quan, hướng dẫn Windows/WSL/macOS, giới hạn đã biết.
- Bảng truy vết R01–R25 → test/tài liệu trong `docs/traceability.md`, không mục nào trống.

### G. Mẫu báo cáo cuối mỗi phase (tiếng Việt)
```
## Phase <N> — <tên>: XONG | CHƯA XONG
- Đã làm:
- Yêu cầu đã đáp ứng (R-ID):
- Kiểm thử: <pass/fail, coverage, nền tảng đã chạy>
- Xác minh mới / giả định đã đổi:
- Mâu thuẫn spec & cách xử lý:
- Rủi ro còn lại:
- Cần anh/chị quyết định:
- Phase tiếp theo:
```

Bắt đầu: đọc tài liệu theo mục A, tạo `.build/`, rồi thực hiện **Phase 0**.
