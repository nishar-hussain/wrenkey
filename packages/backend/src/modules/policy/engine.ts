import { z } from "zod";

export const ConditionSchema = z.object({
  type: z.enum(["LESS_THAN", "GREATER_THAN", "EQUAL", "INCLUDE", "NOT_INCLUDE", "REGEX_MATCH"]),
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
}

export interface EvaluationResult {
  allowed: boolean;
  requiresConsensus: boolean;
  matchedPolicyId?: string;
  reason?: string;
}

function evaluateCondition(condition: Condition, context: EvaluationContext): boolean {
  const fieldValue = resolveFieldPath(condition.field, context);

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
    case "REGEX_MATCH":
      return new RegExp(String(condition.value)).test(String(fieldValue));
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
