import { eventsCsvUrl } from "./api";
import { OpensPulse, DeckBars } from "./charts";
import { ago } from "./format";
import type { AnalyticsSummary } from "./types";

function Tile({ label, value, alert }: { label: string; value: number; alert?: boolean }): React.ReactElement {
  return (
    <div className={alert ? "tile alert" : "tile"}>
      <div className="k">{label}</div>
      <div className="v num">{value}</div>
    </div>
  );
}

export function Dashboard({ data }: { data: AnalyticsSummary }): React.ReactElement {
  return (
    <main>
        <div className="tiles">
          <Tile label="Deck opens" value={data.totalOpens} />
          <Tile label="Unique viewers" value={data.uniqueViewers} />
          <Tile label="Sign-ins" value={data.loginSuccesses} />
          <Tile label="Scrape attempts" value={data.botAttempts.length} alert />
        </div>

        <section className="panel">
          <div className="eyebrow">Engagement</div>
          <h2>Opens over time</h2>
          <p className="cap">Every time a recipient opened one of your decks.</p>
          <div className="chartbox">
            {data.opensOverTime.length ? <OpensPulse data={data.opensOverTime} /> : <p className="empty">No opens yet. Share a deck to start the trail.</p>}
          </div>
        </section>

        <div className="two">
          <section className="panel">
            <div className="eyebrow">Decks</div>
            <h2>Most opened</h2>
            <div className="chartbox" style={{ height: "auto" }}>
              {data.byDeck.length ? <DeckBars decks={data.byDeck} /> : <p className="empty">No decks opened yet.</p>}
            </div>
          </section>

          <section className="panel">
            <div className="eyebrow">People</div>
            <h2>Who is reading</h2>
            {data.byRecipient.length ? (
              <table>
                <thead>
                  <tr>
                    <th>Recipient</th>
                    <th className="r">Opens</th>
                    <th className="r">Last seen</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byRecipient.map((r) => (
                    <tr key={r.recipient}>
                      <td className="who">{r.recipient}</td>
                      <td className="r num">{r.opens}</td>
                      <td className="r ago">{ago(r.lastSeen)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="empty">No readers yet.</p>
            )}
          </section>
        </div>

        <section className="panel trip">
          <div className="eyebrow">Tripwire</div>
          <h2>Scrape attempts</h2>
          <p className="cap">Requests from known AI and crawler agents, refused at the door.</p>
          {data.botAttempts.length ? (
            <table className="trip">
              <thead>
                <tr>
                  <th>When</th>
                  <th>IP</th>
                  <th>Agent</th>
                </tr>
              </thead>
              <tbody>
                {data.botAttempts.slice(0, 20).map((b, i) => (
                  <tr key={i}>
                    <td className="ago">{ago(b.ts)}</td>
                    <td className="num">{b.ip ?? "unknown"}</td>
                    <td>
                      <span className="ua">{b.ua ?? "unknown"}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="empty">None so far. Nobody has tried to scrape your decks.</p>
          )}
        </section>

        <div className="actions">
          <a className="btn" href={eventsCsvUrl}>
            Download audit log (CSV)
          </a>
        </div>
      </main>
  );
}
