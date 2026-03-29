import { resolveLabel, truncateLabel } from "./routeUtils";

describe("resolveLabel", () => {
  it("resolves known routes from navigation config", () => {
    expect(resolveLabel("/dashboard", "dashboard")).toBe("Dashboard");
    expect(resolveLabel("/bridges", "bridges")).toBe("Bridges");
    expect(resolveLabel("/admin/api-keys", "api-keys")).toBe("API Keys");
    expect(resolveLabel("/settings", "settings")).toBe("Settings");
  });

  it("title-cases unknown segments", () => {
    expect(resolveLabel("/some-path", "some-path")).toBe("Some Path");
    expect(resolveLabel("/multi_word_path", "multi_word_path")).toBe("Multi Word Path");
  });

  it("resolves manually-added routes", () => {
    expect(resolveLabel("/admin", "admin")).toBe("Admin");
    expect(resolveLabel("/assets", "assets")).toBe("Assets");
  });
});

describe("truncateLabel", () => {
  it("returns label as-is when within limit", () => {
    expect(truncateLabel("Hello", 10)).toBe("Hello");
  });

  it("truncates and appends ellipsis when exceeding limit", () => {
    expect(truncateLabel("Very Long Label", 10)).toBe("Very Long…");
  });

  it("handles exact boundary length", () => {
    expect(truncateLabel("Exact", 5)).toBe("Exact");
  });

  it("handles single-character max", () => {
    expect(truncateLabel("AB", 1)).toBe("…");
  });
});
