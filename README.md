# SYM12356 个人站
深空霓虹风个人站点 · 展示给朋友的数字小宇宙。全部由 AI 对话开发：纯静态页面 + Supabase，没有服务器，没有域名费用。
| | |
|---|---|
| **主站** | https://sym12356.github.io/ （GitHub Pages） |
| **cc.cd 镜像** | https://sym12356.cc.cd/ （Cloudflare 代理到镜像源站） |
| **备用线路** | https://sym12356.sym12356.workers.dev/ |
| **站长控制台** | https://sym12356.github.io/admin.html （页脚按钮进入，仅站长/管理员） |
| **站点数据** | https://sym12356.github.io/stats.html |
> 接手项目（新会话 / 新机器）请先读 [README-跨会话迁移.md](README-跨会话迁移.md)：资产清单、文件地图、工作流、已知陷阱、启动清单。
---
## 一、功能全景
### 访客可见
- 首屏 WebGL 流体背景 / 名言打字机 / 毫秒时钟
- 标签 · **游戏区**
  - 站内小游戏（直接在页面里玩，带排行榜）：**须臾 · 时间感知**、**终极井字棋**
  - 独立小游戏（卡片入口，跳到各自页面）：**六边形赛车**、**火柴人龙之战**、**铃响之前**
- **桌游板块**：剑影江湖（中/英双版）、爆震空间
- 广告位招租 · 备用线路 · 友链
- 留言板（点赞 / 热评 / 置顶 / 站长回复 / 禁言）
- **积分中心**（兑换码 / 每日签到·连签奖励·活动翻倍 / 积分抽奖 / 排行榜）
- **动态广场**（独立页 `feed.html`：发布 / 图片 / #话题 / @提及 / 点赞 / 评论）
- 公告横幅 · 积分榜 · 更新日志 · 站点数据页
- 中英双语 · 深色/浅色主题
### 登录用户
- 个人中心：三体系称号（积分/留言/签到）+ 8 成就 + 周冠军 + 站长称号
- 积分商店（头像框 / 彩色昵称 / 留言置顶券）
- 邀请好友（双方得积分）· 积分赠送（每日限额）· 改名
- 游戏成绩上榜
### 站长 / 管理员（控制台 12 个页签）
发码（单个/批量/彩蛋/有效期/限次）· 称号（授予/收回/自定义管理）· 设置（签到/连签/活动/公告/抽奖/邀请）· 奖励码 · 用户（搜索/详情/加减分/禁言/补签到）· 兑换记录 · 留言（回复/删除/置顶）· **动态**（删除动态/评论）· 排行榜 · 趋势 · 导出 CSV · 操作日志
---
## 二、页面与游戏清单
| 页面 / 游戏 | 本地位置 | 线上路径 | 说明 |
|---|---|---|---|
| 首页 | `my-webpage/index.html` | `/` | 单文件，CSS/JS 全内联，约 205 KB |
| 动态广场 | `my-webpage/feed.html` | `/feed.html` | 独立页，读写 Supabase |
| 站点数据 | `my-webpage/stats.html` | `/stats.html` | 公开统计 + 近 7 天趋势 |
| 站长控制台 | `my-webpage/admin.html` | `/admin.html` | 12 页签，邮箱白名单校验 |
| 须臾 / 井字棋 | 首页内嵌 | 同左 | 有排行榜（`game_scores`） |
| 六边形赛车 | `racing/`（8 个文件） | `/racing/` | canvas 游戏，`js/` 下 7 个模块 |
| 火柴人龙之战 | `matchstick/`（2 个文件） | `/matchstick/` | 单 HTML + game.js |
| 爆震空间 | `blast/index.html` | `/blast/` | 单文件，双人热座卡牌战术 |
| 铃响之前 | `lingxiang/index.html` | `/lingxiang/` | 单文件，校园 3v3 / 5v5 MOBA |
| 剑影江湖（中） | `jianying-bi/` | `/jianying/` | 桌面游戏 |
| 剑影江湖（英） | `jianying-en/` | `/jianying-en/` | 同上，英文版 |
| 汪义轩突围（**未上线**） | `other_games/SYM/tuwei/` | — | three.js 3D，草稿状态，5.2 MB |
> 游戏入口有两种：站内标签（须臾 / 井字棋）用 `data-gtab` 切换面板；其余游戏都是**相对路径链接**（游戏区三张卡片 `racing/`、`matchstick/`、`lingxiang/`，桌游区的爆震空间 `blast/`）。这样主站与镜像共用同一份首页，各自读自己目录下的副本。
---
## 三、当前版本状态（2026-11-22 核对）
| 文件 | 本地 | GitHub Pages | cc.cd 镜像 |
|---|---|---|---|
| `index.html` | 205,022 | 205,049 ⚠️ 旧（爆震空间还是绝对链接） | 205,410（最新，多出的字节是 Cloudflare 注入） |
| `blast/index.html` | 117,025 | 65,557 ⚠️ 旧 | 117,025 |
| `lingxiang/index.html` | 667,121 | 557,199 ⚠️ 旧 | 667,121 |
| `racing/index.html` | 17,675 | 一致 | 一致 |
| `matchstick/index.html` | 56,304 | 一致 | 一致 |
| `feed / stats / admin` | 20,062 / 6,691 / 69,638 | 一致 | 一致 |
| `fonts/jetbrains-mono.woff2` | 92,164 | 一致 | 一致 |
**结论：镜像已是最新，主站还差三个文件**——`index.html`、`blast/index.html`、`lingxiang/index.html`。比对方法见第七节。
---
## 四、本地目录
```
个人站/
├── my-webpage/                 ← 主站源码（上传到仓库根目录的就是这里的内容）
│   ├── index.html              ← 首页（单文件，约 205 KB）
│   ├── feed.html               ← 动态广场
│   ├── stats.html              ← 站点数据
│   ├── admin.html              ← 站长控制台
│   ├── fonts/jetbrains-mono.woff2  ← 全站等宽字体（唯一本地资源）
│   └── index-*备份.html        ← 首页历史备份（不上传）
├── racing/ matchstick/ blast/ lingxiang/   ← 四个独立游戏，各自一个目录
│   └── lingxiang/3v3/          ← 铃响的 3v3 专用版（未上线）
├── jianying-bi/ jianying-en/   ← 剑影江湖中/英源码；jy-deploy/ 为 Cloudflare 部署目录
├── cc-mirror/                  ← cc.cd 镜像站根目录内容（与主站同构，1.5 MB）
├── other_games/SYM/tuwei/      ← 汪义轩突围（three.js 草稿，未部署）
├── supabase-*.sql              ← 数据库脚本 v1→v10（见 SQL脚本说明.md）
├── 上传包-YYYYMMDD/            ← 按日期打好的上传 zip（主站 / 镜像各一个）
├── _sql-paste-pages/           ← 供浏览器复制 SQL 的临时页面
├── 个人站-项目包/              ← 交付包（简述 / 提示词 / 代码片段），不含程序
├── *-备份 / *-备份.html / 旧 zip ← 历史备份与废弃产物，不要上传
└── tech-route-backend-db.html  ← 后端技术路线说明
```
---
## 五、本地预览
**注意：游戏链接是相对路径**，直接把 `my-webpage/` 当根目录，点游戏卡片会 404。正确做法是拼一个临时站点根：
```bash
rm -rf /tmp/site && mkdir -p /tmp/site
cp -R my-webpage/. /tmp/site/
cp -R racing matchstick blast lingxiang /tmp/site/
python3 -m http.server 8899 --directory /tmp/site
# 打开 http://127.0.0.1:8899/
```
只改文档 / 看 SQL 时不需要这套，直接 `python3 -m http.server 8899` 在项目根起即可。
---
## 六、部署
### 主站（GitHub Pages）
1. 把要传的文件放进一个 zip，**保持目录层级**（`fonts/`、`lingxiang/` 等必须是文件夹）
2. 打开 https://github.com/SYM12356/SYM12356.github.io/upload/main 拖入（GitHub 会自动解包）
3. 提交后等 1–2 分钟，Cmd+Shift+R 强刷
主站上传包的标准内容：`index.html`、`feed.html`、`stats.html`、`admin.html`、`fonts/`，加上改动过的游戏目录。
### 镜像（cc.cd）
1. `cc-mirror/` 就是镜像根目录内容（index / feed / stats / admin / fonts / racing / matchstick / blast / lingxiang）
2. 打 zip → 传到 cc.cd 源站仓库根目录（保持目录层级）
3. 到 Cloudflare 清缓存（Caching → Purge Everything），否则橙云可能继续吐旧页
### 只更新一个游戏
替换对应目录的 `index.html`（赛车的 `js/` 要连带），重新打包上传即可，首页不用动。
---
## 七、核对线上版本
```bash
# 首页 / 子页
curl -sI https://sym12356.github.io/ | grep -i content-length
stat -f%z my-webpage/index.html
# 游戏页（返回的 content-length 应与本地文件大小一致）
curl -sI https://sym12356.github.io/lingxiang/ | grep -i content-length
stat -f%z lingxiang/index.html
# 镜像（Cloudflare 会注入脚本，字节数略大于本地属正常）
curl -s --compressed https://sym12356.cc.cd/ | wc -c
```
---
## 八、站长操作手册
### 角色
- **站长**：邮箱 `sym12356_1@qq.com`（或用户名 SYM12356）——全部权限
- **管理员**：站长在「称号」页授予「管理员」称号即任命——管理类功能；发码 / 设置 / 称号仅站长
### 日常
1. **发奖励码**：控制台「发码」→ 填码/积分（可勾彩蛋、设有效期/限次）→ 生成；或「批量生成」
2. **授予称号**：「称号」页 → 邮箱 + 称号 → 授予（授「管理员」= 任命管理员）
3. **改签到积分 / 连签奖励 / 活动模式 / 公告**：「设置」页
4. **管留言 / 动态**：对应页签删除违规内容（自动记录操作日志）
5. **看数据**：排行榜 / 趋势 / 导出 CSV / 日志
### 数据库
- 见 [SQL脚本说明.md](SQL脚本说明.md)：v1→v10 脚本、核心表、运维速查
- 执行一律在 Supabase SQL Editor 点 **Run without RLS**（点 Run and enable RLS 会污染函数体）
---
## 九、约定与常见坑
| 约定 | 说明 |
|---|---|
| 单文件页面 | 每个 HTML 自带 CSS/JS，不引外部框架（Supabase SDK 除外） |
| 相对链接 | 2026-11 起游戏入口用 `racing/` 这种相对地址，让主站与镜像共用一份首页；代价是本地预览要按第五节拼目录 |
| i18n | 静态文字用 `data-i18n="key"`，JS 文案用 `t('key')`；zh/en 两份字典键必须一致 |
| 提示 | 用 `window.__toast(msg, type)` 与 `window.__confirm(msg, onYes)`，禁用 `alert/confirm` |
| 风格 | 深色霓虹：`--cyan:#22d3ee`、`--violet:#a78bfa`、`--gold:#e8b84b`；圆角卡片、等宽字体点缀 |
| 表情 | 站点页面不使用 emoji（游戏自身风格不受限） |
| 身份 | 管理权限一律用邮箱白名单 `sym12356_1@qq.com` 在**数据库函数内**校验 |
| 写操作 | 统一走 `security definer` 的 RPC 函数，返回 `{ ok, msg, ... }` |
| ID | `messages` 等表主键是 **bigint**，RPC 参数不要用 uuid |
更多踩坑记录（RLS 污染函数体、函数重载歧义、zip 中文名、Pages 缓存等）见 [README-跨会话迁移.md](README-跨会话迁移.md) 第 7 节。
---
## 十、文档索引
| 文档 | 内容 |
|---|---|
| `README.md` | 本文件：功能、页面清单、版本状态、部署、站长手册 |
| `README-跨会话迁移.md` | 跨会话交接：资产、文件地图、工作流、陷阱、启动清单 |
| `SQL脚本说明.md` | 每个 SQL 脚本的作用与执行顺序 |
| `tech-route-backend-db.html` | 后端两条技术路线（GitHub 直连 vs cc.cd + Cloudflare） |
| `个人站-项目包/` | 项目简述、提示词事例、代码片段（可对外发放） |
| `爆震空间-改进方案-20261120.md` / `爆震空间-实施记录-20261120.md` | 爆震空间 v2.5 的设计与实施记录 |
