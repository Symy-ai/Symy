// @ts-check
// Rule: no-warn-only-catch
// Prevents: F8 — swallowed errors (catch blocks that only logger.warn and continue)
//
// Flags catch blocks whose body is ONLY a logger.warn() call with no:
//   - rethrow
//   - user feedback (toast, setError, showAuthPrompt)
//   - recovery logic (setQueryData, invalidateQueries, retry, rollback)
//   - explicit "safe to ignore" comment
//
// This prevents silent failure patterns where the user clicks something,
// nothing happens, and the only trace is a console warning.

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Flag catch blocks that only call logger.warn without rethrow/feedback/recovery (prevents F8: swallowed errors)',
      category: 'Architecture',
      recommended: true,
    },
    schema: [
      {
        type: 'object',
        properties: {
          loggerNames: {
            type: 'array',
            items: { type: 'string' },
            description: 'Logger object names (default: ["logger", "console"])',
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      warnOnlyCatch:
        'Catch block only calls logger.warn without rethrowing, showing user feedback, or recovering state. ' +
        'This silently swallows errors (F8). Either: (a) rethrow, (b) show a toast/setError, ' +
        '(c) add recovery logic (invalidateQueries/rollback), or (d) add a comment explaining ' +
        'why this is safe to ignore: // safe to ignore: <reason>',
    },
  },

  create(context) {
    const options = context.options[0] || {};
    const loggerNames = options.loggerNames || ['logger', 'console'];
    const sourceCode = context.getSourceCode();

    function isLoggerWarnCall(node) {
      if (node?.type !== 'CallExpression') return false;
      const callee = node.callee;
      if (callee?.type === 'MemberExpression') {
        const objectName = callee.object?.name;
        const methodName = callee.property?.name;
        return loggerNames.includes(objectName) && (methodName === 'warn' || methodName === 'error' || methodName === 'info');
      }
      return false;
    }

    function hasUserFeedback(bodySource) {
      return /\b(toast|setError|setErrorMessage|showError|showAuthPrompt|onToast|notify|throw\b|setHealthEventsError|setIsError)/.test(bodySource);
    }

    function hasRecoveryLogic(bodySource) {
      return /\b(setQueryData|invalidateQueries|retry|recover|fallback|rollback|prev\b|previousState|cancelQueries|refetch)/.test(bodySource);
    }

    function hasIgnoreComment(node) {
      const comments = sourceCode.getCommentsInside(node);
      return comments.some(c =>
        /safe.to.ignore|expected|known|non-critical|non-blocking|fail.silent|silent/i.test(c.value)
      );
    }

    return {
      CatchClause(node) {
        const body = node.body;
        if (!body || body.type !== 'BlockStatement') return;

        const statements = body.body;
        if (statements.length === 0) return; // empty catch — separate rule

        // Check if ALL statements are either:
        // (a) logger.warn/error/info calls
        // (b) return statements with trivial values
        // (c) simple assignments to refs (e.g., ref.current = false)
        const isWarnOnly = statements.every(stmt => {
          if (stmt.type === 'ExpressionStatement') {
            return isLoggerWarnCall(stmt.expression);
          }
          if (stmt.type === 'ReturnStatement') {
            return true; // return 'error' or similar trivial returns are part of warn-only
          }
          if (stmt.type === 'ExpressionStatement' && stmt.expression?.type === 'AssignmentExpression') {
            // Allow simple ref resets like: isPending.current = false
            const left = stmt.expression.left;
            if (left?.type === 'MemberExpression' && left.property?.name === 'current') {
              return true;
            }
          }
          return false;
        });

        if (!isWarnOnly) return;

        // Check for explicit "safe to ignore" comment
        if (hasIgnoreComment(body)) return;

        // Get the body source to check for feedback/recovery
        const bodySource = sourceCode.getText(body);
        if (hasUserFeedback(bodySource)) return;
        if (hasRecoveryLogic(bodySource)) return;

        context.report({
          node,
          messageId: 'warnOnlyCatch',
        });
      },
    };
  },
};
