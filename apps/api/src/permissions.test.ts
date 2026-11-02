import { describe, expect, it } from "vitest";
import { canManageOrganizationResources, canReadOrganizationResources } from "./permissions";

describe("organization permissions", () => {
  it("allows owners and admins to manage tenant resources", () => {
    expect(canManageOrganizationResources("owner")).toBe(true);
    expect(canManageOrganizationResources("admin")).toBe(true);
  });

  it("keeps members read-only", () => {
    expect(canReadOrganizationResources("member")).toBe(true);
    expect(canManageOrganizationResources("member")).toBe(false);
  });

  it("denies unknown roles by default", () => {
    expect(canReadOrganizationResources("billing-operator")).toBe(false);
    expect(canManageOrganizationResources("billing-operator")).toBe(false);
  });
});
