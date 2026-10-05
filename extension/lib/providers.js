// Shared by the service worker, popup and options page.
export const configs = {
  openai: { name: 'ChatGPT', model: 'gpt-5.6-luna' },
  anthropic: { name: 'Claude', model: 'claude-haiku-4-5' },
  gemini: { name: 'Gemini', model: 'gemini-3.5-flash-lite' }
};

export const translationModes = {
  faithful: { label: '原文に忠実', prompt: 'Phrase the translation as literally and faithfully as possible, staying close to the original sentence structure and word choice without paraphrasing or adding stylistic flourishes.' },
  natural: { label: 'ネイティブらしい自然な訳', prompt: 'Phrase the translation so it reads naturally and fluently, as if originally written by a native speaker. Prioritize natural phrasing over literal wording.' },
  business: { label: 'ビジネス文書向け', prompt: 'Phrase the translation in formal, professional business language, as it would appear in a corporate document, email, or official correspondence.' },
  casual: { label: '会話・SNS向け', prompt: 'Phrase the translation in casual, conversational language, as it would appear in an everyday chat message or social media post.' },
  technical: { label: '技術文書向け', prompt: 'Phrase the translation using precise technical terminology, as it would appear in technical documentation, keeping domain-specific terms accurate and consistent.' }
};

export const targetLanguages = { auto: '自動（日本語⇄英語）', ja: '日本語', en: '英語' };

export const defaults = { provider: 'openai', mode: 'faithful', target: 'auto', apiKeys: {}, models: {} };

export async function loadSettings() {
  const stored = await chrome.storage.local.get(Object.keys(defaults));
  return { ...defaults, ...stored };
}

export function modelFor(settings, provider = settings.provider) {
  return settings.models?.[provider] || configs[provider].model;
}
