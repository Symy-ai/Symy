import { ImageResponse } from 'next/og';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export async function generateImageMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return [
    {
      id: 'og',
      alt:
        locale === 'zh'
          ? 'Symy — 少买一点，多活一点。你的 AI 绿色消费助手。'
          : 'Symy — Buy less. Live more. Your AI green-shopping companion.',
    },
  ];
}

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background:
            'linear-gradient(135deg, #0c2017 0%, #143527 50%, #0c2017 100%)',
          color: '#ffffff',
          padding: 80,
          boxSizing: 'border-box',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 160,
            height: 160,
            borderRadius: 9999,
            border: '2px solid rgba(255,255,255,0.2)',
            marginBottom: 48,
            background: 'rgba(255,255,255,0.05)',
            fontSize: 96,
          }}
        >
          🐘
        </div>
        <div
          style={{
            fontSize: 84,
            fontWeight: 800,
            letterSpacing: -2,
            marginBottom: 24,
            background: 'linear-gradient(90deg, #4ADE80, #14B8A6)',
            backgroundClip: 'text',
            color: 'transparent',
          }}
        >
          Symy
        </div>
        <div
          style={{
            fontSize: 64,
            fontWeight: 700,
            marginBottom: 40,
          }}
        >
          Buy less. Live more.
        </div>
        <div
          style={{
            fontSize: 36,
            opacity: 0.9,
            maxWidth: 1000,
            textAlign: 'center',
            lineHeight: 1.4,
          }}
        >
          Your AI green-shopping companion. Every guarded choice is a medal.
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
