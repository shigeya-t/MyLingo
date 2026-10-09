// Target languages offered by the web app and the extension. Keys are the
// language names given to the model; values are the labels shown in the
// dropdowns, per UI language. `custom` is the "Other" choice, whose name the
// user types in.
// A classic script that sets `MyLingoLanguages`, so the web app can load it
// with a plain <script> tag and the extension's modules can import it.
globalThis.MyLingoLanguages = {
  targets: {
    English: { en: 'English', ja: '英語' },
    Japanese: { en: 'Japanese', ja: '日本語' },
    'Simplified Chinese': { en: 'Chinese (Simplified)', ja: '中国語（簡体字）' },
    'Traditional Chinese': { en: 'Chinese (Traditional)', ja: '中国語（繁体字）' },
    Korean: { en: 'Korean', ja: '韓国語' },
    French: { en: 'French', ja: 'フランス語' },
    German: { en: 'German', ja: 'ドイツ語' },
    Spanish: { en: 'Spanish', ja: 'スペイン語' },
    Italian: { en: 'Italian', ja: 'イタリア語' },
    Portuguese: { en: 'Portuguese', ja: 'ポルトガル語' },
    Russian: { en: 'Russian', ja: 'ロシア語' },
    Vietnamese: { en: 'Vietnamese', ja: 'ベトナム語' },
    Thai: { en: 'Thai', ja: 'タイ語' },
    Indonesian: { en: 'Indonesian', ja: 'インドネシア語' }
  },
  custom: 'other'
};
