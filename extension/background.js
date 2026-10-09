import { loadSettings, requestUnlock, targetLanguageName, contentScripts } from './lib/providers.js';
import { translateSegments, translateText } from './lib/translator.js';

async function injectContentScript(tabId, frameIds) {
  await chrome.scripting.executeScript({ target: frameIds ? { tabId, frameIds } : { tabId }, files: contentScripts });
}

// Menu items and the toolbar title follow the UI language, so they are
// rebuilt when it changes and at startup (the browser's language may have).
// Runs are chained so overlapping rebuilds cannot create an item twice.
let menuSetup = Promise.resolve();
function setUpMenus() {
  menuSetup = menuSetup.then(async () => {
    await loadSettings();
    const { t } = MyLingoI18n;
    await chrome.contextMenus.removeAll();
    chrome.contextMenus.create({ id: 'mylingo-selection', title: t('ext.menuSelection'), contexts: ['selection'] });
    chrome.contextMenus.create({ id: 'mylingo-page', title: t('ext.menuPage'), contexts: ['page'] });
    await chrome.action.setTitle({ title: t('ext.actionTitle') });
  }).catch((error) => console.warn('MyLingo: could not set up the menus', error));
}

chrome.runtime.onInstalled.addListener(setUpMenus);
chrome.runtime.onStartup.addListener(setUpMenus);
chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local' && changes.uiLanguage) setUpMenus(); });

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) return;
  try {
    if (info.menuItemId === 'mylingo-selection') {
      const message = { type: 'translateSelection', text: info.selectionText };
      if ((await loadSettings()).locked) { await requestUnlock(tab.id, message, info.frameId ?? 0); return; }
      await injectContentScript(tab.id, [info.frameId ?? 0]);
      await chrome.tabs.sendMessage(tab.id, message, { frameId: info.frameId ?? 0 });
    } else if (info.menuItemId === 'mylingo-page') {
      if ((await loadSettings()).locked) { await requestUnlock(tab.id, { type: 'translatePage' }); return; }
      await injectContentScript(tab.id);
      await chrome.tabs.sendMessage(tab.id, { type: 'translatePage' });
    }
  } catch (error) {
    console.warn('MyLingo: cannot run on this page', error);
  }
});

chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command !== 'toggle-translation' || !tab?.id) return;
  try {
    await injectContentScript(tab.id);
    // Going back to the original needs no keys, so only a new translation
    // waits for unlocking.
    if ((await loadSettings()).locked) {
      const state = await chrome.tabs.sendMessage(tab.id, { type: 'getStatus' });
      if (!['translating', 'translated'].includes(state?.status) && !state?.done) { await requestUnlock(tab.id, { type: 'translatePage' }); return; }
    }
    await chrome.tabs.sendMessage(tab.id, { type: 'toggle' });
  } catch (error) {
    console.warn('MyLingo: cannot run on this page', error);
  }
});

async function handleMessage(message, sender) {
  const settings = await loadSettings();
  if (message.type === 'translateSegments') {
    return { translations: await translateSegments(settings, message.segments, message.target) };
  }
  if (message.type === 'translateText') {
    const target = targetLanguageName(settings);
    if (!target) throw new Error(MyLingoI18n.t('ext.missingTarget'));
    return { translation: await translateText(settings, message.text, target) };
  }
  if (message.type === 'getSettings') return { settings: { provider: settings.provider, mode: settings.mode, target: targetLanguageName(settings) } };
  if (message.type === 'status' && sender.tab?.id) {
    const text = message.status === 'translated' ? 'ON' : message.status === 'translating' ? '…' : message.status === 'error' ? '!' : '';
    chrome.action.setBadgeBackgroundColor({ tabId: sender.tab.id, color: message.status === 'error' ? '#e5484d' : '#5f8a1a' });
    chrome.action.setBadgeText({ tabId: sender.tab.id, text });
    return {};
  }
  return undefined;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!['translateSegments', 'translateText', 'getSettings', 'status'].includes(message?.type)) return false;
  handleMessage(message, sender)
    .then(sendResponse)
    .catch((error) => sendResponse({ error: error.message || MyLingoI18n.t('error.unexpected') }));
  return true;
});
