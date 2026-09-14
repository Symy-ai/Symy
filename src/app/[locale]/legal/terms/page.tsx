import { Metadata } from 'next';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const isZh = locale === 'zh';

  return {
    title: isZh ? '服务条款 — Symy' : 'Terms of Service — Symy',
    description: isZh ? 'Symy 服务条款' : 'Symy Terms of Service',
    alternates: { canonical: '/legal/terms' },
  };
}

export default async function TermsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const isZh = locale === 'zh';

  return (
    <div className="min-h-screen bg-surface-outer px-4 py-12">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-text-primary mb-2">{isZh ? '服务条款' : 'Terms of Service'}</h1>
        <p className="text-sm text-emerald-600 dark:text-emerald-400 font-medium mb-2">
          {isZh ? 'Symy 只对你负责——消费者一侧，永远。' : 'Symy answers to you — the consumer, always.'}
        </p>
        <p className="text-xs text-text-tertiary italic mb-6">
          {isZh
            ? '最后更新：September 6, 2026。Symy 由 Symbiotic Lab 开发（Symbiotic Lab 是 Symy 的开发主体，与任何商家、平台无利益关系）。本条款约束您对本服务的使用 —— 请仔细阅读。'
            : 'Last updated: September 6, 2026. Symy is built by Symbiotic Lab (Symbiotic Lab builds Symy and has no financial ties to any merchant or platform). These Terms govern your use of the Service — please read them carefully.'}
        </p>
        <div className="prose prose-sm dark:prose-invert max-w-none text-text-secondary space-y-4">
          <h2 className="text-lg font-semibold text-text-primary">{isZh ? '1. 条款的接受' : '1. Acceptance of Terms'}</h2>
          <p>
            {isZh
              ? '创建账户、登录或使用 Symy（"本服务"），即表示您同意受本服务条款的约束。如果您不同意，请不要使用本服务。如果您代表组织使用本服务，您声明您有权使该组织受本条款约束。'
              : 'By creating an account, logging in, or using Symy ("the Service"), you agree to be bound by these Terms of Service. If you do not agree, please do not use the Service. If you are using the Service on behalf of an organization, you represent that you have authority to bind that organization to these Terms.'}
          </p>

          <h2 className="text-lg font-semibold text-text-primary">{isZh ? '2. 服务说明' : '2. Description of Service'}</h2>
          <p>
            {isZh
              ? 'Symy 是一款 AI 伙伴，帮助您以生命时间来衡量购物的真实成本，并在消费决策时刻把好绿色关。本服务包括与 AI 伙伴的聊天互动、消费反思、绿色替代与复用优先建议、游戏化的守护挑战、可选的邮件收据监控（如果您连接了邮箱账户），以及社区守护功能。Symy 是一款教育与反思工具 —— 它不是财务顾问、心理治疗师或医疗服务。'
              : "Symy is an AI companion that helps you reflect on the real cost of purchases in terms of your life's time and hold the green gate at moments of decision. The Service includes chat interactions with an AI companion, spending reflections, green alternative and reuse-first suggestions, gamified guardian challenges, optional email receipt monitoring (if you connect an email account), and community guardian features. Symy is an educational and reflective tool — it is not a financial advisor, therapist, or medical service."}
          </p>

          <h2 className="text-lg font-semibold text-text-primary">{isZh ? '3. 非财务、法律或医疗建议' : '3. Not Financial, Legal, or Medical Advice'}</h2>
          <p>
            {isZh
              ? '本服务不提供投资、税务、法律、医疗或心理治疗方面的建议。AI 生成的反思、故事和回复仅供教育与反思之用，可能存在不准确之处。无论本服务向您展示何种 AI 建议、反思或规律，您都需对自己的决策负责。在做出财务、法律或医疗决策之前，请务必咨询合格的专业人士。'
              : 'The Service does not provide investment, tax, legal, medical, or therapeutic advice. AI-generated reflections, stories, and responses are for educational and reflective purposes only and may contain inaccuracies. You are responsible for your own decisions, regardless of any AI suggestion, reflection, or pattern the Service shows you. Always consult a qualified professional before making financial, legal, or medical decisions.'}
          </p>

          <h2 className="text-lg font-semibold text-text-primary">{isZh ? '4. 用户账户与资格' : '4. User Accounts &amp; Eligibility'}</h2>
          <p>
            {isZh
              ? '您必须年满 13 岁（或您所在司法管辖区的数字同意年龄）才能使用本服务。如果您未满 18 岁，您声明您的父母或法定监护人已代表您审阅并同意本条款。您有责任对您的账户凭据保密，并对您账户下的所有活动负责。如果您认为账户已被盗用，请立即通过 support@symy.ai 联系我们。'
              : 'You must be at least 13 years old (or the age of digital consent in your jurisdiction) to use the Service. If you are under 18, you represent that your parent or legal guardian has reviewed and agreed to these Terms on your behalf. You are responsible for maintaining the confidentiality of your account credentials and for all activity under your account. If you believe your account has been compromised, contact us immediately at support@symy.ai.'}
          </p>

          <h2 className="text-lg font-semibold text-text-primary">{isZh ? '5. 用户数据与隐私' : '5. User Data &amp; Privacy'}</h2>
          <p>
            {isZh
              ? '我们按照隐私政策中所述处理您的数据。您需对所提供信息的准确性负责。您可以随时请求数据导出或账户删除 —— 详情请参阅隐私政策。'
              : 'We process your data as described in our Privacy Policy. You are responsible for the accuracy of the information you provide. You may request data export or account deletion at any time — see the Privacy Policy for details.'}
          </p>

          <h2 className="text-lg font-semibold text-text-primary">{isZh ? '6. 可接受的使用' : '6. Acceptable Use'}</h2>
          <p>{isZh ? '您同意不会：' : 'You agree not to:'}</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>{isZh ? '通过本服务滥用、骚扰、威胁或恐吓其他用户、Symy 员工或任何人；' : 'Abuse, harass, threaten, or intimidate other users, Symy staff, or any person through the Service;'}</li>
            <li>{isZh ? '试图对本服务进行逆向工程、反编译、反汇编，或以其他方式从本服务中衍生源代码；' : 'Attempt to reverse-engineer, decompile, disassemble, or otherwise derive source code from the Service;'}</li>
            <li>{isZh ? '破坏、使过载或干扰本服务的服务器、网络或 API；' : "Disrupt, overload, or interfere with the Service's servers, networks, or APIs;"}</li>
            <li>{isZh ? '将本服务用于任何非法目的，包括洗钱、欺诈或违反金融法规；' : 'Use the Service for any illegal purpose, including money laundering, fraud, or violating financial regulations;'}</li>
            <li>{isZh ? '分享、出售或转让您的账户凭据，或试图访问其他用户的账户；' : "Share, sell, or transfer your account credentials or attempt to access another user's account;"}</li>
            <li>{isZh ? '通过聊天或邮件监控提交恶意、欺骗性或有害内容（包括恶意软件或钓鱼链接）；' : 'Submit malicious, deceptive, or harmful content (including malware or phishing links) through the chat or email monitor;'}</li>
            <li>{isZh ? '使用自动化脚本、机器人或爬虫访问本服务，除非通过我们公开文档中所列的 API。' : 'Use automated scripts, bots, or scrapers to access the Service except through our publicly documented APIs.'}</li>
          </ul>

          <h2 className="text-lg font-semibold text-text-primary">{isZh ? '7. AI 生成的内容' : '7. AI-Generated Content'}</h2>
          <p>
            {isZh
              ? '本服务使用第三方 AI 提供商（例如 Letta AI 和 GLM / Zhipu）来生成反思、故事和回复。AI 生成的内容可能包含错误、遗漏，或不反映 Symy 理念的输出。我们不保证 AI 生成内容的准确性、完整性或可靠性。您有责任在依据任何 AI 输出采取行动前对其进行评估。对于您基于 AI 生成内容所做的决策，Symy 不承担责任。'
              : "The Service uses third-party AI providers (such as Letta AI and GLM / Zhipu) to generate reflections, stories, and responses. AI-generated content may contain errors, omissions, or outputs that do not reflect Symy's philosophy. We do not guarantee the accuracy, completeness, or reliability of AI-generated content. You are responsible for evaluating any AI output before acting on it. Symy is not liable for decisions you make based on AI-generated content."}
          </p>

          <h2 className="text-lg font-semibold text-text-primary">{isZh ? '8. 邮件监控（可选功能）' : '8. Email Monitoring (Optional Feature)'}</h2>
          <p>
            {isZh
              ? '如果您选择连接邮箱账户以进行收据扫描，即授予本服务有限的权限，以扫描与购物相关的邮件（例如订单确认、收据和退款通知）。邮件凭据在传输和静态存储时均经过加密。我们不会阅读与购物无关的邮件，也不会出售或与第三方分享邮件内容。您可以随时在设置中断开邮件监控，这将撤销本服务对您邮箱账户的访问权限。'
              : "If you choose to connect an email account for receipt scanning, you grant the Service limited access to scan for purchase-related emails (such as order confirmations, receipts, and refund notices). Email credentials are encrypted in transit and at rest. We do not read emails unrelated to purchases, and we do not sell or share email content with third parties. You may disconnect email monitoring at any time from Settings, which revokes the Service's access to your email account."}
          </p>

          <h2 className="text-lg font-semibold text-text-primary">{isZh ? '9. 高级订阅（推出时）' : '9. Premium Subscription (When Available)'}</h2>
          <p>
            {isZh
              ? '部分功能可能需要付费的高级订阅（"Premium"）。Premium 按月或按年提供。费用预先计费，除法律规定外不予退还。您可以随时取消 Premium；取消在当前计费周期结束时生效。我们可能会在下一个计费周期前至少提前 30 天通知以调整 Premium 定价。免费层级的功能仍可免费使用。'
              : 'Some features may require a paid Premium subscription ("Premium"). Premium is offered on a monthly or annual basis. Fees are billed in advance and are non-refundable except as required by law. You may cancel Premium at any time; cancellation takes effect at the end of the current billing period. We may change Premium pricing with at least 30 days\' notice before the next billing cycle. Free-tier features remain available without charge.'}
          </p>

          <h2 className="text-lg font-semibold text-text-primary">{isZh ? '10. 知识产权' : '10. Intellectual Property'}</h2>
          <p>
            {isZh
              ? '本服务的软件、设计、品牌和内容（不包括用户生成的内容以及针对您输入的 AI 生成回复）归 Symbiotic Lab 所有，并受相关知识产权法保护。我们授予您有限的、非排他的、不可转让的许可，供您出于个人非商业目的使用本服务。您保留您所提交内容（例如聊天消息和反思）的所有权。'
              : "The Service's software, design, branding, and content (excluding user-generated content and AI-generated responses to your inputs) are owned by Symbiotic Lab and protected by applicable intellectual property laws. We grant you a limited, non-exclusive, non-transferable license to use the Service for personal, non-commercial use. You retain ownership of content you submit (such as chat messages and reflections)."}
          </p>

          <h2 className="text-lg font-semibold text-text-primary">{isZh ? '11. 责任限制' : '11. Limitation of Liability'}</h2>
          <p>
            {isZh
              ? '在法律允许的最大范围内，本服务以"现状"和"可用"基础提供，不附带任何形式的明示或暗示保证，包括但不限于适销性、特定用途适用性或不侵权的保证。对于因您使用本服务而产生的任何间接、附带、特殊、后果性或惩罚性损害，或任何利润或收入损失，Symbiotic Lab 概不负责。对于因本条款或本服务引起的任何索赔，我们的总责任以您在过去 12 个月内向我们支付的金额为限（或 $50 USD，以较大者为准）。'
              : 'To the maximum extent permitted by law, the Service is provided "as is" and "as available" without warranties of any kind, express or implied, including but not limited to merchantability, fitness for a particular purpose, or non-infringement. Symbiotic Lab is not liable for any indirect, incidental, special, consequential, or punitive damages, or any loss of profits or revenues, arising from your use of the Service. Our total liability for any claim arising from these Terms or the Service is limited to the amount you paid us in the past 12 months (or $50 USD, whichever is greater).'}
          </p>

          <h2 className="text-lg font-semibold text-text-primary">{isZh ? '12. 赔偿' : '12. Indemnification'}</h2>
          <p>
            {isZh
              ? '您同意就因您违反本条款、滥用本服务，或违反任何法律或第三方权利而产生的任何索赔、损害、损失或费用（包括合理的律师费），赔偿 Symbiotic Lab 及其关联方并使其免受损害。'
              : "You agree to indemnify and hold harmless Symbiotic Lab and its affiliates from any claims, damages, losses, or expenses (including reasonable attorneys' fees) arising from your violation of these Terms, your misuse of the Service, or your violation of any law or third-party rights."}
          </p>

          <h2 className="text-lg font-semibold text-text-primary">{isZh ? '13. 账户终止' : '13. Account Termination'}</h2>
          <p>
            {isZh
              ? '您可以随时在设置中删除您的账户。如果您违反本条款、法律要求我们这样做，或我们停止提供本服务，我们可能会暂停或终止您的账户。账户终止后，您使用本服务的权利立即结束。我们将按隐私政策中所述保留您的数据（通常在账户删除后 30 天内删除）。'
              : 'You may delete your account at any time from Settings. We may suspend or terminate your account if you violate these Terms, if we are required to do so by law, or if we discontinue the Service. Upon termination, your right to use the Service ends immediately. We will retain your data as described in the Privacy Policy (typically deleted within 30 days of account deletion).'}
          </p>

          <h2 className="text-lg font-semibold text-text-primary">{isZh ? '14. 条款的变更' : '14. Changes to Terms'}</h2>
          <p>
            {isZh
              ? '我们可能会不时更新本条款。对于重大变更（例如费用、责任或数据惯例的变更），我们将在生效前至少 30 天通过邮件或应用内通知告知您。在生效日期后继续使用本服务，即视为接受更新后的条款。如果您不同意更新后的条款，可以按照第 13 条所述删除您的账户。'
              : 'We may update these Terms from time to time. For material changes (such as changes to fees, liability, or data practices), we will notify you via email or in-app notification at least 30 days before the changes take effect. Continued use of the Service after the effective date constitutes acceptance of the updated Terms. If you do not agree to the updated Terms, you may delete your account as described in Section 13.'}
          </p>

          <h2 className="text-lg font-semibold text-text-primary">{isZh ? '15. 适用法律与争议' : '15. Governing Law &amp; Disputes'}</h2>
          <p>
            {isZh
              ? '本条款受中华人民共和国法律（适用于中国大陆用户）以及 Symbiotic Lab 注册所在司法管辖区的法律（适用于中国大陆以外用户）管辖，不考虑法律冲突原则。您与 Symbiotic Lab 同意在提起法律程序前，先尝试通过非正式方式解决任何争议至少 30 天。'
              : "These Terms are governed by the laws of the People's Republic of China (for users in mainland China) and the laws of the jurisdiction where Symbiotic Lab is registered (for users outside mainland China), without regard to conflict-of-law principles. You and Symbiotic Lab agree to attempt to resolve any dispute informally for at least 30 days before initiating legal proceedings."}
          </p>

          <h2 className="text-lg font-semibold text-text-primary">{isZh ? '16. 联系我们' : '16. Contact'}</h2>
          <p>
            {isZh ? '对本条款有疑问？请发送邮件至 ' : 'Questions about these Terms? Email us at '}
            <a href="mailto:support@symy.ai" className="text-emerald-600 dark:text-emerald-400 hover:underline">support@symy.ai</a>
            {isZh ? '。' : '.'}
          </p>
        </div>
        <div className="mt-8 rounded-2xl border border-emerald-500/20 bg-emerald-500/20 p-5 text-center">
          <p className="text-sm text-text-secondary">
            {isZh ? '守护你的钱包，也守护你的注意力——少买一点，多活一点。' : 'Guard your wallet and your attention — buy a little less, live a little more.'}
          </p>
          <a
            href={`/${locale}`}
            className="mt-3 inline-flex items-center rounded-full border border-emerald-500/20 bg-emerald-500/20 px-4 py-2 text-sm font-semibold text-emerald-600 dark:text-emerald-400"
          >
            {isZh ? '认识小象 Symy 🐘' : 'Meet Symy 🐘'}
          </a>
        </div>
      </div>
    </div>
  );
}
