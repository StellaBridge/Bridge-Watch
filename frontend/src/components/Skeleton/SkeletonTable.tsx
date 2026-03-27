import SkeletonText from "./SkeletonText";

export interface SkeletonTableProps {
  rowCount?: number;
  colCount?: number;
  rowHeight?: number;
  className?: string;
}

export default function SkeletonTable({
  rowCount = 4,
  colCount = 5,
  rowHeight = 18,
  className,
}: SkeletonTableProps) {
  return (
    <div className={`overflow-x-auto bg-stellar-card border border-stellar-border rounded-lg p-4 ${className ?? ""}`}>
      <table className="w-full text-sm" aria-label="Loading table">
        <thead>
          <tr>
            {Array.from({ length: colCount }).map((_, colIndex) => (
              <th key={colIndex} className="pb-3 pr-4 text-left text-stellar-text-secondary">
                <SkeletonText lines={1} width={"80%"} height={rowHeight} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rowCount }).map((_, rowIndex) => (
            <tr key={rowIndex} className="border-b border-stellar-border">
              {Array.from({ length: colCount }).map((_, colIndex) => (
                <td key={colIndex} className="py-3 pr-4">
                  <SkeletonText lines={1} width={"100%"} height={rowHeight} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
