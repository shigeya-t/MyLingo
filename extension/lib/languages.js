// Target languages offered by the web app and the extension. Keys are the
// language names given to the model; values are the labels shown in the
// dropdowns. `custom` is the "その他" choice, whose name the user types in.
// A classic script that sets `MyLingoLanguages`, so the web app can load it
// with a plain <script> tag and the extension's modules can import it.
globalThis.MyLingoLanguages = {
  targets: {
    English: '英語',
    Japanese: '日本語',
    'Simplified Chinese': '中国語（簡体字）',
    'Traditional Chinese': '中国語（繁体字）',
    Korean: '韓国語',
    French: 'フランス語',
    German: 'ドイツ語',
    Spanish: 'スペイン語',
    Italian: 'イタリア語',
    Portuguese: 'ポルトガル語',
    Russian: 'ロシア語',
    Vietnamese: 'ベトナム語',
    Thai: 'タイ語',
    Indonesian: 'インドネシア語'
  },
  custom: 'other'
};
