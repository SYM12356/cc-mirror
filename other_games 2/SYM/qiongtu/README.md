# 穷途末旅 · The Last Road

一款**末世公路卡牌生存经营**网页游戏。你开着一台叫“老骡”的旧卡车，带着两名同伴穿过 20 段废土公路，用卡组、骰子与有限的补给应对危机，最终在北岭建立避难所，留下复兴的火种。

- 单机、离线、零依赖、无外部请求
- 单文件交付：`index.html` 可直接双击打开，也可放在任意静态服务器
- 桌面优先，移动端可玩（1440×900 / 1024×768 / 390×844 已验证）
- 一局约 25–40 分钟，20 段旅程 + 垭口三阶段 + 定居点结局

---

## 1. 如何运行

直接双击 `index.html` 即可。

本地预览（推荐，`localStorage` 在 http 下更稳定）：

```bash
cd other_games/SYM/qiongtu
python3 -m http.server 8899
# 打开 http://127.0.0.1:8899/
```

如果要在个人站里预览“更多小游戏”入口，需要把 `my-webpage/` 的内容作为站点根，并把 `other_games/` 放在同级：

```bash
rm -rf /tmp/qiongtu-site && mkdir -p /tmp/qiongtu-site
cp -R my-webpage/. /tmp/qiongtu-site/
cp -R other_games /tmp/qiongtu-site/
python3 -m http.server 8899 --directory /tmp/qiongtu-site
# http://127.0.0.1:8899/games.html
# http://127.0.0.1:8899/other_games/SYM/qiongtu/
```

---

## 2. 玩法速览

每一段：

1. 从 2 条路线中选 1 条，支付燃油、消耗口粮。
2. 翻一张危机卡，从 2–3 种应对方式中选 1 种（对应一个学科与难度）。
3. 打出手牌（3 行动点），然后掷 2d6 + 加值对抗难度。
4. 成功/失败结算，拿三选一奖励（2 张牌 + 1 份物资/休整）。
5. 第 4、8、12、16 段之后进入营地：一段夜话 + 一项服务。

资源：燃油、食物、药品、零件、车况、人心，以及特殊的“火种”。
车况或人心归零、燃油耗尽且无法拆东墙，都会进入“熄灭”结局。
抵达北岭后，最多建 4 个模块，决定“余烬 / 火种 / 黎明”。

### 操作

- 点击卡牌选中，再点一次打出；也可以直接把卡拖到危机区。
- 数字键 1–5 选牌，Enter 打出；R 掷骰；Enter/Space 继续。
- 路线 1–2、应对 1–3、奖励 1–3 也可用数字键。
- Esc 关闭规则/设置；移动端右上角“日志”打开行车日志。

---

## 3. 目录与构建

```
other_games/SYM/qiongtu/
├── index.html          ← 构建产物，单文件交付
├── README.md
└── src/
    ├── template.html   ← HTML 骨架与占位符
    ├── style.css       ← 全部样式
    ├── data-core.js    ← 学科、平衡、配色、效果构造器
    ├── art.js          ← 程序化 SVG：卡面、图标、肖像、盒绘
    ├── data-cards.js   ← 30 张卡牌
    ├── data-world.js   ← 30 个危机、路线、同伴、营地、模块、结局
    ├── engine.js       ← 状态、牌组、检定、效果、存档、模拟
    ├── ui.js           ← 渲染、交互、拖拽、覆盖层
    ├── audio.js        ← WebAudio 合成音效
    ├── boot.js         ← 启动与全局暴露
    └── build.py        ← 把 src/ 内联成单文件 index.html
```

修改 `src/` 后重新构建：

```bash
python3 src/build.py
```

构建脚本会校验占位符并把所有 CSS/JS 内联，产物仍是单个 HTML。

---

## 4. 内容扩展

### 加一张卡

在 `src/data-cards.js` 的 `CARDS` 里加一条：

```js
{
  id:'my_card', name:'新牌', disc:'drive', cost:1, rarity:'common', art:'road', pal:0,
  text:'本次驾驶检定 +2。',
  flavor:'一句不超过 24 字的风味文字。',
  effects:[FX.b('drive',2)],
  up:{ text:'本次驾驶检定 +3。', effects:[FX.b('drive',3)] }
}
```

- `disc`：`drive / scavenge / repair / medic / negotiate / will`
- `art`：必须是 `art.js` 里存在的场景 key（`road / wreck / engine / hands / toll / storm / convoy / seeds / light / clinic / radio / mountain / campfire / truck / map / fuel / cliff`）
- `FX` 构造器在 `data-core.js`
- 新卡要进入奖励池，只需不是 `basic` / `sig`；传说牌需要 `rarity:'legend'` 且只在幕危机出现

### 加一个危机

在 `src/data-world.js` 的 `CRISES` 里加：

```js
{
  id:'my_crisis', act:1, title:'标题', art:'road', pal:0,
  text:'40–90 字的危机描述。',
  approaches:[
    { disc:'drive', diff:8, label:'应对方式 A', desc:'一句话说明',
      success:{ text:'成功文本', fx:[FX.gain('fuel',1)] },
      fail:{ text:'失败文本', fx:[FX.hull(-1), FX.morale(-1)] } },
    { disc:'repair', diff:9, label:'应对方式 B', desc:'一句话说明',
      success:{ text:'成功文本', fx:[FX.gain('parts',1)] },
      fail:{ text:'失败文本', fx:[FX.hull(-2)] } }
  ]
}
```

- 每个危机至少 2 种应对；幕危机加 `climax:true`
- 失败效果建议以资源/车况/人心/受伤为主，不要普通危机直接致死

### 加一名同伴

在 `src/data-world.js` 的 `CREW` 里加对象，并在 `data-cards.js` 里加对应的 `sig` 卡。注意开局固定选 2 人，界面和结局会自动适配。

---

## 5. 调试与验收参数

在 URL 后追加：

| 参数 | 作用 |
|---|---|
| `?seed=20261127` | 固定随机种子，复现同一局 |
| `?demo=title` | 标题页 |
| `?demo=setup` | 选同伴页 |
| `?demo=map` | 路线选择 |
| `?demo=crisis` | 危机应对选择 |
| `?demo=rolling` | 掷骰结果 |
| `?demo=resolve` | 检定结算 |
| `?demo=reward` | 三选一奖励 |
| `?demo=camp` | 营地 |
| `?demo=settle` | 定居点 |
| `?demo=ending` | 结局 |
| `?static=1` | 关闭动效/音频，供无头截图 |
| `?validate=1` | 校验全部内容引用，输出 `VALIDATE_OK/FAIL` |
| `?sim=300` | 贪心自动模拟 300 局，输出 `SIM_RESULT` |
| `?debug=1` | 保留给后续调试（当前主要用 `?validate` / `?sim`） |

控制台调试：

```js
QT.Game.state        // 当前状态
QT.Game.validate()   // 内容校验
QT.Game.simulate(300, 20261127)
QT.DATA.CARDS        // 全部内容
```

无头验收（本机 Edge 可用）：

```bash
PROFILE=/tmp/qt-edge
"/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge" \
  --headless=new --no-sandbox --disable-gpu --disable-gpu-sandbox \
  --user-data-dir=$PROFILE --no-first-run --virtual-time-budget=5000 \
  --dump-dom 'file:///绝对路径/index.html?validate=1&static=1'
```

---

## 6. 平衡旋钮

所有数值集中在 `src/data-core.js` 的 `BALANCE`：

- `start`：初始燃油/食物/药品/零件/车况/人心/火种
- `foodPerSeg`、`fuelPerSeg`：每段消耗
- `segments`、`camps`、`climaxSegs`：旅程长度与节奏
- `ap`、`hand`：每次检定的行动点与手牌
- `greatMargin`、`critMargin`：大成功/大失败阈值
- `maxModules`：定居点最多模块数

当前 300 局贪心模拟（seed 20261127）：

- 抵达率约 72%
- 结局分布：熄灭约 28%，余烬约 25%，火种约 41%，黎明约 5%
- 无脚本异常

调参顺序建议：初始资源 → 第一幕难度 → 奖励资源概率 → 卡牌数值。

---

## 7. 已知边界

- 单机、无后端、无排行榜、无云存档；进度只在本机 `localStorage`
- 中文单语；英文只作装饰性副标题
- 无局外解锁/多难度；一局一结算
- 所有美术与音频由代码生成，无外部图片/字体/音频
- 浏览器目标：最新 Chrome / Edge / Safari；不支持 IE
- 如果 `file://` 下浏览器禁止 `localStorage`，设置页会提示“本次进度无法保存”，但仍可玩

---

## 8. 交付与部署

- 游戏本体：`index.html`（单文件）
- 站点登记：`other_games/games.json` 顶部新增条目
- 上传包：`上传-穷途末旅-20261127.zip`，解压后保持 `other_games/` 路径，拖到 GitHub 仓库根目录即可

上传后访问：

```
https://sym12356.github.io/other_games/SYM/qiongtu/
```

“更多小游戏”页会自动读取 `games.json`，无需改 `games.html`。
