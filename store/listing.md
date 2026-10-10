# Chrome ウェブストア 掲載情報（貼り付け用）

Developer Dashboard の各欄にそのまま貼り付けられるテキストです。手順は [README.md](README.md) を参照してください。

## ストアの掲載情報（Store listing）

### 英語（English, 既定の言語）

**Name / Summary**: manifest の `name` と `_locales/en/messages.json` の `description` がそのまま使われます（ダッシュボードでは編集できません）。

**Description**

```text
MyLingo translates the web page you are viewing — or just the text you select — using the AI service you choose: ChatGPT (OpenAI), Claude (Anthropic) or Gemini (Google). You use your own API key, and requests go straight from your browser to that service.

HOW IT WORKS
• Click the toolbar icon and press "Translate this page". The page keeps its layout; only the text is replaced.
• What is on screen is translated first, and the rest as you scroll, so long pages start quickly and use less of your API quota.
• Content that appears later (for example after "Show more") is translated too.
• Press "Show original" or Alt+Shift+T to switch back at any time.
• Select text, right-click and choose "Translate … with MyLingo" to see just that part in a small bubble.

FEATURES
• Switch between ChatGPT, Claude and Gemini, and set the model for each.
• Translate into English, Japanese, Chinese, Korean, Spanish, French, German and many more — or type any language under "Other".
• Five translation modes: Faithful, Natural, Business, Casual & social, Technical.
• Requests per minute are limited, and rate-limit (429) errors are retried automatically — handy for Gemini's free tier.
• Input fields, code blocks and elements marked translate="no" are left untouched.
• The interface is available in English and Japanese.

PRIVACY
• No MyLingo server: the developer never sees your text or your keys.
• API keys and settings are stored only in this browser (chrome.storage.local). You can encrypt your API keys with a passkey (Touch ID, etc.) or a passphrase.
• Page access uses "activeTab": MyLingo can read a tab only after you ask it to translate that tab.
• No analytics, no tracking, no ads.

REQUIREMENTS
You need an API key for at least one of the services: OpenAI, Anthropic or Google Gemini (Google AI Studio). API usage is billed by each service according to its pricing.

MyLingo is an independent project and is not affiliated with or endorsed by OpenAI, Anthropic or Google.

Source code: https://github.com/shigeya-t/MyLingo
```

### 日本語（Japanese）

**Description**

```text
MyLingo は、表示中のWebページや選択した文章を、選んだAIサービス — ChatGPT（OpenAI）・Claude（Anthropic）・Gemini（Google）— で翻訳する拡張機能です。ご自身のAPIキーを使い、ブラウザから各サービスへ直接リクエストを送ります。

使い方
・ツールバーのアイコンを開いて「このページを翻訳」を押すだけ。ページのレイアウトはそのままに、文章だけを差し替えます。
・画面に見えている部分から先に翻訳し、残りはスクロールに合わせて翻訳します。長いページでもすぐに読み始められ、APIの使用量も抑えられます。
・「もっと見る」などで後から表示された部分も翻訳します。
・「原文に戻す」または Alt+Shift+T で、いつでも原文に戻せます。
・文章を選んで右クリックし「MyLingo で「…」を翻訳」を選ぶと、その部分の訳文を吹き出しで表示します。

主な機能
・ChatGPT / Claude / Gemini を切り替えられます。モデルもサービスごとに設定できます。
・英語・日本語・中国語・韓国語・スペイン語・フランス語・ドイツ語など多数の言語に翻訳できます。一覧にない言語も「その他」で指定できます。
・翻訳モードは5種類（原文に忠実 / ネイティブらしい自然な訳 / ビジネス文書向け / 会話・SNS向け / 技術文書向け）。
・1分あたりのリクエスト数を制限し、レート制限（429）のエラーは自動で再試行します。Gemini の無料枠でも使いやすくなっています。
・入力欄、コードブロック、translate="no" が指定された要素は翻訳しません。
・画面の表示は日本語と英語に対応しています。

プライバシー
・MyLingo 独自のサーバーはありません。開発者が翻訳する文章やAPIキーを見ることはありません。
・APIキーと設定は、このブラウザの中（chrome.storage.local）にだけ保存されます。APIキーはパスキー（Touch ID など）またはパスフレーズで暗号化できます。
・ページへのアクセスは「activeTab」権限のみ。翻訳を指示したタブ以外は読み取りません。
・アクセス解析・トラッキング・広告はありません。

必要なもの
OpenAI・Anthropic・Google Gemini（Google AI Studio）のいずれかのAPIキーが必要です。APIの利用料金は各サービスの料金体系に従って請求されます。

MyLingo は個人による独立したプロジェクトであり、OpenAI・Anthropic・Google とは提携しておらず、これらの企業による承認を受けたものではありません。

ソースコード: https://github.com/shigeya-t/MyLingo
```

### カテゴリ・言語など

| 項目 | 値 |
| --- | --- |
| Category | Productivity → Tools（仕事効率化 → ツール） |
| Language | English（既定）、日本語を追加 |
| Official URL | なし（Search Console で所有権を確認したサイトがある場合のみ） |
| Homepage URL | `https://github.com/shigeya-t/MyLingo` |
| Support URL | `https://github.com/shigeya-t/MyLingo/issues` |
| Mature content | なし |

### 画像（`store/images/`）

| 欄 | 英語 | 日本語 |
| --- | --- | --- |
| Store icon（128×128） | `store-icon-128.png` | （共通） |
| Screenshots（1280×800、最大5枚） | `en-1-page.png` → `en-2-selection.png` → `en-3-layout.png` → `en-4-settings.png` | `ja-1-page.png` → `ja-2-selection.png` → `ja-3-layout.png` → `ja-4-settings.png` |
| Small promo tile（440×280） | `en-promo-small-440x280.png` | `ja-promo-small-440x280.png` |
| Marquee promo tile（1400×560、任意） | `en-promo-marquee-1400x560.png` | `ja-promo-marquee-1400x560.png` |

## プライバシーへの取り組み（Privacy practices）

### Single purpose（単一用途）

```text
Translates the web page the user is viewing, or text the user selects, into the user's chosen language using the AI service (OpenAI, Anthropic or Google Gemini) and API key the user provides.
```

### Permission justification（権限の理由）

**activeTab**

```text
Lets MyLingo read and replace the text of the current tab only after the user asks to translate it (toolbar popup, context menu or keyboard shortcut). No broad host access to websites is requested.
```

**scripting**

```text
Injects MyLingo's own bundled content script (content.js and lib/i18n.js) into the tab the user chose to translate, to extract its text, replace it with the translation, and restore the original. No remote code is injected.
```

**storage**

```text
Stores the user's settings (selected AI service, model names, target language, translation mode, UI language) and the API keys the user enters, locally in chrome.storage.local. When encryption is enabled, only the encrypted keys are stored; unlocked keys are kept in chrome.storage.session until the browser closes.
```

**contextMenus**

```text
Adds "Translate this page with MyLingo" and "Translate “<selected text>” with MyLingo" to the right-click menu.
```

**Host permissions（api.openai.com / api.anthropic.com / generativelanguage.googleapis.com）**

```text
Sends the text to be translated, with the user's own API key, directly to the AI service the user selected (OpenAI, Anthropic or Google Gemini). These are the only hosts MyLingo contacts; it has no server of its own.
```

### Remote code（リモートコード）

「**No, I am not using remote code**」を選びます。

### Data usage（データの使用）

収集するデータとしてチェックする項目:

- [x] **Authentication information**（APIキーを保存し、選択したサービスへの認証に使うため）
- [x] **Website content**（翻訳するページや選択テキストを、選択したサービスへ送るため）
- そのほか（個人を特定できる情報、健康、金融、個人的な通信、位置情報、ウェブ履歴、ユーザーのアクティビティ）はチェックしない

次の3つすべてにチェックを入れます:

- [x] I do not sell or transfer user data to third parties, outside of the approved use cases
- [x] I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- [x] I do not use or transfer user data to determine creditworthiness or for lending purposes

### Privacy policy URL

```text
https://shigeya-t.github.io/MyLingo/privacy/
```

## 配布（Distribution）

| 項目 | 値 |
| --- | --- |
| Payments | Free of charge |
| Visibility | **Public**（公開: ストアの検索に表示され、誰でもインストールできる） |
| Regions | All regions |

## 審査担当者へのメモ（Test instructions、任意）

```text
MyLingo needs the user's own API key for OpenAI, Anthropic or Google Gemini. To test:
1. Open the extension's options page (toolbar icon → gear) and enter an API key for one service, then Save.
2. On any article page, click the toolbar icon, choose that service and press "Translate this page".
3. Select some text, right-click and choose "Translate … with MyLingo" to see the selection bubble.
A free Gemini API key from Google AI Studio (https://aistudio.google.com/apikey) is enough for testing.
```
