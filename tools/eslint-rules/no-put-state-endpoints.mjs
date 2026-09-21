// @ts-check
// Rule: no-put-state-endpoints
// Prevents: F3 — optimistic concurrency conflicts from PUT /api/*/state
//
// Forbids `apiFetch("/api/.../state", { method: "PUT", ... })` patterns.
// Forces use of delta RPCs (e.g., apply_buddy_state_delta) which handle
// versioning atomically server-side.

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Forbid PUT to /api/*/state endpoints — use delta RPCs instead (prevents F3: optimistic concurrency 409)',
      category: 'Architecture',
      recommended: true,
    },
    schema: [
      {
        type: 'object',
        properties: {
          allowedStateEndpoints: {
            type: 'array',
            items: { type: 'string' },
            description: 'URL patterns allowed for PUT (e.g., "user/onboarding")',
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      noPutState:
        'PUT to /api/{{url}} causes optimistic concurrency 409 conflicts (F3). ' +
        'Use a delta RPC (e.g., apply_buddy_state_delta) instead — the RPC handles ' +
        'versioning atomically server-side. If this is a legitimate exception, add: ' +
        '// eslint-disable-next-line symy/no-put-state-endpoints',
    },
  },

  create(context) {
    const options = context.options[0] || {};
    const allowed = (options.allowedStateEndpoints || []).map(p => new RegExp(p));

    function isAllowed(url) {
      return allowed.some(re => re.test(url));
    }

    function isNetworkCall(node) {
      const callee = node.callee;
      if (!callee) return false;
      if (callee.type === 'Identifier') {
        return ['fetch', 'apiFetch', 'apiFetchVoid'].includes(callee.name);
      }
      return false;
    }

    return {
      CallExpression(node) {
        const fnName = isNetworkCall(node);
        if (!fnName) return;

        // Get URL argument
        const urlArg = node.arguments[0];
        if (!urlArg) return;

        let urlValue = null;
        if (urlArg.type === 'Literal' && typeof urlArg.value === 'string') {
          urlValue = urlArg.value;
        } else if (urlArg.type === 'TemplateLiteral') {
          urlValue = urlArg.quasis?.[0]?.value?.cooked;
        }
        if (!urlValue || typeof urlValue !== 'string') return;

        // Must end with /state or contain /state? or /state/
        if (!/\/state([?\/]|$)/.test(urlValue)) return;

        // Check if method is PUT (in options object — second arg)
        const optsArg = node.arguments[1];
        if (!optsArg || optsArg.type !== 'ObjectExpression') return;

        const methodProp = optsArg.properties.find(p =>
          p.type === 'Property' && (p.key?.name === 'method' || p.key?.value === 'method')
        );
        if (!methodProp) return;

        const methodValue = methodProp.value?.value;
        if (methodValue !== 'PUT') return;

        if (isAllowed(urlValue)) return;

        context.report({
          node,
          messageId: 'noPutState',
          data: { url: urlValue },
        });
      },
    };
  },
};

export default rule;
