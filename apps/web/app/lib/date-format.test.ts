import { describe, expect, test } from "vitest";

import { formatDisplayDate, formatDisplayDateTime } from "./date-format";

describe("date formatting", () => {
  test("formats leading ISO civil dates without timezone conversion", () => {
    expect(formatDisplayDate("2026-06-20")).toBe("20 Jun 2026");
    expect(formatDisplayDate("2026-06-20T23:30:00")).toBe("20 Jun 2026");
    expect(formatDisplayDate("2026-06-20T23:30:00Z")).toBe("20 Jun 2026");
  });

  test("still formats date-time values as instants", () => {
    expect(formatDisplayDateTime(Date.UTC(2026, 5, 20, 22, 30))).toBe("21 Jun 2026, 00:30");
  });
});
