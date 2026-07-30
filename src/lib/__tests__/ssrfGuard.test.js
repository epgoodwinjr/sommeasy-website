// SSRF guard test suite — Session 4 (Hardening & Watchtower)
// Run with: node src/lib/__tests__/ssrfGuard.test.js
//
// Tests the REAL module. The IP classifier is pure; assertPublicUrl/safeFetch
// take an injectable lookup + fetchImpl so the resolver and per-hop
// revalidation are exercised with zero real network.

let passed = 0, failed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    console.log(`  ✗ ${name}\n    ${err.message}`);
  }
}
function assert(cond, msg) { if (!cond) throw new Error("ASSERT FAILED: " + msg); }
async function throwsReason(fn, reason) {
  try {
    await fn();
  } catch (err) {
    assert(err.reason === reason, `expected reason ${reason}, got ${err.reason} (${err.message})`);
    return;
  }
  throw new Error(`expected throw with reason ${reason}, but it resolved`);
}

async function main() {
  const { isBlockedIp, assertPublicUrl, safeFetch, SsrfError } = await import("../ssrfGuard.js");

  console.log("\n═══ isBlockedIp — the block table ═══");

  const BLOCKED = [
    ["169.254.169.254", "AWS/GCP metadata (link-local)"],
    ["169.254.1.1", "link-local"],
    ["127.0.0.1", "loopback"],
    ["127.255.255.255", "loopback edge"],
    ["0.0.0.0", "this-host"],
    ["10.0.0.1", "private 10/8"],
    ["172.16.0.1", "private 172.16/12"],
    ["172.31.255.255", "private 172.16/12 edge"],
    ["192.168.1.1", "private 192.168/16"],
    ["100.64.0.1", "CGNAT"],
    ["192.0.0.1", "IETF"],
    ["198.18.0.1", "benchmarking"],
    ["224.0.0.1", "multicast"],
    ["255.255.255.255", "broadcast"],
    ["::1", "IPv6 loopback"],
    ["::", "IPv6 unspecified"],
    ["::ffff:127.0.0.1", "IPv4-mapped loopback"],
    ["::ffff:169.254.169.254", "IPv4-mapped metadata"],
    ["::ffff:10.0.0.1", "IPv4-mapped private"],
    ["fd00::1", "unique-local fd"],
    ["fc00::1", "unique-local fc"],
    ["fe80::1", "link-local v6"],
    ["ff02::1", "multicast v6"],
    ["2001:db8::1", "documentation v6"],
    ["100::1", "discard-only v6"],
  ];
  for (const [ip, label] of BLOCKED) {
    await test(`blocks ${ip} (${label})`, () => assert(isBlockedIp(ip) === true, ip));
  }

  const PUBLIC = [
    ["8.8.8.8", "Google DNS"],
    ["1.1.1.1", "Cloudflare DNS"],
    ["93.184.216.34", "example.com"],
    ["172.15.255.255", "just below 172.16/12"],
    ["172.32.0.1", "just above 172.16/12"],
    ["100.63.255.255", "just below CGNAT"],
    ["100.128.0.1", "just above CGNAT"],
    ["11.0.0.1", "just above 10/8"],
    ["2606:2800:220:1:248:1893:25c8:1946", "example.com v6"],
    ["2001:4860:4860::8888", "Google DNS v6"],
    ["::ffff:8.8.8.8", "IPv4-mapped public"],
  ];
  for (const [ip, label] of PUBLIC) {
    await test(`allows ${ip} (${label})`, () => assert(isBlockedIp(ip) === false, ip));
  }

  await test("fails closed on garbage input", () => {
    for (const junk of ["", "not-an-ip", "999.999.999.999", "1.2.3", null, undefined, "12345"]) {
      assert(isBlockedIp(junk) === true, `should block junk: ${junk}`);
    }
  });

  console.log("\n═══ assertPublicUrl — protocol + resolve + validate ═══");

  const pub = async () => ["93.184.216.34"];

  await test("http/https to a public host passes", async () => {
    const r = await assertPublicUrl("http://example.com/menu", { lookup: pub });
    assert(r.hostname === "example.com", "hostname");
    const r2 = await assertPublicUrl("https://example.com", { lookup: pub });
    assert(r2.hostname === "example.com", "https hostname");
  });

  await test("non-http protocols are rejected (file:, ftp:, gopher:)", async () => {
    for (const u of ["file:///etc/passwd", "ftp://x.com", "gopher://x.com"]) {
      await throwsReason(() => assertPublicUrl(u, { lookup: pub }), "bad_protocol");
    }
  });

  await test("a host that resolves to metadata is blocked_host", async () => {
    await throwsReason(
      () => assertPublicUrl("http://metadata.attacker.test", { lookup: async () => ["169.254.169.254"] }),
      "blocked_host"
    );
  });

  await test("ANY blocked address among many rejects the whole host", async () => {
    await throwsReason(
      () => assertPublicUrl("http://mixed.test", { lookup: async () => ["93.184.216.34", "127.0.0.1"] }),
      "blocked_host"
    );
  });

  await test("IPv6 metadata literal in brackets is blocked", async () => {
    await throwsReason(
      () => assertPublicUrl("http://[::ffff:169.254.169.254]/", { lookup: async () => ["::ffff:169.254.169.254"] }),
      "blocked_host"
    );
  });

  await test("resolve failure → dns_failed (not a crash)", async () => {
    await throwsReason(
      () => assertPublicUrl("http://nope.invalid", { lookup: async () => { throw new Error("ENOTFOUND"); } }),
      "dns_failed"
    );
    await throwsReason(
      () => assertPublicUrl("http://empty.test", { lookup: async () => [] }),
      "dns_failed"
    );
  });

  console.log("\n═══ safeFetch — per-hop revalidation + hop cap ═══");

  const okResponse = () => new Response("ok", { status: 200 });
  const redirectTo = (loc) => new Response(null, { status: 302, headers: { location: loc } });

  await test("a direct public fetch returns the response", async () => {
    let called = 0;
    const res = await safeFetch("http://example.com", {}, {
      lookup: pub,
      fetchImpl: async () => { called++; return okResponse(); },
    });
    assert(res.status === 200, "status");
    assert(called === 1, "one fetch");
  });

  await test("a public URL that 302s to metadata is stopped at the hop", async () => {
    // First hop resolves public and returns a redirect to a metadata host;
    // the SECOND assertPublicUrl (on the Location) must reject.
    const lookup = async (host) =>
      host === "evil.test" ? ["169.254.169.254"] : ["93.184.216.34"];
    await throwsReason(
      () => safeFetch("http://example.com", {}, {
        lookup,
        fetchImpl: async () => redirectTo("http://evil.test/steal"),
      }),
      "blocked_host"
    );
  });

  await test("redirect hop cap is enforced", async () => {
    await throwsReason(
      () => safeFetch("http://example.com", {}, {
        maxHops: 2,
        lookup: pub,
        fetchImpl: async () => redirectTo("http://example.com/loop"),
      }),
      "too_many_redirects"
    );
  });

  await test("relative redirect Location resolves against the current URL", async () => {
    let seen = [];
    const res = await safeFetch("http://example.com/a", {}, {
      lookup: pub,
      fetchImpl: async (url) => {
        seen.push(url);
        return seen.length === 1 ? redirectTo("/b") : okResponse();
      },
    });
    assert(res.status === 200, "final status");
    assert(seen[1] === "http://example.com/b", `resolved relative: ${seen[1]}`);
  });

  await test("SsrfError carries a machine-readable reason", () => {
    const e = new SsrfError("blocked_host", "x → 127.0.0.1");
    assert(e instanceof Error && e.name === "SsrfError" && e.reason === "blocked_host", "shape");
  });

  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => { console.error(err); process.exit(1); });
