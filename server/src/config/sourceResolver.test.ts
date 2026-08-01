import type { EnvironmentMatrixEntry } from "@log-aggregator/shared";
import { describe, expect, it } from "vitest";

import {
  getSourceOptions,
  resolveLogDirectories,
  resolveLogSources,
} from "./sourceResolver.js";

const matrix: EnvironmentMatrixEntry[] = [
  {
    environment: "DEV",
    country: "FRANCE",
    code: "DEV_FR",
    host: "DEVHOST01",
    shares: ["/tmp/dev-share", String.raw`\\server\logappli$`],
  },
  {
    environment: "PROD",
    country: "FRANCE",
    code: "PROD_FR",
    host: "PRODHOST01",
    shares: ["/tmp/prod-share"],
  },
];

describe("sourceResolver", () => {
  it("lists environments and countries from the matrix", () => {
    expect(getSourceOptions(matrix)).toEqual({
      environments: ["DEV", "PROD"],
      countriesByEnvironment: {
        DEV: ["FRANCE"],
        PROD: ["FRANCE"],
      },
      tiers: ["back", "front"],
    });
  });

  it("expands each selected share into the selected app tier only", () => {
    const directories = resolveLogDirectories(matrix, {
      environment: "DEV",
      country: "FRANCE",
      project: "billing-api",
      date: "2026-07-29",
      tier: "front",
    });

    expect(directories).toHaveLength(2);
    expect(directories[0]).toMatchObject({
      project: "billing-api",
      date: "2026-07-29",
      tier: "front",
      path: "/tmp/dev-share/Java/apache-tomcat-front/logs",
    });
    expect(directories[1].path).toBe(
      String.raw`\\server\logappli$\Java\apache-tomcat-front\logs`,
    );
  });

  it("converts resolved directories into enabled log sources", () => {
    const sources = resolveLogSources(matrix, {
      environment: "PROD",
      country: "FRANCE",
      project: "billing-api",
      date: "2026-07-29",
      tier: "back",
    });

    expect(sources).toHaveLength(1);
    expect(sources[0]).toMatchObject({
      enabled: true,
      environment: "PROD",
      country: "FRANCE",
      project: "billing-api",
      date: "2026-07-29",
      tier: "back",
    });
  });
});
