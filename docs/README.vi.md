# Tài liệu delphi-team

[English](README.md) · **Tiếng Việt**

Dùng Claude Code như một phòng ban: một orchestrator để anh nói chuyện, và các seat chuyên môn — BA,
PM, tech lead, backend, frontend, DB, QA, tester, reviewer — mỗi seat có vai trò, bộ nhớ và phạm vi
file riêng.

> Không chính thức. Chạy cùng Claude Code; không liên kết với Anthropic.
> **Pre-alpha, chưa publish.** Mọi thứ ở đây chạy từ bản build nguồn.

## Bắt đầu từ đây

| | |
|---|---|
| [**Hướng dẫn**](guide.vi.md) | delphi hoạt động thế nào và làm việc với nó ra sao: mô hình, ledger, một ca làm từ đầu đến cuối |
| [**README của package**](../packages/cli/README.vi.md) | Cài đặt, năm phút đầu, và bảng tra toàn bộ lệnh |
| [**Dùng thử từng bước**](try-it.md) | Đi qua công cụ theo thứ tự hợp lý, mỗi lệnh có đánh dấu miễn phí hay tốn quota *(tiếng Anh)* |
| [**Phòng ban mẫu**](../examples/README.md) | Ba pack — solo-dev, software-team, content-team — và cách áp dụng *(tiếng Anh)* |
| [**Viết một role**](writing-a-role.md) | Dạy delphi một công việc nó chưa biết, và khi nào thì không nên *(tiếng Anh)* |
| [**Phát hành**](releasing.md) | Một phiên bản tới npm và PyPI thế nào, và phần một-lần chỉ anh làm được *(tiếng Anh)* |

## Ý tưởng

**Một seat sống lâu hơn phiên đang ngồi vào nó.**

Khi làm việc trên nhiều phiên Claude Code, mỗi phiên một vai trò, cái mong manh nhất chính là vai trò
đó. Nó sống trong một prompt anh gõ lại mỗi lần, và bốc hơi khi resume, khi `/clear`, khi compact,
hoặc khi phiên bị đổi tên. Kết cục anh thành người đưa tin giữa chính các phiên của mình.

- Danh tính, phạm vi và luật nằm trong agent definition được sinh ra, không nằm trong prompt gõ lại.
- Trạng thái công việc nằm trong ledger trên đĩa — brief, state, journal, decisions, board, story,
  report.
- Cuộc hội thoại là thứ dùng xong bỏ. Phiên ngày mai đọc ledger rồi làm tiếp.
- Anh nói chuyện với orchestrator. Nó lập phòng ban, chia việc, và mang quyết định về.

## Nó được xây thế nào

| | |
|---|---|
| [**Những gì đã kiểm chứng**](research/claude-code-capabilities.md) | Mọi tính năng Claude Code mà delphi dựa vào, kèm nguồn |
| [**Chỗ spec gặp thực tế**](../.build/CONFLICTS.md) | Mười tám chỗ công cụ làm khác điều spec giả định, và thứ được xây thay vào đó |
| [**Truy vết yêu cầu**](traceability.md) | Cả 25 yêu cầu, chỗ nào đã đáp ứng, và ba cái chưa |
| [**Tiếp quản việc build**](../.build/HANDOFF.md) | Đủ context cho một phiên khởi động lạnh: luật, trạng thái, và mọi cái bẫy đã trả giá |

Đặc tả gốc nằm trong [`spec/`](spec/) — chín tài liệu tiếng Việt, và chúng quyết định thiết kế. Chỗ
nào công cụ mâu thuẫn với chúng thì thực tế thắng, và bất đồng đó được ghi lại chứ không giấu đi.

## An toàn, nói ngắn

- Không bao giờ `--dangerously-skip-permissions`, và không gợi ý nó như cách lách.
- Không `postinstall`, không telemetry, không ghi đè config nếu thiếu cờ, dry-run và diff.
- Truy cập database mặc định chỉ đọc; một lệnh ghi cần script, môi trường được nêu tên, phương án
  rollback và sự đồng ý của anh.
- `delphi watch --web` chỉ phục vụ `GET`, bind 127.0.0.1, và kiểm `Host` header.
- Lệnh duy nhất tự tiêu quota — `delphi loop` — không làm gì nếu thiếu `--yes`, và in trần chi phí
  tính bằng số phiên trước.
