# MyLingo

English | [日本語](README.ja.md)

A simple browser translation tool that lets you switch between ChatGPT, Claude and Gemini. Translate into English, Japanese or any language you like. It comes as a web app and as a Chrome extension that translates the page you are viewing.

![MyLingo screenshot](assets/mylingo-screenshot.png)

## Features

- Detects the source language automatically. Pick the target language from a dropdown (Japanese by default when the UI is in Japanese, English otherwise), or type any other language under "Other"
- Switch between ChatGPT / Claude / Gemini
- Light and dark mode
- Translation modes (Faithful / Natural / Business / Casual & social / Technical)
- A swap button (swaps the two panes and the target language; the source language is guessed from the script, so Latin-script text counts as English; kanji-only text could be Japanese or Chinese, so the swap then only moves the translation into the input and translates it again)
- Changing the target language or translation mode translates again right away
- Translates automatically shortly after you stop typing (or press `⌘ / Ctrl + Enter`)
- The UI is in English and Japanese: Japanese when your browser (Chrome) is set to Japanese, English otherwise. Switch with the small "EN / JA" toggle (your choice is remembered)
- API keys and model names are stored only in the browser's `localStorage` (API keys can be encrypted with a passkey or passphrase)
- A static site with no build step. Nothing is stored on a server

## About the server

The app needs no backend server. It is a static site made of HTML, CSS and JavaScript, and the browser calls each AI service's API directly when translating.

### Required files

The web app does not work with `index.html` alone. Deploy the whole repository, or at least the following files in the same folder layout.

| File | Required | Purpose |
| --- | --- | --- |
| `index.html` | ✓ | Page |
| `styles.css` | ✓ | Styles |
| `app.js` | ✓ | Translation logic |
| `extension/lib/i18n.js` | ✓ | UI text in English and Japanese (shared with the extension) |
| `extension/lib/vault.js` | ✓ | API key encryption (shared with the extension) |
| `extension/lib/languages.js` | ✓ | Target languages (shared with the extension) |
| `extension/icons/icon.svg` | | Tab icon and logo (shared with the extension) |
| `extension/lib/version.js` | | Shows the commit hash (not tracked by git; optional) |

Fonts are loaded from Google Fonts.

### Serving on localhost

You can open `index.html` directly as a file, but encrypting API keys with a passkey (Touch ID, etc.) requires https or `http://localhost`. To use it locally, run one of these in the repository folder and open `http://localhost:8000` in your browser.

```sh
# Python (preinstalled on macOS)
python3 -m http.server 8000 --bind 127.0.0.1

# Node.js
npx serve -l 8000
```

Press `Ctrl + C` in the terminal to stop it.

- Use `http://localhost:8000`, not `http://127.0.0.1:8000`. Passkeys do not work on IP addresses.
- Settings (API keys, etc.) are stored separately for each origin. Settings saved while the page was opened as a file are not carried over, so enter them again. The same applies when you change the port.

## Usage

1. Choose a service (ChatGPT / Claude / Gemini).
2. Open Settings (the gear at the top right) and enter the API key for the selected service.
3. Change the model name if needed and press "Save".
4. Choose a translation mode at the top left of the "Original" pane ("Faithful" by default).
5. Choose the target language from the dropdown at the top (Japanese by default when the UI is in Japanese, English otherwise). For a language not in the list, choose "Other…" and type its name.
6. Type the text to translate in the left pane. The source language is detected automatically.

| Service | Default model |
| --- | --- |
| ChatGPT | `gpt-6-luna` |
| Claude | `claude-haiku-5-5` |
| Gemini | `gemini-3.5-flash-lite` |

### UI language

The UI is shown in Japanese when the browser's language is Japanese and in English otherwise. The "EN / JA" toggle (at the bottom right of the web app, and at the top of the extension's popup and settings page) switches it; the choice is saved per browser.

### Showing the commit hash

The bottom of the web app's settings panel and the extension's settings page shows a link to this GitHub repository and the commit hash of the running code. A git hook writes it to `extension/lib/version.js` (not tracked by git), so run the following once after cloning. After that it updates automatically on every commit, checkout and pull.

```sh
git config core.hooksPath .githooks && .githooks/write-version
```

## Chrome extension (page translation)

The `extension/` folder contains a Chrome extension that translates the whole page you are viewing. Like the web app, it lets you switch between ChatGPT / Claude / Gemini.

<img src="assets/extension-popup.png" alt="MyLingo Chrome extension popup" width="340">

### Features

- Toggle "Translate this page" / "Show original" from the toolbar popup
- The UI follows Chrome's language (Japanese or English). The "EN / JA" toggle in the popup and the settings page also changes the context menu and the selection bubble (the extension's description and the shortcut's description follow Chrome's language)
- Switch between ChatGPT / Claude / Gemini and choose a translation mode (the same five as the web app)
- Choose the target language from the same list as the web app (Japanese by default when the UI is in Japanese, English otherwise), or type any other language under "Other"
- Changing the target language or translation mode in the popup after translating restores the original and translates again right away (including text the page copied or re-rendered from the translation)
- Translates what is on screen first and the rest as you scroll (faster, and uses less of your API quota than sending the whole page at once)
- Also translates content that appears later, e.g. after "Show more"
- Limits requests per minute, and on a 429 (rate limit) error retries automatically after the wait the service asks for
- Select text, right-click and choose "Translate … with MyLingo" to see just that part translated in a bubble
- `Alt + Shift + T` toggles between translation and the original
- Does not translate input fields, code blocks, or elements marked `translate="no"` / `.notranslate`

### Installation

1. Open `chrome://extensions` in Chrome and turn on "Developer mode" at the top right.
2. Click "Load unpacked" and select this repository's `extension` folder.
3. Open the settings page from the MyLingo toolbar icon → gear, enter the API key (and model name if needed) for the services you use, and save.

The extension stores its settings in `chrome.storage.local`, so you need to enter them separately from the web app.

The extension is being registered on the Chrome Web Store as an unlisted item (see [store/README.md](store/README.md), in Japanese, for the steps). If you install it from the store, skip steps 1 and 2. The privacy policy is in [docs/privacy/](docs/privacy/index.html) (published at <https://shigeya-t.github.io/MyLingo/privacy/>).

After updating the repository (pull, switching branches, etc.), press MyLingo's reload button (↻) in `chrome://extensions`. The popup and settings page load the new files each time they open, but the background service worker that does the translating keeps running the old code until it is reloaded, and the mismatch can cause errors. Reloading also locks encrypted API keys again.

### About Gemini's free tier

Gemini API's free tier limits requests per minute (e.g. 15 per minute for `gemini-3.5-flash-lite`). By default the extension keeps Gemini requests to 12 per minute, and when the limit is hit it waits and retries automatically. If you still see errors, lower "Max requests per minute" on the settings page. If you hit the daily limit, wait until the next day or switch to a paid plan.

### How it works

The extension extracts the page's text element by element and sends only the parts on screen (and a little beyond), closest to the viewport first, to the AI in batches, then replaces them with the translations (without changing the HTML structure). API calls are made from the extension's background service worker, so they are not affected by the site's settings. Page access is limited to `activeTab`, which is granted temporarily only to the tab you translate. Text inside Shadow DOM (web components) and inside frames from the same site is translated too; frames from other sites (embedded videos, ads, and the like) are left as they are, because `activeTab` does not reach them.

## About API keys

This app has no backend; the browser sends requests directly to each AI service's API. API keys are stored in `localStorage` and are never part of the repository.

### Encrypting API keys

Under "API key encryption" in Settings, choose how API keys are stored: "Do not encrypt" (default), "Encrypt with a passkey" or "Encrypt with a passphrase" (in both the web app and the extension). You can switch to another method later (only while unlocked).

- **Passkey (Touch ID, etc.)**: Uses the WebAuthn PRF extension to obtain an encryption key from the authenticator. Requires Chrome 116+ or Safari 18+ and a supporting authenticator. In the web app it only works over https (with a domain name) or at `http://localhost` (not when `index.html` is opened as a file).
  - Password managers such as 1Password sometimes cannot save a passkey for the extension's settings page (`chrome-extension://`) and report that the passkey cannot be saved. In that case, try one of the following:
    - In the password manager's dialog, choose another option such as a security key, and create the passkey with Touch ID in the browser's own dialog (it is saved in Chrome or iCloud Keychain).
    - In 1Password's settings (right-click the toolbar icon → "Settings" → "Autofill & save"), temporarily turn off "Offer to save and sign in with passkeys" while creating it. The same may be needed when unlocking.
    - Encrypt with a passphrase and keep the passphrase in 1Password.
- **Passphrase**: Derives the encryption key with PBKDF2 (SHA-256, 600,000 iterations). For environments where passkeys are not available.

Keys are encrypted with AES-GCM, and plaintext keys are no longer stored. The web app needs unlocking every time the page is opened, the extension every time the browser starts (on the settings page). The extension keeps unlocked keys in `chrome.storage.session` (in memory) until the browser closes. Trying to translate while locked starts unlocking right away (the authentication prompt for a passkey, an input field for a passphrase) and continues the translation once unlocked. The web app unlocks in the translation pane. The extension unlocks in the popup for a passphrase, and for a passkey in a small unlock window that opens automatically (Chrome closes the popup when it shows the passkey prompt). If you lose the passkey or forget the passphrase, the keys cannot be decrypted, so keep the keys themselves in 1Password or your keychain as well.

Encryption protects against the browser's stored data being read or copied. It does not protect against malicious scripts injected into the page while unlocked (XSS).

> **Note:** Storing API keys in a browser app is meant for personal, local use.
> `localStorage` is isolated per browser, but on a public site, tampered code or XSS could leak every user's keys at once.

## Files

```
.
├── index.html   # Page structure
├── styles.css   # Responsive dark/light UI
├── app.js       # Translation, settings and API calls
├── README.md    # README in English (this file)
├── README.ja.md # README in Japanese
├── AGENTS.md    # Development notes for AI coding agents
├── assets/      # Images for the README
├── .githooks/   # Hooks that write the commit hash to version.js
├── docs/privacy/ # Privacy policy (published with GitHub Pages)
├── store/       # Chrome Web Store listing text, images and publishing steps
├── scripts/     # package-extension.sh: builds the zip to upload to the store
└── extension/   # Chrome extension (page translation)
    ├── manifest.json
    ├── background.js    # API calls, context menu, shortcut
    ├── content.js       # Extracts and replaces page text, selection bubble
    ├── popup.html/js    # Toolbar popup
    ├── options.html/js  # Settings page for API keys and models
    ├── unlock.html/js   # Small window for unlocking with a passkey
    ├── ui.css
    ├── lib/
    │   ├── providers.js   # Service settings, loading settings
    │   ├── translator.js  # Translation requests, rate limiting, retries
    │   ├── i18n.js        # UI text in English and Japanese (shared with the web app)
    │   ├── vault.js       # API key encryption (shared with the web app)
    │   ├── languages.js   # Target languages (shared with the web app)
    │   └── version.js     # Commit hash (not tracked by git; generated)
    ├── _locales/        # Manifest descriptions (English and Japanese)
    └── icons/           # icon.svg (also the web app's tab icon and logo) and PNGs
```
