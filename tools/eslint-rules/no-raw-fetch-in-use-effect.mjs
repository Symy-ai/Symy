// @ts-check
// Rule: no-raw-fetch-in-use-effect
// Prevents: F2 — hooks firing API calls before auth ready (401 storm)
//
// Forbids `apiFetch(...)` or `fetch(...)` directly inside a `useEffect` callback.
// All network reads must go through `useQuery` (which supports `enabled` gating).
// All network writes must go through `useMutation` (which has built-in pending state).
//
// Allowed escape hatch: `// eslint-disable-next-line symy/no-raw-fetch-in-use-effect`
// with a comment explaining why (e.g., analytics beacon that must fire on mount).

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Forbid raw fetch/apiFetch inside useEffect — use useQuery/useMutation instead (prevents F2: 401 storm on cold load)',
      category: 'Architecture',
      recommended: true,
    },
    schema: [
      {
        type: 'object',
        properties: {
          allowedPatterns: {
            type: 'array',
            items: { type: 'string' },
            description: 'Regex patterns of URLs allowed in useEffect (e.g., analytics)',
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      noFetchInEffect:
        'Do not call {{fn}} inside useEffect. Use useQuery (for reads) or useMutation (for writes) instead. ' +
        'This prevents the "hook fires before auth ready" bug class (F2: 401 storm on cold load). ' +
        'If this is a legitimate exception (e.g., analytics beacon), add: ' +
        '// eslint-disable-next-line symy/no-raw-fetch-in-use-effect',
    },
  },

  create(context) {
    const options = context.options[0] || {};
    const allowedPatterns = (options.allowedPatterns || []).map(p => new RegExp(p));
    const _sourceCode = context.getSourceCode();

    function isAllowed(url) {
      if (!url) return false;
      return allowedPatterns.some(re => re.test(url));
    }

    // Track whether we're inside a useEffect call
    let useEffectDepth = 0;

    function isUseEffectCall(node) {
      // Match: useEffect(...) or React.useEffect(...)
      const callee = node.callee;
      if (!callee) return false;
      if (callee.type === 'Identifier' && callee.name === 'useEffect') return true;
      if (callee.type === 'MemberExpression' &&
          callee.property?.name === 'useEffect' &&
          (callee.object?.name === 'React' || callee.object?.name === 'preactCompat')) return true;
      return false;
    }

    function isFetchCall(node) {
      const callee = node.callee;
      if (!callee) return false;
      // Direct: fetch(...)
      if (callee.type === 'Identifier' && (callee.name === 'fetch' || callee.name === 'apiFetch' || callee.name === 'apiFetchVoid')) {
        return callee.name;
      }
      // Method: xxx.fetch(...) — skip, not our concern
      return false;
    }

    return {
      CallExpression(node) {
        // If this is a useEffect call, increment depth for the duration of its arguments
        if (isUseEffectCall(node)) {
          useEffectDepth++;
          return;
        }

        // If we're inside a useEffect's callback, check for fetch calls
        if (useEffectDepth > 0) {
          const fnName = isFetchCall(node);
          if (fnName) {
            // Get the URL argument
            const urlArg = node.arguments[0];
            let urlValue = null;
            if (urlArg) {
              if (urlArg.type === 'Literal' && typeof urlArg.value === 'string') {
                urlValue = urlArg.value;
              } else if (urlArg.type === 'TemplateLiteral') {
                urlValue = urlArg.quasis?.[0]?.value?.cooked;
              }
            }
            if (!isAllowed(urlValue)) {
              context.report({
                node,
                messageId: 'noFetchInEffect',
                data: { fn: fnName },
              });
            }
          }
        }
      },

      'CallExpression:exit'(node) {
        if (isUseEffectCall(node)) {
          useEffectDepth--;
        }
      },
    };
  },
};

export default rule;
