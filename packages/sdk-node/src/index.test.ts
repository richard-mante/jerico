import { describe, expect, it } from "vitest";
import { NodeJericoClient } from "./index";

describe("NodeJericoClient", () => {
  it("rejects public keys in trusted server SDK", () => {
    expect(() => new NodeJericoClient({
      apiKey: "jk_pub_not_secret",
      endpoint: "https://ingest.example.test",
    })).toThrow("requires a secret Jerico key");
  });
});
