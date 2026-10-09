// Encrypts the API keys at rest with a key derived from a passkey (the
// WebAuthn PRF extension, e.g. Touch ID) or from a passphrase, and renders the
// settings panel that manages it. Shared by the web app and the extension's
// options page, so it is a classic script that sets `MyLingoVault`.
(() => {
  const encoder = new TextEncoder();
  const PBKDF2_ITERATIONS = 600000;
  const MIN_PASSPHRASE = 8;
  // Looked up when used: the extension's modules load i18n.js after this script.
  const t = (key, params) => globalThis.MyLingoI18n.t(key, params);
  const methodName = (method) => t(method === 'passkey' ? 'vault.methodPasskey' : 'vault.methodPassphrase');

  const random = (length) => crypto.getRandomValues(new Uint8Array(length));
  const toBase64 = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)));
  const fromBase64 = (text) => Uint8Array.from(atob(text), (char) => char.charCodeAt(0));

  // Browsers return WebAuthn binary values as ArrayBuffers, but password
  // manager extensions that handle passkeys (1Password and others) may hand
  // back base64url strings, arrays or buffers from another realm instead.
  function toBytes(value) {
    if (typeof value === 'string') return fromBase64(value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '='));
    if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength).slice();
    if (Object.prototype.toString.call(value) === '[object ArrayBuffer]') return new Uint8Array(value).slice();
    if (Array.isArray(value)) return Uint8Array.from(value);
    if (value && typeof value === 'object') return Uint8Array.from(Object.values(value));
    throw new VaultError(t('vault.unsupportedData'));
  }

  class VaultError extends Error {}

  // WebAuthn only works on https pages (with a domain name), http://localhost
  // and extension pages. Chrome treats file:// as a secure context, yet
  // rejects passkeys there, so check the origin rather than isSecureContext.
  function passkeyOriginProblem() {
    const { protocol, hostname } = location;
    if (protocol === 'chrome-extension:') return '';
    if (protocol === 'file:') return 'vault.originFile';
    const isIp = /^[\d.]+$/.test(hostname) || hostname.includes(':');
    if (protocol === 'https:' && !isIp) return '';
    if (protocol === 'http:' && (hostname === 'localhost' || hostname.endsWith('.localhost'))) return '';
    return 'vault.originUrl';
  }

  // Resolves to '' when passkeys look usable, or to the message key of the
  // reason they are not (a key, so the cached result follows the UI language).
  let passkeyProblem;
  function passkeyUnavailableReason() {
    passkeyProblem ??= (async () => {
      const originProblem = passkeyOriginProblem();
      if (originProblem) return originProblem;
      if (!globalThis.isSecureContext || !globalThis.PublicKeyCredential) return 'vault.noPasskeys';
      try {
        const capabilities = await PublicKeyCredential.getClientCapabilities?.();
        if (capabilities && 'extension:prf' in capabilities) return capabilities['extension:prf'] ? '' : 'vault.noPrf';
      } catch { /* Older browsers: fall through and find out when creating the passkey. */ }
      return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable?.() ? '' : 'vault.noBiometrics';
    })();
    return passkeyProblem;
  }

  async function passphraseKey(passphrase, salt, iterations) {
    const base = await crypto.subtle.importKey('raw', encoder.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }

  async function prfKey(secret) {
    const base = await crypto.subtle.importKey('raw', secret, 'HKDF', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32), info: encoder.encode('MyLingo API keys v1') }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }

  const prfUnsupported = () => new VaultError(t('vault.prfUnsupported'));

  // The challenge is never verified: there is no server, and only the PRF
  // output, which the authenticator releases after user verification, matters.
  async function evaluatePrf(credentialId, prfSalt) {
    const assertion = await navigator.credentials.get({ publicKey: {
      challenge: random(32),
      allowCredentials: [{ type: 'public-key', id: credentialId }],
      userVerification: 'required',
      timeout: 60000,
      extensions: { prf: { eval: { first: prfSalt } } }
    } });
    const secret = assertion?.getClientExtensionResults().prf?.results?.first;
    if (!secret) throw prfUnsupported();
    return toBytes(secret);
  }

  async function createPasskey() {
    const prfSalt = random(32);
    const credential = await navigator.credentials.create({ publicKey: {
      rp: { name: 'MyLingo' },
      user: { id: random(16), name: t('vault.userName'), displayName: t('vault.userName') },
      challenge: random(32),
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { residentKey: 'preferred', userVerification: 'required' },
      timeout: 60000,
      extensions: { prf: { eval: { first: prfSalt } } }
    } });
    const prf = credential?.getClientExtensionResults().prf;
    if (!prf?.enabled && !prf?.results?.first) throw prfUnsupported();
    const credentialId = toBytes(credential.rawId);
    // Some authenticators only evaluate the PRF on sign-in, not on creation.
    const secret = prf.results?.first ? toBytes(prf.results.first) : await evaluatePrf(credentialId, prfSalt);
    return { header: { method: 'passkey', credentialId: toBase64(credentialId), prfSalt: toBase64(prfSalt) }, key: await prfKey(secret) };
  }

  async function seal(header, key, keys) {
    const iv = random(12);
    const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(JSON.stringify(keys)));
    return { v: 1, ...header, iv: toBase64(iv), data: toBase64(data) };
  }

  function headerOf(vault) {
    const { iv, data, ...header } = vault;
    return header;
  }

  // Returns { vault, key }; keep `key` in memory to re-seal after edits.
  async function create(method, keys, passphrase) {
    let header, key;
    if (method === 'passkey') {
      ({ header, key } = await createPasskey());
    } else {
      if ((passphrase || '').length < MIN_PASSPHRASE) throw new VaultError(t('vault.tooShort', { min: MIN_PASSPHRASE }));
      const salt = random(16);
      header = { method: 'passphrase', salt: toBase64(salt), iterations: PBKDF2_ITERATIONS };
      key = await passphraseKey(passphrase, salt, PBKDF2_ITERATIONS);
    }
    return { vault: await seal(header, key, keys), key };
  }

  // Returns { keys, key }.
  async function unlock(vault, passphrase) {
    const key = vault.method === 'passkey'
      ? await prfKey(await evaluatePrf(fromBase64(vault.credentialId), fromBase64(vault.prfSalt)))
      : await passphraseKey(passphrase || '', fromBase64(vault.salt), vault.iterations);
    try {
      const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(vault.iv) }, key, fromBase64(vault.data));
      return { keys: JSON.parse(new TextDecoder().decode(plain)), key };
    } catch {
      throw new VaultError(t(vault.method === 'passkey' ? 'vault.wrongPasskey' : 'vault.wrongPassphrase'));
    }
  }

  function reseal(vault, key, keys) {
    return seal(headerOf(vault), key, keys);
  }

  function friendlyError(error) {
    if (error instanceof VaultError) return error.message;
    if (error?.name === 'NotAllowedError') return t('vault.cancelled');
    if (error?.name === 'InvalidStateError') return t('vault.registered');
    if (error?.name === 'SecurityError') return t('vault.security', { message: error.message });
    if (error?.name === 'NotSupportedError') return t('vault.notSupported', { message: error.message });
    return error?.message || t('error.unexpected');
  }

  const escape = (text) => text.replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]);

  // `handlers.state()` returns { method, unlocked, sessionUnlocked }:
  // method is null (not encrypted), 'passkey' or 'passphrase'; unlocked means
  // this page holds the key; sessionUnlocked (extension only) means the keys
  // are usable until the browser closes although this page cannot edit them.
  // `handlers.protect(method, passphrase)` encrypts the keys with `method`,
  // replacing the current encryption while unlocked; `unprotect()` stores them
  // unencrypted again. The others are unlock, lock and reset. Handlers may
  // throw; the panel re-renders afterwards.
  function mountPanel(root, handlers) {
    let selected = null, busy = false, error = '';

    async function render() {
      const { method, unlocked, sessionUnlocked } = handlers.state();
      const passkeyReason = await passkeyUnavailableReason();
      const current = method || 'none', locked = Boolean(method && !unlocked);
      const choice = locked ? current : selected ?? current;
      const button = (action, label, primary) => `<button type="button" class="vault-button${primary ? ' primary' : ''}" data-vault="${action}"${busy ? ' disabled' : ''}>${label}</button>`;
      const option = (value, label, note, unavailable) => `<label class="vault-option"><input type="radio" name="vaultMethod" value="${value}"${value === choice ? ' checked' : ''}${unavailable || locked || busy ? ' disabled' : ''} /><span><strong>${label}</strong><small>${note}</small></span></label>`;
      let html = `<div class="vault-options" role="radiogroup" aria-label="${t('vault.methods')}">
        ${option('none', t('vault.none'), t('vault.noneNote'))}
        ${option('passkey', t('vault.passkey'), passkeyReason ? escape(t(passkeyReason)) : t('vault.passkeyNote'), passkeyReason && current !== 'passkey')}
        ${option('passphrase', t('vault.passphrase'), t('vault.passphraseNote'))}
      </div>`;
      if (locked && sessionUnlocked) {
        // Usable for translating until the browser closes; only editing here
        // needs the key again, so lead with locking, not unlocking.
        const input = method === 'passphrase' ? `<input class="vault-input" id="vaultPassphrase" type="password" autocomplete="current-password" placeholder="${t('vault.editPlaceholder')}" />` : '';
        html += `<p class="vault-status ok">${t('vault.sessionUnlocked', { method: methodName(method) })}</p>
          <p class="vault-status">${t('vault.reauth')}</p>${input}
          <div class="vault-buttons">${button('lock', t('vault.lock'), true)}${button('unlock', t(method === 'passkey' ? 'vault.editPasskey' : 'vault.edit'))}</div>`;
      } else if (locked) {
        const input = method === 'passphrase' ? `<input class="vault-input" id="vaultPassphrase" type="password" autocomplete="current-password" placeholder="${t('passphrase')}" />` : '';
        html += `<p class="vault-status warn">${t('vault.locked')}</p>${input}
          <div class="vault-buttons">${button('unlock', t(method === 'passkey' ? 'vault.unlockPasskey' : 'vault.unlock'), true)}</div>
          <button type="button" class="vault-link" data-vault="reset"${busy ? ' disabled' : ''}>${t(method === 'passkey' ? 'vault.lostPasskey' : 'vault.forgotPassphrase')}</button>`;
      } else if (choice !== current) {
        const apply = `<div class="vault-buttons">${button('apply', t('vault.apply'), true)}${button('cancel', t('vault.cancel'))}</div>`;
        if (choice === 'passphrase') {
          html += `<p class="vault-status">${t('vault.choosePassphrase')}</p>
            <input class="vault-input" id="vaultPassphrase" type="password" autocomplete="new-password" placeholder="${t('vault.passphrasePlaceholder', { min: MIN_PASSPHRASE })}" />
            <input class="vault-input" id="vaultConfirm" type="password" autocomplete="new-password" placeholder="${t('vault.confirmPlaceholder')}" />${apply}`;
        } else if (choice === 'passkey') {
          html += `<p class="vault-status">${t('vault.passkeyNext')}</p>${apply}`;
        } else {
          html += `<p class="vault-status">${t('vault.noneNext')}</p>${apply}`;
        }
      } else if (method) {
        html += `<p class="vault-status ok">${t('vault.unlockedNow', { method: methodName(method) })}</p>
          <div class="vault-buttons">${button('lock', t('vault.lock'), true)}</div>`;
      } else {
        html += `<p class="vault-status">${t('vault.plain')}</p>`;
      }
      root.innerHTML = html + (error ? `<p class="vault-error" role="alert">${escape(error)}</p>` : '');
    }

    async function run(action) {
      const value = (id) => root.querySelector(`#${id}`)?.value || '';
      const target = selected;
      if (action === 'cancel') { selected = null; error = ''; await render(); return; }
      if (action === 'apply' && target === 'passphrase' && value('vaultPassphrase') !== value('vaultConfirm')) { error = t('vault.mismatch'); await render(); return; }
      if (action === 'reset' && !confirm(t('vault.resetConfirm'))) return;
      const passphrase = value('vaultPassphrase');
      busy = true; error = ''; await render();
      try {
        if (action === 'apply') await (target === 'none' ? handlers.unprotect() : handlers.protect(target, passphrase));
        if (action === 'unlock') await handlers.unlock(passphrase);
        if (action === 'lock') await handlers.lock();
        if (action === 'reset') await handlers.reset();
        selected = null;
      } catch (caught) {
        error = friendlyError(caught);
        if (action === 'apply' && target === 'passkey' && caught?.name === 'NotAllowedError') error += t('vault.createHint'); // 1Password and the like cannot save passkeys for some pages.
      }
      busy = false;
      await render();
    }

    root.addEventListener('click', (event) => {
      const action = event.target.closest('[data-vault]')?.dataset.vault;
      if (action) run(action);
    });
    root.addEventListener('change', async (event) => {
      if (event.target.name !== 'vaultMethod') return;
      selected = event.target.value; error = '';
      await render();
      root.querySelector('#vaultPassphrase')?.focus();
    });
    root.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' || !event.target.matches('.vault-input')) return;
      event.preventDefault();
      run(root.querySelector('[data-vault="apply"]') ? 'apply' : 'unlock');
    });
    render();
    return { render };
  }

  globalThis.MyLingoVault = { create, unlock, reseal, mountPanel, friendlyError };
})();
