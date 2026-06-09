import { describe, it, expect } from "vitest";
import { evaluatePolicies, PolicyRule, EvaluationContext } from "../src/modules/policy/engine.js";

describe("Policy Engine", () => {
  const baseContext: EvaluationContext = {
    params: {
      walletId: "w1",
      to: "0xABC",
      value: 500,
    },
    user: { id: "u1", role: "DEVELOPER", tags: [] },
    wallet: { id: "w1", ownerId: "u1", ownerType: "USER" },
  };

  it("should deny when no policies exist", () => {
    const result = evaluatePolicies([], baseContext);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("No policies");
  });

  it("should allow root user regardless of policies", () => {
    const policies: PolicyRule[] = [{ effect: "EFFECT_DENY", conditions: [] }];
    const result = evaluatePolicies(policies, baseContext, true);
    expect(result.allowed).toBe(true);
  });

  it("should deny if DENY policy matches", () => {
    const policies: PolicyRule[] = [
      {
        effect: "EFFECT_DENY",
        conditions: [{ type: "EQUAL", field: "params.to", value: "0xABC" }],
      },
      {
        effect: "EFFECT_ALLOW",
        conditions: [],
      },
    ];
    const result = evaluatePolicies(policies, baseContext);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("Denied by policy");
  });

  it("should allow if ALLOW policy matches and no DENY matches", () => {
    const policies: PolicyRule[] = [
      {
        effect: "EFFECT_ALLOW",
        conditions: [{ type: "LESS_THAN", field: "params.value", value: 1000 }],
      },
    ];
    const result = evaluatePolicies(policies, baseContext);
    expect(result.allowed).toBe(true);
    expect(result.requiresConsensus).toBe(false);
  });

  it("should deny if no ALLOW policy matches", () => {
    const policies: PolicyRule[] = [
      {
        effect: "EFFECT_ALLOW",
        conditions: [{ type: "GREATER_THAN", field: "params.value", value: 1000 }],
      },
    ];
    const ctx = { ...baseContext };
    ctx.params.value = 500;
    const result = evaluatePolicies(policies, ctx);
    expect(result.allowed).toBe(false);
  });

  it("should handle INCLUDE condition", () => {
    const policies: PolicyRule[] = [
      {
        effect: "EFFECT_ALLOW",
        conditions: [{ type: "INCLUDE", field: "params.to", values: ["0xABC", "0xDEF"] }],
      },
    ];
    const result = evaluatePolicies(policies, baseContext);
    expect(result.allowed).toBe(true);
  });

  it("should handle REQUIRES_CONSENSUS", () => {
    const policies: PolicyRule[] = [
      {
        effect: "EFFECT_ALLOW",
        conditions: [{ type: "LESS_THAN", field: "params.value", value: 1000 }],
        consensus: "REQUIRES_CONSENSUS",
      },
    ];
    const result = evaluatePolicies(policies, baseContext);
    expect(result.allowed).toBe(true);
    expect(result.requiresConsensus).toBe(true);
  });

  it("should allow unconditional ALLOW", () => {
    const policies: PolicyRule[] = [
      { effect: "EFFECT_ALLOW", conditions: [] },
    ];
    const result = evaluatePolicies(policies, baseContext);
    expect(result.allowed).toBe(true);
  });
});
