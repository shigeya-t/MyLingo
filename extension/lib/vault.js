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

  class VaultError extends Error {}

  let passkeySupport;
  function passkeySupported() {
    passkeySupport ??= (async () => {
      if (!globalThis.isSecureContext || !globalThis.PublicKeyCredential) return false;
      try {
        const capabilities = await PublicKeyCredential.getClientCapabilities?.();
        if (capabilities && 'extension:prf' in capabilities) return capabilities['extension:prf'];
      } catch { /* Older browsers: fall through and find out when creating the passkey. */ }
      return Boolean(await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable?.());
    })();
    return passkeySupport;
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
    return secret;
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
    const credentialId = new Uint8Array(credential.rawId);
    // Some authenticators only evaluate the PRF on sign-in, not on creation.
    const secret = prf.results?.first || await evaluatePrf(credentialId, prfSalt);
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
    if (error?.name === 'SecurityError' || error?.name === 'NotSupportedError') return 'この環境ではパスキーを使えません。パスフレーズで暗号化してください。';
    return error?.message || '予期しないエラーが発生しました。';
  }

  const escape = (text) => text.replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]);

  // `handlers.state()` returns { method, unlocked, sessionUnlocked }:
  // method is null (not encrypted), 'passkey' or 'passphrase'; unlocked means
  // this page holds the key; sessionUnlocked (extension only) means the keys
  // are usable until the browser closes although this page cannot edit them.
  // The other handlers perform the action and may throw; the panel re-renders.
  function mountPanel(root, handlers) {
    let choosingPassphrase = false, busy = false, error = '';

    async function render() {
      const { method, unlocked, sessionUnlocked } = handlers.state();
      const button = (action, label, primary) => `<button type="button" class="vault-button${primary ? ' primary' : ''}" data-vault="${action}"${busy ? ' disabled' : ''}>${label}</button>`;
      let html;
      if (!method && choosingPassphrase) {
        html = `<p class="vault-status">パスフレーズを決めてください。忘れると復号できないため、1Password やキーチェーンに保管しておくと安心です。</p>
          <input class="vault-input" id="vaultPassphrase" type="password" autocomplete="new-password" placeholder="パスフレーズ（${MIN_PASSPHRASE}文字以上）" />
          <input class="vault-input" id="vaultConfirm" type="password" autocomplete="new-password" placeholder="もう一度入力" />
          <div class="vault-buttons">${button('protect-passphrase', '暗号化する', true)}${button('cancel', 'キャンセル')}</div>`;
      } else if (!method) {
        const passkey = await passkeySupported();
        html = `<p class="vault-status">APIキーは暗号化されずにこのブラウザに保存されています。暗号化すると、使い始めるときに認証が必要になります。</p>
          <div class="vault-buttons">${passkey ? button('protect-passkey', 'パスキー（Touch ID など）で暗号化', true) : ''}${button('choose-passphrase', 'パスフレーズで暗号化', !passkey)}</div>`;
      } else if (unlocked) {
        html = `<p class="vault-status ok">APIキーは${methodNames[method]}で暗号化して保存されています。いまはロック解除中です。</p>
          <div class="vault-buttons">${button('lock', 'ロックする', true)}${button('unprotect', '暗号化をやめる')}</div>`;
      } else {
        const status = sessionUnlocked
          ? 'ブラウザを閉じるまでロック解除中です。キーを確認・変更するには、もう一度認証してください。'
          : 'APIキーはロックされています。翻訳するにはロックを解除してください。';
        const input = method === 'passphrase' ? '<input class="vault-input" id="vaultPassphrase" type="password" autocomplete="current-password" placeholder="パスフレーズ" />' : '';
        html = `<p class="vault-status warn">${status}</p>${input}
          <div class="vault-buttons">${button('unlock', method === 'passkey' ? 'パスキー（Touch ID など）で解除' : '解除する', true)}${sessionUnlocked ? button('lock', 'ロックする') : ''}</div>
          <button type="button" class="vault-link" data-vault="reset"${busy ? ' disabled' : ''}>${method === 'passkey' ? 'パスキーを使えない場合' : 'パスフレーズを忘れた場合'}（保存したキーを削除）</button>`;
      }
      root.innerHTML = html + (error ? `<p class="vault-error" role="alert">${escape(error)}</p>` : '');
    }

    async function run(action) {
      const value = (id) => root.querySelector(`#${id}`)?.value || '';
      if (action === 'choose-passphrase' || action === 'cancel') { choosingPassphrase = action === 'choose-passphrase'; error = ''; await render(); root.querySelector('#vaultPassphrase')?.focus(); return; }
      if (action === 'protect-passphrase' && value('vaultPassphrase') !== value('vaultConfirm')) { error = '確認用のパスフレーズが一致しません。'; await render(); return; }
      if (action === 'unprotect' && !confirm('暗号化をやめて、APIキーを暗号化せずに保存しますか？')) return;
      if (action === 'reset' && !confirm('暗号化して保存したAPIキーを削除します。キーはあとで入力し直してください。よろしいですか？')) return;
      const passphrase = value('vaultPassphrase');
      busy = true; error = ''; await render();
      try {
        if (action === 'protect-passkey') await handlers.protect('passkey');
        if (action === 'protect-passphrase') await handlers.protect('passphrase', passphrase);
        if (action === 'unlock') await handlers.unlock(passphrase);
        if (action === 'lock') await handlers.lock();
        if (action === 'unprotect') await handlers.unprotect();
        if (action === 'reset') await handlers.reset();
        choosingPassphrase = false;
      } catch (caught) {
        error = friendlyError(caught);
      }
      busy = false;
      await render();
    }

    root.addEventListener('click', (event) => {
      const action = event.target.closest('[data-vault]')?.dataset.vault;
      if (action) run(action);
    });
    root.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' || !event.target.matches('.vault-input')) return;
      event.preventDefault();
      run(handlers.state().method ? 'unlock' : 'protect-passphrase');
    });
    render();
    return { render };
  }

  globalThis.MyLingoVault = { create, unlock, reseal, mountPanel };
})();
