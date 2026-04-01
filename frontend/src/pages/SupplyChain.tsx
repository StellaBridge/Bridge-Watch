import SupplyChainViz from "../components/SupplyChainViz";
import { useSupplyChainData } from "../hooks/useSupplyChainData";

export default function SupplyChain() {
  const { data, isLoading, error } = useSupplyChainData();

  return (
    <div className="flex flex-col h-full gap-4 p-4">
      <div>
        <h1 className="text-xl font-semibold text-white">Supply Chain</h1>
        <p className="text-sm text-slate-400 mt-0.5">
          Cross-chain asset flow and bridge health overview
        </p>
      </div>

      <div className="flex-1 min-h-0 rounded-xl overflow-hidden">
        <SupplyChainViz
          data={
            data ?? {
              nodes: [],
              edges: [],
              totalSupplyUsd: 0,
              totalBridgeVolumeUsd: 0,
              lastUpdated: new Date().toISOString(),
            }
          }
          isLoading={isLoading}
          error={error?.message ?? null}
        />
      </div>
    </div>
  );
}
