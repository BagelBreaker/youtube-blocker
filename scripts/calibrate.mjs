// Prints similarity scores for sample titles against a focus topic, using the
// same model and scoring as the extension. Useful for tuning the threshold.
//   npm run calibrate -- "machine learning" "calculus"
import { pipeline, env } from '@huggingface/transformers';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildTopicTexts, scoreTitle } from '../extension/scoring.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
env.allowRemoteModels = false;
env.localModelPath = path.join(root, 'extension', 'models') + '/';

const topics = process.argv.slice(2).length ? process.argv.slice(2) : ['machine learning', 'guitar'];
const titles = [
  'But what is a neural network? | Deep learning chapter 1',
  'Let\'s build GPT: from scratch, in code, spelled out.',
  'Stanford CS229: Machine Learning Full Course',
  'Transformers explained visually',
  'How I would learn data science in 2026',
  'Beginner guitar lesson: your first 3 chords',
  'Top 10 fingerstyle songs everyone should learn',
  'Blues soloing over a 12 bar progression',
  '$1 vs $1,000,000 Hotel Room!',
  'I Survived 100 Days in Minecraft Hardcore',
  'Gordon Ramsay makes the perfect steak',
  'Funniest cat fails compilation 2026',
  'NBA Top 10 Plays of the Night',
  'iPhone 18 Pro review: one month later',
  'Why the Roman Empire actually fell',
  'Calculus 1 - Full College Course',
];

const embed = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', { dtype: 'q8' });
const toVecs = async (texts) => (await embed(texts, { pooling: 'mean', normalize: true })).tolist();

const topicVecs = await toVecs(buildTopicTexts(topics));
const t0 = performance.now();
const titleVecs = await toVecs(titles);
const ms = performance.now() - t0;

console.log(`topics: ${topics.join(', ')}\n`);
titles
  .map((t, i) => [scoreTitle(titleVecs[i], topicVecs), t])
  .sort((a, b) => b[0] - a[0])
  .forEach(([s, t]) => console.log(`${s.toFixed(3)}  ${t}`));
console.log(`\nembedded ${titles.length} titles in ${ms.toFixed(0)}ms`);
