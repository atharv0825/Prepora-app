import { describe, expect, it } from "vitest";
import {
  ADMIN_USERS_PAGE_SIZE,
  adminListUsersArgs,
  adminUsersSearch,
  pageCount,
  parseAdminUsersQuery,
} from "./admin-users";

describe("parseAdminUsersQuery", () => {
  it("reads search, filters and page from the URL", () => {
    expect(parseAdminUsersQuery({ q: " asha ", country: "in", plan: "gold", page: "3" })).toEqual({
      q: "asha",
      country: "IN",
      plan: "gold",
      page: 3,
    });
  });

  it("defaults to everything, page 1", () => {
    expect(parseAdminUsersQuery({})).toEqual({ q: undefined, country: undefined, plan: undefined, page: 1 });
  });

  it("drops invalid values instead of failing (the page is a shareable link)", () => {
    expect(
      parseAdminUsersQuery({ q: "   ", country: "India", plan: "diamond", page: "-2" }),
    ).toEqual({ q: undefined, country: undefined, plan: undefined, page: 1 });
    expect(parseAdminUsersQuery({ q: "x".repeat(101), page: "abc" })).toMatchObject({ q: undefined, page: 1 });
  });

  it("takes the first value of repeated params", () => {
    expect(parseAdminUsersQuery({ plan: ["platinum", "free"] }).plan).toBe("platinum");
  });
});

describe("adminListUsersArgs", () => {
  it("maps the query to RPC arguments with paging", () => {
    expect(adminListUsersArgs({ q: "ravi", country: "NP", plan: undefined, page: 2 })).toEqual({
      p_search: "ravi",
      p_country: "NP",
      p_plan: undefined,
      p_limit: ADMIN_USERS_PAGE_SIZE,
      p_offset: ADMIN_USERS_PAGE_SIZE,
    });
  });
});

describe("adminUsersSearch", () => {
  it("builds a query string without empty values or page 1", () => {
    expect(adminUsersSearch({})).toBe("");
    expect(adminUsersSearch({ q: "a b", plan: "gold", page: 1 })).toBe("?q=a+b&plan=gold");
    expect(adminUsersSearch({ country: "IN", page: 2 })).toBe("?country=IN&page=2");
  });
});

describe("pageCount", () => {
  it("is at least 1", () => {
    expect(pageCount(0)).toBe(1);
    expect(pageCount(ADMIN_USERS_PAGE_SIZE)).toBe(1);
    expect(pageCount(ADMIN_USERS_PAGE_SIZE + 1)).toBe(2);
  });
});
