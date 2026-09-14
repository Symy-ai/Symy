/**
 * 🔧 P0-1 fix (2026-07-20): 反思问题共享常量
 *
 * 单一源 (SSOT): 反思问题列表, 供前端组件 + 后端检测共用.
 * 避免重复定义导致不一致.
 */

export const REFLECTION_QUESTIONS_EN = [
  'What do you truly want right now?',
  'When did this little spark begin?',
  'If a friend felt this spark, what would you say?',
  'What were you doing ten minutes before it appeared?',
  'If you save this money, should it go to piggy bank or free hours?',
  'If this money stays saved, could it buy a more durable companion?',
  'Was it a notification, an ad, or a feeling knocking?',
  'Is your body feeling tighter or softer right now?',
  'How could saved money become free hours for you?',
  'Has this kind of spark visited you before?',
  'Is it durable — how long can it stay with you?',
  'Could reusing what you own keep this money free?',
] as const;

export const REFLECTION_QUESTIONS_ZH = [
  '现在真正想要的是什么呢？',
  '这份心动是什么时候开始的？',
  '如果朋友此刻心动，你会怎么说？',
  '心动前十分钟，你在做什么？',
  '省下这笔，想去小金库还是自由时光？',
  '这笔钱留下后，能换更耐用的陪伴吗？',
  '是通知、广告，还是心情在敲门？',
  '身体现在更紧一点，还是松一点？',
  '省下的这笔，想换成怎样的自由时光？',
  '这样的心动，以前也悄悄来过吗？',
  '它耐用吗，能陪你多久？',
  '复用家里的已有，能帮这笔钱留下吗？',
] as const;

/** 所有反思问题 (英文 + 中文) */
export const ALL_REFLECTION_QUESTIONS = [...REFLECTION_QUESTIONS_EN, ...REFLECTION_QUESTIONS_ZH];
