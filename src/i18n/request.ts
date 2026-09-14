import { getRequestConfig } from 'next-intl/server';
import { routing } from './routing';
import en from './messages/en.json';
import zh from './messages/zh.json';

const messages = { en, zh } as const;
const locales = routing.locales as readonly string[];

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale =
    requested && locales.includes(requested)
      ? (requested as 'en' | 'zh')
      : (routing.defaultLocale as 'en' | 'zh');

  return {
    locale,
    messages: messages[locale],
  };
});
