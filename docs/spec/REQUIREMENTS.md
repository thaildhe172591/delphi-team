# REQUIREMENTS — Tổng hợp yêu cầu của chủ dự án (nguồn sự thật cấp cao nhất)

Tài liệu này tổng hợp **mọi yêu cầu** (R01–R25) chủ dự án đã nêu. Khi các tài liệu khác mâu thuẫn, thứ tự ưu tiên:
`REQUIREMENTS` > `HARNESS_DESIGN` > `ORCHESTRATION_SPEC` / `MEMORY_SPEC` / `ROLES_SPEC` / `CUSTOMIZATION_SPEC` / `PACKAGING_SPEC` > `WORKFLOW`.

## Bối cảnh chủ dự án
- Làm việc kiểu **phòng ban**: nhiều phiên, mỗi phiên một vai trò (PM, TechLead, Dev BE, Dev FE, …).
- Môi trường chính: **Windows native** (không phải Ubuntu). Hay dùng **Claude Code VS Code extension** và **Claude Desktop** vì trực quan và **dán ảnh clipboard** để sửa lỗi UI. CLI cũng dùng nếu thao tác ảnh được.
- Đang chạy thủ công 3 phiên trong Claude Desktop (OCR PM / OCR TechLead / OCR Dev), gõ prompt vai trò cho từng phiên mới; các phiên đã nhắn tin cho nhau được.
- Có bộ kit riêng **Pythia** để agent truy cập DB **Oracle** (hiểu kiến trúc và thực thi).
- Dùng model: Orchestrator **Fable** (high/xhigh); các vị trí **Opus 5 / Opus 4.8** (tới max).

## Danh sách yêu cầu

| ID | Yêu cầu | Được đặc tả tại | Tiêu chí chấp nhận |
|---|---|---|---|
| R01 | Vai trò không bị mất khi phiên dừng/đổi tên/đổi ID, resume, clear, compact | HARNESS_DESIGN §2, §5; MEMORY_SPEC §6 | Sau resume/clear/compact, seat vẫn đúng vai trò và biết việc của mình |
| R02 | Dựa trên tài liệu Anthropic/Claude và thực tiễn cộng đồng; không bịa tính năng | BUILD_PROMPT luật 1; WORKFLOW Phase 0 | `docs/research/claude-code-capabilities.md` có nguồn cho mọi tính năng dùng |
| R03 | Tham khảo open-source (ruflo, BMAD-METHOD, claude-squad, aws agent-team, claude-team-mcp, …), kết hợp tinh túy | HARNESS_DESIGN §8; ROLES_SPEC mở đầu | README có bảng so sánh; không sao chép prompt/tên thương hiệu |
| R04 | Tạo **GitHub repo public** + **package public** phục vụ cá nhân và cộng đồng | BUILD_PROMPT; WORKFLOW Phase 1, 7 | Repo có LICENSE, CONTRIBUTING, SECURITY, CODE_OF_CONDUCT, CI xanh |
| R05 | Cài được qua **npm/pnpm** và **PyPI** | PACKAGING_SPEC | 6 cách cài đều chạy trên Windows x64 |
| R06 | Nhiều tính năng **quản lý agent** (status, watch, doctor, cost, task, handoff, loop, MCP, dashboard) | WORKFLOW §4 | Mỗi lệnh có test và tài liệu |
| R07 | Mỗi phiên = 1 agent, 1 vai trò, 1 vị trí, 1 memory riêng (như phòng ban) | HARNESS_DESIGN §2; MEMORY_SPEC §1 | Mỗi seat có definition + memory L3 + knowledge L4 |
| R08 | Ưu tiên **ngữ cảnh sạch**: hôm sau mở phiên mới thay vì chat tiếp phiên cũ; tránh compact/rot | HARNESS_DESIGN §5; MEMORY_SPEC §4 | `start` mặc định tạo phiên mới; shift protocol hoạt động |
| R09 | **Orchestrator là bộ não** (Fable high/xhigh); các seat Opus 5/4.8 (max); người dùng chỉ theo dõi và quyết định qua Orchestrator | HARNESS_DESIGN §3–4; ORCHESTRATION_SPEC | Seat báo cáo về Orchestrator; người dùng không phải trả lời từng phiên (trừ duyệt quyền) |
| R10 | Các phiên làm việc **mượt**, liên kết chặt, **không tràn ngữ cảnh** | HARNESS_DESIGN §5; ORCHESTRATION_SPEC §5–6, §11 | Report ≤15 dòng + file; orchestrator không đọc code/log dài |
| R11 | Mô hình **Agent Teams** như sơ đồ: Orchestrator + agent nhắn tin trực tiếp + shared task list | HARNESS_DESIGN §3; ORCHESTRATION_SPEC §2 (`teams`) | Chế độ `teams` hoạt động; agent nhắn nhau theo tên |
| R12 | Áp dụng DO/DON'T khi prompt team (sở hữu file, đầu ra rõ, nêu người nhận, 3–5 thành viên, đủ ngữ cảnh) | ORCHESTRATION_SPEC §4, §12 (hook TaskCreated) | Checklist trước spawn được kiểm tra bằng code/hook |
| R13 | **Xem các agent làm việc** (hiệu ứng như tmux split pane) | HARNESS_DESIGN §6; ORCHESTRATION_SPEC §9 | `watch`, `dept up --surface wt/tmux`, split-pane teams |
| R14 | **Windows native first**; hỗ trợ thêm hồ sơ WSL + tmux | HARNESS_DESIGN §1, §6–7; PACKAGING_SPEC §3–4 | Mọi tính năng test trên Windows Terminal + PowerShell trước |
| R15 | **Dán ảnh** clipboard dùng được trong CLI và chia sẻ ảnh cho các seat | HARNESS_DESIGN §7; ORCHESTRATION_SPEC §8 | Alt+V được kiểm tra; `snap` lưu ảnh + gắn vào story |
| R16 | Hỗ trợ **VS Code extension** và **Claude Desktop** (không chỉ CLI) | HARNESS_DESIGN §6; ORCHESTRATION_SPEC §2 (`manual`), §12 (`/seat`) | `/seat` biến phiên Desktop/extension thành seat; orchestrator phát hiện qua ListAgents |
| R17 | **Chỉ prompt Orchestrator là tự sinh phiên/phòng ban**; split view người dùng tự thao tác | ORCHESTRATION_SPEC §1–2 | Một prompt → ledger + story + ≥3 seat được tạo tự động (khi chế độ cho phép) |
| R18 | Bộ **.md vai trò chuẩn**: Orchestrator, BA, PM, TechLead, Dev BE, Dev FE, DB engineer, QA, Tester, Reviewer, … | ROLES_SPEC | Đủ file, đúng cấu trúc, qua lint/snapshot |
| R19 | Phòng ban cho **task, vấn đề, tính năng, dự án** | ROLES_SPEC §3; CUSTOMIZATION_SPEC §5 | Team templates `quick-fix`, `feature`, `feature-lite`, `project`, `investigation` |
| R20 | **Memory dài hạn chính xác**: Orchestrator mới tái tạo đúng hiện trạng tiến trình | MEMORY_SPEC | `/resume` nêu đúng 100% task mở/blocker/câu hỏi trên ledger mẫu + báo drift |
| R21 | **Custom Agent Teams** (ví dụ Dev BE kiêm DB engineer) | CUSTOMIZATION_SPEC §1, §5 | Seat ghép capability build đúng; team tùy biến dùng được |
| R22 | **Capability riêng (Pythia/Oracle)**; thêm/sửa/cập nhật khả năng cho vai trò | CUSTOMIZATION_SPEC §2–3 | Mẫu Pythia có chỗ trống; doctor kiểm tra `requires`; `/role` sửa bằng lời |
| R23 | An toàn: không bypass permission mặc định; DB mặc định chỉ đọc; không lộ bí mật | BUILD_PROMPT luật 3; ROLES_SPEC §2.7; CUSTOMIZATION_SPEC §2.2, §6; ORCHESTRATION_SPEC §12 | Test/hook chặn; review bảo mật trước release |
| R24 | Bộ tài liệu .md để **Agent tự build** đầy đủ repo; prompt thực thi chi tiết, đúng quy trình | BUILD_PROMPT | Agent chạy theo phase, có điểm dừng, báo cáo tiếng Việt |
| R25 | Tên dự án **delphi-team**; CLI `delphi`; dữ liệu `.delphi/`; Pythia là capability tùy chọn | PACKAGING_SPEC §0; HARNESS_DESIGN (quy ước) | Mọi tài liệu, package, lệnh dùng đúng quy ước; không phụ thuộc Pythia |

## Ngoài phạm vi (v1)
Swarm tự tổ chức/consensus, đa nhà cung cấp LLM, daemon bắt buộc, telemetry, giả lập click chuột để điều khiển Claude Desktop.
