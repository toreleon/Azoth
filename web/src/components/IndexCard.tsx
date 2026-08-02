import "./IndexCard.css";
import type { IndexSnapshot } from "../lib/types";
import { dirOf, fmtIndex, fmtChangeAbs } from "../lib/format";
import ChangeBadge from "./ChangeBadge";
import Sparkline from "./Sparkline";

interface Props {
  index: IndexSnapshot;
}

export default function IndexCard({ index }: Props) {
  const dir = dirOf(index.change_pct_1d);
  return (
    <div className="gf-card indexcard">
      <span className="indexcard__name">{index.name}</span>
      <div className="indexcard__value mono">{fmtIndex(index.latest_close)}</div>
      <div className={`indexcard__change ${dir}`}>
        <span className="indexcard__abs mono">{fmtChangeAbs(index.change_abs)}</span>
        <ChangeBadge pct={index.change_pct_1d} size="sm" />
      </div>
      <div className="indexcard__spark">
        <Sparkline data={index.spark} width={160} height={30} fill direction={dir} />
      </div>
    </div>
  );
}
