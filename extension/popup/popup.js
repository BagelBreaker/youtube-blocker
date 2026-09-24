const $ = (id) => document.getElementById(id);
const statusEl = $('status');

function parseTopics(text) {
  return [...new Set(text.split('\n').map((t) => t.trim()).filter(Boolean))];
}

function setStatus(text, kind = '') {
  statusEl.textContent = text;
  statusEl.className = `status ${kind}`;
}

async function load() {
  const s = await browser.storage.local.get(FOCUS_DEFAULTS);
  $('enabled').checked = s.enabled;
  $('topics').value = s.topics.join('\n');
  $('threshold').value = s.threshold;
  $('thresholdValue').textContent = Number(s.threshold).toFixed(2);
  document.querySelector(`input[name="mode"][value="${s.mode}"]`).checked = true;
  for (const key of ['blurWhilePending', 'filterSearch', 'showScores']) $(key).checked = s[key];
}

const save = (patch) => browser.storage.local.set(patch);

$('enabled').addEventListener('change', (e) => save({ enabled: e.target.checked }));
for (const key of ['blurWhilePending', 'filterSearch', 'showScores']) {
  $(key).addEventListener('change', (e) => save({ [key]: e.target.checked }));
}
for (const radio of document.querySelectorAll('input[name="mode"]')) {
  radio.addEventListener('change', (e) => save({ mode: e.target.value }));
}
$('threshold').addEventListener('input', (e) => {
  $('thresholdValue').textContent = Number(e.target.value).toFixed(2);
});
$('threshold').addEventListener('change', (e) => save({ threshold: Number(e.target.value) }));

async function saveTopics() {
  const topics = parseTopics($('topics').value);
  await save({ topics });
  $('topics').value = topics.join('\n');
  setStatus(topics.length ? `Focusing on ${topics.length} topic${topics.length > 1 ? 's' : ''}.` : 'No topics: nothing is filtered.');
  runTest();
}
$('save').addEventListener('click', saveTopics);
$('topics').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) saveTopics();
});

let testTimer;
async function runTest() {
  const title = $('testTitle').value.trim();
  const out = $('testResult');
  if (!title) {
    out.textContent = '';
    return;
  }
  const [res, { threshold }] = await Promise.all([
    browser.runtime.sendMessage({ type: 'score', titles: [title] }),
    browser.storage.local.get({ threshold: FOCUS_DEFAULTS.threshold }),
  ]);
  if (res.error) {
    out.textContent = res.error;
    out.className = 'blocked';
    return;
  }
  const score = res.scores[0];
  const allowed = score >= threshold;
  out.textContent = `${score.toFixed(2)}: ${allowed ? 'allowed' : 'blocked'}`;
  out.className = allowed ? 'allowed' : 'blocked';
}
$('testTitle').addEventListener('input', () => {
  clearTimeout(testTimer);
  testTimer = setTimeout(runTest, 200);
});

async function warmup() {
  setStatus('Loading model…');
  const t0 = performance.now();
  const res = await browser.runtime.sendMessage({ type: 'warmup' });
  if (res?.error) setStatus(`Model failed to load: ${res.error}`, 'error');
  else setStatus(`Model ready (${Math.round(performance.now() - t0)} ms).`, 'ok');
}

load().then(warmup);
