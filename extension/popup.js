import { translationModes, targetLanguages, customTarget, targetLanguageName, loadSettings, modelFor, requestUnlock, unlockVault, missingKeyMessage } from './lib/providers.js';

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
  // A passphrase can be typed right here; a passkey needs the unlock window
  // because Chrome closes the popup when it shows its passkey dialog.
  const passphrase = settings.locked && settings.lockMethod === 'passphrase';
  $('#unlockPassphrase').hidden = !passphrase;
  if (passphrase) showStatus('APIキーがロックされています。パスフレーズを入力して翻訳してください。', 'warn');
  else if (settings.locked) showStatus('APIキーがロックされています。翻訳を始めると、パスキーで解除する画面が開きます。', 'warn');
  else if (!hasKey) showStatus(missingKeyMessage(settings), 'warn');
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

// True while the page shows (or is fetching) a translation.
function pageTranslated() {
  return Boolean(pageState && (pageState.status === 'translating' || pageState.status === 'translated' || (pageState.status === 'error' && pageState.done)));
}

// After the target language or translation mode changes on a translated page, translate it again
// right away instead of making the user restore and translate by hand.
async function retranslate() {
  if (!pageTranslated()) return;
  const settings = await loadSettings();
  const target = targetLanguageName(settings);
  if (!target || (target === pageState.target && settings.mode === pageState.mode) || settings.locked) return;
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'restorePage' });
    renderPage(await chrome.tabs.sendMessage(tabId, { type: 'translatePage' }));
  } catch {
    showStatus('再翻訳できませんでした。ページを再読み込みしてからもう一度お試しください。', 'error');
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
  fillSelect($('#targetSelect'), [...Object.entries(targetLanguages), [customTarget, 'その他…']], settings.target);
  $('#customTarget').value = settings.customTarget;
  $('#customTarget').hidden = settings.target !== customTarget;
  renderProvider(settings);
  await connectToTab();
  if (pageState) renderProvider(settings);

  document.querySelectorAll('.provider').forEach((button) => button.addEventListener('click', async () => {
    await chrome.storage.local.set({ provider: button.dataset.provider });
    renderProvider(await loadSettings());
  }));
  $('#modeSelect').addEventListener('change', async () => {
    await chrome.storage.local.set({ mode: $('#modeSelect').value });
    retranslate();
  });
  let retranslateTimer;
  $('#targetSelect').addEventListener('change', async () => {
    const target = $('#targetSelect').value;
    await chrome.storage.local.set({ target });
    $('#customTarget').hidden = target !== customTarget;
    if (target === customTarget) $('#customTarget').focus();
    retranslate();
  });
  // A typed language name is applied once typing pauses, or at once on Enter.
  $('#customTarget').addEventListener('input', async () => {
    clearTimeout(retranslateTimer);
    await chrome.storage.local.set({ customTarget: $('#customTarget').value.trim() });
    retranslateTimer = setTimeout(retranslate, 1000);
  });
  $('#customTarget').addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    clearTimeout(retranslateTimer);
    if (pageTranslated()) retranslate();
    else $('#actionButton').click();
  });
  $('#openOptions').addEventListener('click', () => chrome.runtime.openOptionsPage());
  $('#unlockPassphrase').addEventListener('keydown', (event) => { if (event.key === 'Enter') $('#actionButton').click(); });
  $('#actionButton').addEventListener('click', async () => {
    const restore = pageTranslated();
    if (!restore) {
      let current = await loadSettings();
      if (!targetLanguageName(current)) { showStatus('翻訳先の言語名を入力してください。', 'warn'); $('#customTarget').focus(); return; }
      if (current.locked && current.lockMethod === 'passphrase') {
        const passphrase = $('#unlockPassphrase').value;
        if (!passphrase) { $('#unlockPassphrase').focus(); return; }
        try {
          await unlockVault(passphrase);
        } catch (error) {
          showStatus(MyLingoVault.friendlyError(error), 'error');
          $('#unlockPassphrase').select();
          return;
        }
        current = await loadSettings();
        $('#unlockPassphrase').hidden = true;
      }
      if (current.locked) { await requestUnlock(tabId, { type: 'translatePage' }); window.close(); return; }
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

init();
