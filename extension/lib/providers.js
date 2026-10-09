// Shared by the service worker, popup and options page.
export const configs = {
  openai: { name: 'ChatGPT', model: 'gpt-6-luna' },
  anthropic: { name: 'Claude', model: 'claude-haiku-5-5' },
  // The Gemini free tier allows 15 requests per minute; stay a little under it.
  gemini: { name: 'Gemini', model: 'gemini-3.5-flash-lite', rateLimit: 12 }
};

export const translationModes = {
  faithful: { label: '原文に忠実', prompt: 'Phrase the translation as literally and faithfully as possible, staying close to the original sentence structure and word choice without paraphrasing or adding stylistic flourishes.' },
  natural: { label: 'ネイティブらしい自然な訳', prompt: 'Phrase the translation so it reads naturally and fluently, as if originally written by a native speaker. Prioritize natural phrasing over literal wording.' },
  business: { label: 'ビジネス文書向け', prompt: 'Phrase the translation in formal, professional business language, as it would appear in a corporate document, email, or official correspondence.' },
  casual: { label: '会話・SNS向け', prompt: 'Phrase the translation in casual, conversational language, as it would appear in an everyday chat message or social media post.' },
  technical: { label: '技術文書向け', prompt: 'Phrase the translation using precise technical terminology, as it would appear in technical documentation, keeping domain-specific terms accurate and consistent.' }
};

export const targetLanguages = { en: '英語', ja: '日本語' };

export const defaults = { provider: 'openai', mode: 'faithful', target: 'en', apiKeys: {}, models: {}, rateLimits: {} };

// With encryption on, chrome.storage.local holds only the encrypted `vault`
// (see lib/vault.js); the options page puts the decrypted keys in
// chrome.storage.session, which stays in memory until the browser closes.
export async function loadSettings() {
  const { vault, ...stored } = await chrome.storage.local.get([...Object.keys(defaults), 'vault']);
  const settings = { ...defaults, ...stored };
  if (!targetLanguages[settings.target]) settings.target = defaults.target; // e.g. the removed 'auto'
  if (vault) {
    const { apiKeys } = await chrome.storage.session.get('apiKeys');
    settings.apiKeys = apiKeys || {};
    settings.locked = !apiKeys;
    settings.lockMethod = vault.method;
  }
  // An unset limit falls back to the provider default; 0 means unlimited.
  settings.rateLimits = Object.fromEntries(Object.entries(configs).map(([id, config]) => [id, settings.rateLimits[id] ?? config.rateLimit ?? 0]));
  return settings;
}

// A translation started while the keys are locked waits in
// chrome.storage.session while a small unlock window (unlock.html) asks for
// the passkey or passphrase; the window then runs it with runPending().
// Popups close when Chrome shows its passkey dialog, hence the window.
export async function requestUnlock(tabId, message, frameId = 0) {
  await chrome.storage.session.set({ pendingAction: { tabId, frameId, message, at: Date.now() } });
  await chrome.windows.create({ url: chrome.runtime.getURL('unlock.html'), type: 'popup', width: 400, height: 340, focused: true });
}

const PENDING_TTL = 10 * 60 * 1000;

export async function runPending() {
  const { pendingAction: pending } = await chrome.storage.session.get('pendingAction');
  await chrome.storage.session.remove('pendingAction');
  if (!pending || Date.now() - pending.at > PENDING_TTL) return;
  const { tabId, frameId, message } = pending;
  const tab = await chrome.tabs.update(tabId, { active: true });
  await chrome.windows.update(tab.windowId, { focused: true });
  await chrome.scripting.executeScript({ target: { tabId, frameIds: [frameId] }, files: ['content.js'] });
  await chrome.tabs.sendMessage(tabId, message, { frameId });
}

// Decrypts the keys into chrome.storage.session. Pages that call this load
// lib/vault.js, which defines MyLingoVault.
export async function unlockVault(passphrase) {
  const { vault } = await chrome.storage.local.get('vault');
  const { keys } = await MyLingoVault.unlock(vault, passphrase);
  await chrome.storage.session.set({ apiKeys: keys });
  return keys;
}

export function missingKeyMessage(settings) {
  const name = configs[settings.provider].name;
  return settings.lockMethod
    ? `暗号化して保存したAPIキーに ${name} のキーが含まれていません。設定画面でロックを解除してから入力してください。`
    : `${name} のAPIキーが未設定です。設定画面から入力してください。`;
}

export function modelFor(settings, provider = settings.provider) {
  return settings.models?.[provider] || configs[provider].model;
}
