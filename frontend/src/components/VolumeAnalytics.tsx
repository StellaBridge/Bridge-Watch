interface VolumeData {
  volume24h?: number;
  volume7d?: number;
  volume30d?: number;
}

interface VolumeAnalyticsProps {
  data: VolumeData | null | undefined;
  isLoading: boolean;
}

export default function VolumeAnalytics({ data, isLoading }: VolumeAnalyticsProps) {
  if (isLoading) {
    return (
      <div className="bg-stellar-card border border-stellar-border rounded-xl p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Volume Analytics</h3>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-10 bg-stellar-border rounded animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-stellar-card border border-stellar-border rounded-xl p-6">
      <h3 className="text-lg font-semibold text-white mb-4">Volume Analytics</h3>
      {data ? (
        <div className="grid grid-cols-3 gap-4">
          {data.volume24h !== undefined && (
            <div>
              <p className="text-xs text-stellar-text-secondary">24H Volume</p>
              <p className="text-lg font-semibold text-white">${data.volume24h.toLocaleString()}</p>
            </div>
          )}
          {data.volume7d !== undefined && (
            <div>
              <p className="text-xs text-stellar-text-secondary">7D Volume</p>
              <p className="text-lg font-semibold text-white">${data.volume7d.toLocaleString()}</p>
            </div>
          )}
          {data.volume30d !== undefined && (
            <div>
              <p className="text-xs text-stellar-text-secondary">30D Volume</p>
              <p className="text-lg font-semibold text-white">${data.volume30d.toLocaleString()}</p>
            </div>
          )}
        </div>
      ) : (
        <p className="text-stellar-text-secondary text-sm">No volume data available.</p>
      )}
    </div>
  );
}
