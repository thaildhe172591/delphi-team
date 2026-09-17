# Bộ đặc tả delphi-team (bản hoàn thiện)

Bộ tài liệu để giao cho Claude Code tự dựng repo **delphi-team**: harness "phòng ban" cho Claude Code
(Orchestrator + BA/PM/TechLead/Dev/DB/QA/Tester/Reviewer), cài qua npm/pnpm và PyPI, Windows-first.

## Thứ tự đọc
| # | File | Nội dung |
|---|---|---|
| 0 | `BUILD_PROMPT.md` | **Prompt thực thi** — dán phần PROMPT vào Claude Code |
| 1 | `REQUIREMENTS.md` | Yêu cầu R01–R25 + tiêu chí chấp nhận (ưu tiên cao nhất) |
| 2 | `HARNESS_DESIGN.md` | Kiến trúc: quy ước tên, Seat, 3 chế độ, model/effort, ngữ cảnh & ca, surface, Windows & ảnh, tham khảo |
| 3 | `ORCHESTRATION_SPEC.md` | Một prompt → phòng ban; dispatch; spawn prompt; report contract; PROTOCOL.md; skills & hooks |
| 4 | `MEMORY_SPEC.md` | Ledger dự án; tái tạo ngữ cảnh cho Orchestrator mới |
| 5 | `ROLES_SPEC.md` | Khung file vai trò; 10 vai trò chuẩn; team templates |
| 6 | `CUSTOMIZATION_SPEC.md` | Ghép vai trò; capability (mẫu Pythia); sửa vai trò bằng lời; team tùy biến; config.yaml mẫu |
| 7 | `PACKAGING_SPEC.md` | Tên; npm + PyPI (binary wheel) + plugin; CI; install matrix; release |
| 8 | `WORKFLOW.md` | Cấu trúc sinh ra; CLI; phase 0–7; kiểm thử; rủi ro |

## Cách dùng
1. Tạo repo rỗng `delphi-team`, `git init`, chép thư mục này vào `docs/spec/`.
2. **Điền thông tin thật của Pythia** vào `CUSTOMIZATION_SPEC.md` §2.2 (MCP server / skill / CLI, tên, cách kết nối, quyền).
3. Mở Claude Code tại repo, dán phần **PROMPT** trong `BUILD_PROMPT.md`.
4. Agent làm Phase 0 rồi dừng báo cáo. Các ngày sau: phiên mới → `Đọc docs/spec/BUILD_PROMPT.md và .build/STATE.md rồi làm tiếp.`
