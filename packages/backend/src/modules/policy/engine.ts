import { z } from "zod";

export const ConditionSchema = z.object({
  type: z.enum(["LESS_THAN", "GREATER_THAN", "EQUAL", "INCLUDE", "NOT_INCLUDE", "REGEX_MATCH", "BEFORE", "AFTER", "WINDOW"]),
  field: z.string(),
  value: z.union([z.string(), z.number()]).optional(),
  values: z.array(z.union([z.string(), z.number()])).optional(),
});

export const PolicyRuleSchema = z.object({
  effect: z.enum(["EFFECT_ALLOW", "EFFECT_DENY"]),
  conditions: z.array(ConditionSchema).optional(),
  consensus: z.enum(["ANY", "ALL", "REQUIRES_CONSENSUS"]).default("ANY"),
});

export type PolicyRule = z.infer<typeof PolicyRuleSchema>;
export type Condition = z.infer<typeof ConditionSchema>;

export interface EvaluationContext {
  params: Record<string, unknown>;
  user?: { id: string; role: string; tags: string[] };
  wallet?: { id: string; ownerId: string; ownerType: string };
  timestamp?: number;
}

export interface EvaluationResult {
  allowed: boolean;
  requiresConsensus: boolean;
  matchedPolicyId?: string;
  reason?: string;
}

function isSafeRegex(pattern: string): boolean {
  // Reject patterns longer than 256 chars
  if (pattern.length > 256) return false;
  // Reject patterns with nested quantifiers (common ReDoS vector)
  if (/(?:\*\+|\+\*|\+\+|\*\*|\{\d+,\}\{|\{\d+,\}[*+])/.test(pattern)) return false;
  // Reject patterns with nested groups and quantifiers
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

  for (const policy of policies) {
    if (policy.effect === "EFFECT_DENY" && policy.conditions) {
      const conditionsMet = policy.consensus === "ANY"
        ? policy.conditions.some((c) => evaluateCondition(c, context))
        : policy.conditions.every((c) => evaluateCondition(c, context));
      if (conditionsMet) {
        return { allowed: false, requiresConsensus: false, reason: `Denied by policy: ${policy.effect}` };
      }
    }
  }

  for (const policy of policies) {
    if (policy.effect === "EFFECT_ALLOW") {
      if (!policy.conditions || policy.conditions.length === 0) {
        if (policy.consensus === "REQUIRES_CONSENSUS") {
          return { allowed: true, requiresConsensus: true };
        }
        return { allowed: true, requiresConsensus: false };
      }
      const conditionsMet = policy.consensus === "ANY"
        ? policy.conditions.some((c) => evaluateCondition(c, context))
        : policy.conditions.every((c) => evaluateCondition(c, context));
      if (conditionsMet) {
        return { allowed: true, requiresConsensus: policy.consensus === "REQUIRES_CONSENSUS" };
      }
    }
  }

  return { allowed: false, requiresConsensus: false, reason: "No matching allow policy" };
}
