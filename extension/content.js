(() => {
  // Outer containers for a single video/playlist/short. When they nest (e.g. a
  // yt-lockup-view-model inside ytd-rich-item-renderer) the outermost one wins,
  // so "hide" mode removes the whole grid cell.
  const CARD_SELECTOR = [
    'ytd-rich-item-renderer',
    'ytd-video-renderer',
    'ytd-compact-video-renderer',
    'ytd-grid-video-renderer',
    'ytd-playlist-renderer',
    'ytd-compact-playlist-renderer',
    'ytd-radio-renderer',
    'ytd-compact-radio-renderer',
    'ytd-reel-item-renderer',
    'ytd-movie-renderer',
    'yt-lockup-view-model',
    'ytm-shorts-lockup-view-model',
    'ytm-shorts-lockup-view-model-v2',
    // Mobile site
    'ytm-video-with-context-renderer',
    'ytm-compact-video-renderer',
    'ytm-rich-item-renderer',
  ].join(',');

  const TITLE_SELECTORS = [
    '#video-title',
    '.ytLockupMetadataViewModelTitle',
    '.yt-lockup-metadata-view-model__title',
    '.yt-lockup-metadata-view-model-wiz__title',
    '.shortsLockupViewModelHostMetadataTitle',
    '.shortsLockupViewModelHostOutsideMetadataTitle',
    '.media-item-headline',
    'h3',
    '[class*="Headline"]', // in-feed ads
  ];

  const S = { ...FOCUS_DEFAULTS };
  const scores = new Map(); // title -> score for the current topics
  const inflight = new Set();
  let queue = new Set();
  let flushTimer = null;
  let modelError = null;

  function getTitle(card) {
    for (const sel of TITLE_SELECTORS) {
      const el = card.querySelector(sel);
      if (!el) continue;
      const text = (el.getAttribute('title') || el.textContent || '').replace(/\s+/g, ' ').trim();
      if (text) return text;
    }
    return '';
  }

  function isActive() {
    if (!S.enabled || !S.topics.length) return false;
    if (!S.filterSearch && location.pathname === '/results') return false;
    return true;
  }

  function setState(card, state, title, score) {
    if (card.dataset.focusState !== state) card.dataset.focusState = state;
    if (S.showScores && score != null) {
      // Only write on change: setting `title` triggers our own MutationObserver.
      const label = score.toFixed(2);
      if (card.dataset.focusScore !== label) card.dataset.focusScore = label;
      const tip = `Focus score ${label} (threshold ${S.threshold.toFixed(2)}): ${title}`;
      if (card.title !== tip) card.title = tip;
    } else if (card.dataset.focusScore) {
      delete card.dataset.focusScore;
      card.removeAttribute('title');
    }
  }

  function clearCard(card) {
    delete card.dataset.focusState;
    delete card.dataset.focusTitle;
    if (card.dataset.focusScore) {
      delete card.dataset.focusScore;
      card.removeAttribute('title');
    }
  }

  function processCard(card) {
    if (card.parentElement?.closest(CARD_SELECTOR)) return; // handled by outer card
    const title = getTitle(card);
    if (!title) return; // not rendered yet; the observer will call us again
    // YouTube recycles card elements, so key everything off the current title.
    card.dataset.focusTitle = title;
    const score = scores.get(title);
    if (score == null) {
      setState(card, modelError ? 'error' : 'pending', title, null);
      if (!modelError && !inflight.has(title)) {
        queue.add(title);
        scheduleFlush();
      }
      return;
    }
    setState(card, score >= S.threshold ? 'allowed' : 'blocked', title, score);
  }

  function processAll() {
    const root = document.documentElement;
    root.dataset.focusMode = S.mode;
    root.dataset.focusBlurPending = String(S.blurWhilePending);
    const active = isActive();
    root.dataset.focusActive = String(active);
    for (const card of document.querySelectorAll(CARD_SELECTOR)) {
      if (active) processCard(card);
      else if (card.dataset.focusState) clearCard(card);
    }
  }

  function scheduleFlush() {
    if (flushTimer) return;
    flushTimer = setTimeout(flush, 30);
  }

  async function flush() {
    flushTimer = null;
    const titles = [...queue];
    queue = new Set();
    if (!titles.length) return;
    titles.forEach((t) => inflight.add(t));
    const topicsAtRequest = JSON.stringify(S.topics);
    let res;
    try {
      res = await browser.runtime.sendMessage({ type: 'score', titles });
    } catch (err) {
      res = { error: String(err?.message ?? err) };
    }
    titles.forEach((t) => inflight.delete(t));
    if (JSON.stringify(S.topics) !== topicsAtRequest) return; // stale; processAll re-queued
    if (res?.error) {
      modelError = res.error;
      console.error('[focus-filter]', res.error);
      // Show thumbnails normally, but retry in a bit.
      setTimeout(() => {
        modelError = null;
        processAll();
      }, 15000);
    } else {
      modelError = null;
      titles.forEach((t, i) => scores.set(t, res.scores[i]));
    }
    updateTitles(new Set(titles));
  }

  function updateTitles(titles) {
    if (!isActive()) return;
    for (const card of document.querySelectorAll('[data-focus-title]')) {
      if (titles.has(card.dataset.focusTitle)) processCard(card);
    }
  }

  // Coalesce mutation bursts (YouTube re-renders a lot) into one pass per frame.
  let scanPending = false;
  const observer = new MutationObserver(() => {
    if (scanPending) return;
    scanPending = true;
    requestAnimationFrame(() => {
      scanPending = false;
      processAll();
    });
  });

  async function init() {
    Object.assign(S, await browser.storage.local.get(FOCUS_DEFAULTS));
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['title', 'aria-label'],
    });
    processAll();
  }

  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    for (const [key, { newValue }] of Object.entries(changes)) {
      if (key in S) S[key] = newValue ?? FOCUS_DEFAULTS[key];
    }
    if (changes.topics) {
      scores.clear();
      modelError = null;
    }
    if (changes.enabled && S.enabled) modelError = null;
    processAll();
  });

  // SPA navigation (e.g. into/out of search results) doesn't reload the script.
  document.addEventListener('yt-navigate-finish', processAll);

  init();
})();
