import type { Metadata } from 'next';
import { LandingPage } from '@/components/landing-page';

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ ref?: string | string[] }>;
}): Promise<Metadata> {
  const [{ locale }, search] = await Promise.all([params, searchParams]);
  const ref = Array.isArray(search.ref) ? search.ref[0] : search.ref;
  const image = `/${locale}/og${ref ? `?ref=${encodeURIComponent(ref)}` : ''}`;

  return {
    openGraph: {
      images: [{ url: image, width: 1200, height: 630 }],
    },
    twitter: {
      images: [{ url: image, width: 1200, height: 630 }],
    },
  };
}

export default function LandingRoute() {
  return <LandingPage forceShow />;
}
