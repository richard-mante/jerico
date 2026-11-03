import { describe, expect, it } from "vitest";
import { BrowserJericoClient } from "./index";

describe("BrowserJericoClient", () => {
  it("rejects secret keys before browser listeners are installed", () => {
    expect(() => new BrowserJericoClient({
      apiKey: "jk_sec_do_not_use",
      endpoint: "https://ingest.example.test",
    })).toThrow("requires a public Jerico key");
  });
});
