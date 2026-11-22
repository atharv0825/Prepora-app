import { describe, expect, it } from "vitest";
import { appEnvironment, releaseName, sentryDataCollection } from "./observability";

describe("appEnvironment", () => {
  it.each([
    ["localhost", "development"],
    ["127.0.0.1", "development"],
    ["web.localhost", "development"],
    ["pr-12-prepora-web-staging.acme.workers.dev", "preview"],
    ["staging.prepora.site", "staging"],
    ["admin-staging.prepora.site", "staging"],
    ["STAGING.prepora.site", "staging"],
    ["prepora.site", "production"],
    ["admin.prepora.site", "production"],
  ] as const)("%s → %s", (host, env) => {
    expect(appEnvironment(host)).toBe(env);
  });
});

describe("releaseName", () => {
  it("joins app, version and sha", () => {
    expect(releaseName("web", "0.1.0", "abc1234")).toBe("prepora-web@0.1.0+abc1234");
  });
});

describe("sentryDataCollection", () => {
  it("collects no personal data automatically", () => {
    expect(sentryDataCollection).toEqual({
      userInfo: false,
      cookies: false,
      httpBodies: [],
      urlQueryParams: false,
    });
  });
});
