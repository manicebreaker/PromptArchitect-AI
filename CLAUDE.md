# Icebreaker Video Factory

Remotion project：由 `script.json` + `public/vo.mp3` + `public/vo-timing.json` 自動砌出 social / YouTube 片。
內容類型：教學、市場更新、promo。全部共用同一個 scene library。

## Brand kit（開工前填好）
- 主色：`[PRIMARY_HEX]`｜副色：`[SECONDARY_HEX]`｜背景：`[BG_HEX]`｜文字：`[TEXT_HEX]`
- 字體：中文 Noto Sans HK（用 `@remotion/google-fonts`），英文/數字 `[EN_FONT]`
- Logo：`public/logo.svg`
- End card 固定內容：logo + `icebreakerconcept.com` + CTA 文字（來自 cta scene）
- 語氣：專業但親切，似同 client 解釋嘢，唔好似新聞報導

## 格式
| Composition ID | 尺寸 | 用途 |
|---|---|---|
| `Main-9x16` | 1080×1920 | Reels / Shorts / Stories |
| `Main-16x9` | 1920×1080 | YouTube |
- 30fps。Duration 用 `calculateMetadata` 讀 `public/vo-timing.json` 嘅 `durationSec`，唔好 hardcode。
- 兩個 composition 用同一份 script.json，只係 layout 唔同。
- 9:16 safe area（估算值，出片後喺手機實測再調）：上 220px、下 420px、左右 60px 唔放重要文字。
- 最細字號（估算值）：9:16 內文 56px、標題 96px；16:9 內文 40px、標題 80px。

## Scene library
每個 scene 喺 `vo-timing.json` 有 `showFromSec` / `showToSec`，用佢哋計 `<Sequence>` 嘅 from / duration。

| type | data fields | 備註 |
|---|---|---|
| `hook` | `headline`, `sub?` | 頭 3 秒內要出齊標題，大字、強對比 |
| `stat` | `value`, `unit?`, `label`, `source?` | 數字由 0 count up；有 source 一定要顯示 |
| `steps` | `step`, `total`, `title`, `detail` | 一個 scene 一步，角落顯示 step/total 進度 |
| `compare` | `left:{label,points[]}`, `right:{label,points[]}` | 9:16 上下排，16:9 左右排 |
| `chart` | `kind:"bar"\|"line"`, `unit?`, `series:[{label,value}]`, `source?` | 數據驅動，bar 逐條 spring 升起 |
| `screen` | `src`, `startFromSec?`, `highlights?:[{atSec,x,y,w,h}]` | `src` 相對 `public/`；x/y/w/h 用 0–1 比例；highlight 用圈 + 輕微 zoom |
| `quote` | `text`, `by?` | 重點句，逐字浮現 |
| `cta` | `headline`, `action` | 固定 end card |

新增 scene type 前先問我；唔好為單一條片整一次性 component。

## 字幕
- 用 `vo-timing.json` 嘅 `chars`（每字有 `start` / `end` / `scene`）。
- 每次最多 2 行，按標點或者約 12 字（9:16）/ 20 字（16:9）斷句；當前讀緊嗰組字高亮。
- 字幕位置要避開 safe area，同 scene 主要內容唔可以重疊。

## Motion 規則
- 入場用 `spring()`，唔好用 linear fade。多個元素 stagger 3–4 frames。
- 每個 scene 頭 10 frames 內一定要有動作，唔好有死畫面。
- Scene 之間用 `@remotion/transitions`（slide / wipe 為主），全片風格統一。
- 背景要有少量持續動態（例如慢速 gradient 或 grain），避免似 PPT。

## VO 寫稿規則（廣東話 TTS）
- 口語廣東話，但避開 TTS 容易讀錯嘅字：少用「啲、咗、嘅」連續堆疊，唔用粗口同潮語。
- 多音字（例如「行」「長」「重」）盡量換詞。
- 英文 term 保留，但每條片第一次用到時留意讀音；如果讀錯，試改寫法（例如「G-A-4」）。
- 每句 ≤ 20 字；hook 句 ≤ 15 字。粗略估計每秒約 4–5 個字。
- VO 唔可以有 emoji（會打亂 timing index）。

## 事實核查
- 市場更新、platform policy、數據、價錢：一定要先 web search，列出 source（標題、URL、日期）等我 approve，先至寫稿。
- 冇 source 嘅數字唔可以出現喺片入面。

## 指令
- VO：`npm run tts`（A/B：`npm run tts -- --voices ID1,ID2 --models eleven_v3,eleven_multilingual_v2`）
  - 每次行都會扣 ElevenLabs credits；VO 稿未 approve 唔好行。
  - `meta.languageCode: "yue"` 只對 `eleven_v3` 有效；其他 model 拒收時 script 會自動唔帶 language_code 重試並出 warning。
- Preview：`npx remotion studio`
- Render：`npx remotion render Main-9x16 out/<slug>-9x16.mp4`、`npx remotion render Main-16x9 out/<slug>-16x9.mp4`
- 抽 frame 檢查：`npx remotion still Main-9x16 out/check/<slug>-<frame>.png --frame=<n>`

## 唔好做
- 唔好改 `scripts/tts.ts` 嘅輸出格式，除非同時改埋讀佢嘅 component。
- 唔好 hardcode 任何 client 嘅文字喺 component 入面，所有內容都要嚟自 script.json。
