/**
 * Butterfly Illustration Demo Page — 蝴蝶效应插图生成演示
 *
 * 独立测试页面，无需认证和 Supabase。
 * 用于测试和展示 AI 插图生成功能。
 *
 * V6: 统一使用 generateIllustrationClient（内部通过服务端 API 调用 Pollinations.ai）
 * V7: 全面国际化 i18n
 */

'use client';

import { useState, useCallback } from 'react';
import { generateIllustrationClient } from '@/features/butterfly/lib/client-illustration-engine';
import { useI18n } from '@/i18n/provider';

// ============================================================
// 类型
// ============================================================

type StoryTone = 'hopeful' | 'neutral' | 'dark' | 'twist';

interface GeneratedImage {
  prompt: string;
  base64: string;
  /** CDN URL 或 data URL（优先于 base64） */
  imageUrl: string;
  size: string;
  timestamp: number;
  tone: StoryTone;
  title: string;
}

// ============================================================
// 预设场景 key 模式（模块级不能用 hooks，用 key 存储）
// ============================================================

const PRESET_SCENE_KEYS = [
  {
    titleKey: 'butterflyDemo.presetSceneTitles.firstRipple',
    descKey: 'butterflyDemo.presetSceneDescs.firstRipple',
    tone: 'hopeful' as StoryTone,
    customPrompt: '',
  },
  {
    titleKey: 'butterflyDemo.presetSceneTitles.midnightTemptation',
    descKey: 'butterflyDemo.presetSceneDescs.midnightTemptation',
    tone: 'dark' as StoryTone,
    customPrompt: '',
  },
  {
    titleKey: 'butterflyDemo.presetSceneTitles.unexpectedTurn',
    descKey: 'butterflyDemo.presetSceneDescs.unexpectedTurn',
    tone: 'twist' as StoryTone,
    customPrompt: '',
  },
  {
    titleKey: 'butterflyDemo.presetSceneTitles.quietAftermath',
    descKey: 'butterflyDemo.presetSceneDescs.quietAftermath',
    tone: 'neutral' as StoryTone,
    customPrompt: '',
  },
];

// ============================================================
// 基调颜色映射（样式不变，label 改为 key 模式）
// ============================================================

const TONE_COLORS: Record<StoryTone, { border: string; bg: string; text: string; glow: string; labelKey: string; emoji: string }> = {
  hopeful: {
    border: 'border-emerald-500/30',
    bg: 'bg-emerald-500/5',
    text: 'text-emerald-400',
    glow: '0 0 30px rgba(16, 185, 129, 0.3)',
    labelKey: 'butterflyDemo.toneLabels.hopeful',
    emoji: '🌱',
  },
  neutral: {
    border: 'border-gray-500/30',
    bg: 'bg-gray-500/5',
    text: 'text-gray-400',
    glow: '0 0 30px rgba(107, 114, 128, 0.3)',
    labelKey: 'butterflyDemo.toneLabels.neutral',
    emoji: '⚖️',
  },
  dark: {
    border: 'border-red-500/30',
    bg: 'bg-red-500/5',
    text: 'text-red-400',
    glow: '0 0 30px rgba(239, 68, 68, 0.3)',
    labelKey: 'butterflyDemo.toneLabels.dark',
    emoji: '🌑',
  },
  twist: {
    border: 'border-purple-500/30',
    bg: 'bg-purple-500/5',
    text: 'text-purple-400',
    glow: '0 0 30px rgba(168, 85, 247, 0.3)',
    labelKey: 'butterflyDemo.toneLabels.twist',
    emoji: '🎰',
  },
};

// ============================================================
// 组件
// ============================================================

export default function ButterflyDemoPage() {
  const { t } = useI18n();
  const [images, setImages] = useState<GeneratedImage[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedTone, setSelectedTone] = useState<StoryTone>('hopeful');
  const [customTitle, setCustomTitle] = useState('');
  const [customPrompt, setCustomPrompt] = useState('');
  const [selectedImage, setSelectedImage] = useState<GeneratedImage | null>(null);

  const generateImage = useCallback(async (
    title: string,
    tone: StoryTone,
    description?: string,
    prompt?: string,
  ) => {
    setIsGenerating(true);
    setError(null);

    try {
      // V6: 统一通过 generateIllustrationClient（内部调用服务端 API → Pollinations.ai）
      const result = await generateIllustrationClient({
        title,
        tone,
        timeSpan: '1 day later',
        decisionDescription: description || '',
        decisionType: 'bought',
        size: '768x1344',
        customPrompt: prompt || undefined,
      });

      if (result.success && (result.imageUrl || result.imageBase64)) {
        const newImage: GeneratedImage = {
          prompt: result.prompt || prompt || '',
          base64: result.imageBase64 || '',
          imageUrl: result.imageUrl || (result.imageBase64 ? `data:image/png;base64,${result.imageBase64}` : ''),
          size: '768x1344',
          timestamp: Date.now(),
          tone,
          title,
        };
        setImages(prev => [newImage, ...prev]);
        setSelectedImage(newImage);
      } else {
        setError(result.error || 'Generation failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setIsGenerating(false);
    }
  }, []);

  const handlePresetClick = useCallback((scene: typeof PRESET_SCENE_KEYS[number]) => {
    const title = t(scene.titleKey);
    const description = t(scene.descKey);
    generateImage(title, scene.tone, description, scene.customPrompt || undefined);
  }, [generateImage, t]);

  const handleCustomGenerate = useCallback(() => {
    const title = customTitle || t('butterflyDemo.customSceneDefault');
    generateImage(title, selectedTone, undefined, customPrompt || undefined);
  }, [customTitle, selectedTone, customPrompt, generateImage, t]);

  const downloadImage = useCallback((image: GeneratedImage) => {
    const link = document.createElement('a');
    link.href = image.imageUrl || `data:image/png;base64,${image.base64}`;
    link.download = `butterfly-${image.title.replace(/\s+/g, '-').toLowerCase()}-${image.tone}.png`;
    link.click();
  }, []);

  return (
    <div className="min-h-screen bg-surface-1 text-text-primary">
      {/* Header */}
      <div className="border-b border-glass-border bg-surface-1/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <span className="text-3xl">🎰</span>
            <div>
              <h1 className="text-xl font-bold gradient-text">{t('butterflyDemo.title')}</h1>
              <p className="text-xs text-gray-500 mt-0.5">{t('butterflyDemo.description')}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Panel: Controls */}
          <div className="space-y-6">
            {/* Preset Scenes */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 space-y-3">
              <h2 className="text-sm font-bold text-gray-300">{t('butterflyDemo.presetScenes')}</h2>
              <p className="text-xs text-gray-600">{t('butterflyDemo.presetScenesDesc')}</p>
              <div className="space-y-2">
                {PRESET_SCENE_KEYS.map((scene, i) => {
                  const colors = TONE_COLORS[scene.tone];
                  return (
                    <button
                      key={i}
                      onClick={() => handlePresetClick(scene)}
                      disabled={isGenerating}
                      className={`w-full text-left px-3 py-2.5 rounded-xl border ${colors.border} ${colors.bg} transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed hover:scale-[1.02] active:scale-[0.98]`}
                    >
                      <div className="flex items-center justify-between">
                        <span className={`text-sm font-medium ${colors.text}`}>{t(scene.titleKey)}</span>
                        <span className="text-xs text-gray-600">{t(colors.labelKey)}</span>
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">{t(scene.descKey)}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Custom Generation */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 space-y-3">
              <h2 className="text-sm font-bold text-gray-300">{t('butterflyDemo.customScene')}</h2>

              <div>
                <label className="text-xs text-gray-500 mb-1 block">{t('butterflyDemo.titleLabel')}</label>
                <input
                  value={customTitle}
                  onChange={(e) => setCustomTitle(e.target.value)}
                  placeholder={t('butterflyDemo.titlePlaceholder')}
                  className="w-full px-3 py-2 rounded-lg bg-gray-800/40 border border-gray-700/40 text-sm text-gray-200 placeholder:text-gray-600 focus:outline-none focus:border-cyan-500/40"
                />
              </div>

              <div>
                <label className="text-xs text-gray-500 mb-1 block">{t('butterflyDemo.toneLabel')}</label>
                <div className="grid grid-cols-4 gap-1.5">
                  {(Object.entries(TONE_COLORS) as [StoryTone, typeof TONE_COLORS[StoryTone]][]).map(([tone, colors]) => (
                    <button
                      key={tone}
                      onClick={() => setSelectedTone(tone)}
                      className={`px-2 py-1.5 rounded-lg text-xs border transition-all cursor-pointer ${
                        selectedTone === tone
                          ? `${colors.border} ${colors.bg} ${colors.text}`
                          : 'border-gray-700/40 text-gray-500 hover:border-gray-600/40'
                      }`}
                    >
                      {colors.emoji}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-500 mb-1 block">{t('butterflyDemo.customPromptLabel')}</label>
                <textarea
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  placeholder={t('butterflyDemo.customPromptPlaceholder')}
                  className="w-full h-20 px-3 py-2 rounded-lg bg-gray-800/40 border border-gray-700/40 text-sm text-gray-200 placeholder:text-gray-600 resize-none focus:outline-none focus:border-cyan-500/40"
                />
              </div>

              <button
                onClick={handleCustomGenerate}
                disabled={isGenerating}
                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-purple-500 text-white font-bold text-sm hover:from-cyan-400 hover:to-purple-400 transition-all active:scale-95 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isGenerating ? t('butterflyDemo.generating') : t('butterflyDemo.generateBtn')}
              </button>
            </div>

            {/* Error */}
            {error && (
              <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-3">
                <div className="text-xs text-red-400 font-medium">{t('butterflyDemo.generationError')}</div>
                <div className="text-xs text-red-400/70 mt-1">{error}</div>
              </div>
            )}

            {/* Stats */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
              <div className="text-xs text-gray-500 space-y-1">
                <div>{t('butterflyDemo.generated', { n: images.length })}</div>
                <div>{t('butterflyDemo.style')}</div>
                <div>{t('butterflyDemo.size')}</div>
              </div>
            </div>
          </div>

          {/* Center: Preview */}
          <div className="lg:col-span-1">
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden">
              <div className="px-4 py-3 border-b border-white/5">
                <h2 className="text-sm font-bold text-gray-300">{t('butterflyDemo.preview')}</h2>
              </div>

              {selectedImage ? (
                <div className="relative">
                  <div className="aspect-[7/12] bg-gray-900/50">
                    <img
                      src={selectedImage.imageUrl || `data:image/png;base64,${selectedImage.base64}`}
                      alt={selectedImage.title}
                      className="w-full h-full object-cover"
                    />
                    {/* Gradient overlays */}
                    <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.3) 0%, transparent 15%)' }} />
                    <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.4) 25%, transparent 50%)' }} />
                    <div className="absolute bottom-0 left-0 right-0 px-4 py-3">
                      <div className="text-xs text-gray-400 mb-1">{t(TONE_COLORS[selectedImage.tone].labelKey)} · {selectedImage.size}</div>
                      <div className={`text-sm font-medium ${TONE_COLORS[selectedImage.tone].text}`}>{selectedImage.title}</div>
                    </div>
                  </div>
                  <div className="px-4 py-3 space-y-2">
                    <p className="text-xs text-gray-500 leading-relaxed line-clamp-3">{selectedImage.prompt}</p>
                    <button
                      onClick={() => downloadImage(selectedImage)}
                      className="w-full py-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-gray-300 border border-white/10 text-xs transition-all cursor-pointer"
                    >
                      {t('butterflyDemo.downloadPng')}
                    </button>
                  </div>
                </div>
              ) : isGenerating ? (
                <div className="aspect-[7/12] bg-gray-900/50 flex items-center justify-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-16 h-12 relative">
                      <svg viewBox="0 0 64 48" className="w-full h-full" fill="none">
                        <path d="M28 24 C20 12, 4 8, 8 20 C10 26, 18 28, 28 24Z" className="opacity-30" style={{ fill: 'rgba(168,85,247,0.3)' }} />
                        <path d="M36 24 C44 12, 60 8, 56 20 C54 26, 46 28, 36 24Z" className="opacity-30" style={{ fill: 'rgba(168,85,247,0.3)' }} />
                        <line x1="32" y1="16" x2="32" y2="36" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" />
                      </svg>
                      <div className="absolute inset-0 rounded-full animate-pulse" style={{ boxShadow: '0 0 30px rgba(168,85,247,0.3)', transform: 'scale(1.5)' }} />
                    </div>
                    <span className="text-xs text-gray-500 animate-pulse">{t('butterflyDemo.generatingIllustration')}</span>
                    <span className="text-[10px] text-gray-600">{t('butterflyDemo.mayTakeTime')}</span>
                  </div>
                </div>
              ) : (
                <div className="aspect-[7/12] bg-gray-900/50 flex items-center justify-center">
                  <div className="flex flex-col items-center gap-3 text-center px-6">
                    <div className="text-4xl">🎰</div>
                    <span className="text-xs text-gray-500">{t('butterflyDemo.selectPreset')}</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right: Gallery */}
          <div className="lg:col-span-1">
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden">
              <div className="px-4 py-3 border-b border-white/5">
                <h2 className="text-sm font-bold text-gray-300">{t('butterflyDemo.gallery', { n: images.length })}</h2>
              </div>

              {images.length === 0 ? (
                <div className="p-6 text-center">
                  <span className="text-xs text-gray-600">{t('butterflyDemo.galleryEmpty')}</span>
                </div>
              ) : (
                <div className="p-2 grid grid-cols-2 gap-2 max-h-[800px] overflow-y-auto">
                  {images.map((img, _i) => {
                    const colors = TONE_COLORS[img.tone];
                    return (
                      <button
                        key={img.timestamp}
                        onClick={() => setSelectedImage(img)}
                        className={`relative rounded-xl overflow-hidden border transition-all cursor-pointer hover:scale-[1.03] active:scale-[0.97] ${
                          selectedImage?.timestamp === img.timestamp ? colors.border : 'border-white/5'
                        }`}
                      >
                        <div className="aspect-[7/12]">
                          <img
                            src={img.imageUrl || `data:image/png;base64,${img.base64}`}
                            alt={img.title}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div className="absolute bottom-0 left-0 right-0 px-2 py-1.5 bg-gradient-to-t from-black/80 to-transparent">
                          <div className={`text-[10px] font-medium ${colors.text} truncate`}>{img.title}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
