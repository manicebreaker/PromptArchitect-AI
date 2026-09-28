---
description: Brief → script.json → VO → render → 自檢
argument-hint: <brief，可加 "auto" 跳過 VO 稿 approval>
---

Brief：$ARGUMENTS

跟 CLAUDE.md 嘅規則，按以下步驟做：

1. **分類**：判斷係教學、市場更新定 promo。
   - 如果涉及市場更新、platform 資訊、數據或者價錢：先 web search，列出 source table（標題 / URL / 發佈日期 / 用嚟支持邊句），**停低等我 approve**。

2. **寫稿**：由 brief 砌 `script.json`（格式參考 `script.example.json`），slug 用英文細楷加 dash。
   用表格畀我睇：scene #、type、VO、字數、估計秒數、畫面內容。
   - 如果 brief 有「auto」字眼，唔使等 approve，直接行下一步。
   - 否則**停低等我 approve 或者改稿**。

3. **VO**：行 `npm run tts`。
   - 如果見到 alignment 對唔上嘅 warning，報告畀我知。
   - 如果 API error，直接顯示 error，唔好自己換 voice 或 model。

4. **Render**：兩個 format 都 render 去 `out/<slug>-9x16.mp4` 同 `out/<slug>-16x9.mp4`。

5. **自檢**：每個 scene 喺中間位置抽一張 still（兩個 format 都要），逐張檢查：
   - 文字有冇爆框、重疊或者入咗 safe area
   - 字幕有冇遮住主要內容
   - 對比度夠唔夠
   有問題就修正再 render。最多重做 2 輪，之後剩返嘅問題列出嚟畀我決定。

6. **匯報**：列出輸出檔案路徑、片長、有冇 warning，同埋你覺得最弱嘅一個 scene 同改善建議。
