interface Props {
  json: unknown;
}

export default function ResponseViewer({ json }: Props) {
  return (
    <div className="rounded-md bg-[#0d1117] border border-stellar-border overflow-hidden">
      <div className="px-4 py-2 border-b border-stellar-border">
        <span className="text-xs text-stellar-text-secondary font-mono">Response</span>
      </div>
      <pre className="p-4 text-sm text-blue-300 font-mono overflow-x-auto whitespace-pre">
        {JSON.stringify(json, null, 2)}
      </pre>
    </div>
  );
}
