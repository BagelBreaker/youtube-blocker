import './defaults.js';
import { pipeline, env } from './vendor/transformers.min.js';
import { buildTopicTexts, scoreTitle } from './scoring.js';

const MODEL_ID = 'Xenova/all-MiniLM-L6-v2';

// Everything is bundled with the extension; never touch the network.
env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = browser.runtime.getURL('models/');
env.useBrowserCache = false;
// The WASM cache loads the runtime from a blob: URL, which extension CSP forbids.
env.useWasmCache = false;
env.backends.onnx.wasm.wasmPaths = {
  mjs: browser.runtime.getURL('vendor/ort-wasm-simd-threaded.mjs'),
  wasm: browser.runtime.getURL('vendor/ort-wasm-simd-threaded.wasm'),
};
env.backends.onnx.wasm.numThreads = 1;

let extractorPromise = null;
function getExtractor() {
  extractorPromise ??= pipeline('feature-extraction', MODEL_ID, { dtype: 'q8', device: 'wasm' })
    .catch((err) => {
      extractorPromise = null;
      throw err;
    });
  return extractorPromise;
}

async function embed(texts) {
  const extractor = await getExtractor();
  const output = await extractor(texts, { pooling: 'mean', normalize: true });
  return output.tolist();
}

// Title embeddings don't depend on the topics, so they survive topic changes.
const MAX_CACHE = 5000;
const titleCache = new Map();

async function embedTitles(titles) {
  const missing = [...new Set(titles.filter((t) => !titleCache.has(t)))];
  const BATCH = 32;
  for (let i = 0; i < missing.length; i += BATCH) {
    const chunk = missing.slice(i, i + BATCH);
    const vecs = await embed(chunk);
    chunk.forEach((t, j) => titleCache.set(t, vecs[j]));
  }
  while (titleCache.size > MAX_CACHE) {
    titleCache.delete(titleCache.keys().next().value);
  }
  return titles.map((t) => titleCache.get(t));
}

let topicState = { key: null, vecs: null };

async function getTopicVecs(topics) {
  const key = JSON.stringify(topics);
  if (topicState.key !== key) {
    topicState = { key, vecs: topics.length ? await embed(buildTopicTexts(topics)) : [] };
  }
  return topicState.vecs;
}

async function scoreTitles(titles) {
  const { topics } = await browser.storage.local.get({ topics: FOCUS_DEFAULTS.topics });
  const topicVecs = await getTopicVecs(topics);
  if (!topicVecs.length) return titles.map(() => 1);
  const vecs = await embedTitles(titles);
  return vecs.map((v) => scoreTitle(v, topicVecs));
}

browser.runtime.onMessage.addListener((msg) => {
  if (msg?.type === 'score') {
    return scoreTitles(msg.titles).then(
      (scores) => ({ scores }),
      (err) => {
        console.error('[focus-filter] scoring failed', err);
        return { error: String(err?.message ?? err) };
      },
    );
  }
  if (msg?.type === 'warmup') {
    return getExtractor().then(() => ({ ok: true }), (err) => ({ error: String(err?.message ?? err) }));
  }
  return false;
});
