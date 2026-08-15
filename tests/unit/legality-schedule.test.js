import { describe, expect, it } from "vitest";

import {
  END_OF_DAY_MINUTES,
  nycWallClock,
  parseClockLabel,
  windowContains,
} from "../../src/lib/legality/clock.js";
import {
  dayAfterLaborDay,
  laborDay,
  newYearsDay,
  thanksgiving,
} from "../../src/lib/legality/holidays.js";
import { resolveSeason } from "../../src/lib/legality/season.js";
import { rowStatusAt } from "../../src/lib/legality/status.js";
import { ROW_STATUS } from "../../src/lib/legality/vocabulary.js";

describe("parseClockLabel", () => {
  it("parses the printed time vocabulary", () => {
    expect(parseClockLabel("12 a.m.")).toBe(0);
    expect(parseClockLabel("8 a.m.")).toBe(480);
    expect(parseClockLabel("12 p.m.")).toBe(720);
    expect(parseClockLabel("6:30 p.m.")).toBe(1110);
    expect(parseClockLabel("2 p.m.")).toBe(840);
    expect(parseClockLabel("6 a.m.")).toBe(360);
  });

  it("maps the printed end-of-day label to a closed interval end", () => {
    expect(parseClockLabel("11:59 p.m.")).toBe(END_OF_DAY_MINUTES);
    expect(END_OF_DAY_MINUTES).toBe(1440);
  });

  it("returns null on anything outside the vocabulary, never throws", () => {
    for (const bad of ["", "noon", "25 a.m.", "8am", "8 a.m", "0 p.m.", "13 p.m.", "8 a.m. - 7 p.m.", null, undefined, 8]) {
      expect(parseClockLabel(bad), String(bad)).toBeNull();
    }
  });
});

describe("windowContains", () => {
  it("evaluates ordinary half-open windows", () => {
    expect(windowContains(480, 1140, 480)).toBe(true);
    expect(windowContains(480, 1140, 1139)).toBe(true);
    expect(windowContains(480, 1140, 1140)).toBe(false);
    expect(windowContains(480, 1140, 479)).toBe(false);
  });

  it("wraps overnight windows (the 2 p.m. -> 6 a.m. rows)", () => {
    expect(windowContains(840, 360, 1380)).toBe(true); // 11 p.m.
    expect(windowContains(840, 360, 120)).toBe(true); // 2 a.m.
    expect(windowContains(840, 360, 839)).toBe(false); // 1:59 p.m.
    expect(windowContains(840, 360, 360)).toBe(false); // exactly 6 a.m.
  });

  it("keeps the final minute of a full-day restriction closed", () => {
    // 12 a.m. -> 11:59 p.m. maps to [0, 1440); 23:59 must still be restricted.
    expect(windowContains(0, END_OF_DAY_MINUTES, 1439)).toBe(true);
  });
});

describe("nycWallClock", () => {
  it("projects UTC instants into New York across both DST transitions", () => {
    // 2026-03-08: spring forward at 2 a.m. ET.
    const beforeSpring = nycWallClock(new Date("2026-03-08T06:30:00Z"));
    expect(beforeSpring).toMatchObject({ y: 2026, m: 3, d: 8, minutes: 90 }); // 01:30 EST
    const afterSpring = nycWallClock(new Date("2026-03-08T07:30:00Z"));
    expect(afterSpring).toMatchObject({ y: 2026, m: 3, d: 8, minutes: 210 }); // 03:30 EDT

    // 2026-11-01: fall back at 2 a.m. ET.
    const beforeFall = nycWallClock(new Date("2026-11-01T05:30:00Z"));
    expect(beforeFall).toMatchObject({ y: 2026, m: 11, d: 1, minutes: 90 }); // 01:30 EDT
    const afterFall = nycWallClock(new Date("2026-11-01T06:30:00Z"));
    expect(afterFall).toMatchObject({ y: 2026, m: 11, d: 1, minutes: 90 }); // 01:30 EST again
  });

  it("reports the New York weekday, not the runner's", () => {
    // 2026-08-15T02:00Z is Saturday in UTC but Friday 10 p.m. in New York.
    const wall = nycWallClock(new Date("2026-08-15T02:00:00Z"));
    expect(wall.weekday).toBe(5);
    expect(wall.d).toBe(14);
  });
});

describe("holidays", () => {
  it("computes floating holidays exactly", () => {
    expect(laborDay(2026)).toEqual({ m: 9, d: 7 });
    expect(laborDay(2027)).toEqual({ m: 9, d: 6 });
    expect(laborDay(2028)).toEqual({ m: 9, d: 4 });
    expect(dayAfterLaborDay(2026)).toEqual({ m: 9, d: 8 });
    expect(thanksgiving(2026)).toEqual({ m: 11, d: 26 });
    expect(thanksgiving(2027)).toEqual({ m: 11, d: 25 });
    expect(thanksgiving(2028)).toEqual({ m: 11, d: 23 });
    expect(newYearsDay()).toEqual({ m: 1, d: 1 });
  });
});

describe("resolveSeason", () => {
  const wallAt = (m, d) => ({ y: 2026, m, d, weekday: 1, minutes: 600 });

  it("treats year-round as always in season", () => {
    expect(resolveSeason({ kind: "year_round", start_raw: "Year-round", end_raw: "Year-round" }, wallAt(7, 4))).toBe("in_season");
  });

  it("wraps fixed windows across the year boundary with inclusive ends", () => {
    const holidaySeason = {
      kind: "fixed",
      start_raw: "November 1",
      end_raw: "January 15",
      start: { month: 11, day: 1 },
      end: { month: 1, day: 15 },
    };
    expect(resolveSeason(holidaySeason, wallAt(12, 25))).toBe("in_season");
    expect(resolveSeason(holidaySeason, wallAt(1, 2))).toBe("in_season");
    expect(resolveSeason(holidaySeason, wallAt(1, 15))).toBe("in_season");
    expect(resolveSeason(holidaySeason, wallAt(1, 20))).toBe("out_of_season");
    expect(resolveSeason(holidaySeason, wallAt(10, 31))).toBe("out_of_season");
  });

  it("resolves floating holiday anchors exactly", () => {
    const summer = {
      kind: "mixed",
      start_raw: "May 1",
      end_raw: "Labor Day",
      start: { month: 5, day: 1 },
      end: { rule: "labor_day" },
    };
    expect(resolveSeason(summer, wallAt(7, 15))).toBe("in_season");
    expect(resolveSeason(summer, wallAt(9, 7))).toBe("in_season"); // Labor Day 2026 inclusive
    expect(resolveSeason(summer, wallAt(9, 8))).toBe("out_of_season");
    expect(resolveSeason(summer, wallAt(9, 30))).toBe("out_of_season");

    const thanksgivingSeason = {
      kind: "floating",
      start_raw: "Thanksgiving Day",
      end_raw: "New Years Day",
      start: { rule: "thanksgiving" },
      end: { rule: "new_years_day" },
    };
    expect(resolveSeason(thanksgivingSeason, wallAt(12, 1))).toBe("in_season");
    expect(resolveSeason(thanksgivingSeason, wallAt(11, 25))).toBe("out_of_season");
  });

  it("returns unknown outside the closed vocabulary, never a guess", () => {
    expect(resolveSeason({ kind: "lunar", start_raw: "?", end_raw: "?" }, wallAt(6, 1))).toBe("unknown");
    expect(resolveSeason({ kind: "floating", start_raw: "Arbor Day", end_raw: "?", start: { rule: "arbor_day" }, end: { month: 6, day: 1 } }, wallAt(6, 1))).toBe("unknown");
    expect(resolveSeason(null, wallAt(6, 1))).toBe("unknown");
  });
});

describe("rowStatusAt", () => {
  const YEAR_ROUND = { kind: "year_round", start_raw: "Year-round", end_raw: "Year-round" };
  const wallAt = (weekday, minutes) => ({ y: 2026, m: 8, d: 10 + weekday, weekday, minutes });
  const schedule = (day) => ({ days: [null, day, null, null, null, null, null] });

  it("reports restricted_now inside the window with minutes to change", () => {
    const result = rowStatusAt(schedule({ startRaw: "8 a.m.", endRaw: "7 p.m." }), YEAR_ROUND, wallAt(1, 600));
    expect(result.status).toBe(ROW_STATUS.RESTRICTED_NOW);
    expect(result.minutesToChange).toBe(1140 - 600);
  });

  it("reports restricted_later_today before the window opens", () => {
    const result = rowStatusAt(schedule({ startRaw: "8 a.m.", endRaw: "7 p.m." }), YEAR_ROUND, wallAt(1, 300));
    expect(result.status).toBe(ROW_STATUS.RESTRICTED_LATER_TODAY);
    expect(result.minutesToChange).toBe(180);
  });

  it("reports not_restricted_today after the window closes", () => {
    const result = rowStatusAt(schedule({ startRaw: "8 a.m.", endRaw: "7 p.m." }), YEAR_ROUND, wallAt(1, 1200));
    expect(result.status).toBe(ROW_STATUS.NOT_RESTRICTED_TODAY);
  });

  it("evaluates overnight windows as restricted at night and early morning", () => {
    const overnight = schedule({ startRaw: "2 p.m.", endRaw: "6 a.m." });
    expect(rowStatusAt(overnight, YEAR_ROUND, wallAt(1, 1380)).status).toBe(ROW_STATUS.RESTRICTED_NOW);
    expect(rowStatusAt(overnight, YEAR_ROUND, wallAt(1, 120)).status).toBe(ROW_STATUS.RESTRICTED_NOW);
    expect(rowStatusAt(overnight, YEAR_ROUND, wallAt(1, 700)).status).toBe(ROW_STATUS.RESTRICTED_LATER_TODAY);
  });

  it("treats a blank printed day cell as no restriction listed — distinct from unknown", () => {
    const result = rowStatusAt(schedule(null), YEAR_ROUND, wallAt(2, 600));
    expect(result.status).toBe(ROW_STATUS.NOT_RESTRICTED_TODAY);
    expect(result.today.parseOk).toBe(true);
  });

  it("fails toward unknown on an unparseable label — never toward not restricted", () => {
    const result = rowStatusAt(schedule({ startRaw: "dawn", endRaw: "7 p.m." }), YEAR_ROUND, wallAt(1, 600));
    expect(result.status).toBe(ROW_STATUS.UNKNOWN);
    expect(result.status).not.toBe(ROW_STATUS.NOT_RESTRICTED_TODAY);
    expect(result.today.parseOk).toBe(false);
  });

  it("reports out_of_season rows without evaluating hours", () => {
    const winter = {
      kind: "fixed",
      start_raw: "November 1",
      end_raw: "January 15",
      start: { month: 11, day: 1 },
      end: { month: 1, day: 15 },
    };
    const result = rowStatusAt(schedule({ startRaw: "8 a.m.", endRaw: "7 p.m." }), winter, wallAt(1, 600));
    expect(result.status).toBe(ROW_STATUS.OUT_OF_SEASON);
  });

  it("keeps the vocabulary free of permission words", () => {
    for (const value of Object.values(ROW_STATUS)) {
      expect(value).not.toMatch(/allow|legal|permit|\bok\b|open/i);
    }
  });
});
