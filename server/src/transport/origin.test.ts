import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createOriginGuard } from "./origin.js";

const PAGES_ORIGIN = "https://samuelguillemet.github.io";
const guard = createOriginGuard([PAGES_ORIGIN]);

describe("createOriginGuard", () => {
  it("allows loopback origins on any port, so the dev client works", () => {
    for (const origin of [
      "http://localhost:5173",
      "http://localhost:5180",
      "http://127.0.0.1:4000",
      "https://localhost",
      "http://[::1]:5173",
    ]) {
      assert.equal(guard(origin, "127.0.0.1"), true, `expected ${origin} to be allowed`);
    }
  });

  // The frontend ships to GitHub Pages while the backend runs locally, so the
  // canonical deployment is cross-origin and must be allowed explicitly.
  it("allows an explicitly listed origin", () => {
    assert.equal(guard(PAGES_ORIGIN, "127.0.0.1"), true);
  });

  it("rejects every other site, which is the whole point of the guard", () => {
    for (const origin of [
      "https://evil.example.com",
      "http://evil.example.com",
      "https://github.io",
      "https://attacker.test",
    ]) {
      assert.equal(guard(origin, "127.0.0.1"), false, `expected ${origin} to be rejected`);
    }
  });

  it("rejects lookalikes of the allowed origins", () => {
    for (const origin of [
      "https://samuelguillemet.github.io.evil.com",
      "https://samuelguillemet.github.io:8443",
      "http://samuelguillemet.github.io",
      "http://localhost.evil.com",
      "http://127.0.0.1.evil.com",
      "https://notlocalhost",
    ]) {
      assert.equal(guard(origin, "127.0.0.1"), false, `expected ${origin} to be rejected`);
    }
  });

  it("accepts a missing Origin only from this machine", () => {
    assert.equal(guard(undefined, "127.0.0.1"), true);
    assert.equal(guard(undefined, "::1"), true);
    assert.equal(guard(undefined, "192.168.1.40"), false);
    assert.equal(guard(undefined, undefined), false);
  });

  it("treats an opaque origin like a missing one", () => {
    assert.equal(guard("null", "127.0.0.1"), true);
    assert.equal(guard("null", "10.0.0.7"), false);
  });

  it("rejects an unparseable Origin instead of throwing", () => {
    for (const origin of ["not a url", "://", "http://", ""]) {
      assert.equal(guard(origin, "127.0.0.1"), false, `expected ${origin} to be rejected`);
    }
  });
});
