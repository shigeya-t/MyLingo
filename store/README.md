# Chrome ウェブストアでの公開手順

MyLingo の拡張機能を Chrome ウェブストアに**限定公開（Unlisted）**で登録するための手順です。掲載欄に貼り付けるテキストは [listing.md](listing.md) にまとめてあります。

| ファイル | 内容 |
| --- | --- |
| `listing.md` | 説明文（英語・日本語）、権限の理由、データ使用の申告など、ダッシュボードに貼り付けるテキスト |
| `images/` | ストア用の画像（スクリーンショット 1280×800、プロモーションタイル、ストアアイコン） |
| `capture.mjs` | `images/` を作り直すスクリプト（Playwright を使用） |
| `../docs/privacy/` | プライバシーポリシー（GitHub Pages で公開） |
| `../scripts/package-extension.sh` | アップロードする zip を作るスクリプト |

## 1. 初回だけ必要な準備

1. **Google アカウントの2段階認証**を有効にする。
2. [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole) でデベロッパー登録をする（登録料 US$5、一度だけ）。
3. **Account** タブで連絡先メールアドレスを設定し、届いたメールで確認する。
4. **トレーダー申告**: 個人の非営利の配布なら「非トレーダー」を選ぶ（トレーダーの場合は住所・電話番号などがストアに表示されます）。

## 2. プライバシーポリシーを GitHub Pages で公開する

1. この変更を `main` にマージする。
2. GitHub のリポジトリで **Settings → Pages** を開き、**Source: Deploy from a branch**、**Branch: `main` / `/docs`** を選んで保存する。
   - `/docs` を選ぶと `docs/` の中だけが公開されます。Webアプリ（リポジトリ直下の `index.html`）は公開されません。
3. 数分後に次のURLが開けることを確認する。
   - 英語: <https://shigeya-t.github.io/MyLingo/privacy/>
   - 日本語: <https://shigeya-t.github.io/MyLingo/privacy/ja.html>

## 3. アップロードする zip を作る

```sh
scripts/package-extension.sh
# → dist/mylingo-extension-1.0.0.zip
```

- `extension/` をコピーし、`lib/version.js`（コミットハッシュ）を書き込んでから zip にします。設定画面の下に、公開した版のコミットが表示されます。
- `extension/` にコミットしていない変更があると警告が出ます。コミットしてから作ってください。
- `dist/` は git の管理外です。

## 4. ダッシュボードで登録する

1. **New item** → `dist/mylingo-extension-1.0.0.zip` をアップロードする。
2. **Store listing** タブ: [listing.md](listing.md) の「ストアの掲載情報」を英語で入力し、画像を `images/` からアップロードする。右上の言語メニューで **Japanese** を追加し、日本語の説明文と `ja-` で始まる画像を入れる。
3. **Privacy** タブ: listing.md の「プライバシーへの取り組み」をそのまま入力する（単一用途、権限ごとの理由、リモートコードなし、データ使用、プライバシーポリシーのURL）。
4. **Distribution** タブ: **Free**、**Visibility: Unlisted**、**All regions**。
5. （任意）**Test instructions** に listing.md の「審査担当者へのメモ」を貼る。
6. **Submit for review** を押す。審査は通常数日〜1週間程度です。
   - 提出時の画面で、承認後すぐに自動で公開するか、承認後に自分で公開するかを選べます。

限定公開のあいだは、ストアのURL（`https://chromewebstore.google.com/detail/<ID>`）を知っている人だけがインストールできます。検索には出ません。後で **Distribution → Visibility** を **Public** に変えれば一般公開になります。

## 5. 公開後

- ストアのURLが決まったら、README.md / README.ja.md の「Installation / インストール」にストアからのインストール方法を追記する。
- 開発用に `extension/` を「パッケージ化されていない拡張機能」として読み込んでいる場合、ストア版とは別の拡張機能（別ID・別の保存領域）として扱われます。

## 更新するとき

1. `extension/manifest.json` の `version` を上げる（ストアは同じか小さい番号を受け付けません）。
2. 掲載内容に関わる変更（権限、送信先、機能）があれば、`listing.md` と `docs/privacy/` も更新する。プライバシーポリシーを変えたら最終更新日も直す。
3. `scripts/package-extension.sh` で zip を作り、ダッシュボードの **Package → Upload new package** からアップロードして審査に出す。

## 画像を作り直すとき

```sh
node store/capture.mjs
```

- 実際の拡張機能を Playwright（Chromium）で読み込み、デモ記事を翻訳した画面を撮影して `images/` に合成します。APIの呼び出しはスクリプト内のダミー応答に差し替えるので、APIキーは不要です。
- 日本語のフォント（Noto Sans JP）と Manrope が入っている環境で実行してください。ない場合は別のフォントで描画されます。
- UIを変えたときや、文言を変えたときに作り直してください。

## 審査で指摘されやすい点

- **権限の理由とコードの動作が一致していること**: 権限を追加・変更したら listing.md の理由も直す。
- **リモートコードを使わないこと**: 外部のスクリプトを読み込んだり `eval` を使ったりしない。
- **他社の商標**: 名前やアイコンに ChatGPT / Claude / Gemini のロゴや名前を使わない。説明文では「対応サービス」として触れるにとどめ、提携していない旨を書いておく（listing.md の説明文には記載済み）。
- **プライバシーポリシーとの一致**: 送信先や保存するデータを変えたら、ポリシーとデータ使用の申告も合わせて更新する。
