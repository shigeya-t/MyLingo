import { loadSettings, requestUnlock, targetLanguageName } from './lib/providers.js';
import { translateSegments, translateText } from './lib/translator.js';

async function injectContentScript(tabId, frameIds) {
  await chrome.scripting.executeScript({ target: frameIds ? { tabId, frameIds } : { tabId }, files: ['content.js'] });
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: 'mylingo-selection', title: 'MyLingo で「%s」を翻訳', contexts: ['selection'] });
  chrome.contextMenus.create({ id: 'mylingo-page', title: 'MyLingo でこのページを翻訳', contexts: ['page'] });
});

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
    console.warn('MyLingo: このページでは実行できません', error);
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
    console.warn('MyLingo: このページでは実行できません', error);
  }
});

const missingTargetMessage = '翻訳先の言語が未入力です。ツールバーの MyLingo で「その他」の言語名を入力してください。';

async function handleMessage(message, sender) {
  const settings = await loadSettings();
  if (message.type === 'translateSegments') {
    return { translations: await translateSegments(settings, message.segments, message.target) };
  }
  if (message.type === 'translateText') {
    const target = targetLanguageName(settings);
    if (!target) throw new Error(missingTargetMessage);
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
    .catch((error) => sendResponse({ error: error.message || '予期しないエラーが発生しました。' }));
  return true;
});
