import { configs, translationModes, targetLanguages, loadSettings, modelFor } from './lib/providers.js';

const $ = (selector) => document.querySelector(selector);
let tabId = null;
let pageState = null;

function fillSelect(select, entries, value) {
  select.innerHTML = '';
  for (const [key, label] of entries) select.add(new Option(label, key));
  select.value = value;
}

function renderProvider(settings) {
  document.querySelectorAll('.provider').forEach((button) => {
    const active = button.dataset.provider === settings.provider;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', active);
  });
  $('#modelLabel').textContent = modelFor(settings);
  const hasKey = Boolean(settings.apiKeys?.[settings.provider]);
  if (settings.locked) showStatus('APIキーがロックされています。右上の設定からロックを解除してください。', 'warn');
  else if (!hasKey) showStatus(`${configs[settings.provider].name} のAPIキーが未設定です。右上の設定から入力してください。`, 'warn');
  else if (!pageState || pageState.status === 'idle') showStatus('');
}

function showStatus(message, tone = '') {
  $('#status').textContent = message;
  $('#status').className = `status ${tone}`;
}

function renderPage(state) {
  pageState = state;
  const button = $('#actionButton');
  button.disabled = false;
  const progress = $('#progress');
  progress.hidden = state.status !== 'translating';
  if (state.total) $('#progressBar').style.width = `${Math.round((state.done / state.total) * 100)}%`;
  if (state.status === 'translating') {
    button.textContent = '翻訳を中止して原文に戻す';
    showStatus(state.total ? `表示中の部分を翻訳しています… ${state.done} / ${state.total}` : '表示中の部分を翻訳しています…');
  } else if (state.status === 'translated') {
    button.textContent = '原文に戻す';
    showStatus(state.total ? `表示中の ${state.total} 箇所を翻訳しました。スクロールすると続きを順次翻訳します。` : '表示中に翻訳が必要なテキストはありません。スクロールすると続きを翻訳します。', 'ok');
  } else if (state.status === 'error') {
    button.textContent = state.done ? '原文に戻す' : 'もう一度翻訳';
    showStatus(state.error, 'error');
  } else {
    button.textContent = 'このページを翻訳';
  }
}

async function connectToTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  tabId = tab?.id;
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
    renderPage(await chrome.tabs.sendMessage(tabId, { type: 'getStatus' }));
  } catch {
    $('#actionButton').disabled = true;
    showStatus('このページ（ブラウザの内部ページやWebストアなど）は翻訳できません。', 'warn');
  }
}

async function init() {
  const settings = await loadSettings();
  fillSelect($('#modeSelect'), Object.entries(translationModes).map(([key, mode]) => [key, mode.label]), settings.mode);
  fillSelect($('#targetSelect'), Object.entries(targetLanguages), settings.target);
  renderProvider(settings);
  await connectToTab();
  if (pageState) renderProvider(settings);

  document.querySelectorAll('.provider').forEach((button) => button.addEventListener('click', async () => {
    await chrome.storage.local.set({ provider: button.dataset.provider });
    renderProvider(await loadSettings());
  }));
  $('#modeSelect').addEventListener('change', () => chrome.storage.local.set({ mode: $('#modeSelect').value }));
  $('#targetSelect').addEventListener('change', () => chrome.storage.local.set({ target: $('#targetSelect').value }));
  $('#openOptions').addEventListener('click', () => chrome.runtime.openOptionsPage());
  $('#actionButton').addEventListener('click', async () => {
    const restore = pageState && (pageState.status === 'translating' || pageState.status === 'translated' || (pageState.status === 'error' && pageState.done));
    if (!restore) {
      const current = await loadSettings();
      if (!current.apiKeys?.[current.provider]) { chrome.runtime.openOptionsPage(); return; }
      // The content script drives the translation, so the popup can close once it
      // has the request. Closing before the reply can drop the message while
      // Chrome is still opening the channel to the tab.
      $('#actionButton').disabled = true;
      showStatus('翻訳を開始しています…');
      try {
        const state = await chrome.tabs.sendMessage(tabId, { type: 'translatePage' });
        if (state?.status === 'error') { renderPage(state); return; }
        window.close();
      } catch {
        renderPage(pageState || { status: 'idle' });
        showStatus('翻訳を開始できませんでした。ページを再読み込みしてからもう一度お試しください。', 'error');
      }
      return;
    }
    renderPage(await chrome.tabs.sendMessage(tabId, { type: 'restorePage' }));
  });

  // Progress updates broadcast by the content script.
  chrome.runtime.onMessage.addListener((message, sender) => {
    if (message.type === 'status' && sender.tab?.id === tabId) renderPage(message);
  });
}

$('#commitHash').textContent = globalThis.MYLINGO_COMMIT || '';
init();
