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
 *
 * A/B 模式（多過一把聲或一個 model，或者加 --test）只輸出 public/vo-tests/*.mp3，唔改 vo.mp3。
 * 需要 Node 20.6+（用 built-in fetch 同 --env-file）。
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

type Scene = { type: string; vo: string; data?: Record<string, unknown> };
type Script = {
  meta: { title: string; voiceId?: string; modelId?: string; tailSec?: number };
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

async function tts(text: string, voiceId: string, modelId: string): Promise<TtsResponse> {
  const res = await fetch(`${API}/${voiceId}/with-timestamps?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": KEY!, "Content-Type": "application/json" },
    body: JSON.stringify({ text, model_id: modelId }),
  });
  if (!res.ok) throw new Error(`ElevenLabs ${res.status} (${voiceId}/${modelId}): ${await res.text()}`);
  return (await res.json()) as TtsResponse;
}

function buildTiming(al: Alignment, texts: string[], tailSec: number) {
  const expected = texts.join(SEP);
  const aligned = al.characters.join("") === expected;
  if (!aligned) {
    console.warn("⚠️ Alignment 同原文對唔上（可能 model normalise 咗文字），scene 分段改用字數比例估算。字幕 timing 可能有偏差。");
  }
  const chars = al.characters.map((c, i) => ({
    c,
    start: al.character_start_times_seconds[i],
    end: al.character_end_times_seconds[i],
    scene: -1,
  }));
  const voEnd = chars.length ? chars[chars.length - 1].end : 0;
  const total = expected.length || 1;

  let offset = 0;
  const raw = texts.map((t, i) => {
    const len = t.length;
    let start: number;
    let end: number;
    if (aligned) {
      start = chars[offset]?.start ?? 0;
      end = chars[offset + len - 1]?.end ?? voEnd;
      for (let k = offset; k < offset + len; k++) if (chars[k]) chars[k].scene = i;
    } else {
      start = (offset / total) * voEnd;
      end = ((offset + len) / total) * voEnd;
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
  const models = (arg("models") ?? script.meta.modelId ?? "eleven_multilingual_v2").split(",").map((s) => s.trim()).filter(Boolean);
  if (!voices.length) throw new Error("未指定 voice：填 script.json meta.voiceId 或者用 --voices");

  const texts = script.scenes.map((s) => s.vo.trim());
  if (texts.some((t) => !t)) throw new Error("有 scene 嘅 vo 係空白");
  const full = texts.join(SEP);
  const isTest = voices.length > 1 || models.length > 1 || args.includes("--test");

  if (isTest) {
    const dir = path.join(PUBLIC, "vo-tests");
    await mkdir(dir, { recursive: true });
    for (const v of voices) {
      for (const m of models) {
        try {
          const r = await tts(full, v, m);
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

  const r = await tts(full, voices[0], models[0]);
  if (!r.alignment) throw new Error("Response 冇 alignment，字幕同 scene timing 做唔到");
  await mkdir(PUBLIC, { recursive: true });
  await writeFile(path.join(PUBLIC, "vo.mp3"), Buffer.from(r.audio_base64, "base64"));
  const timing = {
    title: script.meta.title,
    voiceId: voices[0],
    modelId: models[0],
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
