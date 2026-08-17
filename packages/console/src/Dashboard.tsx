import { eventsCsvUrl } from "./api";
import { OpensPulse, DeckBars } from "./charts";
import { ago, duration } from "./format";
import type { AnalyticsSummary } from "./types";

function Tile({
  label,
  value,
  alert,
  detail,
}: {
  label: string;
  value: number;
  alert?: boolean;
  detail?: string;
}): React.ReactElement {
  return (
    <div className={alert ? "tile alert" : "tile"}>
      <div className="k">{label}</div>
      <div className="v num">{value}</div>
      {detail ? <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 6 }}>{detail}</div> : null}
    </div>
  );
}

export function Dashboard({ data }: { data: AnalyticsSummary }): React.ReactElement {
  // Which tripwire fired, not just that one did: contextmenu, selection, or whatever else the
  // beacon later adds. Most frequent first, so the reader sees the dominant one at a glance.
  const tripwireDetail = Object.entries(data.tripwireReasons)
    .sort((a, b) => b[1] - a[1])
    .map(([reason, count]) => `${reason} ${count}`)
    .join(", ");

  return (
    <main>
        <div className="tiles">
          <Tile label="Deck opens" value={data.totalOpens} />
          <Tile label="Unique viewers" value={data.uniqueViewers} />
          <Tile label="Read to the end" value={data.completions} />
          {/* Someone signed in and asked for a deck that was not theirs, or asked for one with
              no invite at all. A forwarded link shows up here. */}
          <Tile label="Refused" value={data.deniedCount} />
          <Tile label="Scrape attempts" value={data.botAttempts.length} alert />
          {/* A heuristic, not a fact about a person: see the detection comment in beacon.ts for
              the false positives it still has, such as a browser extension that formats
              console output with nobody watching. */}
          <Tile label="Devtools opened (signal)" value={data.devtoolsOpens} />
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

        <div className="two">
          <section className="panel">
            <div className="eyebrow">Attention</div>
            <h2>Where the time went</h2>
            <p className="cap">
              Time on each slide, longest first. The middle column is the typical reader, not the
              average, so one deck left open in a tab cannot move it.
            </p>
            {data.bySlide.length ? (
              <table>
                <thead>
                  <tr>
                    <th>Slide</th>
                    <th className="r">Views</th>
                    <th className="r">Typical</th>
                    <th className="r">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {data.bySlide.slice(0, 12).map((s) => (
                    <tr key={`${s.artifactId} ${s.slideId}`}>
                      <td className="who">{s.slideId}</td>
                      <td className="r num">{s.views}</td>
                      <td className="r num">{duration(s.medianDwellMs)}</td>
                      <td className="r num">{duration(s.totalDwellMs)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="empty">Nothing read yet. This fills in as people move through a deck.</p>
            )}
          </section>

          <section className="panel">
            <div className="eyebrow">Depth</div>
            <h2>How far they got</h2>
            <p className="cap">The furthest point each person reached, and how long they spent.</p>
            {data.reading.length ? (
              <table>
                <thead>
                  <tr>
                    <th>Recipient</th>
                    <th className="r">Read</th>
                    <th className="r">Slides</th>
                    <th className="r">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {data.reading.slice(0, 12).map((r) => (
                    <tr key={`${r.recipient} ${r.artifactId}`}>
                      <td className="who">{r.recipient}</td>
                      <td className="r num">{r.finished ? "all of it" : `${r.completion}%`}</td>
                      <td className="r num">{r.totalSlides ? `${r.slidesViewed} / ${r.totalSlides}` : r.slidesViewed}</td>
                      <td className="r num">{duration(r.dwellMs)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="empty">No reading recorded yet.</p>
            )}
          </section>
        </div>

        <section className="panel">
          <div className="eyebrow">Protection</div>
          <h2>Viewer attempts</h2>
          <p className="cap">
            Actions a signed-in reader took against the deck&apos;s copy protection. This is a
            viewer on their own copy, not the bot traffic in Scrape attempts below.
          </p>
          <div className="tiles">
            <Tile label="Copy attempts" value={data.copyAttempts} alert />
            <Tile label="Print attempts" value={data.printAttempts} alert />
            <Tile label="Download attempts" value={data.downloadAttempts} alert />
            <Tile label="Tripwires" value={data.tripwires} alert detail={tripwireDetail || undefined} />
          </div>
        </section>

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
