import type { ReactNode } from 'react';

export function DataTable({ caption, headers, children }: { caption: string; headers: readonly string[]; children: ReactNode }) {
  return <div className="table-scroll" role="region" aria-label={caption} tabIndex={0}><table className="data-table"><caption className="sr-only">{caption}</caption><thead><tr>{headers.map(header => <th key={header} scope="col">{header}</th>)}</tr></thead><tbody>{children}</tbody></table></div>;
}
