import { configs, loadSettings } from './lib/providers.js';

const $ = (selector) => document.querySelector(selector);
const orbs = { openai: '✦', anthropic: 'A', gemini: '✧' };

function renderFields(settings) {
  $('#providerFields').innerHTML = '';
  for (const [id, config] of Object.entries(configs)) {
    const section = document.createElement('section');
    section.className = 'provider-card';
    section.innerHTML = `
      <h2><span class="provider-orb ${id}">${orbs[id]}</span>${config.name}</h2>
      <label class="field-label" for="key-${id}">API キー</label>
      <div class="key-field"><input id="key-${id}" type="password" autocomplete="off" placeholder="API key を貼り付け" /><button type="button" data-toggle="key-${id}">表示</button></div>
      <label class="field-label" for="model-${id}">モデル</label>
      <input id="model-${id}" class="model-input" type="text" placeholder="${config.model}" />
      <label class="field-label" for="rate-${id}">1分あたりの最大リクエスト数 <span class="hint">0 = 制限なし</span></label>
      <input id="rate-${id}" class="model-input" type="number" min="0" step="1" />`;
    const keyInput = section.querySelector(`#key-${id}`);
    keyInput.value = keysLocked() ? '' : apiKeys()[id] || '';
    keyInput.disabled = keysLocked();
    section.querySelector(`[data-toggle="key-${id}"]`).disabled = keysLocked();
    if (keysLocked()) keyInput.placeholder = 'ロックを解除すると編集できます';
    section.querySelector(`#model-${id}`).value = settings.models?.[id] || config.model;
    section.querySelector(`#rate-${id}`).value = settings.rateLimits[id];
    $('#providerFields').appendChild(section);
  }
  document.querySelectorAll('[data-toggle]').forEach((button) => button.addEventListener('click', () => {
    const input = document.getElementById(button.dataset.toggle);
    const hidden = input.type === 'password';
    input.type = hidden ? 'text' : 'password';
    button.textContent = hidden ? '隠す' : '表示';
  }));
}

function toast(message) {
  $('#toast').textContent = message;
  $('#toast').classList.add('show');
  setTimeout(() => $('#toast').classList.remove('show'), 1800);
}

$('#settingsForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const models = {}, rateLimits = {};
  for (const [id, config] of Object.entries(configs)) {
    models[id] = $(`#model-${id}`).value.trim() || config.model;
    const rate = $(`#rate-${id}`).value.trim();
    rateLimits[id] = rate === '' ? config.rateLimit ?? 0 : Math.max(0, Math.floor(Number(rate)) || 0);
  }
  await chrome.storage.local.set({ models, rateLimits });
  if (!keysLocked()) await saveApiKeys(typedKeys());
  toast('設定を保存しました');
});

// With encryption on, editing the keys needs the key derived on this page;
// keys unlocked earlier only sit in chrome.storage.session for translating.
let vault = null;
let unlocked = null; // { keys, key } while this page is unlocked.
let plain = {}; // Unencrypted keys, when encryption is off.
let sessionUnlocked = false; // Keys unlocked earlier are in chrome.storage.session.

function keysLocked() { return Boolean(vault && !unlocked); }
function apiKeys() { return vault ? unlocked?.keys || {} : plain; }
function typedKeys() { return Object.fromEntries(Object.keys(configs).map((id) => [id, $(`#key-${id}`).value.trim()])); }

async function saveApiKeys(keys) {
  if (!vault) { plain = keys; await chrome.storage.local.set({ apiKeys: keys }); return; }
  vault = await MyLingoVault.reseal(vault, unlocked.key, keys);
  unlocked.keys = keys;
  await chrome.storage.local.set({ vault });
  await chrome.storage.session.set({ apiKeys: keys });
}

async function refresh() {
  ({ vault = null, apiKeys: plain = {} } = await chrome.storage.local.get(['vault', 'apiKeys']));
  const { apiKeys: sessionKeys } = await chrome.storage.session.get('apiKeys');
  sessionUnlocked = Boolean(sessionKeys);
  renderFields(await loadSettings());
  vaultPanel.render();
}

const vaultPanel = MyLingoVault.mountPanel($('#vaultPanel'), {
  state: () => ({ method: vault?.method || null, unlocked: Boolean(unlocked), sessionUnlocked }),
  async protect(method, passphrase) {
    // Include keys typed into the form but not saved yet.
    const keys = typedKeys();
    const created = await MyLingoVault.create(method, keys, passphrase);
    await chrome.storage.local.set({ vault: created.vault });
    await chrome.storage.local.remove('apiKeys');
    await chrome.storage.session.set({ apiKeys: keys });
    unlocked = { keys, key: created.key };
    await refresh();
  },
  async unlock(passphrase) {
    unlocked = await MyLingoVault.unlock(vault, passphrase);
    await chrome.storage.session.set({ apiKeys: unlocked.keys });
    await refresh();
  },
  async lock() {
    unlocked = null;
    await chrome.storage.session.remove('apiKeys');
    await refresh();
  },
  async unprotect() {
    await chrome.storage.local.set({ apiKeys: unlocked.keys });
    await chrome.storage.local.remove('vault');
    await chrome.storage.session.remove('apiKeys');
    unlocked = null;
    await refresh();
  },
  async reset() {
    await chrome.storage.local.remove('vault');
    await chrome.storage.session.remove('apiKeys');
    unlocked = null;
    await refresh();
  }
});

$('#commitHash').textContent = globalThis.MYLINGO_COMMIT || '';

refresh();
