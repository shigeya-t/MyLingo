// Encrypts the API keys at rest with a key derived from a passkey (the
// WebAuthn PRF extension, e.g. Touch ID) or from a passphrase, and renders the
// settings panel that manages it. Shared by the web app and the extension's
// options page, so it is a classic script that sets `MyLingoVault`.
(() => {
  const encoder = new TextEncoder();
  const PBKDF2_ITERATIONS = 600000;
  const MIN_PASSPHRASE = 8;
  const methodNames = { passkey: 'パスキー（Touch ID など）', passphrase: 'パスフレーズ' };

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
    throw new VaultError('パスキーから受け取ったデータの形式に対応していません。パスフレーズで暗号化してください。');
  }

  class VaultError extends Error {}

  // WebAuthn only works on https pages (with a domain name), http://localhost
  // and extension pages. Chrome treats file:// as a secure context, yet
  // rejects passkeys there, so check the origin rather than isSecureContext.
  function passkeyOriginProblem() {
    const { protocol, hostname } = location;
    if (protocol === 'chrome-extension:') return '';
    if (protocol === 'file:') return 'ファイルとして開いたページでは使えません。https または http://localhost で開いてください。';
    const isIp = /^[\d.]+$/.test(hostname) || hostname.includes(':');
    if (protocol === 'https:' && !isIp) return '';
    if (protocol === 'http:' && (hostname === 'localhost' || hostname.endsWith('.localhost'))) return '';
    return 'このURLでは使えません。https（ドメイン名）または http://localhost で開いてください。';
  }

  // Resolves to '' when passkeys look usable, or to the reason they are not.
  let passkeyProblem;
  function passkeyUnavailableReason() {
    passkeyProblem ??= (async () => {
      const originProblem = passkeyOriginProblem();
      if (originProblem) return originProblem;
      if (!globalThis.isSecureContext || !globalThis.PublicKeyCredential) return 'このブラウザはパスキーに対応していません。';
      try {
        const capabilities = await PublicKeyCredential.getClientCapabilities?.();
        if (capabilities && 'extension:prf' in capabilities) return capabilities['extension:prf'] ? '' : 'このブラウザはパスキーによる暗号化（PRF）に対応していません。';
      } catch { /* Older browsers: fall through and find out when creating the passkey. */ }
      return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable?.() ? '' : 'この端末では Touch ID などの生体認証を使えません。';
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

  const prfUnsupported = () => new VaultError('このブラウザまたは認証器は、パスキーによる暗号化（PRF）に対応していません。パスフレーズで暗号化してください。');

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
      user: { id: random(16), name: 'MyLingo APIキー', displayName: 'MyLingo APIキー' },
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
      if ((passphrase || '').length < MIN_PASSPHRASE) throw new VaultError(`パスフレーズは${MIN_PASSPHRASE}文字以上にしてください。`);
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
      throw new VaultError(vault.method === 'passkey' ? '復号できませんでした。暗号化したときと同じパスキーで認証してください。' : 'パスフレーズが違います。');
    }
  }

  function reseal(vault, key, keys) {
    return seal(headerOf(vault), key, keys);
  }

  function friendlyError(error) {
    if (error instanceof VaultError) return error.message;
    if (error?.name === 'NotAllowedError') return '認証がキャンセルされたか、時間切れになりました。';
    if (error?.name === 'InvalidStateError') return 'このパスキーはすでに登録されています。';
    if (error?.name === 'SecurityError') return `このページではパスキーを使えません（${error.message}）。https または http://localhost で開くか、パスフレーズで暗号化してください。`;
    if (error?.name === 'NotSupportedError') return `この環境ではパスキーを作成できません（${error.message}）。パスフレーズで暗号化してください。`;
    return error?.message || '予期しないエラーが発生しました。';
  }

  // 1Password and similar password managers take over passkey creation but
  // cannot save passkeys for some pages (extension pages in particular).
  const passkeyCreateHint = ' 1Password などのパスワード管理ツールは、このページのパスキーを保存できないことがあります。その画面でセキュリティキーなど別の方法を選んでブラウザ標準の画面で作成するか、パスフレーズで暗号化してください。';

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
      let html = `<div class="vault-options" role="radiogroup" aria-label="APIキーの保存方法">
        ${option('none', '暗号化しない', 'これまでどおり、このブラウザにそのまま保存します。')}
        ${option('passkey', 'パスキー（Touch ID など）で暗号化', passkeyReason ? escape(passkeyReason) : '使い始めるときに Touch ID などで解除します。', passkeyReason && current !== 'passkey')}
        ${option('passphrase', 'パスフレーズで暗号化', '使い始めるときにパスフレーズを入力して解除します。')}
      </div>`;
      if (locked) {
        const status = sessionUnlocked
          ? 'ブラウザを閉じるまでロック解除中です。キーの確認・変更や保存方法の変更には、もう一度認証してください。'
          : 'APIキーはロックされています。翻訳や保存方法の変更には、ロックを解除してください。';
        const input = method === 'passphrase' ? '<input class="vault-input" id="vaultPassphrase" type="password" autocomplete="current-password" placeholder="パスフレーズ" />' : '';
        html += `<p class="vault-status warn">${status}</p>${input}
          <div class="vault-buttons">${button('unlock', method === 'passkey' ? 'パスキー（Touch ID など）で解除' : '解除する', true)}${sessionUnlocked ? button('lock', 'ロックする') : ''}</div>
          <button type="button" class="vault-link" data-vault="reset"${busy ? ' disabled' : ''}>${method === 'passkey' ? 'パスキーを使えない場合' : 'パスフレーズを忘れた場合'}（保存したキーを削除）</button>`;
      } else if (choice !== current) {
        const apply = `<div class="vault-buttons">${button('apply', 'この方法に変更', true)}${button('cancel', 'キャンセル')}</div>`;
        if (choice === 'passphrase') {
          html += `<p class="vault-status">パスフレーズを決めてください。忘れると復号できないため、1Password やキーチェーンに保管しておくと安心です。</p>
            <input class="vault-input" id="vaultPassphrase" type="password" autocomplete="new-password" placeholder="パスフレーズ（${MIN_PASSPHRASE}文字以上）" />
            <input class="vault-input" id="vaultConfirm" type="password" autocomplete="new-password" placeholder="もう一度入力" />${apply}`;
        } else if (choice === 'passkey') {
          html += `<p class="vault-status">変更すると、パスキーを作成する認証画面（Touch ID など）が開きます。</p>${apply}`;
        } else {
          html += `<p class="vault-status">暗号化をやめて、APIキーを暗号化せずにこのブラウザに保存します。</p>${apply}`;
        }
      } else if (method) {
        html += `<p class="vault-status ok">APIキーは${methodNames[method]}で暗号化して保存されています。いまはロック解除中です。</p>
          <div class="vault-buttons">${button('lock', 'ロックする', true)}</div>`;
      } else {
        html += '<p class="vault-status">APIキーは暗号化されずにこのブラウザに保存されています。</p>';
      }
      root.innerHTML = html + (error ? `<p class="vault-error" role="alert">${escape(error)}</p>` : '');
    }

    async function run(action, { quiet = false } = {}) {
      const value = (id) => root.querySelector(`#${id}`)?.value || '';
      const target = selected;
      if (action === 'cancel') { selected = null; error = ''; await render(); return; }
      if (action === 'apply' && target === 'passphrase' && value('vaultPassphrase') !== value('vaultConfirm')) { error = '確認用のパスフレーズが一致しません。'; await render(); return; }
      if (action === 'reset' && !confirm('暗号化して保存したAPIキーを削除します。キーはあとで入力し直してください。よろしいですか？')) return;
      const passphrase = value('vaultPassphrase');
      busy = true; error = ''; await render();
      try {
        if (action === 'apply') await (target === 'none' ? handlers.unprotect() : handlers.protect(target, passphrase));
        if (action === 'unlock') await handlers.unlock(passphrase);
        if (action === 'lock') await handlers.lock();
        if (action === 'reset') await handlers.reset();
        selected = null;
      } catch (caught) {
        // A passkey prompt started without a click may be refused or dismissed;
        // the unlock button is right there, so stay quiet about it.
        error = quiet && caught?.name === 'NotAllowedError' ? '' : friendlyError(caught);
        if (action === 'apply' && target === 'passkey' && caught?.name === 'NotAllowedError') error += passkeyCreateHint;
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
    // Starts unlocking right away: asks for the passkey, or focuses the
    // passphrase field. Used when a translation needs the locked keys.
    async function startUnlock() {
      const { method, unlocked } = handlers.state();
      if (!method || unlocked || busy) return;
      await render();
      if (method === 'passkey') await run('unlock', { quiet: true });
      else root.querySelector('#vaultPassphrase')?.focus();
    }

    render();
    return { render, startUnlock };
  }

  globalThis.MyLingoVault = { create, unlock, reseal, mountPanel, friendlyError };
})();
