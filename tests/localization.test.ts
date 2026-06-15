import { describe, expect, test } from "bun:test";
import { Localization } from "../src/engine/Localization";

describe("Localization", () => {
  test("uses the active locale and replaces parameters", () => {
    Localization.add("en", { score: "Score: {value}" });
    Localization.add("vi", { score: "Diem: {value}" });

    Localization.use("vi");

    expect(Localization.translate("score", { value: 42 })).toBe("Diem: 42");
  });

  test("falls back to the configured locale and then the key", () => {
    Localization.add("en", { play: "Play" });
    Localization.use("missing", "en");

    expect(Localization.translate("play")).toBe("Play");
    expect(Localization.translate("unknown")).toBe("unknown");
  });
});
