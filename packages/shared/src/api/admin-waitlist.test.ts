import { describe, expect, it } from "vitest";
import {
  adminWaitlistSearch,
  csvField,
  parseAdminWaitlistQuery,
  waitlistCsv,
  waitlistCsvFilename,
  type WaitlistEntry,
} from "./admin-waitlist";

describe("parseAdminWaitlistQuery", () => {
  it("reads country, status and page", () => {
    expect(parseAdminWaitlistQuery({ country: "vn", status: "invited", page: "2" })).toEqual({
      country: "VN",
      status: "invited",
      page: 2,
    });
  });

  it("defaults to people still waiting, all countries", () => {
    expect(parseAdminWaitlistQuery({})).toEqual({ country: undefined, status: "waiting", page: 1 });
  });

  it("accepts 'unknown' for entries without a country", () => {
    expect(parseAdminWaitlistQuery({ country: "Unknown" }).country).toBe("unknown");
  });

  it("drops invalid values", () => {
    expect(parseAdminWaitlistQuery({ country: "Vietnam", status: "banned", page: "0" })).toEqual({
      country: undefined,
      status: "waiting",
      page: 1,
    });
  });
});

describe("adminWaitlistSearch", () => {
  it("leaves defaults out", () => {
    expect(adminWaitlistSearch({ status: "waiting", page: 1 })).toBe("");
    expect(adminWaitlistSearch({ country: "PH", status: "all", page: 3 })).toBe("?country=PH&status=all&page=3");
  });
});

describe("csvField", () => {
  it("leaves plain values alone and empties nulls", () => {
    expect(csvField("asha@example.com")).toBe("asha@example.com");
    expect(csvField(null)).toBe("");
  });

  it("quotes commas, quotes and line breaks", () => {
    expect(csvField("a,b")).toBe('"a,b"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField("line\nbreak")).toBe('"line\nbreak"');
  });

  it.each(["=HYPERLINK(\"x\")", "+1", "-2", "@SUM(A1)", "\tx"])("neutralises formula %j", (v) => {
    expect(csvField(v).replace(/^"/, "").startsWith("'")).toBe(true);
  });
});

describe("waitlistCsv", () => {
  const entries: WaitlistEntry[] = [
    { id: 1, email: "vn1@example.com", country_code: "VN", source: "hero", created_at: "2026-11-20T10:00:00+00:00", invited_at: null },
    { id: 2, email: "x@example.com", country_code: null, source: "=cmd", created_at: "2026-11-21T10:00:00+00:00", invited_at: "2026-11-22T10:00:00+00:00" },
  ];

  it("has a BOM, a header and CRLF rows", () => {
    expect(waitlistCsv(entries)).toBe(
      "﻿email,country_code,source,joined_at,invited_at\r\n" +
        "vn1@example.com,VN,hero,2026-11-20T10:00:00+00:00,\r\n" +
        "x@example.com,,'=cmd,2026-11-21T10:00:00+00:00,2026-11-22T10:00:00+00:00\r\n",
    );
  });

  it("is just the header when empty", () => {
    expect(waitlistCsv([])).toBe("﻿email,country_code,source,joined_at,invited_at\r\n");
  });
});

describe("waitlistCsvFilename", () => {
  it("names the filters and the date", () => {
    expect(waitlistCsvFilename({ country: "VN", status: "waiting" }, "2026-11-23")).toBe(
      "prepora-waitlist-VN-waiting-2026-11-23.csv",
    );
    expect(waitlistCsvFilename({ country: undefined, status: "all" }, "2026-11-23")).toBe("prepora-waitlist-all-2026-11-23.csv");
  });
});
