# Hướng dẫn

[English](./guide.md) · **Tiếng Việt**

delphi thực sự hoạt động thế nào, và làm việc với nó ra sao. Bảng tra lệnh nằm trong
[README của package](../packages/cli/README.vi.md); đây là phần giải thích vì sao các lệnh có hình
dạng như vậy.

---

## 1. Mô hình tư duy

### Seat không phải là session

**Session** là một cuộc hội thoại với Claude Code. Nó kết thúc, bị clear, bị compact, bị đổi tên.
**Seat** là một vị trí trong phòng ban — "dev backend của project này" — và nó sống qua tất cả những
thứ đó.

Khác biệt này quan trọng, vì mọi thứ làm nên giá trị của một session lại chính là thứ session không
giữ được:

| | Nằm trong session | Nằm trong seat |
|---|---|---|
| Anh là ai | prompt gõ lại mỗi lần | `.claude/agents/dev-be.md` |
| Được đụng vào gì | những gì còn nhớ | `owns` trong config, `files` trong story |
| Học được gì | transcript | `knowledge/dev-be.md` |
| Còn việc gì | cuộn lên đọc lại | `board.yaml` |

### Ledger là sự thật

Mọi thứ phải sống sót đều là file dưới `.delphi/projects/<slug>/`:

```
BRIEF.md        vì sao project này tồn tại        (anh viết, một lần)
STATE.md        ảnh chụp: mục tiêu, phase, đang bay, đang kẹt
JOURNAL.md      nhật ký chỉ-ghi-thêm              (không sửa, chỉ thêm dòng)
DECISIONS.md    ADR: bối cảnh, quyết định, hệ quả
board.yaml      mọi task, trạng thái và chủ sở hữu
stories/*.md    mỗi mẩu việc một gói bàn giao
reports/*/*.md  mỗi seat làm gì, kèm bằng chứng
knowledge/*.md  mỗi seat học được gì, giữa các phiên
handoffs/*.md   phần không nằm trong file nào
inbox/*/        tin nhắn đang chờ một seat
sessions.log    delphi đã khởi động gì, với model nào
```

Khi ledger và cuộc hội thoại mâu thuẫn, ledger thắng. Đó không phải luật về lòng tin; đó là vì trong
hai thứ, chỉ một thứ còn ở đó vào ngày mai.

### Orchestrator là seat duy nhất anh nói chuyện

Anh mô tả điều anh muốn. Nó viết story, lập phòng ban, điều seat, thu report và mang quyết định về cho
anh. Nó **không viết code** — có một hook cưỡng chế điều đó, vì orchestrator mà bắt đầu sửa file thì
ngừng điều phối và nhét đầy context bằng chi tiết không ai khác nhìn thấy.

---

## 2. Giải phẫu một seat

Seat được **ghép**, không phải viết tay:

```
base role  +  capability pack  +  những gì nó sở hữu  =  .claude/agents/<seat>.md
```

```yaml
# .delphi/config.yaml
seats:
  dev-be:
    base: dev-be                              # roles/dev-be.md
    capabilities: [db-engineer, pythia-oracle] # gộp vào lúc build
    owns: ["src/api/**", "db/**"]
    description: "Backend và Oracle: API, procedure, query."
```

`delphi role build --all` dựng lại chúng. File sinh ra có các khối đánh dấu:

```markdown
<!-- delphi:core:start -->        ← base role. Được sinh lại. Đừng sửa.
<!-- delphi:capabilities:start --> ← capability đã gộp. Được sinh lại.
<!-- delphi:project:start -->      ← của anh. Upgrade không bao giờ đụng vào.
```

Viết chỉ dẫn riêng của project vào khối `project` thì nó sống qua mọi lần `delphi upgrade`.

### Role và capability khác nhau ở đâu

**Role** xứng đáng có một seat: có danh tính riêng, định nghĩa "xong" riêng, report riêng.
**Capability** thì không — nó là việc mà *một seat nào đó cũng làm được*.

`pythia-oracle` là capability, không phải role. Việc Oracle không cần một phiên riêng ngồi không; nó
cần dev backend biết luật an toàn khi story đụng tới database.

---

## 3. Story là một hợp đồng

Bốn trường quyết định story có điều phối được hay không:

```yaml
files: ["src/server.js", "src/health.test.js"]
deliverables: ["một route GET /health", "test bao phủ nó"]
acceptance:
  - "GET /health trả 200 với content-type application/json"
  - "route GET /orders cũ vẫn trả về mảng như trước"
verify: "npm test"
```

- **`files`** là hợp đồng sở hữu. Nó là thứ cho phép hai seat làm cùng lúc. Hai story cùng đòi một
  path bị từ chối trước khi seat nào kịp khởi động — và điều này được kiểm ở **cả** `dept up` **lẫn**
  `dispatch`, vì điều phối một seat cũng vẫn là điều phối.
- **`acceptance`** là cách seat biết mình đã xong. Thiếu nó, "done" chỉ có nghĩa là "tôi dừng rồi".
- **`verify`** là cách nó chứng minh. Một report ghi "test pass" mà không có output là lời khai,
  không phải bằng chứng.

Board từ chối nước đi sai luật:

| Nước đi | Bị từ chối trừ khi |
|---|---|
| → `ready` | story có acceptance criteria và danh sách file |
| → `done` | đã có report mang output của lệnh verify |
| → `blocked` | có nêu lý do |
| `ready` → `done` | không cho phép; việc phải đi qua `doing` |

---

## 4. Một ca làm, từ đầu đến cuối

```bash
# sáng
delphi resume                       # thứ một orchestrator mới cần để tiếp quản
claude                              # nói chuyện với orchestrator

# nó viết story, rồi:
delphi dept up --dry-run            # ai sẽ khởi động, và prompt chính xác mỗi người nhận
delphi dept up                      # khởi động — có hỏi trước

# trong lúc họ làm
delphi watch --follow               # hoặc --web để xem trên trình duyệt
delphi dept status                  # ai kẹt, và cách tới chỗ họ

# khi một seat xong
delphi task show T-001              # story và trạng thái của nó
cat .delphi/projects/shop/reports/dev-be/T-001-1.md

# cuối ngày
delphi shift end                    # checkpoint, rồi dừng các seat
delphi dept down
```

### Mỗi seat tự làm gì

Mọi seat tuân theo `.delphi/PROTOCOL.md` — file mà mọi phiên trong project đều nạp, vì `CLAUDE.md`
import nó, và **một import sống qua compaction**, trong khi một prompt dán vào thì không.

Protocol có mười hai mục ngắn. Những mục làm việc thật sự:

1. **Anh là một seat.** Xác định là seat nào qua agent definition, `DELPHI_SEAT`, hoặc skill `/seat`.
   **Nếu không cái nào nói, thì hỏi — đừng đoán.** Trả lời nhầm seat là làm hỏng ledger.
2. **File mới là sự thật.** Thứ gì phải sống sót thì phải nằm trong file.
3. **Ở yên trong phạm vi file của mình.** Cần sửa thứ ngoài phạm vi? Nhắn cho seat sở hữu nó. *Xoá
   cũng là sửa, và là loại không hoàn tác được.*
4. **Ghi qua lệnh**, để file được khoá và giữ đúng định dạng.
5. **Report theo đúng hình dạng hợp đồng** — tối đa mười lăm dòng gửi orchestrator, chi tiết nằm
   trong file.
7. **Chứng minh trước khi gọi là xong.** Chạy lệnh verify, dán output đã cắt gọn.

---

## 5. Việc được điều phối thế nào

`delphi dept up` chọn chế độ dựa trên môi trường, không dựa trên một cấu hình:

| Chế độ | Khi nào | Làm gì |
|---|---|---|
| `sessions` | `claude --bg` khởi động được | Mỗi seat một phiên nền. Đây là trường hợp thường |
| `teams` | CLI tương tác, đã bật experiment, không seat nào cần effort riêng | Agent Teams |
| `manual` | còn lại, kể cả Claude Desktop | In prompt ra để anh dán |

> **Về `teams`:** một spike chạy thật cho thấy khi bật experiment, team được tạo ra **chỉ có lead là
> thành viên**, các agent được nêu tên chạy như background subagent, các sự kiện team **không bao giờ
> bắn**, và task tool **không tồn tại**. Vì vậy delphi không phụ thuộc gì vào nó — `board.yaml` là
> danh sách task chung, và vốn luôn là như vậy. Xem `.build/CONFLICTS.md` C-015.

### Nhìn họ làm việc

`dispatch.surface: auto` chia chính terminal anh đang ngồi:

| Anh đang ở | Nó dùng |
|---|---|
| tmux | `tmux split-window`, bố cục `main-vertical` |
| terminal VS Code | không gì — extension đồng hành mở pane |
| còn lại, trên Windows | `wt -w 0 split-pane` |

Anh giữ pane của mình; các seat xếp chồng bên cạnh. Đặt `surface: none` để họ chạy ngầm, khi đó
`claude attach <id>` vẫn tới được.

---

## 6. Bộ nhớ, và vì sao session là thứ dùng xong bỏ

Ba tầng, và chúng khác nhau có chủ đích:

| Tầng | Ở đâu | Sống được bao lâu |
|---|---|---|
| Cuộc hội thoại | session | tới khi clear hoặc compact |
| Kiến thức của seat | `knowledge/<seat>.md` | mãi mãi, và được đọc lúc khởi động |
| Trạng thái project | ledger | mãi mãi, và là thứ `resume` dựng lại từ đó |

**Ngày mai hãy mở phiên mới thay vì nối tiếp phiên hôm qua.** Một phiên dài sẽ xuống cấp: nó compact,
mất phần giữa, và mang theo những giả định không ai còn nhìn thấy nữa. `delphi resume` dựng lại tình
hình từ file với một phần nhỏ context — và thứ nó dựng lại **kiểm được**, vì nó nằm trên đĩa.

`delphi memory compact <seat>` chuyển phần dôi ra vào kho lưu. Claude Code chỉ nạp trước 200 dòng đầu
hoặc 25 KB của file memory, nên file vượt quá ngưỡng đó sẽ âm thầm mất chính phần đầu của nó.

---

## 7. Vòng lặp tự động

`delphi loop` là lệnh duy nhất tự khởi động phiên, và nó được xây để **dừng**.

```
        ┌─ story sẵn sàng ─→ điều phối chủ sở hữu ─→ chờ ─→ đọc lại board ─┐
        │                                                                  │
        └──────────── còn dưới mọi giới hạn? ←─────────────────────────────┘
                              │ không
                              ↓
                            dừng
```

Nó dừng khi:

- đã xong `--max-stories` story (mặc định **1**)
- một story đã tốn `--max-attempts` lần điều phối (mặc định **3**)
- một seat báo **BLOCKED**, **DECISION** hoặc **RISK** — đó là seat đang cần một con người
- một seat đang chờ ở permission prompt
- board chặn hoặc huỷ story
- một seat chưa xong sau `--step-timeout` (mặc định 20 phút)

Hãy chạy không có `--yes` trước. Nó in trần chi phí tính bằng số phiên, seat đầu tiên nó sẽ khởi
động, và prompt chính xác — mà không tiêu gì.

---

## 8. An toàn, và cái giá của nó

Mỗi điều dưới đây đều làm chậm một thứ gì đó, và mỗi điều đều là cố ý.

| Luật | Cái giá | Vì sao |
|---|---|---|
| Không bypass permission | anh phải duyệt | hệ thống permission là thứ bảo vệ anh; một harness tắt nó đi là harness tự quyết thay anh |
| Config không bị ghi đè | một cờ và một diff | cấu hình là của anh, và ghi đè âm thầm thì không phân biệt được với bug |
| DB mặc định chỉ đọc | ghi thì cần script và phê duyệt | phương án còn lại là một migration không ai review |
| Orchestrator không sửa source | phải viết story và điều phối | orchestrator mà sửa code thì ngừng điều phối |
| `loop` cần `--yes` | thêm một lệnh nữa | nó tiêu quota thật, và lệnh thứ nhất là chỗ anh biết tốn bao nhiêu |
| `watch --web` chỉ localhost | không chia sẻ dashboard được | board nêu tên người, việc kẹt và đường dẫn |

---

## 9. Khi có chuyện

Ledger là text thuần, nên câu trả lời thường nằm ngay trong đó.

```bash
delphi doctor                       # setup có lành lặn không
delphi dept status                  # có seat nào kẹt ở permission prompt không
delphi journal tail                 # chuyện gì đã xảy ra, theo thứ tự
cat .delphi/projects/<slug>/reports/<seat>/<id>-1.md
```

**Một seat kẹt ở permission prompt** là thất bại đốt cả ca làm, vì nhìn bề ngoài chẳng có gì sai.
`dept status` và `watch` đều nêu nó ra, kèm dòng `claude attach` để tới chỗ đó.

**Một story cứ quay lại** thường là do acceptance criteria mơ hồ. Nếu seat không biết mình đã xong
hay chưa, thì reviewer cũng không biết.

**Hai seat giẫm chân nhau** nghĩa là glob `owns` hoặc `files` của story chồng lên nhau. delphi từ
chối những va chạm nó nhìn thấy được trước khi điều phối — thứ nó không nhìn thấy được là lệnh shell,
và với công việc mà điều đó phải là **bất khả thi** chứ không chỉ *bị từ chối*, `delphi worktree` cho
mỗi seat một checkout riêng.
