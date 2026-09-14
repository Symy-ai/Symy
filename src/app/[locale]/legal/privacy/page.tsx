import { Metadata } from 'next';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const isZh = locale === 'zh';

  return {
    title: isZh ? '隐私政策 — Symy' : 'Privacy Policy — Symy',
    description: isZh ? 'Symy 隐私政策' : 'Symy Privacy Policy',
    alternates: { canonical: '/legal/privacy' },
  };
}

export default async function PrivacyPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const isZh = locale === 'zh';

  return (
    <div className="min-h-screen bg-surface-outer px-4 py-12">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-text-primary mb-2">{isZh ? '隐私政策' : 'Privacy Policy'}</h1>
        <p className="text-sm text-emerald-600 dark:text-emerald-400 font-medium mb-2">
          {isZh ? '你的消费数据，和你的钱一样，被同一双手守护。' : 'Your shopping data is guarded by the same hands that guard your money.'}
        </p>
        <p className="text-xs text-text-tertiary italic mb-6">
          {isZh
            ? '最后更新：September 6, 2026。Symy 由 Symbiotic Lab 开发（Symbiotic Lab 是 Symy 的开发主体，与任何商家、平台无利益关系）。本政策说明我们收集哪些数据、为何收集，以及您如何控制这些数据。'
            : 'Last updated: September 6, 2026. Symy is built by Symbiotic Lab (Symbiotic Lab builds Symy and has no financial ties to any merchant or platform). This Policy describes what data we collect, why we collect it, and how you can control it.'}
        </p>
        <div className="prose prose-sm dark:prose-invert max-w-none text-text-secondary space-y-4">
          <h2 className="text-lg font-semibold text-text-primary">{isZh ? '1. 我们收集的数据' : '1. Data We Collect'}</h2>
          <p>
            <strong>{isZh ? '账户数据：' : 'Account data:'}</strong>
            {isZh
              ? ' 电子邮箱地址、显示名称、身份验证令牌（由 Supabase Auth 管理）。您的密码绝不会以明文存储 —— Supabase Auth 使用 bcrypt 哈希加密。'
              : ' Email address, display name, authentication tokens (managed by Supabase Auth). Your password is never stored in plaintext — Supabase Auth uses bcrypt hashing.'}
          </p>
          <p>
            <strong>{isZh ? '使用数据：' : 'Usage data:'}</strong>
            {isZh
              ? ' 与 Symy 的聊天消息、挑战结果（看到了 / 还是买了）、消费反思、梦想基金目标与进度、抽卡故事描述与结果、时薪设置，以及伙伴状态（活力、代币、经验值、连续打卡、每日需求）。'
              : ' Chat messages with Symy, challenge results (saw it / bought anyway), spending reflections, Dream Fund goals and progress, Gacha story descriptions and outcomes, hourly rate setting, and buddy state (vitality, tokens, XP, streak, daily needs).'}
          </p>
          <p>
            <strong>{isZh ? '盲区地图数据：' : 'Blind-spot map data:'}</strong>
            {isZh
              ? ' 根据您的挑战汇总得出的消费规律（例如时段、金额区间、冲动率）—— 用于向您展示消费模式。除非您连接邮件监控，否则我们不会存储单笔购物收据。'
              : ' Aggregated patterns derived from your challenges (e.g. time-of-day, amount tier, impulse rate) — used to show you your spending patterns. We do not store individual purchase receipts unless you connect email monitoring.'}
          </p>
          <p>
            <strong>{isZh ? '邮件收据（可选，仅在您连接邮件时）：' : 'Email receipts (optional, only if you connect email):'}</strong>
            {isZh
              ? ' 如果您连接了邮箱账户，我们会扫描与购物相关的邮件（订单确认、收据、退款通知）。我们提取商户名称、商品描述、金额和日期。我们'
              : ' If you connect an email account, we scan for purchase-related emails (order confirmations, receipts, refund notices). We extract merchant name, item description, amount, and date. We do '}
            <strong>{isZh ? '不会' : 'not'}</strong>
            {isZh
              ? '存储完整的邮件正文、附件，或与购物无关的邮件。'
              : ' store the full email body, attachments, or emails unrelated to purchases.'}
          </p>
          <p>
            <strong>{isZh ? '设备与使用分析：' : 'Device &amp; usage analytics:'}</strong>
            {isZh
              ? ' 通过 Sentry 收集的汇总、匿名化使用统计数据（页面浏览量、功能使用情况、错误率）。Sentry 会接收 IP 地址和浏览器指纹用于错误诊断，但我们已将 Sentry 配置为不存储原始个人身份信息（PII）。'
              : ' Aggregated, anonymized usage statistics (page views, feature engagement, error rates) via Sentry. Sentry receives IP addresses and browser fingerprints for error diagnosis, but we configure Sentry to not store raw PII.'}
          </p>
          <p>
            <strong>{isZh ? '推荐数据：' : 'Referral data:'}</strong>
            {isZh
              ? ' 如果您通过推荐链接注册，我们会在您的账户中存储推荐人的邀请码（一个 8 字符的随机字符串，而非其邮箱），以便在您完成首次挑战时向推荐人发放奖励。'
              : " If you sign up via a referral link, we store the referrer's code (an 8-character random string, not their email) on your account to credit the referrer if you complete your first challenge."}
          </p>

          <h2 className="text-lg font-semibold text-text-primary">{isZh ? '2. 我们如何使用您的数据' : '2. How We Use Your Data'}</h2>
          <p>{isZh ? '您的数据用于：' : 'Your data is used to:'}</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>{isZh ? '提供 Symy 伙伴体验 —— 聊天、挑战、梦想基金、抽卡故事；' : 'Provide the Symy companion experience — chat, challenges, Dream Funds, Gacha stories;'}</li>
            <li>{isZh ? '个性化 AI 反思与故事（您的挑战历史会被注入 AI 上下文，以保持连贯性）；' : 'Personalize AI reflections and stories (your challenge history is injected into AI context for continuity);'}</li>
            <li>{isZh ? '追踪您的进度（活力、连续打卡、储蓄、盲区地图）；' : 'Track your progress (vitality, streaks, savings, blind-spot map);'}</li>
            <li>
              {isZh
                ? '匿名改进服务 —— 我们可能汇总用户数据以识别普遍规律（例如"40% 的用户在深夜 TikTok Shop 上难以自控"），而不会暴露任何个人的数据；'
                : 'Improve the Service anonymously — we may aggregate user data to identify common patterns (e.g. "40% of users struggle with late-night TikTok Shop") without exposing any individual\'s data;'}
            </li>
            <li>{isZh ? '向您发送与服务相关的通知（例如连续打卡提醒、新功能公告）—— 您可以在设置中选择退出；' : 'Send you service-related notifications (e.g. streak reminders, new feature announcements) — you can opt out from Settings;'}</li>
            <li>{isZh ? '检测并防止滥用、欺诈和违反服务条款的行为。' : 'Detect and prevent abuse, fraud, and Terms violations.'}</li>
          </ul>

          <h2 className="text-lg font-semibold text-text-primary">{isZh ? '3. AI 处理' : '3. AI Processing'}</h2>
          <p>
            {isZh
              ? '您的聊天消息和消费反思会发送至我们的 AI 提供商（Letta AI 和 GLM / Zhipu），用于生成个性化回复。每个用户拥有独立的 Letta Agent —— 您的对话记忆不会与其他用户共享。AI 提供商可能会在内存中临时处理您的数据以生成回复，但'
              : 'Your chat messages and spending reflections are sent to our AI providers (Letta AI and GLM / Zhipu) for generating personalized responses. Each user has an isolated Letta Agent — your conversation memory is not shared with other users. The AI provider may temporarily process your data in memory to generate responses, but '}
            <strong>{isZh ? '不会使用您的数据训练其模型' : 'does not use your data for training their models'}</strong>
            {isZh
              ? '（依据 Letta AI 和 Zhipu 与我们签订的企业协议）。'
              : " (per Letta AI and Zhipu's enterprise agreements with us)."}
          </p>
          <p>
            {isZh
              ? '我们会将相关上下文（您最近的挑战、时薪、盲区洞察）注入 AI 提示词中，使回复更具个性化。该上下文通过 HTTPS 传输，且不会在 AI 提供商的服务器上留存至回复生成窗口之外。'
              : "We inject relevant context (your recent challenges, hourly rate, blind-spot insights) into the AI prompt to make responses more personalized. This context is sent over HTTPS and not persisted on the AI provider's servers beyond the response generation window."}
          </p>

          <h2 className="text-lg font-semibold text-text-primary">{isZh ? '4. 数据存储与安全' : '4. Data Storage &amp; Security'}</h2>
          <p>
            {isZh
              ? '数据存储在 Supabase（PostgreSQL，托管于受监管的云区域）中，并启用了行级安全（RLS）。RLS 确保您只能读写自己的数据 —— 即便是 Symy 的工程师，在未获明确授权的情况下也无法读取个别用户的聊天。AI 对话历史存储在 Letta 的托管基础设施中，按用户代理隔离。'
              : "Data is stored in Supabase (PostgreSQL, hosted in regulated cloud regions) with Row-Level Security (RLS) enabled. RLS ensures you can only read and write your own data — even Symy engineers cannot read individual user chats without explicit authorization. AI conversation history is stored in Letta's managed infrastructure, isolated per user agent."}
          </p>
          <p>
            {isZh
              ? '邮件凭据（如果您连接了邮件监控）在静态存储时使用 AES-256 加密，传输中使用 TLS 1.3 加密。解密密钥的访问权限仅限少数授权服务，而非个别工程师。'
              : 'Email credentials (if you connect email monitoring) are encrypted with AES-256 at rest and TLS 1.3 in transit. Access to decryption keys is restricted to a small number of authorized services, not individual engineers.'}
          </p>
          <p>
            {isZh
              ? '身份验证令牌（会话 JWT）存储在 HTTP-only Cookie 中（而非 localStorage），以降低 XSS 风险。我们在 OAuth 中使用 Supabase Auth 的 PKCE 流程。'
              : "Authentication tokens (session JWTs) are stored in HTTP-only cookies (not localStorage) to reduce XSS risk. We use Supabase Auth's PKCE flow for OAuth."}
          </p>

          <h2 className="text-lg font-semibold text-text-primary">{isZh ? '5. 数据保留' : '5. Data Retention'}</h2>
          <p>
            {isZh
              ? '只要您的账户处于活跃状态，您的数据就会被保留。账户在 24 个月无登录活动后即视为不活跃；在删除不活跃账户前，我们会通知您。您可以随时在 设置 → 账户 中请求数据导出或账户删除。您的守护记录（挑战结果与梦想基金存入）归您所有。账户删除会在 30 天内移除您的所有数据（包括聊天记录、梦想基金、盲区地图）。部分匿名化汇总统计数据可能出于产品改进目的而被保留（例如"普通用户每月节省 $X"）—— 这些数据无法反向关联到您。'
              : 'Your data is retained as long as your account is active. An account is considered inactive after 24 months of no login activity; we will notify you before deleting inactive accounts. You can request a data export or account deletion at any time from Settings → Account. Your guardian records — challenge outcomes and Dream Fund deposits — remain yours. Account deletion removes all your data (including chat history, Dream Funds, blind-spot map) within 30 days. Some anonymized aggregate statistics may be retained for product improvement (e.g. "average user saves $X/month") — these cannot be linked back to you.'}
          </p>
          <p>
            {isZh
              ? 'Letta AI 会保留对话记忆，直至您删除账户或清除代理记忆。Sentry 会将错误事件保留 90 天，随后自动删除。'
              : 'Letta AI retains conversation memory until you delete your account or clear agent memory. Sentry retains error events for 90 days, then automatically deletes them.'}
          </p>

          <h2 className="text-lg font-semibold text-text-primary">{isZh ? '6. 您的权利（GDPR / CCPA / PIPL）' : '6. Your Rights (GDPR / CCPA / PIPL)'}</h2>
          <p>{isZh ? '根据您所在的司法管辖区（欧盟 GDPR、加州 CCPA、中国 PIPL），您有权：' : 'Depending on your jurisdiction (EU GDPR, California CCPA, China PIPL), you have the right to:'}</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>
              <strong>{isZh ? '访问' : 'Access'}</strong>
              {isZh ? ' —— 请求获取我们持有的关于您的所有数据的副本；' : ' — request a copy of all data we hold about you;'}
            </li>
            <li>
              <strong>{isZh ? '删除（"被遗忘权"）' : 'Delete ("right to be forgotten")'}</strong>
              {isZh ? ' —— 请求清除您的所有数据；' : ' — request erasure of all your data;'}
            </li>
            <li>
              <strong>{isZh ? '更正' : 'Correct'}</strong>
              {isZh ? ' —— 修正不准确的数据（例如错误的时薪、拼写错误的姓名）；' : ' — fix inaccurate data (e.g. wrong hourly rate, misspelled name);'}
            </li>
            <li>
              <strong>{isZh ? '异议' : 'Object'}</strong>
              {isZh ? ' —— 对特定处理活动（例如 AI 个性化）提出异议；' : ' — object to specific processing activities (e.g. AI personalization);'}
            </li>
            <li>
              <strong>{isZh ? '数据可携权' : 'Data portability'}</strong>
              {isZh ? ' —— 以机器可读格式（JSON）接收您的数据；' : ' — receive your data in a machine-readable format (JSON);'}
            </li>
            <li>
              <strong>{isZh ? '撤回同意' : 'Withdraw consent'}</strong>
              {isZh ? ' —— 随时撤回对邮件监控、AI 处理或营销通讯的同意。' : ' — withdraw consent for email monitoring, AI processing, or marketing communications at any time.'}
            </li>
          </ul>
          <p>
            {isZh
              ? '如需行使上述权利，请使用应用内的数据导出 / 删除工具（设置 → 账户），或发送邮件至'
              : 'To exercise these rights, use the in-app data export / deletion tools (Settings → Account) or email'}
            <a href="mailto:support@symy.ai" className="text-emerald-600 dark:text-emerald-400 hover:underline"> support@symy.ai</a>
            {isZh
              ? '。我们将在 30 天内回复已验证的请求（GDPR），或在 45 天内回复（CCPA）。'
              : '. We respond to verified requests within 30 days (GDPR) or 45 days (CCPA).'}
          </p>

          <h2 className="text-lg font-semibold text-text-primary">{isZh ? '7. Cookie 与本地存储' : '7. Cookies &amp; Local Storage'}</h2>
          <p>
            {isZh
              ? '我们使用必要的 Cookie 进行身份验证（Supabase Auth 会话令牌，以 HTTP-only Cookie 的形式存储）。我们'
              : 'We use essential cookies for authentication (Supabase Auth session tokens, stored as HTTP-only cookies). We do '}
            <strong>{isZh ? '不会' : 'not'}</strong>
            {isZh
              ? '使用跨网站识别您的第三方跟踪 Cookie、广告 Cookie 或分析 Cookie。我们将 localStorage 用于：语言偏好、主题（深色/浅色）、邀请码（直到您注册），以及连续打卡保护标记。我们不会将 localStorage 用于敏感数据。'
              : ' use third-party tracking cookies, advertising cookies, or analytics cookies that identify you across sites. We use localStorage for: language preference, theme (dark/light), referral code (until you sign up), and a streak-protected flag. We do not use localStorage for sensitive data.'}
          </p>

          <h2 className="text-lg font-semibold text-text-primary">{isZh ? "8. 儿童隐私" : "8. Children's Privacy"}</h2>
          <p>
            {isZh
              ? '本服务不面向 13 岁以下的用户（或您所在司法管辖区的数字同意年龄，例如某些欧盟国家为 14 岁）。我们不会故意收集儿童的数据。如果父母或监护人认为其子女提供了个人数据，可以发送邮件至 '
              : "The Service is not intended for users under 13 (or the age of digital consent in your jurisdiction, e.g. 14 in some EU countries). We do not knowingly collect data from children. If a parent or guardian believes their child has provided personal data, they can request immediate deletion at "}
            <a href="mailto:support@symy.ai" className="text-emerald-600 dark:text-emerald-400 hover:underline">support@symy.ai</a>
            {isZh ? '。我们将在验证后的 7 天内删除该数据。' : '. We will delete the data within 7 days of verification.'}
          </p>

          <h2 className="text-lg font-semibold text-text-primary">{isZh ? '9. 跨境数据传输' : '9. International Data Transfers'}</h2>
          <p>
            {isZh
              ? '您的数据可能在您所在国家以外的地区进行处理（例如 Supabase 服务器位于美国/欧盟、Letta AI 位于美国、GLM 位于中国）。我们仅将数据传输至具备充分数据保护法律的国家（例如欧盟充分性认定），或依据相关监管机构批准的标准合同条款（SCCs）。对于中国大陆用户，我们遵守 PIPL 的跨境传输要求。'
              : 'Your data may be processed in countries other than your own (e.g. Supabase servers in US/EU, Letta AI in US, GLM in China). We only transfer data to countries with adequate data protection laws (e.g. EU adequacy decisions) or under standard contractual clauses (SCCs) approved by the relevant regulator. For users in mainland China, we comply with PIPL cross-border transfer requirements.'}
          </p>

          <h2 className="text-lg font-semibold text-text-primary">{isZh ? '10. 第三方服务' : '10. Third-Party Services'}</h2>
          <p>{isZh ? '我们使用以下第三方服务，每项服务均有各自的隐私政策：' : 'We use the following third-party services, each with their own privacy policies:'}</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>
              <strong>{isZh ? 'Supabase' : 'Supabase'}</strong>
              {isZh ? ' —— 身份验证与数据库（数据托管于受监管区域）；' : ' — authentication and database (data hosted in regulated regions);'}
            </li>
            <li>
              <strong>{isZh ? 'Letta AI' : 'Letta AI'}</strong>
              {isZh ? ' —— AI 代理基础设施（对话记忆，按用户隔离）；' : ' — AI agent infrastructure (conversation memory, isolated per user);'}
            </li>
            <li>
              <strong>{isZh ? 'GLM / Zhipu' : 'GLM / Zhipu'}</strong>
              {isZh ? ' —— AI 模型推理（依据企业协议，不使用您的数据进行训练）；' : ' — AI model inference (no training on your data, per enterprise agreement);'}
            </li>
            <li>
              <strong>{isZh ? 'Sentry' : 'Sentry'}</strong>
              {isZh ? ' —— 错误监控（已启用 PII 清洗，保留 90 天）；' : ' — error monitoring (PII scrubbing enabled, 90-day retention);'}
            </li>
            <li>
              <strong>{isZh ? 'Vercel' : 'Vercel'}</strong>
              {isZh ? ' —— 托管与边缘网络；' : ' — hosting and edge network;'}
            </li>
            <li>
              <strong>{isZh ? 'Google APIs' : 'Google APIs'}</strong>
              {isZh
                ? '（如果您连接了 Gmail）—— 依据 Google 的 API 有限使用政策扫描邮件以提取收据。'
                : " (if you connect Gmail) — email scanning for receipts, per Google's API Limited Use policy."}
            </li>
          </ul>
          <p>{isZh ? '我们不会将您的数据出售给第三方。我们不会与广告商分享您的数据。' : 'We do not sell your data to third parties. We do not share your data with advertisers.'}</p>

          <h2 className="text-lg font-semibold text-text-primary">{isZh ? '11. 数据泄露通知' : '11. Data Breach Notification'}</h2>
          <p>
            {isZh
              ? '一旦发生可能危及您的权利或自由的数据泄露，我们将根据 GDPR 第 34 条，在意识到泄露后的 72 小时内通过邮件通知您。在需要时，我们还将通知相关数据保护机构。'
              : 'In the event of a data breach that poses a risk to your rights or freedoms, we will notify you via email within 72 hours of becoming aware of the breach, in accordance with GDPR Article 34. We will also notify the relevant data protection authority where required.'}
          </p>

          <h2 className="text-lg font-semibold text-text-primary">{isZh ? '12. 本政策的变更' : '12. Changes to This Policy'}</h2>
          <p>
            {isZh
              ? '我们可能会不时更新本隐私政策。重大变更（例如新增数据收集、新增第三方处理者，或保留期限的变更）将在生效前至少 30 天通过邮件或应用内通知告知您。非重大变更（例如澄清说明、联系信息更新）自发布之日起立即生效。'
              : 'We may update this Privacy Policy from time to time. Material changes (such as new data collection, new third-party processors, or changes to retention) will be notified via email or in-app notification at least 30 days before the changes take effect. Non-material changes (e.g. clarifications, contact info updates) take effect immediately upon posting.'}
          </p>

          <h2 className="text-lg font-semibold text-text-primary">{isZh ? '13. 联系我们' : '13. Contact'}</h2>
          <p>
            {isZh ? '对隐私有疑问？请发送邮件至 ' : 'Questions about privacy? Email us at '}
            <a href="mailto:support@symy.ai" className="text-emerald-600 dark:text-emerald-400 hover:underline">support@symy.ai</a>
            {isZh
              ? '。对于欧盟/英国的数据保护事宜，您有权向当地数据保护机构提出投诉。'
              : '. For EU/UK data protection inquiries, you have the right to lodge a complaint with your local data protection authority.'}
          </p>
        </div>
        <div className="mt-8 rounded-2xl border border-emerald-500/20 bg-emerald-500/20 p-5 text-center">
          <p className="text-sm text-text-secondary">
            {isZh ? '守护你的钱包，也守护你的注意力——少买一点，多活一点。' : 'Guard your wallet and your attention — buy a little less, live a little more.'}
          </p>
          <div className="mt-3 flex flex-col items-center gap-2">
            <a
              href={`/${locale}`}
              className="inline-flex items-center rounded-full border border-emerald-500/20 bg-emerald-500/20 px-4 py-2 text-sm font-semibold text-emerald-600 dark:text-emerald-400"
            >
              {isZh ? '认识小象 Symy 🐘' : 'Meet Symy 🐘'}
            </a>
            <p className="text-xs text-text-tertiary">
              {isZh ? '你的数据随时可导出——在 设置 → 账户 导出。' : 'Your data is exportable anytime — export it from Settings → Account.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
