interface Props {
  svgRef: React.RefObject<SVGSVGElement | null>;
  filename?: string;
}

export default function ExportButton({ svgRef, filename = "supply-chain" }: Props) {
  function handleExportSvg() {
    const svg = svgRef.current;
    if (!svg) return;
    const serializer = new XMLSerializer();
    const svgStr = serializer.serializeToString(svg);
    const blob = new Blob([svgStr], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filename}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleExportPng() {
    const svg = svgRef.current;
    if (!svg) return;

    const bbox = svg.getBoundingClientRect();
    const canvas = document.createElement("canvas");
    canvas.width = bbox.width * window.devicePixelRatio;
    canvas.height = bbox.height * window.devicePixelRatio;

    const serializer = new XMLSerializer();
    const svgStr = serializer.serializeToString(svg);
    const svgBlob = new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);

    const img = new Image();
    img.onload = () => {
      const ctx = canvas.getContext("2d")!;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
      ctx.drawImage(img, 0, 0, bbox.width, bbox.height);
      URL.revokeObjectURL(url);
      canvas.toBlob((blob) => {
        if (!blob) return;
        const pngUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = pngUrl;
        a.download = `${filename}.png`;
        a.click();
        URL.revokeObjectURL(pngUrl);
      }, "image/png");
    };
    img.src = url;
  }

  return (
    <div className="absolute bottom-4 left-4 flex gap-1">
      <button
        onClick={handleExportSvg}
        className="text-xs bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-300 hover:text-white rounded px-2 py-1 transition-colors"
        aria-label="Export as SVG"
      >
        SVG
      </button>
      <button
        onClick={handleExportPng}
        className="text-xs bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-300 hover:text-white rounded px-2 py-1 transition-colors"
        aria-label="Export as PNG"
      >
        PNG
      </button>
    </div>
  );
}
