# delphi-team

[English](./README.md) · **Tiếng Việt**

**Dùng Claude Code như một phòng ban.** Một orchestrator để anh nói chuyện, và các *seat* chuyên môn
— BA, PM, tech lead, backend, frontend, DB, QA, tester, reviewer — mỗi seat có vai trò, bộ nhớ và
phạm vi file riêng.

> Không chính thức. Chạy cùng Claude Code; không liên kết với Anthropic.

> **Pre-alpha.** Nó chạy được và có test, nhưng bề mặt lệnh vẫn có thể đổi.

---

## Vấn đề

Khi làm việc trên nhiều phiên Claude Code, mỗi phiên một vai trò, **cái mong manh nhất chính là vai
trò đó.** Nó sống trong một đoạn prompt mà anh phải gõ lại cho mỗi phiên mới, và nó bốc hơi khi
resume, khi `/clear`, khi compact, hoặc khi phiên bị đổi tên. Kết cục là anh trở thành người đưa tin
giữa chính các phiên của mình, giải thích lại thứ đáng ra phải nằm trong file.

## Ý tưởng

**Một seat sống lâu hơn phiên đang ngồi vào nó.**

- Danh tính, phạm vi và luật nằm trong agent definition được sinh ra, không nằm trong prompt anh gõ lại.
- Trạng thái công việc nằm trong một *ledger* trên đĩa — brief, state, journal, decisions, board,
  story, report.
- Cuộc hội thoại là thứ dùng xong bỏ. Phiên ngày mai đọc ledger rồi làm tiếp.
- Anh chỉ nói chuyện với orchestrator. Nó lập phòng ban, chia việc, và mang quyết định về cho anh.

Nó dựng trên những gì Claude Code đã có sẵn — agent definition, background session, hook, skill,
plugin — chứ không viết lại thứ gì trong số đó.

---

## Cài đặt

**Yêu cầu** Node.js 22 trở lên, và [Claude Code](https://claude.com/claude-code) đã nằm trên PATH và
đã đăng nhập.

```bash
npm install -g delphi-team
```

<details>
<summary>pnpm, hoặc máy không có Node</summary>

```bash
pnpm add -g delphi-team
```

Có cả gói PyPI kèm binary độc lập, cho máy không cài Node:

```bash
pipx install delphi-team
```

</details>

Kiểm tra:

```bash
delphi --version
claude --version      # phải có và đã đăng nhập
```

CLI cài vào dưới cả hai tên: `delphi` và `delphi-team`.

> **`delphi` phải nằm trên PATH, không chỉ là build xong.** Các hook mà delphi cài vào project gọi
> `delphi hook <event>` bằng tên. Thiếu nó trên PATH thì hook fail open — im lặng không làm gì, và
> trông y hệt như đang chạy tốt.

### Chỉ riêng bộ skill

Sáu skill này chạy trong Claude Code, Codex, Cursor và hơn 70 agent khác, và anh **không cần cài
delphi** mới dùng được — ví dụ để đọc một ledger do người khác dựng:

```bash
npx skills add thaildhe172591/delphi-team          # chỉ project này
npx skills add thaildhe172591/delphi-team -g       # mọi project
```

Chúng là `delphi-dept`, `delphi-resume`, `delphi-seat`, `delphi-role`, `delphi-shift-end` và
`delphi-checkpoint`. Tiền tố là cố ý: `resume` từng che `/resume` của chính Claude Code và chạy
thay nó, im lặng.

`delphi init` cài đúng sáu cái đó vào `.claude/skills/`, nên anh không cần cả hai.

Hoặc cài như một plugin của Claude Code, cách này mang theo cả các seat chứ không chỉ skill:

```
/plugin marketplace add thaildhe172591/delphi-team
/plugin install delphi-team@delphi-team
```

Trên Codex cũng cùng hình dạng, chỉ khác là nó đọc manifest portable thay vì bản của Claude:

```
codex plugin marketplace add thaildhe172591/delphi-team
```

Plugin tự đặt namespace cho thứ nó cài, nên trong Claude Code skill sẽ là
`/delphi-team:delphi-resume`. Plugin
mang theo role, skill và protocol; **ledger và mọi lệnh `delphi` vẫn đến từ CLI**, và hook nó
cài sẽ không làm gì cho tới khi CLI nằm trên PATH.

---

## Năm phút đầu

### 1. Dựng project

delphi cần một git repository — nó từ chối khởi tạo ngoài repo.

```bash
cd your-project
delphi init --yes
delphi doctor
```

`init` ghi ra:

| | |
|---|---|
| `.delphi/` | config, protocol, roles, teams, capabilities |
| `.claude/agents/*.md` | mỗi seat một agent definition — đây là thứ Claude Code nạp |
| `.claude/settings.json` | bốn hook: SessionStart, PreCompact, PreToolUse, SubagentStop |
| `CLAUDE.md` | import `.delphi/PROTOCOL.md`, nên mọi phiên trong project đều nạp protocol |
| `.gitattributes` | ghim ledger về LF, để git trên Windows không báo cả file thay đổi |

`init` không bao giờ ghi đè file thuộc về anh nếu không có `--force`, và `--dry-run` cho xem trước nó
sẽ đổi gì.

### 2. Chọn một phòng ban

```bash
delphi pack list
delphi pack show solo-dev           # nó dùng cho việc gì, và sẽ đổi gì ở đây
delphi pack apply solo-dev          # in diff, không ghi gì
delphi pack apply solo-dev --write
delphi role build --all
```

| Pack | Dùng khi |
|---|---|
| `solo-dev` | Anh là cả đội |
| `software-team` | Sản phẩm có roadmap và schema còn thay đổi |
| `content-team` | Công việc mà đầu ra là chữ nghĩa, không phải code |

Sau đó sửa `owns` cho từng seat trong `.delphi/config.yaml`. Danh sách glob đó chính là thứ ngăn hai
seat bị điều lên cùng một file.

### 3. Tạo việc

```bash
delphi project new shop --title "Order checkout"
delphi story new T-001 --title "Add a health endpoint" --owner dev-be --project shop
```

Mở `.delphi/projects/shop/stories/T-001.md` và điền bốn trường. Board từ chối `ready` nếu thiếu:

```yaml
files: ["src/health.ts"]                  # glob mà story này sở hữu
deliverables: ["a GET /health route"]
acceptance: ["GET /health returns 200"]   # câu mà ai đó kiểm được
verify: "npm test"                        # lệnh chứng minh nó chạy
```

```bash
delphi task move T-001 ready --project shop
delphi next
```

### 4. Nói chuyện với orchestrator

```bash
claude
```

Phiên đó nạp `CLAUDE.md` → `.delphi/PROTOCOL.md`, và hook SessionStart chèn vào trạng thái hiện tại
cùng board. Anh nói muốn làm gì. Nó lập phòng ban, viết story, và điều seat.

---

## Từng thứ làm gì

Lệnh được đánh dấu **🟢 miễn phí** hoặc **🔴 tốn quota**. Không lệnh 🟢 nào khởi động phiên Claude.
Mọi lệnh đều nhận `--json`.

### Dựng project 🟢

| Lệnh | |
|---|---|
| `delphi init` | Dựng project thành một phòng ban |
| `delphi doctor` | Kiểm tra setup có lành lặn không, và chấm điểm |
| `delphi upgrade` | Cập nhật các file sinh ra theo phiên bản delphi hiện tại |

### Seat và team 🟢

| Lệnh | |
|---|---|
| `delphi role list` | Các seat đang có, và mỗi cái ghép từ gì |
| `delphi role build [seat] \| --all` | Dựng lại seat từ base role và capability |
| `delphi role add/remove <seat>` | Thêm hoặc gỡ một capability khỏi seat |
| `delphi capability list` | 8 capability pack ship sẵn, và mỗi cái cần gì |
| `delphi capability new <id>` | Bắt đầu một capability của riêng anh |
| `delphi team list` | 6 mẫu team |
| `delphi pack list \| show \| apply` | Phòng ban dựng sẵn |

Một **seat** = base role + các capability pack + những gì nó sở hữu. Một **capability** là việc mà
seat *cũng* làm được — `pythia-oracle` không xứng có một seat riêng, nó xứng là thứ mà dev backend
cũng làm được.

### Ledger 🟢

| Lệnh | |
|---|---|
| `delphi project new/list/open/close` | Các project phòng ban đang làm |
| `delphi state` | Ảnh chụp hiện tại: mục tiêu, phase, đang bay cái gì, kẹt cái gì |
| `delphi journal add/tail` | Nhật ký sự kiện — chỉ ghi thêm |
| `delphi task list/move/show` | Board |
| `delphi story new <id>` | Gói bàn giao cho một mẩu việc |
| `delphi report <seat> <id> <outcome>` | Viết report và in ra tin nhắn gửi orchestrator |
| `delphi checkpoint` | Lưu một điểm khôi phục |
| `delphi resume [slug]` | Mọi thứ một orchestrator mới cần để làm tiếp từ chỗ người trước dừng |

**Board từ chối nước đi sai luật.** `ready` cần acceptance criteria và danh sách file; `done` cần
report có bằng chứng; `blocked` cần lý do. Hai story cùng đòi một file bị chặn trước khi seat nào kịp
khởi động.

### Vận hành phòng ban

| Lệnh | | |
|---|---|---|
| `delphi dept up --dry-run` | 🟢 | Ai sẽ khởi động, vì sao, và prompt chính xác mỗi seat nhận được |
| `delphi dept up` | 🔴 | Khởi động họ |
| `delphi dept status` | 🟢 | Ai đang làm, ai kẹt, cái gì đang chờ |
| `delphi dept down` | 🟢 | Dừng các seat project này đã khởi động |
| `delphi dispatch <seat> <id>` | 🔴 | Một seat, một story, chạy nền |
| `delphi start <seat>` | 🔴 | Mở phiên seat ngay trong terminal này |
| `delphi seat <seat>` | 🟢 | Gói một seat cần để bắt đầu, để dán vào Claude Desktop |
| `delphi meeting <seats...>` | 🟢 | Prompt để đặt nhiều seat lên cùng một câu hỏi |
| `delphi loop` | 🔴 | Chạy một story qua dev và review, tự động |

Cả `dept up` lẫn `dispatch` đều chạy cùng bộ kiểm tra tiền-điều-phối: hai seat sở hữu cùng một path,
hai story đòi cùng một file, story thiếu acceptance criteria — mỗi cái đều chặn việc điều phối. Cả
hai đều hỏi trước khi tiêu, trừ khi anh truyền `-y` hoặc terminal không hỏi được.

### Theo dõi 🟢

| Lệnh | |
|---|---|
| `delphi watch` | Board và các seat đang sống, cạnh nhau |
| `delphi watch --follow` | Tự vẽ lại |
| `delphi watch --web` | Cùng view đó trên trình duyệt, tại `127.0.0.1:4173` |
| `delphi cost` | Số phiên delphi đã khởi động — **không phải** tiền tài khoản, và nó nói rõ thế |

`--web` là chỉ-đọc: chỉ `GET`, không endpoint nào ghi, bind vào 127.0.0.1, và kiểm `Host` header —
nếu không, một trang web bất kỳ trong trình duyệt của anh có thể trỏ hostname nó kiểm soát về
localhost rồi đọc sạch ledger.

### Giữa các seat 🟢

| Lệnh | |
|---|---|
| `delphi handoff new/list` | Ghi chú bàn giao: phần không nằm trong file nào |
| `delphi inbox [seat]` | Tin nhắn đang chờ một seat |
| `delphi next` | Nên cầm việc gì lên bây giờ |
| `delphi shift end` | Đóng ca: checkpoint, rồi dừng các seat |
| `delphi memory show/compact <seat>` | Seat nhớ gì giữa các phiên |

### Nâng cao 🟢

| Lệnh | |
|---|---|
| `delphi worktree create/remove <seat>` | Một git worktree riêng cho mỗi seat |
| `delphi export plugin` | Sinh một Claude Code plugin từ template |
| `delphi import bmad` | Ánh xạ artifact BMAD-METHOD sang ledger delphi |
| `delphi snap` | Lưu ảnh clipboard vào assets của project |
| `delphi mcp` | Chạy MCP server của delphi trên stdin/stdout |

`delphi mcp` cho seat tám công cụ thao tác ledger thay vì phải gõ lệnh shell — cùng core, cùng khoá
file, cùng các từ chối, chỉ khác cửa vào:

```bash
claude mcp add delphi --scope project -- delphi mcp
```

Nó sẽ hiện **pending approval**, và như vậy là đúng: `.mcp.json` phạm vi project là file ai cũng có
thể commit vào.

---

## `delphi loop` — đọc phần này trước khi dùng

Lệnh duy nhất tự khởi động phiên.

```bash
delphi loop                 # in trần chi phí và prompt đầu tiên, không tiêu gì
delphi loop --yes           # chạy thật
```

| Chốt chặn | Mặc định |
|---|---|
| `--max-stories` | 1 |
| `--max-attempts` | 3 lần điều phối cho mỗi story |
| `--step-timeout` | 20 phút cho mỗi seat |

`--max-stories × --max-attempts` là số phiên `claude` tối đa mà một lần gọi có thể khởi động, và con
số đó **được test chứ không phải chỉ tuyên bố**. Nó tự dừng khi: một seat báo BLOCKED / DECISION /
RISK, một seat kẹt ở permission prompt, board chặn story, hoặc story không nhúc nhích nữa.

---

## Cấu hình

Mọi thứ nằm trong `.delphi/config.yaml`, và file đó là của anh — delphi không bao giờ viết lại nó nếu
không có cờ, dry-run và diff.

```yaml
language: vi                     # ngôn ngữ các seat trả lời anh

defaults:
  team: feature

dispatch:
  mode: auto                     # auto | teams | sessions | manual
  surface: auto                  # auto | wt | tmux | vscode | desktop | none
  max_active: 5                  # ba tới năm seat phối hợp tốt; nhiều hơn thì không
  confirm_before_dispatch: true

models:
  orchestrator: { model: fable, effort: high }
  dev-be: { model: opus, effort: xhigh }

seats:
  dev-be:
    base: dev-be
    capabilities: [db-engineer, pythia-oracle]
    owns: ["src/api/**", "db/**"]

safety:
  db_default: read-only
  allow_production: false
```

`surface: auto` chia chính terminal anh đang ngồi: trong tmux thì split tmux, trong terminal VS Code
thì để extension lo, còn lại thì split cửa sổ Windows Terminal hiện tại. Anh giữ pane của mình, các
seat xếp chồng bên cạnh.

---

## An toàn

Đây không phải mặc định có thể vô tình tắt. Đây là thiết kế.

- **Không bao giờ** `--dangerously-skip-permissions`, và delphi cũng không gợi ý nó như cách lách.
- **Không `postinstall`, không telemetry.** Không gì chạy lúc cài, không gì gọi về nhà.
- **Config là của anh.** Không ghi đè nếu không có cờ tường minh, dry-run và diff.
- **Truy cập database mặc định chỉ đọc.** Một lệnh ghi cần script, môi trường được nêu tên, phương án
  rollback và sự đồng ý của anh — theo đúng thứ tự đó.
- **Orchestrator không được sửa source.** Một hook giữ nó trong ledger và docs, vì orchestrator mà
  bắt đầu sửa code thì ngừng điều phối.
- **Không qua shell, bao giờ.** Tham số được truyền như tham số, nên path có dấu cách hay ký tự
  không-ASCII không thành vấn đề.
- **`watch --web` chỉ phục vụ `GET`**, bind 127.0.0.1, và kiểm `Host` header.
- **Bí mật không bao giờ được in ra** — không trong chat, không trong report, không trong file.

---

## Khi có gì đó không chạy

| | |
|---|---|
| `error: not inside a project` | Anh đang ở ngoài git repository, hoặc chưa chạy `delphi init` |
| Dispatch lỗi, có nhắc line break và `cmd.exe` | Cập nhật — adapter đã tự phân giải `.cmd` shim của Windows ra `.exe` thật |
| `claude` không có trên PATH | Đặt `DELPHI_CLAUDE_BIN` trỏ tới đường dẫn đầy đủ |
| Hook có vẻ không làm gì | `delphi` không nằm trên PATH. Hook fail open, nên nó trông như đang chạy |
| Pane mở ra nhưng không launch được | Cùng nguyên nhân `.cmd` shim ở trên; cập nhật |
| Lệnh nào cũng chậm ở lần đầu | Nó đang hỏi `claude agents --json` xem cái gì đang chạy |

Mọi thứ delphi làm với ledger đều là file. Nếu một lệnh khiến anh ngạc nhiên, hãy mở
`.delphi/projects/<slug>/` — board, journal và report đều là text thuần, và chúng là sự thật.

---

## Liên kết

- [Hướng dẫn chi tiết](https://github.com/thaildhe172591/delphi-team/blob/main/docs/guide.vi.md)
- [Tài liệu](https://github.com/thaildhe172591/delphi-team/tree/main/docs)
- [Dùng thử từng bước](https://github.com/thaildhe172591/delphi-team/blob/main/docs/try-it.md)
- [Viết một role hoặc capability](https://github.com/thaildhe172591/delphi-team/blob/main/docs/writing-a-role.md)
- [Báo lỗi](https://github.com/thaildhe172591/delphi-team/issues)

MIT. Không chính thức; chạy cùng Claude Code.
