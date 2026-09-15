import { Link } from "react-router-dom";
import Sparkline from "./Sparkline";
import ChangeBadge from "./ChangeBadge";
import { dirOf, fmtPriceVnd } from "../lib/format";
import type { IndexConstituent } from "../lib/types";
import "./ConstituentTable.css";

interface Props {
  rows: IndexConstituent[];
  loading?: boolean;
}

/** Ranked members of an index or sector. Shared by IndexPage and SectorPage. */
export default function ConstituentTable({ rows, loading }: Props) {
  if (loading) {
    return (
      <div className="gf-card ctable__rows">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="gf-skeleton ctable__row-skel" />
        ))}
      </div>
    );
  }

  if (!rows.length) {
    return <p className="ctable__empty text-muted">No constituent data available.</p>;
  }

  return (
    <div className="gf-card ctable__wrap">
      <table className="ctable">
        <thead>
          <tr>
            <th scope="col">Symbol</th>
            <th scope="col" className="ctable__th-spark">
              Trend
            </th>
            <th scope="col" className="ctable__num">
              Price
            </th>
            <th scope="col" className="ctable__num">
              Change
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.ticker}>
              <td>
                <Link to={`/quote/${c.ticker}`} className="ctable__sym">
                  <span className="ctable__sym-ticker">{c.ticker}</span>
                  {c.name && <span className="ctable__sym-name text-secondary">{c.name}</span>}
                </Link>
              </td>
              <td className="ctable__td-spark">
                <Sparkline
                  data={c.spark}
                  width={72}
                  height={26}
                  fill
                  direction={dirOf(c.change_pct)}
                />
              </td>
              <td className="ctable__num mono">{fmtPriceVnd(c.last)}</td>
              <td className="ctable__num">
                <ChangeBadge pct={c.change_pct} size="sm" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
