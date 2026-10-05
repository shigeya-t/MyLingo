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
    section.querySelector(`#key-${id}`).value = settings.apiKeys?.[id] || '';
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
  const apiKeys = {}, models = {}, rateLimits = {};
  for (const [id, config] of Object.entries(configs)) {
    apiKeys[id] = $(`#key-${id}`).value.trim();
    models[id] = $(`#model-${id}`).value.trim() || config.model;
    const rate = $(`#rate-${id}`).value.trim();
    rateLimits[id] = rate === '' ? config.rateLimit ?? 0 : Math.max(0, Math.floor(Number(rate)) || 0);
  }
  await chrome.storage.local.set({ apiKeys, models, rateLimits });
  toast('設定を保存しました');
});

loadSettings().then(renderFields);
