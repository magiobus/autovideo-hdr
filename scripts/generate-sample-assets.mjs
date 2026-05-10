import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { fal } from "@fal-ai/client";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const outDir = path.join(rootDir, "public", "samples");

await loadLocalEnv();

const falKey = process.env.FAL_API_KEY || process.env.FAL_KEY;
if (!falKey) {
  throw new Error("FAL_API_KEY or FAL_KEY is required to generate sample assets");
}
fal.config({ credentials: falKey });

const presenterPrompts = [
  {
    id: "male-1",
    prompt:
      "Professional male luxury real estate presenter headshot, early 40s, calm approachable expression, dark blazer over black knit, soft studio lighting, neutral warm background, photorealistic editorial portrait, centered, shoulders visible, no text, no logo",
  },
  {
    id: "male-2",
    prompt:
      "Professional male editorial real estate host headshot, mid 30s, confident quiet expression, charcoal suit, soft cinematic studio light, dark neutral background, photorealistic portrait, centered composition, no text, no logo",
  },
  {
    id: "male-3",
    prompt:
      "Professional male luxury property advisor headshot, late 30s, warm expression, navy jacket, premium studio portrait, soft key light, subtle background depth, photorealistic, centered, no text, no logo",
  },
  {
    id: "female-1",
    prompt:
      "Professional female luxury real estate presenter headshot, early 30s, warm composed expression, black blazer, soft studio lighting, neutral warm background, photorealistic editorial portrait, centered, shoulders visible, no text, no logo",
  },
  {
    id: "female-2",
    prompt:
      "Professional female premium real estate guide headshot, late 30s, elegant calm expression, cream silk blouse and dark blazer, cinematic soft studio light, neutral background, photorealistic, centered, no text, no logo",
  },
  {
    id: "female-3",
    prompt:
      "Professional female editorial narrator headshot, mid 30s, refined expression, black turtleneck, soft dramatic studio lighting, dark neutral background, photorealistic portrait, centered, no text, no logo",
  },
];

const voiceSamples = [
  {
    id: "male-architect",
    voice: "Charon",
    prompt: "A quieter kind of luxury. Light, texture, and quiet intention.",
    style:
      "Premium male architectural film narrator. Warm, low, cinematic, slow, understated, expensive, human. Clean pauses. No realtor energy.",
  },
  {
    id: "male-editorial",
    voice: "Fenrir",
    prompt: "Not every home asks for attention. Some simply hold it.",
    style:
      "Premium male editorial narrator. Calm, confident, refined, quiet, slow, human. No YouTube host energy and no corporate explainer tone.",
  },
  {
    id: "female-architect",
    voice: "Aoede",
    prompt: "A slower rhythm. A brighter frame. A home designed to be felt.",
    style:
      "Premium female architectural film narrator. Warm, intimate, cinematic, restrained, slow, elegant, human. Clean pauses.",
  },
  {
    id: "female-editorial",
    voice: "Zephyr",
    prompt: "Stone, light, and proportion. Every detail lands quietly.",
    style:
      "Premium female editorial narrator. Soft, refined, understated, slow, expensive, quiet, human. No realtor energy.",
  },
];

const musicSamples = [
  {
    id: "minimal-house",
    prompt:
      "Instrumental minimal ambient house for a luxury real estate architectural film. Soft pulse, elegant synth pads, warm bass, no vocals, no lyrics, understated, polished, 88 BPM.",
  },
  {
    id: "cinematic-piano",
    prompt:
      "Instrumental cinematic piano music bed for luxury real estate. Soft piano, warm pads, restrained low pulse, emotional but understated, no vocals, no lyrics, spacious and premium.",
  },
  {
    id: "editorial-luxury",
    prompt:
      "Instrumental editorial luxury music bed for an architectural property video. Elegant synth pads, subtle percussion, polished, expensive, cinematic, no vocals, no lyrics.",
  },
];

await fs.mkdir(path.join(outDir, "presenters"), { recursive: true });
await fs.mkdir(path.join(outDir, "voices"), { recursive: true });
await fs.mkdir(path.join(outDir, "music"), { recursive: true });

for (const presenter of presenterPrompts) {
  const outputPath = path.join(outDir, "presenters", `${presenter.id}.jpg`);
  if (await exists(outputPath)) {
    console.log(`presenter exists: ${presenter.id}`);
    continue;
  }

  console.log(`generating presenter: ${presenter.id}`);
  const result = await fal.subscribe("fal-ai/flux/schnell", {
    input: {
      prompt: presenter.prompt,
      image_size: "square_hd",
      num_images: 1,
      num_inference_steps: 4,
      guidance_scale: 3.5,
      enable_safety_checker: true,
      output_format: "jpeg",
      acceleration: "regular",
    },
  });

  const imageUrl = result.data?.images?.[0]?.url;
  if (!imageUrl) throw new Error(`No image URL returned for ${presenter.id}`);
  await downloadToFile(imageUrl, outputPath);
}

for (const voice of voiceSamples) {
  const outputPath = path.join(outDir, "voices", `${voice.id}.mp3`);
  if (!shouldForce("voices") && (await exists(outputPath))) {
    console.log(`voice exists: ${voice.id}`);
    continue;
  }

  console.log(`generating voice: ${voice.id}`);
  const result = await fal.subscribe("fal-ai/gemini-tts", {
    input: {
      prompt: voice.prompt,
      model: "gemini-2.5-flash-tts",
      style_instructions: voice.style,
      voice: voice.voice,
      language_code: "English (US)",
      output_format: "mp3",
    },
  });

  const audioUrl = extractAudioUrl(result.data);
  if (!audioUrl) throw new Error(`No voice URL returned for ${voice.id}`);
  await downloadToFile(audioUrl, outputPath);
}

for (const music of musicSamples) {
  const outputPath = path.join(outDir, "music", `${music.id}.wav`);
  if (await exists(outputPath)) {
    console.log(`music exists: ${music.id}`);
    continue;
  }

  console.log(`generating music: ${music.id}`);
  const result = await fal.subscribe("cassetteai/music-generator", {
    input: {
      prompt: music.prompt,
      duration: 12,
    },
  });

  const audioUrl = extractAudioUrl(result.data);
  if (!audioUrl) throw new Error(`No music URL returned for ${music.id}`);
  await downloadToFile(audioUrl, outputPath);
}

console.log("sample assets ready");

async function loadLocalEnv() {
  const envPath = path.join(rootDir, ".env.local");
  try {
    const raw = await fs.readFile(envPath, "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex === -1) continue;
      const key = trimmed.slice(0, separatorIndex).trim();
      const value = trimmed.slice(separatorIndex + 1).trim().replace(/^["']|["']$/g, "");
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    // Environment variables may already be provided by the shell or deployment.
  }
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function downloadToFile(url, filePath) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Download failed ${response.status} for ${filePath}`);
  }
  await fs.writeFile(filePath, Buffer.from(await response.arrayBuffer()));
}

function extractAudioUrl(data) {
  return (
    data?.audio_file?.url ||
    data?.audio?.url ||
    data?.file?.url ||
    data?.output?.url ||
    data?.music?.url ||
    data?.url ||
    null
  );
}

function shouldForce(assetType) {
  const force = process.argv.includes("--force") || process.argv.includes(`--force-${assetType}`);
  return force || process.env.FORCE_SAMPLE_ASSETS === "true" || process.env.FORCE_SAMPLE_ASSETS === assetType;
}
