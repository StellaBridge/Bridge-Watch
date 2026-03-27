import { useState } from "react";

interface Props {
  code: string;
  lang: string;
}

export default function CodeSnippet({ code, lang }: Props) {
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="relative rounded-md bg-[#0d1117] border border-stellar-border overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-stellar-border">
        <span className="text-xs text-stellar-text-secondary font-mono">{lang}</span>
        <button
          onClick={copy}
          className="text-xs text-stellar-text-secondary hover:text-white transition-colors"
          aria-label="Copy code"
        >
          {copied ? "✓ Copied" : "Copy"}
        </button>
      </div>
      <pre className="p-4 text-sm text-green-300 font-mono overflow-x-auto whitespace-pre">
        {code}
      </pre>
    </div>
  );
}
