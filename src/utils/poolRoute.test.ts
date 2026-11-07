import { describe, expect, it } from "vitest";
import { polygon, sepolia } from "viem/chains";
import { findPoolChain, poolHref, resolvePoolChainId, type PoolProbe } from "@/utils/poolRoute";

const POOL = "0x9a89A1eC7BE0c6A5DeC5FB759420CBB230A456Ef";
const CHAINS = [sepolia.id, polygon.id];

const probeOn = (results: Record<number, PoolProbe>) => async (chainId: number) => results[chainId] ?? "missing";

describe("poolHref", () => {
  it("names the pool's chain in the link", () => {
    expect(poolHref(POOL, polygon.id)).toBe(`/pool?id=${POOL}&chainId=137`);
  });
});

describe("resolvePoolChainId", () => {
  it("reads the chain named in the link", () => {
    expect(resolvePoolChainId("137")).toBe(polygon.id);
    expect(resolvePoolChainId("11155111")).toBe(sepolia.id);
  });

  it("does not guess a chain for a link without one", () => {
    expect(resolvePoolChainId(null)).toBeNull();
  });

  it("rejects a chain the app does not support or cannot parse", () => {
    for (const param of ["1", "0", "", "abc", "137abc", " 137", "0137", "137.0", "-137", "1e2", "0x89", "Infinity", "11155111000000000001"]) {
      expect(resolvePoolChainId(param), JSON.stringify(param)).toBeNull();
    }
  });
});

describe("findPoolChain", () => {
  it("sends the issue's link without a chain to the Polygon pool", async () => {
    const params = new URLSearchParams(`?id=${POOL}`);
    expect(resolvePoolChainId(params.get("chainId"))).toBeNull();
    const found = await findPoolChain(CHAINS, probeOn({ [polygon.id]: "found" }));
    expect(found).toEqual({ chainId: polygon.id });
    expect(poolHref(POOL, polygon.id)).toBe(`/pool?id=${POOL}&chainId=137`);
  });

  it("asks for a choice when the pool answers on several chains, in configured order", async () => {
    const both = probeOn({ [sepolia.id]: "found", [polygon.id]: "found" });
    expect(await findPoolChain(CHAINS, both)).toEqual({ choices: [sepolia.id, polygon.id], incomplete: false });
  });

  it("asks for a choice instead of redirecting when another chain could not be checked", async () => {
    expect(await findPoolChain(CHAINS, probeOn({ [sepolia.id]: "error", [polygon.id]: "found" })))
      .toEqual({ choices: [polygon.id], incomplete: true });
  });

  it("says missing only when every chain answered, unreachable otherwise", async () => {
    expect(await findPoolChain(CHAINS, probeOn({}))).toEqual({ error: "missing" });
    expect(await findPoolChain(CHAINS, probeOn({ [polygon.id]: "error" }))).toEqual({ error: "unreachable" });
  });
});
