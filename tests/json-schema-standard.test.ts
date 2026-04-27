import { describe, expect, it } from "bun:test";

import { jsonSchemaToStandardSchema } from "../src/json-schema-standard";

describe("jsonSchemaToStandardSchema", () => {
  it("exposes the MCP JSON Schema through the Standard JSON Schema contract", () => {
    const schema = jsonSchemaToStandardSchema({
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
    });

    expect(schema["~standard"].jsonSchema.input({ target: "draft-07" })).toMatchObject({
      type: "object",
      required: ["query"],
    });
  });

  it("checks required fields before delegating full validation to the MCP server", async () => {
    const schema = jsonSchemaToStandardSchema({
      type: "object",
      required: ["query"],
    });

    const result = await schema["~standard"].validate({});
    expect(result.issues?.[0]?.message).toContain("Missing required field");
  });
});
