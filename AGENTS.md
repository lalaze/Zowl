## Agent skills

### Issue tracker

Issues and PRDs use GitHub Issues. See `docs/agents/issue-tracker.md`.

### Triage labels

Triage uses the five default role names. See `docs/agents/triage-labels.md`.

### Domain docs

This is a single-context repo: use root `CONTEXT.md` and `docs/adr/`. See `docs/agents/domain.md`.

### Missed payment captures

When the user reports or asks to review missed payment captures (漏记 / 没记到 / 查漏记), follow `docs/agents/capture-log-investigation.md`.

## GitHub Issue 与 PR 任务管理规范

### 1. 建单边界

- 只为这几类建 Issue：跨天任务、需拆分的功能、调研后暂缓的方案、开发主线外顺带发现的 Bug / 技术债。
- 几分钟能完成的小改动直接开发提交，不建单。
- 主线外的无关问题不顺手大改，先征询用户或直接提 Issue。

### 2. 建单格式

- 由 AI 用 Issue 工具（`create_issue` 等）创建，不让用户手填模板；工具不可用时用 `gh`，见 `docs/agents/issue-tracker.md`。
- 正文精简，含三部分：`背景/目标`、`涉及文件与思路`、`验收标准`（Markdown Checklist）。
- 标签从简，优先复用仓库已有的：`bug`、`enhancement`（即 feat）、`documentation`；没有对应的才新建 `idea`、`chore`。triage 状态标签仍按 `docs/agents/triage-labels.md`。
- Issue、PR、评论同样遵守 `docs/agents/capture-log-investigation.md` 第 7 节的隐私要求，不写真实消费数据、IP、密钥。

### 3. 领单与续做

- 处理某个 Issue（如 `#12`）时，先读正文、全部评论和关联 PR，并用 `link_issue` 关联到当前线程。
- 已有未合并的关联 PR（含 Draft）时，默认在该 PR 分支上继续，不另开分支。

### 4. PR 联动与收尾

- 每个独立 Issue 用独立分支（`feat/...`、`fix/...`）或 worktree。
- PR 正文关联 Issue：单 PR 完成写 `Closes #<id>`；分阶段时前几个写 `Part of #<id>`，最后一个写 `Closes #<id>`。将 PR 关联到当前线程。
- `Closes` 会在合并时自动关单：需要合并后才能验收的（真机、生产环境），改写 `Part of #<id>`，验收通过后再关单。
- 用户要求不走 PR 直接合入主分支时，commit 只写 `Refs #<id>`；合入后在 Issue 评论改动摘要与 commit，再关单。
- 未经用户确认，不合并 PR，不关闭未验收的 Issue。

### 5. 中断与交接

用户要求暂停或交接时执行；还没有 Issue 的先补建。

- **未写代码**：把调研结论、已定方案、踩坑点和下一步 Checklist 写入 Issue 评论。
- **代码写到一半**：在任务分支（不在 `main`）提交 `wip:` commit 并推送到 `origin`，创建或更新关联该 Issue 的 Draft PR，写明「已完成 / 未完成 / 当前卡点 / 下一步」，再在 Issue 评论留一条指向该 PR 的简短状态。
- **方案推倒重来**：在 Issue 评论写清旧方案为何废弃和新方向，再关闭废弃 PR，下次从默认分支重新开始。
