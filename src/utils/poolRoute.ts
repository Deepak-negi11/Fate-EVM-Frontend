import {
  BaseError, ContractFunctionRevertedError, ContractFunctionZeroDataError, createPublicClient, type Address,
} from "viem";
import { PredictionPoolABI } from "./abi/PredictionPool";
import { getChainConfig } from "./chainConfig";
import { getTransport } from "./rpcTransport";
import { isChainSupported } from "./supportedChainFeed";

export type PoolProbe = "found" | "missing" | "error";
export type PoolChainLookup =
  | { chainId: number }
  | { choices: number[]; incomplete: boolean }
  | { error: "missing" | "unreachable" };

export const poolHref = (poolId: string, chainId: number): string =>
  `/pool?id=${poolId}&chainId=${chainId}`;

// null: the link has no chain, or names one the app does not support.
export const resolvePoolChainId = (param: string | null): number | null => {
  if (param === null) return null;
  const chainId = Number(param);
  return String(chainId) === param && isChainSupported(chainId) ? chainId : null;
};

export const isPoolMissingError = (error: unknown): boolean =>
  error instanceof BaseError && error.walk(
    (e) => e instanceof ContractFunctionRevertedError || e instanceof ContractFunctionZeroDataError,
  ) !== null;

export const probePool = async (chainId: number, poolId: Address): Promise<PoolProbe> => {
  const chain = getChainConfig(chainId)?.chain;
  if (!chain) return "missing";
  try {
    const client = createPublicClient({ chain, transport: getTransport(chainId) });
    await client.readContract({ address: poolId, abi: PredictionPoolABI, functionName: "baseToken" });
    return "found";
  } catch (error) {
    return isPoolMissingError(error) ? "missing" : "error";
  }
};

// For a link without a chain: redirect only when one chain has the pool and every other chain said it has none.
export const findPoolChain = async (
  chainIds: readonly number[],
  probe: (chainId: number) => Promise<PoolProbe>,
): Promise<PoolChainLookup> => {
  const results = await Promise.all(chainIds.map((chainId) => probe(chainId)));
  const found = chainIds.filter((_, i) => results[i] === "found");
  const incomplete = results.includes("error");
  if (found.length === 1 && !incomplete) return { chainId: found[0] };
  if (found.length > 0) return { choices: found, incomplete };
  return { error: incomplete ? "unreachable" : "missing" };
};
