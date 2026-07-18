import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Filler,
  Tooltip,
} from "chart.js";
import { Line, Bar } from "react-chartjs-2";
import { C } from "./colors";
import type { DailyOpens, DeckStat } from "./types";

// Register only the pieces the console uses, so the bundle stays small.
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Filler, Tooltip);

ChartJS.defaults.font.family = "ui-monospace, 'Cascadia Code', 'SF Mono', Menlo, Consolas, monospace";
ChartJS.defaults.color = C.axis;

/** The "pulse": opens over time, as a filled line. The centrepiece of the dashboard. */
export function OpensPulse({ data }: { data: DailyOpens[] }): React.ReactElement {
  return (
    <Line
      height={90}
      data={{
        labels: data.map((d) => d.date.slice(5)),
        datasets: [
          {
            data: data.map((d) => d.opens),
            borderColor: C.accent,
            backgroundColor: C.accentSoft,
            fill: true,
            tension: 0.35,
            pointRadius: data.length > 30 ? 0 : 3,
            pointBackgroundColor: C.accent,
            borderWidth: 2,
          },
        ],
      }}
      options={{
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { intersect: false, mode: "index" } },
        scales: {
          x: { grid: { color: C.grid }, ticks: { maxRotation: 0, autoSkip: true } },
          y: { grid: { color: C.grid }, ticks: { precision: 0 }, beginAtZero: true },
        },
      }}
    />
  );
}

/** Per-deck opens as horizontal bars, ranked. */
export function DeckBars({ decks }: { decks: DeckStat[] }): React.ReactElement {
  const top = decks.slice(0, 8);
  return (
    <Bar
      height={Math.max(120, top.length * 34)}
      data={{
        labels: top.map((d) => d.artifactId),
        datasets: [{ data: top.map((d) => d.opens), backgroundColor: C.accent, borderRadius: 4, barThickness: 16 }],
      }}
      options={{
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { intersect: false } },
        scales: {
          x: { grid: { color: C.grid }, ticks: { precision: 0 }, beginAtZero: true },
          y: { grid: { display: false } },
        },
      }}
    />
  );
}
