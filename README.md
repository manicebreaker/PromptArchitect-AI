# Icebreaker Video Factory — Starter Kit

## Setup（約 20 分鐘，只做一次）
1. 開 Remotion project：`npx create-video@latest icebreaker-video`（揀 Blank + TypeScript）
2. 將呢個 kit 全部內容 copy 入 project root（包括隱藏嘅 `.claude/` folder）
3. `cd icebreaker-video && npm i -D tsx`
4. `package.json` 嘅 `scripts` 加一行：`"tts": "tsx --env-file=.env scripts/tts.ts"`
5. `cp .env.example .env`，填 `ELEVENLABS_API_KEY`（kit 附帶嘅 `.gitignore` 已包 `.env`；如果 Remotion template 已有 `.gitignore`，合併兩份，唔好直接覆蓋）
6. Logo 放 `public/logo.svg`，填好 `CLAUDE.md` 入面所有 `[...]` placeholder
7. 裝 Remotion plugin：
   ```
   claude plugin marketplace add remotion-dev/claude-code-plugin
   claude plugin install remotion@remotion
   ```

## Voice A/B（先做，VO 未過關唔好砌畫面）
1. `cp script.example.json script.json`
2. 喺 ElevenLabs Voice Library 揀 2–3 把 native 廣東話聲，copy voice ID
3. `npm run tts -- --voices ID1,ID2,ID3 --models eleven_v3,eleven_multilingual_v2`
4. 聽 `public/vo-tests/` 入面嘅檔案，揀最好嗰個組合，填入 `script.json` 嘅 `meta.voiceId` / `modelId`
5. `npm run tts` → 確認 terminal 冇「對唔上」warning（「少量差異」warning 可接受，但要抽查字幕）

> 廣東話：`eleven_v3` + `languageCode: "yue"` 係官方支援組合；`eleven_multilingual_v2` 冇 Cantonese language code，要靠 voice 本身，A/B 時留意有冇普通話腔。

## 砌 scene library（Claude Code，一次性）
開 `claude`，貼：
```
讀 CLAUDE.md 同 script.json、public/vo-timing.json。
按 Scene library 規格起全部 8 個 scene component，同 Main-9x16、Main-16x9 兩個 composition，
duration 用 calculateMetadata 讀 vo-timing.json，字幕按 CLAUDE.md 規則做。
砌好之後 render 兩個版本，每個 scene 抽 still 自檢，然後匯報。
```

## 日常出片
```
/make-video 45秒教學，題目：……
```
