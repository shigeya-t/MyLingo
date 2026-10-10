// Regenerates the Chrome Web Store images in store/images/ from the real
// extension: screenshots (1280x800), promo tiles (440x280, 1400x560) and the
// store icon (128x128), in English and Japanese.
//
//   node store/capture.mjs
//
// Needs Playwright with Chromium (the global install is used when the repo has
// none). No API key is needed: the service worker's fetch is replaced with a
// stub that answers from the demo article's own translations below.
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { createServer } from 'node:http';
import { cp, mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = require(join(execSync('npm root -g').toString().trim(), 'playwright')); }
const { chromium } = playwright;

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'store', 'images');

// The demo article, as [English, Japanese] pairs. The English listing
// translates the Japanese page into English and the Japanese listing the
// reverse, so each shows the direction its readers care about.
const article = {
  site: ['Field Notes', 'フィールドノート'],
  nav: [['Travel', '旅'], ['Food', '食'], ['About', 'このサイトについて']],
  title: ['A slow morning in Kyoto', '京都で過ごす、ゆっくりした朝'],
  byline: ['By Aki Mori · 6 min read', '森 亜希 · 6分で読めます'],
  paragraphs: [
    ['Kyoto is at its best before eight in the morning. The tour buses have not arrived yet, and the stone paths of Higashiyama belong to shopkeepers sweeping their doorsteps.', '京都がいちばん美しいのは朝8時前です。観光バスはまだ到着しておらず、東山の石畳は店先を掃く店主たちのものです。'],
    ['I started at a small coffee stand near Yasaka Shrine. The owner roasts the beans himself every Sunday and serves each cup in a different hand-made bowl.', '最初に訪れたのは、八坂神社の近くにある小さなコーヒースタンドです。店主は毎週日曜日に自ら豆を焙煎し、一杯ごとに違う手作りの器で出してくれます。'],
    ['From there, a fifteen-minute walk north brings you to the quiet garden of a temple that most visitors pass by. Sit on the wooden veranda and listen to the water.', 'そこから北へ15分ほど歩くと、多くの観光客が素通りしてしまうお寺の静かな庭に着きます。木の縁側に腰かけて、水の音に耳を澄ませてみてください。']
  ],
  heading: ['Where to have breakfast', '朝ごはんを食べるなら'],
  more: [
    ['Nishiki Market opens at nine, but several stalls on its eastern end start serving tamagoyaki and grilled fish earlier for local workers.', '錦市場が開くのは9時ですが、東側のいくつかの店では、地元で働く人たちのために早くから卵焼きや焼き魚を出しています。'],
    ['If you prefer a sit-down meal, the old townhouse cafés along the river offer set breakfasts with rice, miso soup and seasonal pickles.', '座ってゆっくり食べたいなら、川沿いの古い町家カフェで、ご飯・味噌汁・季節の漬物がそろった朝食セットが楽しめます。']
  ]
};

const copy = {
  en: {
    pageLang: 'ja', target: 'English', ui: 'en',
    hero: ['Translate the whole page', 'with the AI you choose'],
    heroSub: 'ChatGPT, Claude or Gemini — using your own API key.',
    bubble: ['Translate just a selection', 'Right-click selected text for a quick translation in a bubble.'],
    compare: ['Same layout, new language', 'Only the text changes. Switch back to the original at any time (Alt+Shift+T).'],
    options: ['Your keys stay in your browser', 'Requests go straight to the AI service. Encrypt keys with a passkey or passphrase.'],
    before: 'Original', after: 'Translated',
    tagline: 'Page translation with ChatGPT, Claude or Gemini',
    taglineShort: 'Translate pages with the AI you choose'
  },
  ja: {
    pageLang: 'en', target: 'Japanese', ui: 'ja',
    hero: ['表示中のページを', '選んだAIで丸ごと翻訳'],
    heroSub: 'ChatGPT・Claude・Gemini を、自分のAPIキーで。',
    bubble: ['選択した部分だけを翻訳', '文字を選んで右クリックすると、吹き出しで訳文を表示します。'],
    compare: ['レイアウトはそのまま', '文章だけを差し替えます。いつでも原文に戻せます（Alt+Shift+T）。'],
    options: ['APIキーはブラウザの中だけに', 'サーバーを経由せず各AIサービスへ直接送信。パスキーやパスフレーズで暗号化できます。'],
    before: '原文', after: '翻訳後',
    tagline: 'ChatGPT・Claude・Gemini でWebページを翻訳',
    taglineShort: '選んだAIでWebページを翻訳'
  }
};

function demoPage(lang) {
  const i = lang === 'en' ? 0 : 1;
  const p = (pair) => `<p>${pair[i]}</p>`;
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><title>${article.title[i]}</title>
<style>
  html { scrollbar-width:none; }
  body { margin:0; font:18px/1.8 Georgia, "Noto Serif JP", "Noto Sans JP", serif; color:#2b2622; background:#fbf8f3; }
  header { display:flex; justify-content:space-between; align-items:center; padding:18px 48px; border-bottom:1px solid #e7dfd3; font-family:Manrope, "Noto Sans JP", sans-serif; }
  .site { font-weight:800; font-size:20px; letter-spacing:.02em; } nav { display:flex; gap:28px; font-size:15px; color:#6c6157; }
  main { max-width:720px; margin:0 auto; padding:44px 24px 80px; }
  h1 { font-size:42px; line-height:1.25; margin:0 0 10px; } h2 { font-size:26px; margin:36px 0 8px; }
  .byline { font:14px Manrope, "Noto Sans JP", sans-serif; color:#8a7e72; margin:0 0 28px; }
  .photo { height:150px; border-radius:14px; margin:0 0 28px; background:linear-gradient(120deg,#c9784a,#e9b872 45%,#7f9a6b); }
</style></head><body>
<header><span class="site">${article.site[i]}</span><nav>${article.nav.map((pair) => `<span>${pair[i]}</span>`).join('')}</nav></header>
<main><h1>${article.title[i]}</h1><p class="byline">${article.byline[i]}</p><div class="photo"></div>
${article.paragraphs.map(p).join('')}<h2>${article.heading[i]}</h2>${article.more.map(p).join('')}</main></body></html>`;
}

function allPairs() {
  return [article.site, ...article.nav, article.title, article.byline, ...article.paragraphs, article.heading, ...article.more];
}

const png = async (file) => `data:image/png;base64,${(await readFile(file)).toString('base64')}`;

async function main() {
  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });
  const shots = await mkdtemp(join(tmpdir(), 'mylingo-shots-'));

  const server = createServer((req, res) => {
    const lang = new URL(req.url, 'http://x').searchParams.get('lang') || 'en';
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(demoPage(lang));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://localhost:${server.address().port}/`;

  // A copy with broad host permissions so the test can inject the content
  // script without a user gesture (activeTab). The packaged manifest is unchanged.
  const ext = await mkdtemp(join(tmpdir(), 'mylingo-ext-'));
  await cp(join(root, 'extension'), ext, { recursive: true });
  const manifest = JSON.parse(await readFile(join(ext, 'manifest.json'), 'utf8'));
  manifest.host_permissions.push('<all_urls>');
  await writeFile(join(ext, 'manifest.json'), JSON.stringify(manifest));

  const userData = await mkdtemp(join(tmpdir(), 'mylingo-profile-'));
  const context = await chromium.launchPersistentContext(userData, {
    headless: false,
    colorScheme: 'light',
    args: ['--headless=new', `--disable-extensions-except=${ext}`, `--load-extension=${ext}`]
  });
  const sw = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  const extId = new URL(sw.url()).host;
  // Extension APIs are bound shortly after the worker starts.
  while (!await sw.evaluate(() => Boolean(globalThis.chrome?.storage))) await new Promise((resolve) => setTimeout(resolve, 100));

  await sw.evaluate((pairs) => {
    const lookup = new Map();
    for (const [en, ja] of pairs) { lookup.set(en, ja); lookup.set(ja, en); }
    const translate = (text) => lookup.get(text.trim()) ?? text;
    globalThis.fetch = async (_url, init) => {
      const user = JSON.parse(init.body).messages[0].content;
      const source = user.match(/^<source>\n([\s\S]*)\n<\/source>$/);
      const text = source ? translate(source[1]) : JSON.stringify(JSON.parse(user).map(translate));
      await new Promise((resolve) => setTimeout(resolve, 150));
      return new Response(JSON.stringify({ content: [{ type: 'text', text }] }), { headers: { 'Content-Type': 'application/json' } });
    };
  }, allPairs());

  for (const [locale, c] of Object.entries(copy)) {
    await sw.evaluate(async (settings) => { await chrome.storage.local.clear(); await chrome.storage.local.set(settings); },
      { provider: 'anthropic', mode: 'natural', target: c.target, uiLanguage: c.ui, apiKeys: { anthropic: 'sk-ant-demo' } });
    const shot = (name) => join(shots, `${locale}-${name}.png`);
    const pageUrl = `${base}?lang=${c.pageLang}`;

    const page = await context.newPage();
    await page.setViewportSize({ width: 1200, height: 750 });
    await page.goto(pageUrl);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(500);
    await page.screenshot({ path: shot('before') });

    // Selection bubble on the original page.
    // Scrolled so the bubble opens below the selection, as it usually does.
    await page.evaluate(() => {
      const paragraph = document.querySelectorAll('main p:not(.byline)')[1];
      window.scrollTo(0, paragraph.getBoundingClientRect().top + window.scrollY - 230);
      const range = document.createRange();
      range.selectNodeContents(paragraph);
      getSelection().removeAllRanges(); getSelection().addRange(range);
    });
    const selected = await page.evaluate(() => getSelection().toString());
    await sw.evaluate(async ({ url, text }) => {
      const [tab] = await chrome.tabs.query({ url });
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['lib/i18n.js', 'content.js'] });
      await chrome.tabs.sendMessage(tab.id, { type: 'translateSelection', text });
    }, { url: pageUrl, text: selected });
    await page.waitForFunction(() => document.querySelector('mylingo-bubble')?.shadowRoot.querySelector('.copy')?.offsetParent);
    await page.waitForTimeout(300);
    await page.screenshot({ path: shot('bubble') });
    await page.evaluate(() => window.scrollTo(0, 0));

    // Whole-page translation.
    await page.keyboard.press('Escape');
    await page.evaluate(() => getSelection().removeAllRanges());
    await sw.evaluate(async (url) => {
      const [tab] = await chrome.tabs.query({ url });
      await chrome.tabs.sendMessage(tab.id, { type: 'translatePage' });
    }, pageUrl);
    await page.waitForFunction((title) => document.querySelector('h1').textContent === title, article.title[c.pageLang === 'en' ? 1 : 0]);
    await page.waitForTimeout(800);
    await page.screenshot({ path: shot('after') });

    // The popup, pointed at the demo tab (opened as a tab, it would otherwise see itself).
    const tabId = await sw.evaluate(async (url) => (await chrome.tabs.query({ url }))[0].id, pageUrl);
    const popup = await context.newPage();
    await popup.addInitScript((id) => { chrome.tabs.query = async () => [{ id, url: location.href }]; }, tabId);
    await popup.setViewportSize({ width: 372, height: 600 });
    await popup.goto(`chrome-extension://${extId}/popup.html`);
    await popup.waitForFunction(() => !document.querySelector('#actionButton').disabled);
    await popup.waitForTimeout(400);
    await popup.locator('body').screenshot({ path: shot('popup') });
    await popup.close();

    const options = await context.newPage();
    await options.setViewportSize({ width: 1200, height: 750 });
    await options.goto(`chrome-extension://${extId}/options.html`);
    await options.addStyleTag({ content: 'html { scrollbar-width:none; }' });
    await options.waitForTimeout(600);
    await options.screenshot({ path: shot('options') });
    await options.close();
    await page.close();
  }

  // Compose the store images.
  const composer = await context.newPage();
  const icon = await png(join(root, 'extension', 'icons', 'icon-128.png'));
  const render = async (width, height, body, file, transparent = false) => {
    await composer.setViewportSize({ width, height });
    await composer.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body style="width:${width}px;height:${height}px">${body}</body></html>`);
    await composer.evaluate(() => Promise.all([document.fonts.ready, ...[...document.images].map((img) => img.decode())]));
    await composer.screenshot({ path: join(out, file), omitBackground: transparent });
  };
  const frame = (src, extra = '') => `<div class="window ${extra}"><div class="chrome"><i></i><i></i><i></i><span class="url"></span></div><img src="${src}"></div>`;
  const brand = `<img class="mark" src="${icon}" alt="">MyLingo`;
  const chips = '<div class="chips"><span><b class="o">✦</b>ChatGPT</span><span><b class="a">A</b>Claude</span><span><b class="g">✧</b>Gemini</span></div>';

  await render(128, 128, `<img src="${icon}" style="width:96px;height:96px;margin:16px;display:block">`, 'store-icon-128.png', true);

  for (const [locale, c] of Object.entries(copy)) {
    const s = async (name) => png(join(shots, `${locale}-${name}.png`));
    const [before, after, bubble, popup, options] = await Promise.all(['before', 'after', 'bubble', 'popup', 'options'].map(s));
    const lang = `lang="${locale}"`;

    await render(1280, 800, `<div class="slide" ${lang}><div class="caption"><div class="brand">${brand}</div><h1>${c.hero[0]}<br><em>${c.hero[1]}</em></h1><p>${c.heroSub}</p>${chips}</div>
      <div class="stage">${frame(after, 'hero')}<img class="popup" src="${popup}"></div></div>`, `${locale}-1-page.png`);
    await render(1280, 800, `<div class="slide wide" ${lang}><div class="caption top"><h1>${c.bubble[0]}</h1><p>${c.bubble[1]}</p></div>${frame(bubble, 'center')}</div>`, `${locale}-2-selection.png`);
    await render(1280, 800, `<div class="slide wide" ${lang}><div class="caption top"><h1>${c.compare[0]}</h1><p>${c.compare[1]}</p></div>
      <div class="pair"><figure>${frame(before)}<figcaption>${c.before}</figcaption></figure><figure>${frame(after)}<figcaption>${c.after}</figcaption></figure></div></div>`, `${locale}-3-layout.png`);
    await render(1280, 800, `<div class="slide wide" ${lang}><div class="caption top"><h1>${c.options[0]}</h1><p>${c.options[1]}</p></div>${frame(options, 'center')}</div>`, `${locale}-4-settings.png`);

    await render(440, 280, `<div class="tile" ${lang}><div class="brand big">${brand}</div><p>${c.taglineShort}</p>${chips}</div>`, `${locale}-promo-small-440x280.png`);
    await render(1400, 560, `<div class="marquee" ${lang}><div><div class="brand big">${brand}</div><h1>${c.tagline}</h1>${chips}</div>
      <div class="stage">${frame(after, 'hero')}<img class="popup" src="${popup}"></div></div>`, `${locale}-promo-marquee-1400x560.png`);
  }

  await context.close();
  server.close();
  await Promise.all([shots, ext, userData].map((dir) => rm(dir, { recursive: true, force: true })));
  console.log(`Wrote images to ${out}`);
}

const css = `
  * { box-sizing:border-box; } body { margin:0; overflow:hidden; background:transparent; font-family:Manrope, "Noto Sans JP", sans-serif; color:#edf0ea; }
  .slide, .tile, .marquee { width:100%; height:100%; background:radial-gradient(1200px 600px at 85% 110%, #2b3a1a 0%, transparent 60%), #111516; position:relative; overflow:hidden; }
  [lang="ja"] { font-family:"Noto Sans JP", Manrope, sans-serif; }
  .brand { display:flex; align-items:center; gap:10px; font-weight:800; font-size:22px; } .brand.big { font-size:34px; gap:12px; }
  .mark { width:32px; height:32px; border-radius:8px; box-shadow:0 0 0 1px #2a3233; } .big .mark { width:48px; height:48px; border-radius:11px; }
  h1 { margin:0; font-weight:800; letter-spacing:-.01em; } em { font-style:normal; color:#c8f859; }
  .caption p, .tile p { color:#cbd1cd; margin:0; }
  .chips { display:flex; gap:10px; flex-wrap:wrap; } .chips span { display:flex; align-items:center; gap:8px; padding:8px 14px 8px 8px; border:1px solid #2a3233; border-radius:99px; background:#171c1d; font-weight:700; font-size:15px; }
  .chips b { width:22px; height:22px; border-radius:50%; display:grid; place-items:center; font-size:13px; color:#101516; } .o{background:#e7eee7}.a{background:#dfb594;font-size:11px!important}.g{background:linear-gradient(135deg,#80c7ff,#d6aaff)}
  .window { border-radius:12px; overflow:hidden; background:#fff; border:1px solid #2a3233; box-shadow:0 30px 80px rgba(0,0,0,.5); }
  .window img { display:block; width:100%; } .chrome { height:30px; background:#202627; display:flex; align-items:center; gap:7px; padding:0 12px; }
  .chrome i { width:10px; height:10px; border-radius:50%; background:#3a4344; } .chrome .url { flex:1; height:16px; margin-left:14px; border-radius:99px; background:#2a3233; max-width:420px; }
  .slide:not(.wide) .caption { position:absolute; left:64px; top:0; bottom:0; width:400px; display:flex; flex-direction:column; justify-content:center; gap:22px; }
  .slide:not(.wide) h1 { font-size:44px; line-height:1.25; } .slide:not(.wide) p { font-size:19px; line-height:1.6; }
  [lang="ja"].slide:not(.wide) h1 { font-size:40px; line-height:1.4; }
  .slide .stage { position:absolute; left:500px; top:110px; width:730px; } .slide .stage .hero { width:730px; }
  .stage .popup { position:absolute; width:290px; right:-24px; top:250px; border-radius:14px; border:1px solid #2a3233; box-shadow:0 30px 70px rgba(0,0,0,.6); }
  .caption.top { text-align:center; padding:52px 80px 0; display:flex; flex-direction:column; gap:12px; } .caption.top h1 { font-size:40px; } .caption.top p { font-size:19px; }
  .window.center { width:960px; margin:40px auto 0; }
  .pair { display:flex; gap:28px; justify-content:center; margin-top:64px; } .pair figure { margin:0; width:590px; display:flex; flex-direction:column; align-items:center; gap:14px; }
  .pair figcaption { font-weight:700; font-size:17px; color:#c8f859; }
  .tile { display:flex; flex-direction:column; justify-content:center; gap:16px; padding:0 36px; } .tile p { font-size:20px; font-weight:700; color:#edf0ea; line-height:1.4; }
  .tile .chips span { font-size:13px; padding:6px 12px 6px 6px; } .tile .chips b { width:18px; height:18px; font-size:11px; }
  .marquee > div:first-child { position:absolute; left:72px; top:0; bottom:0; width:500px; display:flex; flex-direction:column; justify-content:center; gap:24px; }
  .marquee h1 { font-size:38px; line-height:1.3; } .marquee .stage { position:absolute; left:740px; top:70px; width:760px; } .marquee .stage .hero { width:760px; }
  .marquee .stage .popup { width:250px; right:auto; left:-60px; top:170px; }
`;

main().catch((error) => { console.error(error); process.exit(1); });
