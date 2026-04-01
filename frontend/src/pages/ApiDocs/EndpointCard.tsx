import { useState } from "react";
import type { Endpoint } from "./data";
import { generateSnippet } from "./data";
import CodeSnippet from "./CodeSnippet";
import RequestBuilder from "./RequestBuilder";
import ResponseViewer from "./ResponseViewer";

const METHOD_COLORS: Record<string, string> = {
  GET: "bg-green-900 text-green-300",
  POST: "bg-blue-900 text-blue-300",
  DELETE: "bg-red-900 text-red-300",
  WS: "bg-purple-900 text-purple-300",
};

const STATUS_COLORS: Record<number, string> = {
  200: "text-green-400",
  404: "text-yellow-400",
  429: "text-orange-400",
  500: "text-red-400",
};

type Lang = "curl" | "js" | "python";

interface Props {
  endpoint: Endpoint;
}

export default function EndpointCard({ endpoint }: Props) {
  const [open, setOpen] = useState(false);
  const [lang, setLang] = useState<Lang>("curl");

  return (
    <div className="border border-stellar-border rounded-lg overflow-hidden">
      {/* Header — always visible */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 bg-stellar-card hover:bg-[#1a1f35] transition-colors text-left"
        aria-expanded={open}
      >
        <span className={`text-xs font-bold px-2 py-0.5 rounded font-mono shrink-0 ${METHOD_COLORS[endpoint.method]}`}>
          {endpoint.method}
        </span>
        <span className="text-sm font-mono text-white">{endpoint.path}</span>
        <span className="text-sm text-stellar-text-secondary ml-2 hidden sm:block">{endpoint.summary}</span>
        <span className="ml-auto text-stellar-text-secondary text-xs">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="px-4 pb-5 pt-4 bg-stellar-dark space-y-5 border-t border-stellar-border">
          <p className="text-sm text-stellar-text-secondary">{endpoint.description}</p>

          {/* Path params table */}
          {(endpoint.pathParams ?? []).length > 0 && (
            <section>
              <h4 className="text-xs font-semibold text-stellar-text-secondary uppercase tracking-wide mb-2">Path Parameters</h4>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-stellar-text-secondary border-b border-stellar-border">
                    <th className="pb-1 pr-4 font-medium">Name</th>
                    <th className="pb-1 pr-4 font-medium">Type</th>
                    <th className="pb-1 pr-4 font-medium">Required</th>
                    <th className="pb-1 font-medium">Description</th>
                  </tr>
                </thead>
                <tbody>
                  {endpoint.pathParams!.map((p) => (
                    <tr key={p.name} className="border-b border-stellar-border last:border-0">
                      <td className="py-1.5 pr-4 font-mono text-white">{p.name}</td>
                      <td className="py-1.5 pr-4 text-blue-300">{p.type}</td>
                      <td className="py-1.5 pr-4 text-yellow-400">{p.required ? "yes" : "no"}</td>
                      <td className="py-1.5 text-stellar-text-secondary">{p.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {/* Response codes */}
          {endpoint.responseCodes.length > 0 && (
            <section>
              <h4 className="text-xs font-semibold text-stellar-text-secondary uppercase tracking-wide mb-2">Response Codes</h4>
              <div className="flex flex-wrap gap-2">
                {endpoint.responseCodes.map((r) => (
                  <span key={r.code} className={`text-xs font-mono ${STATUS_COLORS[r.code] ?? "text-white"}`}>
                    <span className="font-bold">{r.code}</span> — {r.description}
                  </span>
                ))}
              </div>
            </section>
          )}

          {/* Example response */}
          <section>
            <h4 className="text-xs font-semibold text-stellar-text-secondary uppercase tracking-wide mb-2">Example Response</h4>
            <ResponseViewer json={endpoint.exampleResponse} />
          </section>

          {/* Code snippets */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-semibold text-stellar-text-secondary uppercase tracking-wide">Code Snippet</h4>
              <div className="flex gap-1">
                {(["curl", "js", "python"] as Lang[]).map((l) => (
                  <button
                    key={l}
                    onClick={() => setLang(l)}
                    className={`text-xs px-2 py-0.5 rounded transition-colors ${
                      lang === l ? "bg-stellar-blue text-white" : "text-stellar-text-secondary hover:text-white"
                    }`}
                  >
                    {l === "js" ? "JavaScript" : l === "python" ? "Python" : "cURL"}
                  </button>
                ))}
              </div>
            </div>
            <CodeSnippet code={generateSnippet(endpoint, lang)} lang={lang === "js" ? "javascript" : lang} />
          </section>

          {/* Interactive try-it */}
          <section>
            <h4 className="text-xs font-semibold text-stellar-text-secondary uppercase tracking-wide mb-3">Try It Out</h4>
            <RequestBuilder endpoint={endpoint} />
          </section>
        </div>
      )}
    </div>
  );
}
