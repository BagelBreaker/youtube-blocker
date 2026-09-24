// Loaded as a classic script (content script + popup) and imported by background.js.
var FOCUS_DEFAULTS = {
  enabled: true,
  topics: [],
  threshold: 0.25,
  mode: 'blur', // 'blur' = blur thumbnail, 'hide' = remove the whole card
  blurWhilePending: true,
  filterSearch: true,
  showScores: false,
};
globalThis.FOCUS_DEFAULTS = FOCUS_DEFAULTS;
