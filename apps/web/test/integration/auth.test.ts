import { describe, expect, it } from "vitest";
import { POST as register } from "@/app/api/v1/auth/register/route";
import { POST as login } from "@/app/api/v1/auth/login/route";
import { GET as me } from "@/app/api/v1/auth/me/route";
import { body, makeRequest, unique } from "./helpers";

describe("auth", () => {
  it("registers, sets a session cookie, and serves /me", async () => {
    const email = `${unique("reg")}@test.local`;
    const res = await register(
      makeRequest("/api/v1/auth/register", {
        method: "POST",
        json: { name: "Reg User", email, password: "supersecret1" },
      }),
      {},
    );
    expect(res.status).toBe(201);
    const cookie = res.headers.get("set-cookie");
    expect(cookie).toContain("lp_session=");
    expect(cookie).toContain("HttpOnly");

    const meRes = await me(makeRequest("/api/v1/auth/me", { cookie: cookie!.split(";")[0]! }), {});
    expect(meRes.status).toBe(200);
    const data = await body<{ user: { email: string } }>(meRes);
    expect(data.user.email).toBe(email);
  });

  it("rejects duplicate registration with 409", async () => {
    const email = `${unique("dup")}@test.local`;
    const payload = { name: "Dup", email, password: "supersecret1" };
    await register(makeRequest("/x", { method: "POST", json: payload }), {});
    const res = await register(makeRequest("/x", { method: "POST", json: payload }), {});
    expect(res.status).toBe(409);
  });

  it("rejects weak passwords", async () => {
    const res = await register(
      makeRequest("/x", {
        method: "POST",
        json: { name: "Weak", email: `${unique("weak")}@test.local`, password: "short" },
      }),
      {},
    );
    expect(res.status).toBe(400);
  });

  it("logs in with valid credentials and rejects bad passwords with 401", async () => {
    const email = `${unique("login")}@test.local`;
    await register(
      makeRequest("/x", { method: "POST", json: { name: "L", email, password: "supersecret1" } }),
      {},
    );
    const ok = await login(
      makeRequest("/x", { method: "POST", json: { email, password: "supersecret1" } }),
      {},
    );
    expect(ok.status).toBe(200);

    const bad = await login(
      makeRequest("/x", { method: "POST", json: { email, password: "wrong-password" } }),
      {},
    );
    expect(bad.status).toBe(401);
    const err = await body<{ error: { code: string } }>(bad);
    expect(err.error.code).toBe("unauthorized");
  });

  it("requires auth for /me", async () => {
    const res = await me(makeRequest("/api/v1/auth/me"), {});
    expect(res.status).toBe(401);
  });
});
