import { describe, it, expect } from "vitest";
import { PolicyRuleSchema, evaluatePolicies, EvaluationContext } from "../../src/modules/policy/engine";

describe("PolicyRuleSchema", () => {
  it("should validate an allow policy with conditions", () => {
    const result = PolicyRuleSchema.safeParse({
      effect: "EFFECT_ALLOW",
      conditions: [{ type: "LESS_THAN", field: "params.value", value: 1000 }],
      consensus: "ANY",
    });
    expect(result.success).toBe(true);
  });

  it("should validate a deny policy", () => {
    const result = PolicyRuleSchema.safeParse({
      effect: "EFFECT_DENY",
      conditions: [{ type: "INCLUDE", field: "params.to", values: ["0xabc"] }],
      consensus: "ALL",
    });
    expect(result.success).toBe(true);
  });

  it("should reject invalid effect", () => {
    const result = PolicyRuleSchema.safeParse({
      effect: "INVALID",
      conditions: [],
    });
    expect(result.success).toBe(false);
  });

  it("should accept policy without conditions", () => {
    const result = PolicyRuleSchema.safeParse({
      effect: "EFFECT_ALLOW",
    });
    expect(result.success).toBe(true);
  });
});

describe("evaluatePolicies", () => {
  const baseContext: EvaluationContext = {
    params: { value: 500, to: "0xabc123", chain: "arc" },
    user: { id: "user1", role: "DEVELOPER", tags: [] },
    wallet: { id: "wallet1", ownerId: "user1", ownerType: "USER" },
  };

  it("should allow root user regardless of policies", () => {
    const result = evaluatePolicies([], baseContext, true);
    expect(result.allowed).toBe(true);
    expect(result.requiresConsensus).toBe(false);
  });

  it("should deny when no policies exist", () => {
    const result = evaluatePolicies([], baseContext, false);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("No policies defined");
  });

  it("should allow when allow policy matches", () => {
    const result = evaluatePolicies(
      [
        {
          effect: "EFFECT_ALLOW",
          conditions: [{ type: "LESS_THAN", field: "params.value", value: 1000 }],
          consensus: "ANY",
        },
      ],
      baseContext
    );
    expect(result.allowed).toBe(true);
    expect(result.requiresConsensus).toBe(false);
  });

  it("should deny when value exceeds allow limit", () => {
    const result = evaluatePolicies(
      [
        {
          effect: "EFFECT_ALLOW",
          conditions: [{ type: "LESS_THAN", field: "params.value", value: 100 }],
          consensus: "ANY",
        },
      ],
      baseContext
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("No matching allow policy");
  });

  it("should deny when deny policy matches", () => {
    const result = evaluatePolicies(
      [
        {
          effect: "EFFECT_ALLOW",
          conditions: [{ type: "LESS_THAN", field: "params.value", value: 1000 }],
          consensus: "ANY",
        },
        {
          effect: "EFFECT_DENY",
          conditions: [{ type: "EQUAL", field: "params.to", value: "0xabc123" }],
          consensus: "ANY",
        },
      ],
      baseContext
    );
    expect(result.allowed).toBe(false);
  });

  it("should allow when deny doesn't match and allow does", () => {
    const result = evaluatePolicies(
      [
        {
          effect: "EFFECT_ALLOW",
          conditions: [{ type: "LESS_THAN", field: "params.value", value: 1000 }],
          consensus: "ANY",
        },
        {
          effect: "EFFECT_DENY",
          conditions: [{ type: "EQUAL", field: "params.to", value: "0xdeadbeef" }],
          consensus: "ANY",
        },
      ],
      baseContext
    );
    expect(result.allowed).toBe(true);
  });

  it("should require consensus when policy has REQUIRES_CONSENSUS", () => {
    const result = evaluatePolicies(
      [
        {
          effect: "EFFECT_ALLOW",
          conditions: [{ type: "LESS_THAN", field: "params.value", value: 1000 }],
          consensus: "REQUIRES_CONSENSUS",
        },
      ],
      baseContext
    );
    expect(result.allowed).toBe(true);
    expect(result.requiresConsensus).toBe(true);
  });

  it("should use ALL consensus mode", () => {
    const result = evaluatePolicies(
      [
        {
          effect: "EFFECT_ALLOW",
          conditions: [
            { type: "LESS_THAN", field: "params.value", value: 1000 },
            { type: "EQUAL", field: "params.chain", value: "arc" },
          ],
          consensus: "ALL",
        },
      ],
      baseContext
    );
    expect(result.allowed).toBe(true);
  });

  it("should deny when ALL conditions not met", () => {
    const result = evaluatePolicies(
      [
        {
          effect: "EFFECT_ALLOW",
          conditions: [
            { type: "LESS_THAN", field: "params.value", value: 1000 },
            { type: "EQUAL", field: "params.chain", value: "ethereum" },
          ],
          consensus: "ALL",
        },
      ],
      baseContext
    );
    expect(result.allowed).toBe(false);
  });

  it("should handle INCLUDE condition", () => {
    const result = evaluatePolicies(
      [
        {
          effect: "EFFECT_ALLOW",
          conditions: [{ type: "INCLUDE", field: "params.to", values: ["0xabc123", "0xdef456"] }],
          consensus: "ANY",
        },
      ],
      baseContext
    );
    expect(result.allowed).toBe(true);
  });

  it("should handle NOT_INCLUDE condition", () => {
    const result = evaluatePolicies(
      [
        {
          effect: "EFFECT_DENY",
          conditions: [{ type: "NOT_INCLUDE", field: "params.to", values: ["0xabc123"] }],
          consensus: "ANY",
        },
      ],
      baseContext
    );
    expect(result.allowed).toBe(false);
  });

  it("should allow when NOT_INCLUDE doesn't match blacklist", () => {
    const result = evaluatePolicies(
      [
        {
          effect: "EFFECT_ALLOW",
          conditions: [{ type: "LESS_THAN", field: "params.value", value: 1000 }],
          consensus: "ANY",
        },
      ],
      { ...baseContext, params: { ...baseContext.params, to: "0xallowed" } }
    );
    expect(result.allowed).toBe(true);
  });

  it("should handle GREATER_THAN condition", () => {
    const result = evaluatePolicies(
      [
        {
          effect: "EFFECT_ALLOW",
          conditions: [{ type: "GREATER_THAN", field: "params.value", value: 100 }],
          consensus: "ANY",
        },
      ],
      baseContext
    );
    expect(result.allowed).toBe(true);
  });

  it("should handle REGEX_MATCH condition", () => {
    const result = evaluatePolicies(
      [
        {
          effect: "EFFECT_ALLOW",
          conditions: [{ type: "REGEX_MATCH", field: "params.to", value: "^0xabc" }],
          consensus: "ANY",
        },
      ],
      baseContext
    );
    expect(result.allowed).toBe(true);
  });

  it("should validate time-based BEFORE condition", () => {
    const result = PolicyRuleSchema.safeParse({
      effect: "EFFECT_ALLOW",
      conditions: [{ type: "BEFORE", field: "timestamp", value: "2027-01-01T00:00:00Z" }],
      consensus: "ANY",
    });
    expect(result.success).toBe(true);
  });

  it("should validate time-based AFTER condition", () => {
    const result = PolicyRuleSchema.safeParse({
      effect: "EFFECT_DENY",
      conditions: [{ type: "AFTER", field: "timestamp", value: "2025-01-01T00:00:00Z" }],
      consensus: "ALL",
    });
    expect(result.success).toBe(true);
  });

  it("should validate time-based WINDOW condition", () => {
    const result = PolicyRuleSchema.safeParse({
      effect: "EFFECT_ALLOW",
      conditions: [{ type: "WINDOW", field: "timestamp", values: ["2025-01-01T00:00:00Z", "2027-01-01T00:00:00Z"] }],
      consensus: "ANY",
    });
    expect(result.success).toBe(true);
  });

  it("should allow when BEFORE future date", () => {
    const result = evaluatePolicies(
      [
        {
          effect: "EFFECT_ALLOW",
          conditions: [{ type: "BEFORE", field: "timestamp", value: "2099-01-01T00:00:00Z" }],
          consensus: "ANY",
        },
      ],
      { ...baseContext, timestamp: Date.now() }
    );
    expect(result.allowed).toBe(true);
  });

  it("should deny when AFTER future date", () => {
    const result = evaluatePolicies(
      [
        {
          effect: "EFFECT_DENY",
          conditions: [{ type: "AFTER", field: "timestamp", value: "2099-01-01T00:00:00Z" }],
          consensus: "ANY",
        },
      ],
      { ...baseContext, timestamp: Date.now() }
    );
    expect(result.allowed).toBe(false);
  });

  it("should allow when timestamp within WINDOW", () => {
    const result = evaluatePolicies(
      [
        {
          effect: "EFFECT_ALLOW",
          conditions: [{ type: "WINDOW", field: "timestamp", values: ["2020-01-01T00:00:00Z", "2099-01-01T00:00:00Z"] }],
          consensus: "ANY",
        },
      ],
      { ...baseContext, timestamp: Date.now() }
    );
    expect(result.allowed).toBe(true);
  });

  it("should deny when timestamp outside WINDOW", () => {
    const result = evaluatePolicies(
      [
        {
          effect: "EFFECT_ALLOW",
          conditions: [{ type: "WINDOW", field: "timestamp", values: ["2020-01-01T00:00:00Z", "2021-01-01T00:00:00Z"] }],
          consensus: "ANY",
        },
      ],
      { ...baseContext, timestamp: Date.now() }
    );
    expect(result.allowed).toBe(false);
  });

  it("should block ReDoS patterns in REGEX_MATCH", () => {
    const result = evaluatePolicies(
      [
        {
          effect: "EFFECT_ALLOW",
          conditions: [{ type: "REGEX_MATCH", field: "params.to", value: "(a+)+b" }],
          consensus: "ANY",
        },
      ],
      baseContext
    );
    expect(result.allowed).toBe(false);
  });

  it("should block long regex patterns", () => {
    const longPattern = "a".repeat(300);
    const result = evaluatePolicies(
      [
        {
          effect: "EFFECT_ALLOW",
          conditions: [{ type: "REGEX_MATCH", field: "params.to", value: longPattern }],
          consensus: "ANY",
        },
      ],
      baseContext
    );
    expect(result.allowed).toBe(false);
  });

  it("should allow safe regex patterns", () => {
    const result = evaluatePolicies(
      [
        {
          effect: "EFFECT_ALLOW",
          conditions: [{ type: "REGEX_MATCH", field: "params.to", value: "^0xabc" }],
          consensus: "ANY",
        },
      ],
      baseContext
    );
    expect(result.allowed).toBe(true);
  });
});
