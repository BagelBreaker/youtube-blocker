// Copies transformers.js + the ONNX Runtime WASM binary into extension/vendor and
// downloads the quantized all-MiniLM-L6-v2 model into extension/models, so the
// extension runs fully offline (AMO does not allow loading remote code/WASM).
import { copyFile, mkdir, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ext = path.join(root, 'extension');

const MODEL_ID = 'Xenova/all-MiniLM-L6-v2';
const MODEL_FILES = [
  'config.json',
  'tokenizer.json',
  'tokenizer_config.json',
  'onnx/model_quantized.onnx',
];

async function exists(p) {
  try { await stat(p); return true; } catch { return false; }
}

async function vendor() {
  const vendorDir = path.join(ext, 'vendor');
  await mkdir(vendorDir, { recursive: true });

  const tfPkg = path.join(root, 'node_modules', '@huggingface', 'transformers');
  const tfDist = path.join(tfPkg, 'dist');
  // Use the ort-web copy that transformers.js was built against so versions match.
  const nestedOrt = path.join(tfPkg, 'node_modules', 'onnxruntime-web');
  const ortPkg = (await exists(nestedOrt)) ? nestedOrt : path.join(root, 'node_modules', 'onnxruntime-web');
  const ortDist = path.join(ortPkg, 'dist');

  const files = [
    [path.join(tfDist, 'transformers.min.js'), 'transformers.min.js'],
    [path.join(ortDist, 'ort-wasm-simd-threaded.mjs'), 'ort-wasm-simd-threaded.mjs'],
    [path.join(ortDist, 'ort-wasm-simd-threaded.wasm'), 'ort-wasm-simd-threaded.wasm'],
  ];
  for (const [src, name] of files) {
    await copyFile(src, path.join(vendorDir, name));
    console.log(`vendor/${name}`);
  }
}

async function downloadModel() {
  const modelDir = path.join(ext, 'models', MODEL_ID);
  for (const file of MODEL_FILES) {
    const dest = path.join(modelDir, file);
    if (await exists(dest)) {
      console.log(`models/${MODEL_ID}/${file} (cached)`);
      continue;
    }
    const url = `https://huggingface.co/${MODEL_ID}/resolve/main/${file}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to download ${url}: ${res.status}`);
    await mkdir(path.dirname(dest), { recursive: true });
    await writeFile(dest, Buffer.from(await res.arrayBuffer()));
    console.log(`models/${MODEL_ID}/${file}`);
  }
}

await vendor();
await downloadModel();
console.log('\nDone. Load extension/manifest.json via about:debugging, or run `npm start`.');
