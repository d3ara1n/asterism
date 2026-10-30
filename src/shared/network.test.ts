import { describe, expect, it } from "vitest";
import { proxyAddress, resolvedProxyAddress } from "./network.ts";

describe("Proxy addresses", () => {
  it("normalizes hostnames and default ports while preserving SOCKS and IPv6 endpoints", () => {
    expect(proxyAddress(" HTTPS://Proxy.Example:443/ ")).toBe("https://proxy.example");
    expect(proxyAddress("socks5://[::1]:1080")).toBe("socks5://[::1]:1080");
  });

  it.each([
    "127.0.0.1:7890", "ftp://proxy.example", "http://user:secret@proxy.example",
    "http://proxy.example/path", "http://proxy.example?token=secret", "http://proxy.example#fragment",
    "socks5://proxy.example:99999",
  ])("rejects non-endpoint proxy input: %s", input => {
    expect(proxyAddress(input)).toBeNull();
  });
});

describe("System proxy resolution", () => {
  it("uses the first route instead of silently bypassing a configured proxy", () => {
    expect(resolvedProxyAddress("PROXY proxy.example:8080; DIRECT")).toBe("http://proxy.example:8080");
    expect(resolvedProxyAddress("DIRECT; PROXY proxy.example:8080")).toBeNull();
    expect(resolvedProxyAddress("HTTPS secure.example:443")).toBe("https://secure.example");
    expect(resolvedProxyAddress("SOCKS5 [::1]:1080")).toBe("socks5://[::1]:1080");
  });

  it("surfaces unsupported and malformed system routes rather than silently connecting directly", () => {
    expect(() => resolvedProxyAddress("SOCKS4 proxy.example:1080; DIRECT")).toThrow("Unsupported system proxy");
    expect(() => resolvedProxyAddress("")).toThrow("Unsupported system proxy");
    expect(() => resolvedProxyAddress("PROXY host:99999")).toThrow("invalid proxy address");
  });
});
