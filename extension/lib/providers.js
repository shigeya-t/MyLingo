// Shared by the service worker, popup and options page.
export const configs = {
  openai: { name: 'ChatGPT', model: 'gpt-6-luna' },
  anthropic: { name: 'Claude', model: 'claude-haiku-5-5' },
  gemini: { name: 'Gemini', model: 'gemini-3.5-flash-lite' }
};

// Labels are the `mode.<key>` messages in i18n.js.
export const translationModes = {
  faithful: { prompt: 'Phrase the translation as literally and faithfully as possible, staying close to the original meaning and sentence structure without paraphrasing or adding stylistic flourishes.' },
  natural: { prompt: 'Phrase the translation so it reads naturally and fluently, as if originally written by a native speaker. Prioritize natural phrasing over literal wording.' },
  business: { prompt: 'Phrase the translation in formal, professional business language, as it would appear in a corporate document, email, or official correspondence.' },
  casual: { prompt: 'Phrase the translation in casual, conversational language, as it would appear in an everyday chat message or social media post.' },
  technical: { prompt: 'Phrase the translation using precise technical terminology, as it would appear in technical documentation, keeping domain-specific terms accurate and consistent.' }
};

import './languages.js';
import './i18n.js';

export const { targets: targetLanguages, custom: customTarget } = globalThis.MyLingoLanguages;
// Values saved by earlier versions, which offered only these (and 'auto').
const legacyTargets = { en: 'English', ja: 'Japanese', auto: '' };

// The language name given to the model, or '' when "Other" is chosen but left blank.
export function targetLanguageName(settings) {
  return settings.target === customTarget ? (settings.customTarget || '').trim() : settings.target;
}

// `target` left empty means MyLingoI18n.defaultTarget(), which follows the UI language.
export const defaults = { provider: 'openai', mode: 'faithful', target: '', customTarget: '', apiKeys: {}, models: {}, rateLimits: {}, rateLimitsVersion: 0, uiLanguage: '' };

// With encryption on, chrome.storage.local holds only the encrypted `vault`
// (see lib/vault.js); the options page puts the decrypted keys in
// chrome.storage.session, which stays in memory until the browser closes.
// Also switches MyLingoI18n to the UI language picked with the switch
// (`uiLanguage`, empty to follow the browser).
export async function loadSettings() {
  const { vault, ...stored } = await chrome.storage.local.get([...Object.keys(defaults), 'vault']);
  const settings = { ...defaults, ...stored };
  MyLingoI18n.setLanguage(settings.uiLanguage);
  settings.target = legacyTargets[settings.target] ?? settings.target;
  if (settings.target !== customTarget && !targetLanguages[settings.target]) settings.target = MyLingoI18n.defaultTarget();
  if (vault) {
    const { apiKeys } = await chrome.storage.session.get('apiKeys');
    settings.apiKeys = apiKeys || {};
    settings.locked = !apiKeys;
    settings.lockMethod = vault.method;
  }
  // Earlier versions limited Gemini to 12 per minute by default and saved that
  // value along with any other setting, so it cannot be told apart from a
  // limit the user chose; it is dropped once. The options page saves the
  // version, so a 12 set after this is kept.
  if (!settings.rateLimitsVersion) {
    if (settings.rateLimits.gemini === 12) settings.rateLimits = { ...settings.rateLimits, gemini: 0 };
    await chrome.storage.local.set({ rateLimits: settings.rateLimits, rateLimitsVersion: 1 });
  }
  // No limit unless the user sets one (0 means unlimited); a 429 is retried
  // after the wait the service asks for (see translator.js).
  settings.rateLimits = Object.fromEntries(Object.keys(configs).map((id) => [id, settings.rateLimits[id] ?? 0]));
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

// Injected on demand; content.js uses MyLingoI18n.
export const contentScripts = ['lib/i18n.js', 'content.js'];

export async function runPending() {
  const { pendingAction: pending } = await chrome.storage.session.get('pendingAction');
  await chrome.storage.session.remove('pendingAction');
  if (!pending || Date.now() - pending.at > PENDING_TTL) return;
  const { tabId, frameId, message } = pending;
  const tab = await chrome.tabs.update(tabId, { active: true });
  await chrome.windows.update(tab.windowId, { focused: true });
  await chrome.scripting.executeScript({ target: { tabId, frameIds: [frameId] }, files: contentScripts });
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
  return MyLingoI18n.t(settings.lockMethod ? 'error.missingKeyVault' : 'error.missingKey', { name });
}

export function modelFor(settings, provider = settings.provider) {
  return settings.models?.[provider] || configs[provider].model;
}
