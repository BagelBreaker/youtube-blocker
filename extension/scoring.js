// Shared between the background script and scripts/calibrate.mjs.

// Each focus line is embedded as-is. Short topics ("guitar") embed poorly against
// full video titles, so we also embed a sentence form that looks more like a title.
export function buildTopicTexts(topics) {
  const texts = [];
  for (const topic of topics) {
    texts.push(topic, `a video about ${topic}`);
  }
  return texts;
}

// Vectors are L2-normalized, so the dot product is the cosine similarity.
export function dot(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

// A title matches if it's close to any of the focus topics.
export function scoreTitle(titleVec, topicVecs) {
  let best = -1;
  for (const v of topicVecs) best = Math.max(best, dot(titleVec, v));
  return best;
}
