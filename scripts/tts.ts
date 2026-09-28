/**
 * scripts/tts.ts
 * 讀 script.json → call ElevenLabs /with-timestamps → 輸出
 *   public/vo.mp3
 *   public/vo-timing.json  (scene 分段 + 逐字 timing，畀 Remotion 做 duration 同字幕)
 *
 * 用法：
 *   npm run tts                                   # 用 script.json meta.voiceId / modelId
 *   npm run tts -- --script scripts/other.json
 *   npm run tts -- --voices ID1,ID2 --models eleven_v3,eleven_multilingual_v2   # A/B 模式
 *   npm run tts -- --lang yue                    # 覆蓋 meta.languageCode（只有 eleven_v3 用得著）
 *
 * A/B 模式（多過一把聲或一個 model，或者加 --test）只輸出 public/vo-tests/*.mp3，唔改 vo.mp3。
 * 需要 Node 20.6+（用 built-in fetch 同 --env-file）。
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

type Scene = { type: string; vo: string; data?: Record<string, unknown> };
type Script = {
  meta: { title: string; voiceId?: string; modelId?: string; languageCode?: string; tailSec?: number };
  scenes: Scene[];
};
type Alignment = {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
};
type TtsResponse = { audio_base64: string; alignment: Alignment | null };

const API = "https://api.elevenlabs.io/v1/text-to-speech";
const KEY = process.env.ELEVENLABS_API_KEY;
const SEP = "\n"; // scene 之間嘅分隔，唔會出現喺字幕
const PUBLIC = path.resolve("public");

const args = process.argv.slice(2);
const arg = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

async function tts(text: string, voiceId: string, modelId: string, languageCode?: string): Promise<TtsResponse> {
  const call = (lang?: string) =>
    fetch(`${API}/${voiceId}/with-timestamps?output_format=mp3_44100_128`, {
      method: "POST",
      headers: { "xi-api-key": KEY!, "Content-Type": "application/json" },
      body: JSON.stringify({ text, model_id: modelId, ...(lang ? { language_code: lang } : {}) }),
    });
  let res = await call(languageCode);
  if (!res.ok && languageCode && (res.status === 400 || res.status === 422)) {
    const body = await res.text();
    if (!/language/i.test(body)) throw new Error(`ElevenLabs ${res.status} (${voiceId}/${modelId}): ${body}`);
    // 部分 model（例如 multilingual_v2）唔接受 language_code：唔帶 language_code 再試一次
    console.warn(`⚠️ ${modelId} 唔接受 language_code=${languageCode}，改為唔指定語言再試（廣東話讀音可能變普通話腔）`);
    res = await call();
  }
  if (!res.ok) throw new Error(`ElevenLabs ${res.status} (${voiceId}/${modelId}): ${await res.text()}`);
  return (await res.json()) as TtsResponse;
}

/**
 * 將 alignment 每個字 map 返去 scene index。
 * ElevenLabs 有時會吞走空格 / 換行或者輕微改字，所以唔可以純粹靠 index 對位：
 * 逐字喺原文向前搵（最多睇 LOOKAHEAD 個字），搵到就跟原文嗰個字嘅 scene，搵唔到就沿用上一個 scene。
 */
const LOOKAHEAD = 8;
function mapScenes(al: Alignment, texts: string[]) {
  const expected: { c: string; scene: number }[] = [];
  texts.forEach((t, i) => {
    if (i > 0) for (const c of SEP) expected.push({ c, scene: -1 });
    for (const c of t) expected.push({ c, scene: i });
  });
  let j = 0;
  let matched = 0;
  let lastScene = 0;
  let firstMismatch = -1;
  const scenes = al.characters.map((c, i) => {
    for (let k = j; k < Math.min(j + LOOKAHEAD, expected.length); k++) {
      if (expected[k].c === c) {
        if (k !== j && firstMismatch < 0) firstMismatch = i;
        j = k + 1;
        matched++;
        if (expected[k].scene >= 0) lastScene = expected[k].scene;
        return expected[k].scene >= 0 ? expected[k].scene : lastScene;
      }
    }
    if (firstMismatch < 0) firstMismatch = i;
    return lastScene;
  });
  return { scenes, matchRatio: al.characters.length ? matched / al.characters.length : 0, firstMismatch };
}

// VO 入面唔可以有 emoji：會令 alignment index 錯位（CLAUDE.md 規則）
const EMOJI = /\p{Extended_Pictographic}/u;

function buildTiming(al: Alignment, texts: string[], tailSec: number) {
  const expected = texts.join(SEP);
  const exact = al.characters.join("") === expected;
  const { scenes: sceneOf, matchRatio, firstMismatch } = mapScenes(al, texts);
  // ≥ 95% 字對得上就當 scene 分段可信；再低就改用字數比例估算
  const aligned = exact || matchRatio >= 0.95;
  if (!exact) {
    const at = firstMismatch >= 0 ? `，第一個唔同喺第 ${firstMismatch} 個字附近：「${al.characters.slice(Math.max(0, firstMismatch - 3), firstMismatch + 5).join("")}」` : "";
    console.warn(
      aligned
        ? `⚠️ Alignment 同原文有少量差異（${(matchRatio * 100).toFixed(1)}% 對得上${at}），已用模糊對位分 scene，請抽查字幕。`
        : `⚠️ Alignment 同原文對唔上（只有 ${(matchRatio * 100).toFixed(1)}%${at}），scene 分段改用字數比例估算。字幕 timing 可能有偏差。`,
    );
  }
  const chars = al.characters.map((c, i) => ({
    c,
    start: al.character_start_times_seconds[i],
    end: al.character_end_times_seconds[i],
    scene: sceneOf[i],
  }));
  const voEnd = chars.length ? chars[chars.length - 1].end : 0;
  const total = expected.length || 1;

  let offset = 0;
  const raw = texts.map((t, i) => {
    const len = t.length;
    let start: number;
    let end: number;
    const own = chars.filter((c) => c.scene === i && c.c !== SEP);
    if (aligned && own.length) {
      start = own[0].start;
      end = own[own.length - 1].end;
    } else {
      start = (offset / total) * voEnd;
      end = ((offset + len) / total) * voEnd;
      // 比例估算時字幕都要跟返同一套分段，否則字幕會同畫面錯 scene
      for (const c of chars) if (c.start >= start && c.start < end) c.scene = i;
    }
    offset += len + SEP.length;
    return { index: i, voStartSec: start, voEndSec: end };
  });

  const durationSec = voEnd + tailSec;
  // 顯示區間：由上一個 scene 完結無縫接駁，第一個由 0 開始，最後一個去到片尾
  const scenes = raw.map((s, i) => ({
    ...s,
    showFromSec: i === 0 ? 0 : s.voStartSec,
    showToSec: i === raw.length - 1 ? durationSec : raw[i + 1].voStartSec,
  }));

  return {
    durationSec,
    aligned,
    scenes,
    chars: chars.filter((c) => c.c !== SEP),
  };
}

async function main() {
  if (!KEY) throw new Error("Missing ELEVENLABS_API_KEY（放喺 .env）");
  const scriptPath = arg("script") ?? "script.json";
  const script: Script = JSON.parse(await readFile(scriptPath, "utf8"));
  if (!script.scenes?.length) throw new Error(`${scriptPath} 冇 scenes`);

  const voices = (arg("voices") ?? script.meta.voiceId ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const models = (arg("models") ?? script.meta.modelId ?? "eleven_v3").split(",").map((s) => s.trim()).filter(Boolean);
  const lang = arg("lang") ?? script.meta.languageCode;
  if (!voices.length || voices.some((v) => v.startsWith("["))) throw new Error("未指定 voice：填 script.json meta.voiceId 或者用 --voices");

  // scene 內部嘅換行會同 SEP 撞，統一換做空格
  const texts = script.scenes.map((s) => (s.vo ?? "").replace(/\s*\n\s*/g, " ").trim());
  const empty = texts.findIndex((t) => !t);
  if (empty >= 0) throw new Error(`scene #${empty} 嘅 vo 係空白`);
  const withEmoji = texts.findIndex((t) => EMOJI.test(t));
  if (withEmoji >= 0) throw new Error(`scene #${withEmoji} 嘅 vo 有 emoji，請刪走（會打亂 timing）`);
  const full = texts.join(SEP);
  const isTest = voices.length > 1 || models.length > 1 || args.includes("--test");

  if (isTest) {
    const dir = path.join(PUBLIC, "vo-tests");
    await mkdir(dir, { recursive: true });
    for (const v of voices) {
      for (const m of models) {
        try {
          const r = await tts(full, v, m, lang);
          const file = path.join(dir, `${v}__${m}.mp3`);
          await writeFile(file, Buffer.from(r.audio_base64, "base64"));
          console.log(`✅ ${file}`);
        } catch (e) {
          console.error(`❌ ${(e as Error).message}`);
        }
      }
    }
    return;
  }

  const r = await tts(full, voices[0], models[0], lang);
  if (!r.alignment) throw new Error("Response 冇 alignment，字幕同 scene timing 做唔到");
  await mkdir(PUBLIC, { recursive: true });
  await writeFile(path.join(PUBLIC, "vo.mp3"), Buffer.from(r.audio_base64, "base64"));
  const timing = {
    title: script.meta.title,
    voiceId: voices[0],
    modelId: models[0],
    languageCode: lang ?? null,
    ...buildTiming(r.alignment, texts, script.meta.tailSec ?? 0.8),
  };
  await writeFile(path.join(PUBLIC, "vo-timing.json"), JSON.stringify(timing, null, 2));
  console.log(`✅ public/vo.mp3 + public/vo-timing.json（${timing.durationSec.toFixed(2)}s，${timing.scenes.length} scenes）`);
  for (const s of timing.scenes) {
    console.log(`   #${s.index} ${script.scenes[s.index].type.padEnd(8)} ${s.showFromSec.toFixed(2)}–${s.showToSec.toFixed(2)}s`);
  }
}

main().catch((e) => {
  console.error(`❌ ${(e as Error).message}`);
  process.exit(1);
});
