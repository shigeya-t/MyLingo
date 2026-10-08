// Injected on demand (popup, shortcut, context menu). The guard keeps repeated
// injections into the same page from registering duplicate listeners.
if (!window.__myLingoLoaded) {
  window.__myLingoLoaded = true;

  const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'TEXTAREA', 'INPUT', 'SELECT', 'OPTION', 'CODE', 'PRE', 'KBD', 'SAMP', 'VAR', 'SVG', 'MATH', 'CANVAS', 'IFRAME']);
  const BATCH_CHARS = 2500;
  const BATCH_SEGMENTS = 40;
  // The first request is kept small so something appears quickly; the model
  // takes longer the more it has to write before replying.
  const FIRST_BATCH_CHARS = 400;
  const FIRST_BATCH_SEGMENTS = 8;
  const CONCURRENCY = 3;

  const originals = new Map(); // Text node -> original text, for restoring.
  let seen = new WeakSet(); // Nodes already queued, so dynamic content is not translated twice.
  let state = { status: 'idle', done: 0, total: 0, error: '', target: '' };
  let generation = 0; // Bumped on restore so late replies are ignored.
  let observer = null; // MutationObserver for content added after translation starts.
  let visibility = null; // IntersectionObserver for text approaching the viewport.
  const nodesByElement = new Map(); // Element -> text nodes waiting for it to come into view.
  let queue = []; // Text nodes in view, waiting to be sent.
  let inFlight = 0;
  let pumpTimer = null;
  let firstBatch = true;
  let pendingNodes = [];
  let observerTimer = null;
  let bubbleHost = null;

  const isOwnUi = (element) => bubbleHost && (element === bubbleHost || bubbleHost.contains(element));

  function setState(patch) {
    state = { ...state, ...patch };
    chrome.runtime.sendMessage({ type: 'status', ...state }).catch(() => {});
  }

  function detectPageTarget() {
    const lang = (document.documentElement.lang || '').toLowerCase();
    if (lang.startsWith('ja')) return 'en';
    if (lang) return 'ja';
    const sample = (document.body?.innerText || '').slice(0, 4000);
    const kana = (sample.match(/[぀-ヿ]/g) || []).length;
    return kana > sample.length * 0.05 ? 'en' : 'ja';
  }

  function alreadyInTarget(text, target) {
    if (target === 'ja') return /[぀-ヿ]/.test(text);
    return /^[\x00-\x7f -⁯]*$/.test(text);
  }

  function shouldSkipElement(element) {
    for (let current = element; current && current !== document.body; current = current.parentElement) {
      if (SKIP_TAGS.has(current.tagName.toUpperCase())) return true;
      if (current.isContentEditable || isOwnUi(current)) return true;
      if (current.getAttribute('translate') === 'no' || current.classList.contains('notranslate')) return true;
    }
    return false;
  }

  function collectTextNodes(root, target) {
    const nodes = [];
    if (!root) return nodes;
    if (root.nodeType === Node.TEXT_NODE) root = root.parentNode;
    if (!root || (root.nodeType === Node.ELEMENT_NODE && shouldSkipElement(root))) return nodes;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (seen.has(node) || originals.has(node)) return NodeFilter.FILTER_REJECT;
        const text = node.data.trim();
        if (text.length < 2 || !/\p{L}/u.test(text) || alreadyInTarget(text, target)) return NodeFilter.FILTER_REJECT;
        return shouldSkipElement(node.parentElement) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
      }
    });
    while (walker.nextNode()) nodes.push(walker.currentNode);
    return nodes;
  }

  // Only text near the viewport is translated. Elements are watched with an
  // IntersectionObserver and queued when they scroll within this margin.
  const VIEWPORT_MARGIN = '50% 0px';

  function watchNodes(nodes) {
    for (const node of nodes) {
      seen.add(node);
      const element = node.parentElement;
      if (!nodesByElement.has(element)) {
        nodesByElement.set(element, []);
        visibility.observe(element);
      }
      nodesByElement.get(element).push(node);
    }
  }

  function onVisibility(entries) {
    let added = 0;
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      visibility.unobserve(entry.target);
      const nodes = nodesByElement.get(entry.target) || [];
      nodesByElement.delete(entry.target);
      queue.push(...nodes);
      added += nodes.length;
    }
    if (added) setState({ total: state.total + added });
    schedulePump();
  }

  function schedulePump() {
    clearTimeout(pumpTimer);
    pumpTimer = setTimeout(pump, 120);
  }

  function distanceFromViewport(node) {
    const rect = node.parentElement?.getBoundingClientRect();
    if (!rect) return Infinity;
    if (rect.bottom < 0) return -rect.bottom;
    if (rect.top > window.innerHeight) return rect.top - window.innerHeight;
    return 0;
  }

  // Picks the queued segments closest to what the user is looking at right
  // now, so fast scrolling never leaves the visible area waiting behind text
  // that has already scrolled away.
  function takeBatch() {
    const distances = new Map(queue.filter((node) => node.isConnected).map((node) => [node, distanceFromViewport(node)]));
    const sorted = [...distances.keys()].sort((a, b) => distances.get(a) - distances.get(b));
    const [maxChars, maxSegments] = firstBatch ? [FIRST_BATCH_CHARS, FIRST_BATCH_SEGMENTS] : [BATCH_CHARS, BATCH_SEGMENTS];
    const batch = [];
    let size = 0;
    for (const node of sorted) {
      const length = node.data.trim().length;
      if (batch.length && (size + length > maxChars || batch.length >= maxSegments)) break;
      batch.push(node); size += length;
    }
    if (batch.length) firstBatch = false;
    queue = sorted.slice(batch.length);
    // Document order inside a batch lets adjacent fragments give each other context.
    return batch.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
  }

  function applyTranslation(node, translated) {
    if (!node.isConnected || !translated) return;
    const original = node.data;
    const leading = original.match(/^\s*/)[0], trailing = original.match(/\s*$/)[0];
    if (!originals.has(node)) originals.set(node, original);
    node.data = leading + translated.trim() + trailing;
  }

  function pump() {
    if (!visibility) return;
    while (inFlight < CONCURRENCY && queue.length) sendBatch(takeBatch());
    const status = inFlight || queue.length ? 'translating' : 'translated';
    if (state.status !== status) setState({ status });
  }

  async function sendBatch(batch) {
    if (!batch.length) return;
    const run = generation;
    inFlight++;
    try {
      const response = await chrome.runtime.sendMessage({ type: 'translateSegments', segments: batch.map((node) => node.data.trim()), target: state.target });
      if (run !== generation) return;
      if (response?.error) throw new Error(response.error);
      batch.forEach((node, index) => applyTranslation(node, response.translations[index]));
      inFlight--;
      setState({ done: state.done + batch.length });
      pump();
    } catch (error) {
      if (run !== generation) return;
      stopWatching();
      setState({ status: 'error', error: error.message });
    }
  }

  function startObserver() {
    if (observer) return;
    observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach((node) => { if (!isOwnUi(node)) pendingNodes.push(node); });
      }
      clearTimeout(observerTimer);
      observerTimer = setTimeout(() => {
        const roots = pendingNodes; pendingNodes = [];
        if (visibility) watchNodes(roots.flatMap((root) => (root.isConnected ? collectTextNodes(root, state.target) : [])));
      }, 300);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function stopWatching() {
    observer?.disconnect();
    observer = null;
    clearTimeout(observerTimer);
    pendingNodes = [];
    visibility?.disconnect();
    visibility = null;
    nodesByElement.clear();
    queue = [];
    inFlight = 0;
    clearTimeout(pumpTimer);
  }

  async function translatePage() {
    if (state.status === 'translating' || state.status === 'translated') return state;
    const { settings } = await chrome.runtime.sendMessage({ type: 'getSettings' });
    const target = settings.target === 'auto' ? detectPageTarget() : settings.target;
    seen = new WeakSet(); // Lets a retry after an error pick up segments that failed.
    firstBatch = true;
    setState({ status: 'translating', done: 0, total: 0, error: '', target });
    visibility = new IntersectionObserver(onVisibility, { rootMargin: VIEWPORT_MARGIN });
    watchNodes(collectTextNodes(document.body, target));
    startObserver();
    schedulePump();
    return state;
  }

  function restorePage() {
    generation++;
    stopWatching();
    for (const [node, text] of originals) if (node.isConnected) node.data = text;
    originals.clear();
    setState({ status: 'idle', done: 0, total: 0, error: '' });
    return state;
  }

  // ---- Selection translation bubble ----------------------------------------

  function selectionRect() {
    const selection = window.getSelection();
    if (selection && selection.rangeCount) {
      const rect = selection.getRangeAt(0).getBoundingClientRect();
      if (rect.width || rect.height) return rect;
    }
    return { left: window.innerWidth / 2 - 180, bottom: 80, top: 80 };
  }

  function showBubble(text, { loading = false, error = false } = {}) {
    if (!bubbleHost) {
      bubbleHost = document.createElement('mylingo-bubble');
      const shadow = bubbleHost.attachShadow({ mode: 'open' });
      shadow.innerHTML = `
        <style>
          :host { all: initial; position: fixed; z-index: 2147483647; }
          .card { width: min(360px, calc(100vw - 32px)); max-height: 320px; overflow: auto; box-sizing: border-box; padding: 14px 16px 16px; border-radius: 14px; background: #171c1d; color: #edf0ea; border: 1px solid #2a3233; box-shadow: 0 18px 50px rgba(0,0,0,.35); font: 14px/1.7 "Noto Sans JP", system-ui, sans-serif; }
          .head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; color: #8f9894; font: 700 11px/1 system-ui, sans-serif; letter-spacing: .04em; }
          .brand { display: flex; align-items: center; gap: 6px; } .brand i { width: 7px; height: 7px; border-radius: 99px; background: #c8f859; }
          button { border: 0; background: transparent; color: #8f9894; cursor: pointer; font: 16px/1 system-ui; padding: 2px 4px; } button:hover { color: #edf0ea; }
          .body { white-space: pre-wrap; word-break: break-word; } .body.loading { color: #8f9894; } .body.error { color: #ff8f8f; }
          .actions { display: flex; justify-content: flex-end; margin-top: 10px; } .copy { font: 700 11px system-ui; border: 1px solid #2a3233; border-radius: 8px; padding: 6px 10px; }
          @media (prefers-color-scheme: light) { .card { background: #fff; color: #161a17; border-color: #dde2d9; box-shadow: 0 18px 50px rgba(0,0,0,.15); } .head, button { color: #69726c; } button:hover { color: #161a17; } .brand i { background: #5f8a1a; } .copy { border-color: #dde2d9; } .body.loading { color: #69726c; } .body.error { color: #c62828; } }
        </style>
        <div class="card" role="dialog" aria-label="MyLingo 翻訳">
          <div class="head"><span class="brand"><i></i>MyLingo</span><button class="close" aria-label="閉じる">×</button></div>
          <div class="body"></div>
          <div class="actions"><button class="copy">コピー</button></div>
        </div>`;
      shadow.querySelector('.close').addEventListener('click', hideBubble);
      shadow.querySelector('.copy').addEventListener('click', async (event) => {
        await navigator.clipboard.writeText(shadow.querySelector('.body').textContent);
        event.target.textContent = 'コピーしました';
      });
      document.addEventListener('keydown', (event) => { if (event.key === 'Escape') hideBubble(); });
      document.addEventListener('mousedown', (event) => { if (bubbleHost?.isConnected && !event.composedPath().includes(bubbleHost)) hideBubble(); });
    }
    const shadow = bubbleHost.shadowRoot;
    const body = shadow.querySelector('.body');
    body.textContent = text;
    body.className = `body${loading ? ' loading' : ''}${error ? ' error' : ''}`;
    shadow.querySelector('.actions').style.display = loading || error ? 'none' : 'flex';
    shadow.querySelector('.copy').textContent = 'コピー';
    if (!bubbleHost.isConnected) {
      const rect = selectionRect();
      const top = rect.bottom + 340 < window.innerHeight ? rect.bottom + 8 : Math.max(8, rect.top - 340);
      bubbleHost.style.top = `${top}px`;
      bubbleHost.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - 376))}px`;
      document.documentElement.appendChild(bubbleHost);
    }
  }

  function hideBubble() { bubbleHost?.remove(); }

  async function translateSelection(text) {
    const selected = (text || window.getSelection()?.toString() || '').trim();
    if (!selected) return;
    hideBubble();
    showBubble('翻訳しています…', { loading: true });
    const response = await chrome.runtime.sendMessage({ type: 'translateText', text: selected });
    if (!bubbleHost?.isConnected) return;
    if (response?.error) showBubble(response.error, { error: true });
    else showBubble(response.translation);
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === 'getStatus') sendResponse(state);
    else if (message.type === 'translatePage') translatePage().then(sendResponse);
    else if (message.type === 'restorePage') sendResponse(restorePage());
    else if (message.type === 'toggle') {
      if (state.status === 'translating' || state.status === 'translated' || originals.size) sendResponse(restorePage());
      else translatePage().then(sendResponse);
    } else if (message.type === 'translateSelection') {
      translateSelection(message.text);
      sendResponse({});
    } else return false;
    return true;
  });
}
