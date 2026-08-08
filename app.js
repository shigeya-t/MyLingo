const configs = {
  openai: { name: 'ChatGPT', model: 'gpt-5.6-luna', key: 'lingo-openai-key', modelKey: 'lingo-openai-model' },
  anthropic: { name: 'Claude', model: 'claude-haiku-4-5-20251001', key: 'lingo-anthropic-key', modelKey: 'lingo-anthropic-model' },
  gemini: { name: 'Gemini', model: 'gemini-3.5-flash-lite', key: 'lingo-gemini-key', modelKey: 'lingo-gemini-model' }
};

let provider = localStorage.getItem('lingo-provider') || 'openai';
let timer;
const $ = (selector) => document.querySelector(selector);
const source = $('#sourceText'), translation = $('#translation');

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  $('#themeToggle').setAttribute('aria-pressed', theme === 'light');
  $('meta[name="theme-color"]').setAttribute('content', theme === 'light' ? '#f5f6f2' : '#101416');
}

function initTheme() {
  const stored = localStorage.getItem('lingo-theme');
  applyTheme(stored || (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'));
}

function detectLanguage(text) {
  // Japanese kana / CJK characters are a reliable lightweight detector for this two-language tool.
  return /[\u3040-\u30ff\u3400-\u9faf]/.test(text) ? 'ja' : 'en';
}

function setLanguages(text) {
  const sourceLanguage = detectLanguage(text);
  $('#sourceLang').textContent = text.trim() ? (sourceLanguage === 'ja' ? '日本語を検出' : '英語を検出') : '言語を自動判別';
  $('#targetLang').textContent = sourceLanguage === 'ja' ? '英語' : '日本語';
  return sourceLanguage;
}

function providerConfig() { return configs[provider]; }
function currentModel() {
  const config = providerConfig();
  const savedModel = localStorage.getItem(config.modelKey);
  if ((provider === 'openai' && savedModel === 'gpt-4.1-mini') ||
      (provider === 'anthropic' && (savedModel === 'claude-sonnet-4-20250514' || savedModel === 'claude-opus-5')) ||
      (provider === 'gemini' && (savedModel === 'gemini-2.0-flash' || savedModel === 'gemini-3.5-flash'))) {
    localStorage.setItem(config.modelKey, config.model);
    return config.model;
  }
  return savedModel || config.model;
}

function setProvider(next) {
  provider = next;
  localStorage.setItem('lingo-provider', provider);
  document.querySelectorAll('.provider').forEach((button) => {
    const active = button.dataset.provider === provider;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', active);
  });
  $('#modelLabel').textContent = providerConfig().name;
  if ($('#settingsPanel').classList.contains('open')) fillSettings();
}

function output(text) {
  translation.textContent = text;
}

function outputEmpty() {
  translation.innerHTML = '<div class="empty-state"><span class="empty-star">✦</span><p>ここに翻訳が表示されます</p></div>';
}

function systemPrompt(sourceLanguage) {
  const target = sourceLanguage === 'ja' ? 'English' : 'Japanese';
  return `You are a precise translation engine. Translate the input from ${sourceLanguage === 'ja' ? 'Japanese' : 'English'} to ${target}. Return only the translation. Preserve line breaks, tone, and formatting. Do not add explanations, labels, quotation marks, or notes.`;
}

function friendlyApiError(status, message) {
  const detail = message || 'サービスから詳細なエラー情報を取得できませんでした。';
  if (status === 401 || status === 403) {
    return `APIキーを確認してください。\n選択中の ${providerConfig().name} 用のAPIキーが無効、または権限不足です。\n\n詳細: ${detail}`;
  }
  if (status === 429) {
    return `利用上限に達しているか、短時間にリクエストが集中しています。しばらく待ってから再試行してください。\n\n詳細: ${detail}`;
  }
  if (status === 400 || status === 404) {
    return `モデルまたはAPIの設定を確認してください。現在のモデル: ${currentModel()}\n\n詳細: ${detail}`;
  }
  return `翻訳サービスでエラーが発生しました（HTTP ${status}）。\n\n詳細: ${detail}`;
}

function friendlyNetworkError(error) {
  if (error instanceof TypeError && /fetch/i.test(error.message)) {
    return `${providerConfig().name} に接続できませんでした。ネットワーク接続、ブラウザの拡張機能、またはブラウザからのAPI接続制限を確認してください。`;
  }
  return error.message || '予期しないエラーが発生しました。';
}

function getOpenAIText(data) {
  // `output_text` is the convenience field used by many Responses API replies.
  // Some compatible responses return only the structured `output` array instead.
  if (typeof data.output_text === 'string' && data.output_text.trim()) return data.output_text;
  return (data.output || [])
    .flatMap((item) => item.content || [])
    .filter((part) => part.type === 'output_text' || part.type === 'text')
    .map((part) => part.text || '')
    .join('');
}

async function requestTranslation(text) {
  const key = localStorage.getItem(providerConfig().key);
  if (!key) {
    output('APIキーを設定すると翻訳できます。右上の設定から入力してください。');
    $('#translationStatus').textContent = 'APIキーが未設定です';
    return;
  }
  const sourceLanguage = setLanguages(text);
  const model = currentModel();
  $('#translationStatus').textContent = '翻訳しています…';
  output('');
  try {
    let result;
    if (provider === 'openai') {
      const response = await fetch('https://api.openai.com/v1/responses', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }, body: JSON.stringify({ model, instructions: systemPrompt(sourceLanguage), input: text }) });
      const data = await response.json();
      if (!response.ok) throw new Error(friendlyApiError(response.status, data.error?.message));
      result = getOpenAIText(data);
    } else if (provider === 'anthropic') {
      const response = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' }, body: JSON.stringify({ model, max_tokens: 2048, system: systemPrompt(sourceLanguage), messages: [{ role: 'user', content: text }] }) });
      const data = await response.json();
      if (!response.ok) throw new Error(friendlyApiError(response.status, data.error?.message));
      result = (data.content || [])
        .filter((part) => part.type === 'text')
        .map((part) => part.text || '')
        .join('');
    } else {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ systemInstruction: { parts: [{ text: systemPrompt(sourceLanguage) }] }, contents: [{ parts: [{ text }] }], generationConfig: { temperature: 0.2 } }) });
      const data = await response.json();
      if (!response.ok) throw new Error(friendlyApiError(response.status, data.error?.message));
      result = data.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('');
    }
    if (!result) throw new Error('翻訳結果を取得できませんでした。モデルからテキスト形式の応答が返らなかったため、設定のモデル名を確認してください。');
    output(result.trim());
    $('#translationStatus').textContent = '翻訳完了';
  } catch (error) {
    output(friendlyNetworkError(error));
    $('#translationStatus').textContent = 'エラーが発生しました';
  }
}

function scheduleTranslation() {
  clearTimeout(timer);
  const text = source.value.trim();
  $('#characterCount').textContent = `${source.value.length.toLocaleString('ja-JP')} 文字`;
  setLanguages(text);
  if (!text) { outputEmpty(); $('#translationStatus').textContent = '準備完了'; return; }
  timer = setTimeout(() => requestTranslation(text), 700);
}

function openSettings() { fillSettings(); $('#settingsPanel').classList.add('open'); $('#scrim').classList.add('show'); $('#settingsPanel').setAttribute('aria-hidden', 'false'); }
function closeSettings() { $('#settingsPanel').classList.remove('open'); $('#scrim').classList.remove('show'); $('#settingsPanel').setAttribute('aria-hidden', 'true'); }
function fillSettings() { const config = providerConfig(); $('#keyProvider').textContent = config.name; $('#apiKey').value = localStorage.getItem(config.key) || ''; $('#modelInput').value = currentModel(); }
function toast(message) { $('#toast').textContent = message; $('#toast').classList.add('show'); setTimeout(() => $('#toast').classList.remove('show'), 1800); }

source.addEventListener('input', scheduleTranslation);
source.addEventListener('keydown', (event) => { if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') { clearTimeout(timer); requestTranslation(source.value.trim()); } });
document.querySelectorAll('.provider').forEach((button) => button.addEventListener('click', () => { setProvider(button.dataset.provider); if (source.value.trim()) scheduleTranslation(); }));
$('#clearButton').addEventListener('click', () => { source.value = ''; scheduleTranslation(); source.focus(); });
$('#swapButton').addEventListener('click', () => { const text = translation.textContent.trim(); if (!text || translation.querySelector('.empty-state')) return; source.value = text; scheduleTranslation(); source.focus(); toast('翻訳結果を原文にコピーしました'); });
document.querySelectorAll('[data-copy]').forEach((button) => button.addEventListener('click', async () => { const id = button.dataset.copy; const text = id === 'translation' ? translation.textContent.trim() : source.value; if (!text) return; await navigator.clipboard.writeText(text); toast('コピーしました'); }));
$('.settings-trigger').addEventListener('click', openSettings); $('.close-settings').addEventListener('click', closeSettings); $('#scrim').addEventListener('click', closeSettings);
$('#toggleKey').addEventListener('click', () => { const isPassword = $('#apiKey').type === 'password'; $('#apiKey').type = isPassword ? 'text' : 'password'; $('#toggleKey').textContent = isPassword ? '隠す' : '表示'; });
$('#saveSettings').addEventListener('click', () => { const config = providerConfig(); localStorage.setItem(config.key, $('#apiKey').value.trim()); localStorage.setItem(config.modelKey, $('#modelInput').value.trim() || config.model); closeSettings(); toast(`${config.name} の設定を保存しました`); if (source.value.trim()) scheduleTranslation(); });
$('#themeToggle').addEventListener('click', () => { const next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light'; localStorage.setItem('lingo-theme', next); applyTheme(next); });
setProvider(provider);
initTheme();
