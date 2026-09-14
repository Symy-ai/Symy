import { redirect, notFound } from 'next/navigation';
import { routing } from '@/i18n/routing';

// Named tab paths that users/bookmarks may type, mapped to the SPA tab id.
// The app is a single-page tab UI under /{locale}, so these paths have no
// real route — redirect them home with the tab activated via ?tab=.
const SLUG_TO_TAB: Record<string, string> = {
  buddy: 'buddy',
  'defense-net': 'defense',
  defense: 'defense',
  me: 'profile',
  profile: 'profile',
  chat: 'chat',
  insights: 'profile',
  dashboard: 'buddy',
};

export default async function CatchAllTabRedirect({
  params,
}: {
  params: Promise<{ locale: string; slug: string[] }>;
}) {
  const { locale, slug } = await params;
  const validLocale = (routing.locales as readonly string[]).includes(locale)
    ? locale
    : routing.defaultLocale;

  const first = slug[0]?.toLowerCase();
  const tab = first ? SLUG_TO_TAB[first] : undefined;

  if (tab) {
    redirect(`/${validLocale}?tab=${tab}`);
  }

  notFound();
}
