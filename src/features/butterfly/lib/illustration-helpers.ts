/**
 * illustration-helpers — Pure functions for illustration prompt building
 *
 * 🔧 ARCH fix (Round 61 — illustration-engine.ts god component 拆分):
 *    从 illustration-engine.ts 提取 tone maps + extractVisualHintsFromContent +
 *    extractSceneFromTitle + buildIllustrationPrompt (~330 行)。
 *    illustration-engine.ts 从 878 行 → ~548 行。
 *
 * 高内聚低耦合: prompt 构建逻辑内聚到此文件, illustration-engine 只 import。
 */

import type { StoryTone, DecisionType } from '../types';

// ============================================================
// Tone → 视觉映射
// ============================================================

// ---- Dark mode tone maps ----
export const TONE_COLOR_MAP_DARK: Record<StoryTone, string> = {
  hopeful: 'green',
  dark: 'crimson',
  twist: 'purple',
  neutral: 'blue',
};

export const TONE_MOOD_MAP_DARK: Record<StoryTone, string> = {
  hopeful: 'hopeful',
  dark: 'ominous',
  twist: 'surreal',
  neutral: 'melancholic',
};

export const TONE_LIGHTING_MAP_DARK: Record<StoryTone, string> = {
  hopeful: 'golden',
  dark: 'harsh',
  twist: 'neon',
  neutral: 'flat',
};

export const TONE_ATMOSPHERE_MAP_DARK: Record<StoryTone, string> = {
  hopeful: 'misty',
  dark: 'foggy',
  twist: 'distorted',
  neutral: 'still',
};

// ---- Light mode tone maps ----
export const TONE_COLOR_MAP_LIGHT: Record<StoryTone, string> = {
  hopeful: 'green',
  dark: 'crimson',
  twist: 'lavender',
  neutral: 'gray',
};

export const TONE_MOOD_MAP_LIGHT: Record<StoryTone, string> = {
  hopeful: 'hopeful',
  dark: 'somber',
  twist: 'dreamy',
  neutral: 'calm',
};

export const TONE_LIGHTING_MAP_LIGHT: Record<StoryTone, string> = {
  hopeful: 'sunlit',
  dark: 'overcast',
  twist: 'soft',
  neutral: 'even',
};

export const TONE_ATMOSPHERE_MAP_LIGHT: Record<StoryTone, string> = {
  hopeful: 'bright',
  dark: 'foggy',
  twist: 'hazy',
  neutral: 'clear',
};

// ============================================================
// Prompt 构建
// ============================================================

export const MANGA_PROTAGONIST_PROMPT =
  'Simple stick figure, no face, body language through posture only — stick figure art style.';

export const MANGA_STYLE_DARK =
  'Minimalist stick figure line drawing, black ink on white, rough sketch style, no detail, no shading, childlike simplicity';

export const MANGA_STYLE_LIGHT =
  'Minimalist stick figure line drawing, black ink on white, rough sketch style, no detail, no shading, childlike simplicity';

/**
 * 从章节内容中提取视觉线索
 */
export function extractVisualHintsFromContent(content: string): string | null {
  const lower = content.toLowerCase();

  const timeHints: string[] = [];
  if (lower.includes('sunset') || lower.includes('dusk')) timeHints.push('sunset light');
  if (lower.includes('dawn') || lower.includes('sunrise')) timeHints.push('dawn light');
  if (lower.includes('midnight') || lower.includes('3am') || lower.includes('2am')) timeHints.push('deep night');
  if (lower.includes('rain') || lower.includes('storm')) timeHints.push('rain');
  if (lower.includes('snow') || lower.includes('winter')) timeHints.push('snow');

  const locationHints: string[] = [];
  if (lower.includes('kitchen')) locationHints.push('kitchen');
  else if (lower.includes('bedroom')) locationHints.push('bedroom');
  else if (lower.includes('office')) locationHints.push('office');
  else if (lower.includes('hospital')) locationHints.push('hospital corridor');
  else if (lower.includes('airport')) locationHints.push('airport terminal');
  else if (lower.includes('coffee shop') || lower.includes('cafe')) locationHints.push('coffee shop');
  else if (lower.includes('car') || lower.includes('driving')) locationHints.push('inside a car');

  const emotionHints: string[] = [];
  if (lower.includes('tears') || lower.includes('crying') || lower.includes('sob')) emotionHints.push('tears');
  if (lower.includes('smile') || lower.includes('laugh')) emotionHints.push('a faint smile');
  if (lower.includes('silence') || lower.includes('quiet')) emotionHints.push('heavy silence');
  if (lower.includes('screaming') || lower.includes('shout')) emotionHints.push('anguish');

  const allHints = [...timeHints, ...locationHints.slice(0, 1), ...emotionHints.slice(0, 1)];
  if (allHints.length === 0) return null;

  return `Scene includes ${allHints.join(', ')}`;
}

/**
 * 从章节标题中提取场景关键词
 */
export function extractSceneFromTitle(
  title: string,
  decisionDescription: string,
): string {
  const lower = title.toLowerCase();
  const descLower = decisionDescription.toLowerCase();

  // 从决策描述中提取物品关键词
  const itemKeywords: string[] = [];
  const itemPatterns = [
    /(?:bought|spent|paid\s+for)\s+(?:a\s+|an\s+)?(.+?)(?:\s+for|\s+on|\s+from|$)/i,
    /(?:a|an)\s+([\w-]+\s+(?:jacket|coat|shoes|bag|phone|watch|dress|shirt|ring|game|console|ticket|gadget|device|item|thing))/i,
  ];

  for (const pattern of itemPatterns) {
    const match = descLower.match(pattern);
    if (match?.[1]) {
      itemKeywords.push(match[1].trim());
      break;
    }
  }

  let scene: string;

  if (lower.includes('rain') || lower.includes('storm') || lower.includes('flood')) {
    scene = 'rain streaking down a dark window, water pooling on a cold floor, a figure watching from inside';
  } else if (lower.includes('sun') || lower.includes('light') || lower.includes('dawn')) {
    scene = 'sunlight breaking through heavy clouds, a figure standing in a shaft of golden light';
  } else if (lower.includes('moon') || lower.includes('night') || lower.includes('midnight')) {
    scene = 'a dark room bathed in cold moonlight, long shadows stretching across the floor';
  } else if (lower.includes('snow') || lower.includes('winter') || lower.includes('ice') || lower.includes('cold') || lower.includes('frost')) {
    scene = 'frost patterns on a window, a frozen landscape with a solitary figure in the distance';
  } else if (lower.includes('fire') || lower.includes('flame') || lower.includes('burn') || lower.includes('ember')) {
    scene = 'embers glowing in darkness, smoke curling upward, orange light on a face half in shadow';
  } else if (lower.includes('summer') || lower.includes('heat') || lower.includes('warm')) {
    scene = 'hazy golden afternoon light, dust particles floating, a window half open to a bright world';
  } else if (lower.includes('wind') || lower.includes('breeze')) {
    scene = 'leaves swirling in the air, a figure standing at a cliff edge, hair and clothes catching the wind';
  } else if (lower.includes('door') || lower.includes('gate') || lower.includes('portal') || lower.includes('entrance')) {
    scene = 'an ornate door ajar with light spilling through the gap, a figure reaching toward the handle';
  } else if (lower.includes('window')) {
    scene = 'a rain-streaked window overlooking city lights, a silhouette pressing a hand against the glass';
  } else if (lower.includes('mirror') || lower.includes('reflection')) {
    scene = 'a cracked mirror reflecting a different scene than reality, fragments of light scattered across the floor';
  } else if (lower.includes('garden') || lower.includes('bloom') || lower.includes('flower')) {
    scene = 'an overgrown garden with wildflowers pushing through cracks, a bench half-hidden by vines';
  } else if (lower.includes('street') || lower.includes('road') || lower.includes('path') || lower.includes('alley')) {
    scene = 'a long road vanishing into fog, streetlights casting pools of light, a lone figure walking away';
  } else if (lower.includes('ocean') || lower.includes('sea') || lower.includes('water') || lower.includes('river') || lower.includes('lake')) {
    scene = 'dark water reflecting dim moonlight, ripples spreading outward, a pier extending into the mist';
  } else if (lower.includes('mountain') || lower.includes('hill') || lower.includes('cliff')) {
    scene = 'a vast mountain range under a dramatic sky, a figure standing at the summit silhouetted against the clouds';
  } else if (lower.includes('forest') || lower.includes('tree') || lower.includes('wood')) {
    scene = 'dense forest with shafts of light piercing the canopy, twisted roots and deep shadows';
  } else if (lower.includes('city') || lower.includes('tower') || lower.includes('building')) {
    scene = 'a towering cityscape at dusk, neon reflections on wet pavement, a figure looking up from below';
  } else if (lower.includes('home') || lower.includes('house') || lower.includes('room')) {
    scene = 'a warmly lit doorway seen from the dark outside, a figure hesitating on the threshold';
  } else if (lower.includes('office') || lower.includes('desk') || lower.includes('work')) {
    scene = 'a dim office at night, a single desk lamp illuminating scattered papers, empty chairs around';
  } else if (lower.includes('bridge')) {
    scene = 'a long bridge stretching into fog, water far below, a figure standing at the railing';
  } else if (lower.includes('key') || lower.includes('lock') || lower.includes('secret')) {
    scene = 'an old ornate key held in a hand, before a locked door with strange markings';
  } else if (lower.includes('letter') || lower.includes('note') || lower.includes('message') || lower.includes('envelope')) {
    scene = 'an unfolded letter on a wooden table, a hand reaching for it, ink barely visible in dim light';
  } else if (lower.includes('book') || lower.includes('page') || lower.includes('story') || lower.includes('chapter')) {
    scene = 'an open book with pages turning by themselves, text glowing faintly, a figure reading by candlelight';
  } else if (lower.includes('phone') || lower.includes('call') || lower.includes('screen')) {
    scene = 'a phone screen glowing in the dark, a face lit only by the screen, thumb hovering over a button';
  } else if (lower.includes('box') || lower.includes('package') || lower.includes('sealed')) {
    scene = 'a sealed box on a desk in a dim room, dust particles in the light, a hand reaching to open it';
  } else if (lower.includes('ring') || lower.includes('jewel') || lower.includes('necklace')) {
    scene = 'a ring or small object catching the light on a dark surface, reflected in a pair of eyes';
  } else if (lower.includes('price') || lower.includes('cost') || lower.includes('debt') || lower.includes('money') || lower.includes('coin') || lower.includes('receipt')) {
    scene = 'scattered receipts and coins on a table, a calculator display glowing, a hand covering a wallet';
  } else if (lower.includes('clock') || lower.includes('time') || lower.includes('hour') || lower.includes('moment')) {
    scene = 'a clock face with hands frozen at a significant moment, time seeming to stop around it';
  } else if (lower.includes('fall') || lower.includes('drop') || lower.includes('slip') || lower.includes('crash')) {
    scene = 'a figure in mid-motion, frozen in time, surrounded by shattered glass or falling objects';
  } else if (lower.includes('rise') || lower.includes('climb') || lower.includes('ascend') || lower.includes('soar')) {
    scene = 'a steep staircase ascending into light, a figure climbing upward, shadow stretching behind';
  } else if (lower.includes('run') || lower.includes('chase') || lower.includes('escape') || lower.includes('flee')) {
    scene = 'a figure running through a corridor or street, motion blur, looking back over their shoulder';
  } else if (lower.includes('wait') || lower.includes('stand') || lower.includes('still') || lower.includes('pause')) {
    scene = 'a figure standing perfectly still in a vast empty space, long shadows, silence made visible';
  } else if (lower.includes('return') || lower.includes('back') || lower.includes('come')) {
    scene = 'a doorway seen from outside, warm light inside, a figure hesitating on the doorstep';
  } else if (lower.includes('leave') || lower.includes('go') || lower.includes('depart') || lower.includes('gone') || lower.includes('lost') || lower.includes('missing')) {
    scene = 'an empty chair in a half-lit room, a door left ajar, traces of someone who just left';
  } else if (lower.includes('dream') || lower.includes('sleep') || lower.includes('nightmare') || lower.includes('wake')) {
    scene = 'a dark bedroom with moonlight, tangled sheets, a figure sitting up with eyes wide open';
  } else if (lower.includes('silence') || lower.includes('quiet') || lower.includes('hush')) {
    scene = 'a vast empty space with long shadows, dust particles frozen in a beam of light, absolute stillness';
  } else if (lower.includes('echo') || lower.includes('ripple') || lower.includes('wave') || lower.includes('butterfly')) {
    scene = 'concentric ripples on dark water, expanding circles of light, a single drop falling into still water';
  } else if (lower.includes('shadow') || lower.includes('dark') || lower.includes('void') || lower.includes('abyss')) {
    scene = 'deep shadows consuming a room, a figure standing at the edge of darkness, one foot in the light';
  } else if (lower.includes('hope') || lower.includes('wish') || lower.includes('pray') || lower.includes('believe')) {
    scene = 'a single candle flame in vast darkness, a figure with closed eyes, hands clasped';
  } else if (lower.includes('fear') || lower.includes('dread') || lower.includes('horror') || lower.includes('terror')) {
    scene = 'a distorted shadow on the wall bigger than the figure casting it, edges blurring into darkness';
  } else if (lower.includes('love') || lower.includes('heart') || lower.includes('together') || lower.includes('hold')) {
    scene = 'two silhouettes close together against a window, city lights behind them, warmth in a cold space';
  } else if (lower.includes('memory') || lower.includes('remember') || lower.includes('past') || lower.includes('before')) {
    scene = 'faded photographs scattered on a table, a figure looking at them in dim light, time layering';
  } else if (lower.includes('found') || lower.includes('discover') || lower.includes('reveal') || lower.includes('uncover')) {
    scene = 'something uncovered in a dusty attic, light falling on a hidden object, a figure gasping';
  } else if (lower.includes('wall') || lower.includes('barrier') || lower.includes('divide') || lower.includes('border')) {
    scene = 'a tall wall with a single crack of light, a figure pressing their hand against it';
  } else if (lower.includes('cross') || lower.includes('fork') || lower.includes('choice') || lower.includes('decision') || lower.includes('turn')) {
    scene = 'two diverging paths at a foggy intersection, a figure standing at the fork, unable to see what lies ahead';
  } else if (lower.includes('begin') || lower.includes('start') || lower.includes('first') || lower.includes('origin') || lower.includes('ripple')) {
    scene = 'a single drop falling into still water, the moment of impact, ripples just beginning to form';
  } else if (lower.includes('end') || lower.includes('final') || lower.includes('last') || lower.includes('finish') || lower.includes('close')) {
    scene = 'a door closing slowly, light from the other side narrowing to a sliver, then darkness';
  } else if (lower.includes('change') || lower.includes('transform') || lower.includes('shift') || lower.includes('become')) {
    scene = 'a figure at the moment of transformation, edges blurring, old self dissolving into new';
  } else {
    scene = 'a dim room with a single source of light, a figure standing in the threshold between shadow and illumination';
  }

  if (itemKeywords.length > 0) {
    scene = `${scene}, with ${itemKeywords[0]} visible nearby`;
  }

  return scene;
}

/**
 * 构建插图生成 Prompt — 漫画风格 + 主角不露脸 + light mode
 */
export function buildIllustrationPrompt(
  title: string,
  tone: StoryTone,
  timeSpan: string,
  decisionDescription: string,
  _decisionType: DecisionType,
  contentSnippet?: string,
  llmSceneDescription?: string,
  isLight?: boolean,
): string {
  let scene: string;
  if (llmSceneDescription) {
    scene = llmSceneDescription;
  } else if (contentSnippet && contentSnippet.length > 50) {
    const contentHints = extractVisualHintsFromContent(contentSnippet);
    scene = extractSceneFromTitle(title, decisionDescription);
    if (contentHints) {
      scene = `${scene}. ${contentHints}`;
    }
  } else {
    scene = extractSceneFromTitle(title, decisionDescription);
  }

  const toneColor = isLight
    ? (TONE_COLOR_MAP_LIGHT[tone] || TONE_COLOR_MAP_LIGHT.neutral)
    : (TONE_COLOR_MAP_DARK[tone] || TONE_COLOR_MAP_DARK.neutral);
  const toneMood = isLight
    ? (TONE_MOOD_MAP_LIGHT[tone] || TONE_MOOD_MAP_LIGHT.neutral)
    : (TONE_MOOD_MAP_DARK[tone] || TONE_MOOD_MAP_DARK.neutral);
  const stylePrefix = isLight ? MANGA_STYLE_LIGHT : MANGA_STYLE_DARK;

  return `${stylePrefix}, ${scene}. ${MANGA_PROTAGONIST_PROMPT} ${toneMood} mood, ${toneColor} colors. No face visible.`;
}
