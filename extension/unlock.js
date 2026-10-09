import { runPending, unlockVault } from './lib/providers.js';

// Opened by requestUnlock() (lib/providers.js) as a small window.
const $ = (selector) => document.querySelector(selector);
const { vault } = await chrome.storage.local.get('vault');
const passkey = vault?.method === 'passkey';
let busy = false;

async function finish() {
  try {
    await runPending();
  } catch {
    $('#message').textContent = 'ロックを解除しました。翻訳を開始できなかったため、もう一度お試しください。';
    $('#message').className = 'status';
    $('#unlockButton').hidden = $('#passphrase').hidden = true;
    return;
  }
  window.close();
}

async function unlock({ quiet = false } = {}) {
  if (busy) return;
  busy = true;
  $('#unlockButton').disabled = true;
  $('#error').textContent = '';
  try {
    await unlockVault($('#passphrase').value);
    await finish();
  } catch (error) {
    // A passkey prompt started without a click may be refused; the button stays.
    if (!(quiet && error?.name === 'NotAllowedError')) $('#error').textContent = MyLingoVault.friendlyError(error);
  } finally {
    busy = false;
    $('#unlockButton').disabled = false;
  }
}

$('#unlockButton').addEventListener('click', () => unlock());
$('#passphrase').addEventListener('keydown', (event) => { if (event.key === 'Enter') unlock(); });

if (!vault || (await chrome.storage.session.get('apiKeys')).apiKeys) {
  await finish(); // Unlocked meanwhile (or never encrypted): just run it.
} else if (passkey) {
  $('#unlockButton').textContent = 'パスキー（Touch ID など）で解除';
  unlock({ quiet: true });
} else {
  $('#passphrase').hidden = false;
  $('#passphrase').focus();
}
