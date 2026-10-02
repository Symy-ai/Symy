// cultivation-assessment — 修身阶段/严重度评估纯函数（此前 0 测试）
// 规则来自注释文档: 降级优先; 升级阈值 zhi_zhi<15/cheng_yi<10+60%/zheng_xin<3+80%。
import { describe, expect, it } from 'vitest';
import { assessSeverityTier, assessCultivationStage, type WeeklyMetrics, type MonthlyMetrics, type CultivationStage } from '@/lib/cultivation-assessment';

const weekly = (o: Partial<WeeklyMetrics> = {}): WeeklyMetrics => ({
  impulseCount: 0, totalAmount: 0, avgImpulseScore: 0, refundCount: 0, ...o,
});
const monthly = (o: Partial<MonthlyMetrics> = {}): MonthlyMetrics => ({
  impulseCount: 0, resistedCount: 0, challengePassRate: 0, ...o,
});

describe('assessSeverityTier — 严重度评分', () => {
  it('全零 → light', () => {
    expect(assessSeverityTier(weekly()).tier).toBe('light');
  });

  it('高频冲动 → severe (score≥40)', () => {
    // 10×4 + 500/10 + 80×0.3 = 40+50+24 = 114
    expect(assessSeverityTier(weekly({ impulseCount: 10, totalAmount: 500, avgImpulseScore: 80 })).tier).toBe('severe');
  });

  it('中等 → moderate (20≤score<40)', () => {
    // 3×4 + 100/10 + 30×0.3 = 12+10+9 = 31
    expect(assessSeverityTier(weekly({ impulseCount: 3, totalAmount: 100, avgImpulseScore: 30 })).tier).toBe('moderate');
  });

  it('score 精确边界: 恰 40 → severe, 恰 20 → moderate', () => {
    // 40: 5×4 + 100/10 + 100/3≈33.3 → 不精确凑; 用单因子: impulseCount=10 → 40
    expect(assessSeverityTier(weekly({ impulseCount: 10 })).tier).toBe('severe');
    expect(assessSeverityTier(weekly({ impulseCount: 5 })).tier).toBe('moderate');
  });

  it('reason 含因子明细 (可解释性)', () => {
    const { reason } = assessSeverityTier(weekly({ impulseCount: 2, totalAmount: 50, avgImpulseScore: 40 }));
    expect(reason).toContain('impulseCount=2');
    expect(reason).toContain('avgScore=40');
  });
});

describe('assessCultivationStage — 修身阶段迁移', () => {
  it('降级优先: 冲动>15 任何阶段回 zhi_yu', () => {
    for (const stage of ['zhi_zhi', 'cheng_yi', 'zheng_xin'] as CultivationStage[]) {
      const r = assessCultivationStage(stage, monthly({ impulseCount: 16, challengePassRate: 0.9 }));
      expect(r.stage).toBe('zhi_yu');
      expect(r.changed).toBe(true);
    }
  });

  it('已在 zhi_yu 且冲动>15 → maintain 不变', () => {
    const r = assessCultivationStage('zhi_yu', monthly({ impulseCount: 20 }));
    expect(r.stage).toBe('zhi_yu');
    expect(r.changed).toBe(false);
  });

  it('cheng_yi/zheng_xin 冲动>5 → 降 zhi_zhi', () => {
    for (const stage of ['cheng_yi', 'zheng_xin'] as CultivationStage[]) {
      const r = assessCultivationStage(stage, monthly({ impulseCount: 6, challengePassRate: 0.85 }));
      expect(r.stage).toBe('zhi_zhi');
      expect(r.changed).toBe(true);
    }
  });

  it('zhi_yu → zhi_zhi: 冲动<15', () => {
    const r = assessCultivationStage('zhi_yu', monthly({ impulseCount: 8 }));
    expect(r.stage).toBe('zhi_zhi');
    expect(r.changed).toBe(true);
  });

  it('zhi_zhi → cheng_yi: 冲动<10 且拦截率>60%', () => {
    const r = assessCultivationStage('zhi_zhi', monthly({ impulseCount: 8, challengePassRate: 0.7 }));
    expect(r.stage).toBe('cheng_yi');
    expect(r.changed).toBe(true);
  });

  it('zhi_zhi 拦截率不足 → maintain', () => {
    const r = assessCultivationStage('zhi_zhi', monthly({ impulseCount: 8, challengePassRate: 0.5 }));
    expect(r.stage).toBe('zhi_zhi');
    expect(r.changed).toBe(false);
  });

  it('cheng_yi → zheng_xin: 冲动<3 且拦截率>80%', () => {
    const r = assessCultivationStage('cheng_yi', monthly({ impulseCount: 2, challengePassRate: 0.85 }));
    expect(r.stage).toBe('zheng_xin');
    expect(r.changed).toBe(true);
  });

  it('cheng_yi 冲动达标但拦截率不足 → maintain', () => {
    const r = assessCultivationStage('cheng_yi', monthly({ impulseCount: 2, challengePassRate: 0.75 }));
    expect(r.stage).toBe('cheng_yi');
    expect(r.changed).toBe(false);
  });

  it('zheng_xin 稳定: 低冲动高拦截 → maintain', () => {
    const r = assessCultivationStage('zheng_xin', monthly({ impulseCount: 1, challengePassRate: 0.9 }));
    expect(r.stage).toBe('zheng_xin');
    expect(r.changed).toBe(false);
  });
});
