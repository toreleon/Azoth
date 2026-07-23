import { Link } from "react-router-dom";
import MarketStrip from "../components/MarketStrip";
import MarketSummary from "../components/MarketSummary";
import DiscoverStrip from "../components/DiscoverStrip";
import "./Home.css";

export default function Home() {
  return (
    <div className="home">
      <section className="home__section">
        <header className="home__head">
          <h1 className="home__title">Markets</h1>
          <Link to="/markets" className="home__more">
            Market trends →
          </Link>
        </header>
        <MarketStrip />
      </section>

      <section className="home__section">
        <MarketSummary />
      </section>

      <section className="home__section">
        <h2 className="gf-section-title home__subtitle">You may be interested in</h2>
        <DiscoverStrip />
      </section>
    </div>
  );
}
