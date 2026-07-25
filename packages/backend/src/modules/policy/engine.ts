import { z } from "zod";

export const ConditionSchema = z.object({
  type: z.enum(["LESS_THAN", "GREATER_THAN", "EQUAL", "INCLUDE", "NOT_INCLUDE", "REGEX_MATCH", "BEFORE", "AFTER", "WINDOW"]),
  field: z.string(),
  value: z.union([z.string(), z.number()]).optional(),
  values: z.array(z.union([z.string(), z.number()])).optional(),
});

export const LegacyPolicyRuleSchema = z.object({
  effect: z.enum(["EFFECT_ALLOW", "EFFECT_DENY"]),
  conditions: z.array(ConditionSchema).optional(),
  consensus: z.enum(["ANY", "ALL", "REQUIRES_CONSENSUS"]).default("ANY"),
});

export const TurnkeyPolicyRuleSchema = z.object({
  effect: z.enum(["EFFECT_ALLOW", "EFFECT_DENY"]),
  conditions: z.object({
    condition: z.string().optional(),
    isTurnkey: z.literal(true),
    description: z.string().optional(),
  }),
  consensus: z.string().optional(),
});

export const PolicyRuleSchema = z.union([
  LegacyPolicyRuleSchema,
  TurnkeyPolicyRuleSchema,
]);

export type PolicyRule = z.infer<typeof PolicyRuleSchema>;
export type Condition = z.infer<typeof ConditionSchema>;

export interface EvaluationContext {
  params: Record<string, unknown>;
  user?: { id: string; role: string; tags: string[]; email?: string };
  wallet?: { id: string; ownerId: string; ownerType: string; tags?: string[] };
  activity?: { resource?: string; action?: string; type?: string; kind?: string };
  credential?: { type?: string; id?: string };
  credentials?: Array<{ type?: string; id?: string }>;
  eth?: { tx?: { to?: string; data?: string; value?: number; chain_id?: number; function_name?: string; function_signature?: string; from?: string; contract_call_args?: Record<string, string> } };
  contractInterface?: { functions?: Array<{ name: string; signature: string }> };
  timestamp?: number;
}

export interface EvaluationResult {
  allowed: boolean;
  requiresConsensus: boolean;
  matchedPolicyId?: string;
  reason?: string;
}

function compareValues(a: any, b: any): boolean {
  if (typeof a === "number" && typeof b === "number") return a === b;
  if (typeof a === "boolean" && typeof b === "boolean") return a === b;
  return String(a) === String(b);
}

function compareLargeNumbers(a: any, b: any): number {
  const aNum = Number(a);
  const bNum = Number(b);
  if (Number.isSafeInteger(aNum) && Number.isSafeInteger(bNum)) {
    return aNum - bNum;
  }
  try {
    const aBig = BigInt(typeof a === "string" ? a : String(a));
    const bBig = BigInt(typeof b === "string" ? b : String(b));
    if (aBig < bBig) return -1;
    if (aBig > bBig) return 1;
    return 0;
  } catch {
    return aNum - bNum;
  }
}

function isSafeRegex(pattern: string): boolean {
  if (pattern.length > 256) return false;
  if (/(?:\*\+|\+\*|\+\+|\*\*|\{\d+,\}\{|\{\d+,\}[*+])/.test(pattern)) return false;
  if (/(?:\(.*(\*|\+|\{\d+,\})\).*(\*|\+|\{\d+,\}))/.test(pattern)) return false;
  return true;
}

function evaluateCondition(condition: Condition, context: EvaluationContext): boolean {
  const fieldValue = resolveFieldPath(condition.field, context);
  const now = context.timestamp || Date.now();

  switch (condition.type) {
    case "LESS_THAN":
      return Number(fieldValue) < Number(condition.value);
    case "GREATER_THAN":
      return Number(fieldValue) > Number(condition.value);
    case "EQUAL":
      return String(fieldValue) === String(condition.value);
    case "INCLUDE":
      if (!condition.values) return false;
      if (Array.isArray(fieldValue)) {
        return fieldValue.some((v) => condition.values!.includes(String(v)));
      }
      return condition.values.includes(String(fieldValue));
    case "NOT_INCLUDE":
      if (!condition.values) return false;
      if (Array.isArray(fieldValue)) {
        return !fieldValue.some((v) => condition.values!.includes(String(v)));
      }
      return !condition.values.includes(String(fieldValue));
    case "REGEX_MATCH": {
      const pattern = String(condition.value);
      if (!isSafeRegex(pattern)) return false;
      try {
        return new RegExp(pattern).test(String(fieldValue));
      } catch {
        return false;
      }
    }
    case "BEFORE":
      return now < new Date(String(condition.value)).getTime();
    case "AFTER":
      return now > new Date(String(condition.value)).getTime();
    case "WINDOW": {
      if (!condition.values || condition.values.length !== 2) return false;
      const start = new Date(String(condition.values[0])).getTime();
      const end = new Date(String(condition.values[1])).getTime();
      return now >= start && now <= end;
    }
    default:
      return false;
  }
}

function resolveFieldPath(path: string, context: EvaluationContext): unknown {
  const parts = path.split(".");
  let value: unknown = context;
  for (const part of parts) {
    if (value && typeof value === "object") {
      value = (value as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return value;
}

export function evaluateCel(expression: string, context: EvaluationContext): any {
  const tokens = tokenize(expression);
  let pos = 0;

  function tokenize(str: string): string[] {
    const regex = /"([^"\\]|\\.)*"|'([^'\\]|\\.)*'|\d+|\b[a-zA-Z_][a-zA-Z0-9_]*\b|==|!=|>=|<=|>|<|&&|\|\||[\[\]\(\),\.]/g;
    const matches = [];
    let match;
    while ((match = regex.exec(str)) !== null) {
      matches.push(match[0]);
    }
    return matches;
  }

  function peek() {
    return tokens[pos];
  }

  function consume(expected?: string) {
    const t = tokens[pos++];
    if (expected && t !== expected) {
      throw new Error(`Expected ${expected} but got ${t}`);
    }
    return t;
  }

  function parseLogicalOr(ctx: any): any {
    let left = parseLogicalAnd(ctx);
    while (peek() === "||") {
      consume();
      const right = parseLogicalAnd(ctx);
      left = left || right;
    }
    return left;
  }

  function parseLogicalAnd(ctx: any): any {
    let left = parseComparison(ctx);
    while (peek() === "&&") {
      consume();
      const right = parseComparison(ctx);
      left = left && right;
    }
    return left;
  }

  function parseComparison(ctx: any): any {
    const left = parseExpression(ctx);
    const op = peek();
    if (op === "in") {
      consume();
      const right = parseExpression(ctx);
      if (Array.isArray(right)) return right.map(String).includes(String(left));
      return false;
    }
    if (["==", "!=", ">=", "<=", ">", "<"].includes(op)) {
      consume();
      const right = parseExpression(ctx);
      if (op === "==") return compareValues(left, right);
      if (op === "!=") return !compareValues(left, right);
      if (op === ">=") return compareLargeNumbers(left, right) >= 0;
      if (op === "<=") return compareLargeNumbers(left, right) <= 0;
      if (op === ">") return compareLargeNumbers(left, right) > 0;
      if (op === "<") return compareLargeNumbers(left, right) < 0;
    }
    return left;
  }

  function parseExpression(ctx: any): any {
    const token = peek();
    if (!token) return undefined;

    if (token.startsWith("'") || token.startsWith('"')) {
      consume();
      return token.slice(1, -1);
    }

    if (/^\d+$/.test(token)) {
      consume();
      return parseInt(token, 10);
    }

    if (token === "(") {
      consume();
      const val = parseLogicalOr(ctx);
      consume(")");
      return val;
    }

    consume();
    let val = resolveValue(token, ctx);

    while (pos < tokens.length && (peek() === "(" || peek() === "." || peek() === "[")) {
      if (peek() === "[") {
        consume();
        const keyToken = consume(); // quoted string 'key' or "key"
        consume("]");
        const key = keyToken.startsWith("'") || keyToken.startsWith('"')
          ? keyToken.slice(1, -1)
          : keyToken;
        val = val?.[key];
      } else if (peek() === "(") {
        consume();
        consume(")");
      } else {
        consume();
        const method = consume();
        if (peek() === "(") {
          consume();
          const argTokens: string[] = [];
          let depth = 1;
          while (pos < tokens.length) {
            const t = tokens[pos];
            if (t === "(") depth++;
            if (t === ")") {
              depth--;
              if (depth === 0) {
                pos++;
                break;
              }
            }
            argTokens.push(t);
            pos++;
          }
          val = executeMethod(val, method, argTokens, ctx);
        } else {
          val = val?.[method];
        }
      }
    }

    return val;
  }

  function resolveValue(path: string, ctx: any): any {
    if (path === "activity") return ctx.activity;
    if (path === "credential") return ctx.credential;
    if (path === "credentials") return ctx.credentials || (ctx.credential ? [ctx.credential] : []);
    if (path === "wallet") return ctx.wallet;
    if (path === "user") return ctx.user;
    if (path === "eth") return ctx.eth;
    if (path === "approvers") return ctx.user ? [ctx.user] : [];

    const parts = path.split(".");
    let current = ctx;
    for (const p of parts) {
      if (current === undefined || current === null) return undefined;
      if (p === "tx" && current.eth) { current = current.eth; continue; }
      if (p === "contract_call_args" && current.tx && current.tx.contract_call_args) {
        current = current.tx.contract_call_args;
        continue;
      }
      current = current[p];
    }
    return current;
  }

  function executeMethod(obj: any, method: string, argTokens: string[], ctx: any): any {
    if (method === "contains") {
      const val = evaluateSubTokens(argTokens, ctx);
      return Array.isArray(obj) && obj.some((item: any) => String(item) === String(val));
    }

    if (method === "any") {
      const varName = argTokens[0];
      const lambdaTokens = argTokens.slice(2);
      if (Array.isArray(obj)) {
        return obj.some((item: any) => {
          const subCtx: any = { ...ctx };
          if (typeof item === "object" && item !== null) {
            subCtx[varName] = item;
          } else {
            subCtx[varName] = { value: item };
          }
          return evaluateSubTokens(lambdaTokens, subCtx);
        });
      }
      return false;
    }

    if (method === "all") {
      const varName = argTokens[0];
      const lambdaTokens = argTokens.slice(2);
      if (Array.isArray(obj)) {
        return obj.length > 0 && obj.every((item: any) => {
          const subCtx: any = { ...ctx };
          if (typeof item === "object" && item !== null) {
            subCtx[varName] = item;
          } else {
            subCtx[varName] = { value: item };
          }
          return evaluateSubTokens(lambdaTokens, subCtx);
        });
      }
      return false;
    }

    if (method === "filter") {
      const varName = argTokens[0];
      const lambdaTokens = argTokens.slice(2);
      if (Array.isArray(obj)) {
        return obj.filter((item: any) => {
          const subCtx: any = { ...ctx };
          if (typeof item === "object" && item !== null) {
            subCtx[varName] = item;
          } else {
            subCtx[varName] = { value: item };
          }
          return evaluateSubTokens(lambdaTokens, subCtx);
        });
      }
      return [];
    }

    if (method === "count") {
      return Array.isArray(obj) ? obj.length : 0;
    }

    return undefined;
  }

  function evaluateSubTokens(subTokens: string[], subCtx: any): any {
    const subExpr = subTokens.join(" ");
    return evaluateCel(subExpr, subCtx);
  }

  try {
    return parseLogicalOr(context);
  } catch (e) {
    console.error("CEL Evaluation error:", e);
    return false;
  }
}

export function evaluatePolicies(
  policies: PolicyRule[],
  context: EvaluationContext,
  isRootUser = false
): EvaluationResult {
  if (isRootUser) {
    return { allowed: true, requiresConsensus: false };
  }

  if (policies.length === 0) {
    return { allowed: false, requiresConsensus: false, reason: "No policies defined" };
  }

  // Deny rules check
  for (const policy of policies) {
    if (policy.effect === "EFFECT_DENY") {
      const isTurnkey = policy.conditions && !Array.isArray(policy.conditions) && (policy.conditions as any).isTurnkey;
      if (isTurnkey) {
        const conditionExpr = (policy.conditions as any).condition;
        const consensusExpr = policy.consensus;
        const conditionMet = conditionExpr ? evaluateCel(conditionExpr, context) : true;
        if (conditionMet) {
          const consensusMet = consensusExpr ? evaluateCel(consensusExpr, context) : true;
          if (consensusMet) {
            return { allowed: false, requiresConsensus: false, reason: `Denied by policy: ${policy.effect}` };
          }
        }
      } else if (policy.conditions && Array.isArray(policy.conditions)) {
        const conditions = policy.conditions as Condition[];
        const conditionsMet = policy.consensus === "ANY"
          ? conditions.some((c) => evaluateCondition(c, context))
          : conditions.every((c) => evaluateCondition(c, context));
        if (conditionsMet) {
          return { allowed: false, requiresConsensus: false, reason: `Denied by policy: ${policy.effect}` };
        }
      }
    }
  }

  // Allow rules check
  for (const policy of policies) {
    if (policy.effect === "EFFECT_ALLOW") {
      const isTurnkey = policy.conditions && !Array.isArray(policy.conditions) && (policy.conditions as any).isTurnkey;
      if (isTurnkey) {
        const conditionExpr = (policy.conditions as any).condition;
        const consensusExpr = policy.consensus;
        const conditionMet = conditionExpr ? evaluateCel(conditionExpr, context) : true;
        if (conditionMet) {
          if (!consensusExpr) {
            return { allowed: true, requiresConsensus: false };
          }
          const consensusMet = evaluateCel(consensusExpr, context);
          if (consensusMet) {
            return { allowed: true, requiresConsensus: false };
          } else {
            return { allowed: true, requiresConsensus: true };
          }
        }
      } else {
        const legacyConditions = Array.isArray(policy.conditions) ? policy.conditions as Condition[] : null;
        if (!legacyConditions || legacyConditions.length === 0) {
          if (policy.consensus === "REQUIRES_CONSENSUS") {
            return { allowed: true, requiresConsensus: true };
          }
          return { allowed: true, requiresConsensus: false };
        }
        const conditionsMet = policy.consensus === "ANY"
          ? legacyConditions.some((c) => evaluateCondition(c, context))
          : legacyConditions.every((c) => evaluateCondition(c, context));
        if (conditionsMet) {
          return { allowed: true, requiresConsensus: policy.consensus === "REQUIRES_CONSENSUS" };
        }
      }
    }
  }

  return { allowed: false, requiresConsensus: false, reason: "No matching allow policy" };
}

