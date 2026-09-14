/**
 * 后台管理系统 — 类型定义
 *
 * 仅用于 /admin/* 路由树，与主站类型隔离。
 */

// ── 认证 ──────────────────────────────────────────────────────────
export interface AdminAuthState {
  /** 是否已登录（sessionStorage 有 key） */
  isAuthenticated: boolean;
  /** ADMIN_API_KEY（未登录时为 null） */
  apiKey: string | null;
  /** 登录：存入 sessionStorage */
  login: (key: string) => void;
  /** 登出：清除 sessionStorage */
  logout: () => void;
}

// ── API 响应 ──────────────────────────────────────────────────────
export interface ApiError {
  error: string;
  detail?: unknown;
}

export interface ApiResponse<T = unknown> {
  ok: boolean;
  status: number;
  data: T | null;
  error: string | null;
}

// ── Dashboard 概览 ────────────────────────────────────────────────
export interface DashboardOverview {
  agents: { id: string; name: string; model: string }[];
  agentCount: number;
  mcpServers: { id: string; name: string; server_url: string; server_type: string }[];
  poolStatus: {
    available?: number;
    assigned?: number;
    poolSize?: number;
    initialPoolSize?: number;
    creating?: number;
    failed?: number;
    lastCronCheck?: string;
    lastRefillAt?: string;
    lastDoubledAt?: string;
  } | null;
  auditStats: {
    total: number;
    byAction?: Record<string, number>;
  } | null;
  cultivationStats: {
    total?: number;
    by_cultivation_stage?: Record<string, number>;
    by_severity_tier?: Record<string, number>;
  } | null;
  embeddingStats: {
    total?: number;
    by_source_type?: Record<string, number>;
  } | null;
  /** 最近审计日志（Dashboard 时间线） */
  recentLogs?: AuditLog[];
}

// ── Letta ─────────────────────────────────────────────────────────
export interface LettaAgent {
  id: string;
  name: string;
  model: string;
  user_id?: string;
}

export interface LettaMcpServer {
  id: string;
  name: string;
  server_url: string;
  server_type: string;
}

export interface LettaOverview {
  agents: LettaAgent[];
  agentCount: number;
  mcpServers: LettaMcpServer[];
}

/** Letta action 元信息 — 用于渲染操作面板 */
export interface LettaActionMeta {
  /** action 标识（传给 API） */
  action: string;
  /** 中文名 */
  label: string;
  /** 描述 */
  description: string;
  /** 参数定义 */
  params: LettaActionParam[];
  /** 是否危险操作（需二次确认） */
  dangerous?: boolean;
  /** HTTP 方法（默认 POST） */
  method?: 'GET' | 'POST';
}

export interface LettaActionParam {
  key: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'textarea' | 'json';
  required?: boolean;
  placeholder?: string;
  defaultValue?: string | number | boolean;
  /** 帮助文本 */
  help?: string;
}

// ── Cultivation ───────────────────────────────────────────────────
export interface CultivationStats {
  total?: number;
  /** 后端返回 snake_case key */
  by_cultivation_stage?: Record<string, number>;
  by_severity_tier?: Record<string, number>;
}

/** 后端 getProfile 返回 camelCase（mapRowToProfile） */
export interface CultivationProfile {
  userId: string;
  severityTier: string;
  cultivationStage: string;
  lastReassessedAt: string | null;
  stageEnteredAt?: string | null;
  weeklyImpulseCount?: number;
  weeklyTotalAmount?: number;
  weeklyAvgImpulseScore?: number;
  weeklyRefundCount?: number;
  monthlyImpulseCount?: number;
  monthlyResistedCount?: number;
  monthlyChallengePassRate?: number;
  professionalReferralRecommended?: boolean;
}

// ── Embeddings ────────────────────────────────────────────────────
export interface EmbeddingStats {
  total?: number;
  by_source_type?: Record<string, number>;
  unique_users?: number;
  by_user?: Record<string, number>;
}

// ── Audit ─────────────────────────────────────────────────────────
export interface AuditLog {
  id: string | number;
  created_at: string;
  route: string;
  actor: string;
  action: string | null;
  method: string | null;
  success: boolean;
  status_code: number | null;
  metadata?: Record<string, unknown> | null;
}

export interface AuditStats {
  total: number;
  byAction?: Record<string, number>;
}

export interface AuditQuery {
  page?: number;
  limit?: number;
  route?: string;
  actor?: string;
}

// ── Agent Pool ────────────────────────────────────────────────────
export interface AgentPoolStatus {
  available: number;
  assigned?: number;
  poolSize: number;
  initialPoolSize?: number;
  creating?: number;
  failed?: number;
  lastCronCheck?: string;
  lastRefillAt?: string;
  lastDoubledAt?: string;
  [key: string]: unknown;
}

// ── Weekly Challenges ─────────────────────────────────────────────
export interface WeeklyChallengeResult {
  success: boolean;
  created?: number;
  expired?: number;
  challenges?: unknown[];
  message?: string;
}

// ── Users ─────────────────────────────────────────────────────────
export interface UserProfile {
  id: string;
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
  plan: string;
  banned: boolean;
  banned_until: string | null;
  banned_reason: string | null;
  onboarding_completed: boolean;
  locale: string | null;
  timezone: string;
  trial_until: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserListResponse {
  users: UserProfile[];
  total: number;
  page: number;
  totalPages: number;
}

export interface UserDetail extends UserProfile {
  impulseCount?: number;
  chatMessageCount?: number;
  butterflySessionCount?: number;
  buddyState?: Record<string, unknown> | null;
}

export interface UserBatchAction {
  action: 'ban' | 'unban' | 'set_plan' | 'reset_onboarding';
  userIds: string[];
  plan?: 'free' | 'premium';
  bannedUntil?: string;
  reason?: string;
}

// ── Settings ──────────────────────────────────────────────────────
export interface EnvVarCheck {
  key: string;
  configured: boolean;
  required: boolean;
  group: string;
  description?: string;
}

export interface AppConfigEntry {
  key: string;
  hasValue: boolean;
  updatedAt: string;
}

export interface HealthCheckResult {
  service: string;
  status: 'healthy' | 'degraded' | 'down';
  latencyMs: number;
  message?: string;
}

export interface MigrationInfo {
  filename: string;
  size: number;
}

export interface SettingsOverview {
  envVars: EnvVarCheck[];
  appConfig: AppConfigEntry[];
  migrationCount: number;
  cronJobs?: { path: string; schedule: string }[];
}

export interface MigrationsOverview {
  migrations: MigrationInfo[];
  duplicates: string[];
}
