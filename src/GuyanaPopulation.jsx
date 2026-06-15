import { useState, useEffect, useRef, useMemo } from "react";
import "./GuyanaPopulation.css";

const FALLBACK_POP  = 831087;
const BIRTH_RATE    = 17.3 / 1000;
const DEATH_RATE    =  7.4 / 1000;
const GROWTH_RATE   = BIRTH_RATE - DEATH_RATE;

const WB = "https://api.worldbank.org/v2/country/GY/indicator";

function getRates(basePop) {
  const spy = 365.25 * 86400;
  return {
    birthsPerSec: (basePop * BIRTH_RATE) / spy,
    deathsPerSec: (basePop * DEATH_RATE) / spy,
    netPerSec:    (basePop * GROWTH_RATE) / spy,
  };
}

function getPopExact(basePop, baseDate, netPerSec) {
  return basePop + netPerSec * ((Date.now() - baseDate.getTime()) / 1000);
}

function getTodayStats(birthsPerSec, deathsPerSec, netPerSec) {
  const now = new Date();
  const sod = new Date(now);
  sod.setUTCHours(0, 0, 0, 0);
  const s = (now - sod) / 1000;
  return {
    births: Math.round(birthsPerSec * s),
    deaths: Math.round(deathsPerSec * s),
    net:    Math.round(netPerSec    * s),
  };
}

async function fetchIndicator(indicator) {
  const res  = await fetch(`${WB}/${indicator}?format=json&mrv=1`);
  const data = await res.json();
  return data[1]?.[0]?.value ?? null;
}

/* ── Nice axis ticks ──────────────────────────────────── */
function niceTicks(min, max, n = 5) {
  const range = max - min || 1;
  const rough = range / (n - 1);
  const mag   = Math.pow(10, Math.floor(Math.log10(rough)));
  const step  = [1, 2, 2.5, 5, 10].map(f => f * mag).find(s => s >= rough) ?? mag;
  const lo    = Math.floor(min / step) * step;
  const ticks = [];
  for (let t = lo; t <= max + step * 0.01; t += step) ticks.push(parseFloat(t.toPrecision(10)));
  return ticks;
}

/* ── Population line chart ────────────────────────────── */
function PopLineChart({ data }) {
  const W = 640, H = 220;
  const PAD = { top: 24, right: 20, bottom: 36, left: 78 };
  const iW  = W - PAD.left - PAD.right;
  const iH  = H - PAD.top  - PAD.bottom;

  const svgRef = useRef(null);
  const [hover, setHover] = useState(null);

  const pts = useMemo(() => data.filter(p => p.pop != null), [data]);

  if (!pts.length) return null;

  const lastPt  = pts[pts.length - 1];
  const pops    = pts.map(p => p.pop);
  const dataMin = Math.min(...pops);
  const yTks    = niceTicks(dataMin * 0.97, 900000);
  const yMin    = yTks[0], yMax = yTks[yTks.length - 1];
  const xMin   = pts[0].year;
  const xMax   = lastPt.year;

  const toX = y => PAD.left + ((y - xMin) / (xMax - xMin)) * iW;
  const toY = v => PAD.top  + (1 - (v - yMin) / (yMax - yMin)) * iH;

  const line = pts.map((p, i) => `${i ? "L" : "M"}${toX(p.year).toFixed(1)},${toY(p.pop).toFixed(1)}`).join(" ");
  const area = line
    + ` L${toX(xMax).toFixed(1)},${(PAD.top + iH).toFixed(1)}`
    + ` L${toX(xMin).toFixed(1)},${(PAD.top + iH).toFixed(1)} Z`;

  // Build decade ticks; skip a decade if it falls within 5 years of xMax to avoid crowding
  const firstDecade = Math.ceil(xMin / 10) * 10;
  const xTks = [];
  for (let y = firstDecade; y <= xMax; y += 10) {
    if (xMax - y > 0 && xMax - y < 6) continue; // too close to final label
    xTks.push(y);
  }
  if (xTks[xTks.length - 1] !== xMax) xTks.push(xMax);

  const fmt = v => Math.round(v / 1000) + "k";

  const handleMouseMove = (e) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const svgX = (e.clientX - rect.left) / rect.width * W;
    const year = xMin + (svgX - PAD.left) / iW * (xMax - xMin);
    const pt   = pts.reduce((a, b) => Math.abs(b.year - year) < Math.abs(a.year - year) ? b : a);
    setHover(pt); // store only data point; x/y recomputed each render
  };

  // Recompute circle position from current toX/toY so it stays on the line after data loads
  const hoverX  = hover ? toX(hover.year) : null;
  const hoverY  = hover ? toY(hover.pop)  : null;

  // Tooltip box dimensions
  const TW = 130, TH = 36, TR = 4;

  return (
    <div className="gp-wm-chart">
      <div className="gp-wm-chart-header">
        <div className="gp-wm-chart-title">Guyana Population ({Math.round(xMin)} – {lastPt.year})</div>
        <div className="gp-wm-chart-legend">
          <span className="gp-wm-legend-line" style={{ background: "#1d4ed8" }} />
          Guyana Population
        </div>
      </div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="gp-wm-chart-svg"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHover(null)}
        style={{ cursor: "crosshair" }}
      >
        <defs>
          <clipPath id="popClip">
            <rect x={PAD.left} y={PAD.top} width={iW} height={iH} />
          </clipPath>
        </defs>
        <rect x={PAD.left} y={PAD.top} width={iW} height={iH} fill="#f9f7f4" />
        {yTks.map((t, i) => (
          <g key={i}>
            <line x1={PAD.left} y1={toY(t)} x2={PAD.left + iW} y2={toY(t)} stroke="#ddd5c8" strokeWidth="1" />
            <text x={PAD.left - 6} y={toY(t) + 4} textAnchor="end" className="gp-axis-label">{fmt(t)}</text>
          </g>
        ))}
        {xTks.map((y, i) => (
          <text key={i} x={toX(y)} y={PAD.top + iH + 18} textAnchor="middle" className="gp-axis-label">{Math.round(y)}</text>
        ))}
        <path d={area} fill="rgba(59,130,246,0.10)" clipPath="url(#popClip)" />
        <path d={line} fill="none" stroke="#1d4ed8" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" clipPath="url(#popClip)" />
        <rect x={PAD.left} y={PAD.top} width={iW} height={iH} fill="none" stroke="#c9bfb0" strokeWidth="1" />

        {/* Hover crosshair + tooltip */}
        {hover && hoverX != null && hoverY != null && (
          <g>
            <line x1={hoverX} y1={PAD.top} x2={hoverX} y2={PAD.top + iH}
                  stroke="#1d4ed8" strokeWidth="1" strokeDasharray="4 3" opacity="0.5" />
            <circle cx={hoverX} cy={hoverY} r="5" fill="#fff" stroke="#1d4ed8" strokeWidth="2" />
            {(() => {
              const tx = hoverX + TW + 8 > PAD.left + iW ? hoverX - TW - 8 : hoverX + 8;
              const ty = Math.max(PAD.top + 2, hoverY - TH - 8);
              return (
                <g>
                  <rect x={tx} y={ty} width={TW} height={TH} rx={TR} fill="#1e293b" opacity="0.92" />
                  <text x={tx + TW / 2} y={ty + 13} textAnchor="middle"
                        fill="#94a3b8" fontSize="9" fontFamily="Inter,sans-serif">
                    {hover.year}
                  </text>
                  <text x={tx + TW / 2} y={ty + 27} textAnchor="middle"
                        fill="#f1f5f9" fontSize="11" fontWeight="600" fontFamily="Inter,sans-serif">
                    {hover.pop.toLocaleString()}
                  </text>
                </g>
              );
            })()}
          </g>
        )}
      </svg>
    </div>
  );
}

/* ── Growth rate chart ────────────────────────────────── */
function GrowthRateChart({ data }) {
  const W = 640, H = 194;
  const PAD = { top: 24, right: 20, bottom: 36, left: 56 };
  const iW  = W - PAD.left - PAD.right;
  const iH  = H - PAD.top  - PAD.bottom;

  const pts = useMemo(() => data.filter(d => d.yearlyPct != null && d.year >= 1961), [data]);

  if (pts.length < 2) return null;

  const pcts  = pts.map(p => p.yearlyPct);
  const years = pts.map(p => p.year);
  const yTks  = niceTicks(Math.min(...pcts), Math.max(...pcts));
  const yMin  = yTks[0], yMax = yTks[yTks.length - 1];
  const xMin  = Math.min(...years), xMax = Math.max(...years);

  const toX  = y => PAD.left + ((y - xMin) / (xMax - xMin)) * iW;
  const toY  = v => PAD.top  + (1 - (v - yMin) / (yMax - yMin)) * iH;
  const zero = toY(0);

  const line = pts.map((p, i) => `${i ? "L" : "M"}${toX(p.year).toFixed(1)},${toY(p.yearlyPct).toFixed(1)}`).join(" ");

  const firstDecade = Math.ceil(xMin / 10) * 10;
  const xTks = [];
  for (let y = firstDecade; y <= xMax; y += 10) {
    if (xMax - y > 0 && xMax - y < 6) continue;
    xTks.push(y);
  }
  if (xTks[xTks.length - 1] !== xMax) xTks.push(xMax);

  return (
    <div className="gp-wm-chart">
      <div className="gp-wm-chart-header">
        <div className="gp-wm-chart-title">Yearly Population Growth Rate (%)</div>
        <div className="gp-wm-chart-legend">
          <span className="gp-wm-legend-line" style={{ background: "#1d4ed8" }} />
          Yearly Growth Rate
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="gp-wm-chart-svg">
        <clipPath id="grClip">
          <rect x={PAD.left} y={PAD.top} width={iW} height={iH} />
        </clipPath>
        <rect x={PAD.left} y={PAD.top} width={iW} height={iH} fill="#f9f7f4" />
        {yTks.map((t, i) => (
          <g key={i}>
            <line x1={PAD.left} y1={toY(t)} x2={PAD.left + iW} y2={toY(t)} stroke="#ddd5c8" strokeWidth="1" />
            <text x={PAD.left - 5} y={toY(t) + 4} textAnchor="end" className="gp-axis-label">{t.toFixed(1)}%</text>
          </g>
        ))}
        {xTks.map((y, i) => (
          <text key={i} x={toX(y)} y={PAD.top + iH + 18} textAnchor="middle" className="gp-axis-label">{Math.round(y)}</text>
        ))}
        {zero >= PAD.top && zero <= PAD.top + iH && (
          <line x1={PAD.left} y1={zero} x2={PAD.left + iW} y2={zero} stroke="#92400e" strokeWidth="1" strokeDasharray="3 2" />
        )}
        <path d={line} fill="none" stroke="#1d4ed8" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" clipPath="url(#grClip)" />
        <rect x={PAD.left} y={PAD.top} width={iW} height={iH} fill="none" stroke="#c9bfb0" strokeWidth="1" />
      </svg>
    </div>
  );
}

/* ── GDP per capita chart ─────────────────────────────── */
function GDPChart({ data }) {
  const W = 640, H = 194;
  const PAD = { top: 24, right: 20, bottom: 36, left: 72 };
  const iW  = W - PAD.left - PAD.right;
  const iH  = H - PAD.top  - PAD.bottom;

  const pts = useMemo(() => data.filter(p => p.gdp != null), [data]);
  if (pts.length < 2) return null;

  const vals = pts.map(p => p.gdp);
  const yTks = niceTicks(0, Math.max(...vals));
  const yMin = yTks[0], yMax = yTks[yTks.length - 1];
  const xMin = pts[0].year, xMax = pts[pts.length - 1].year;

  const toX = y => PAD.left + ((y - xMin) / (xMax - xMin)) * iW;
  const toY = v => PAD.top  + (1 - (v - yMin) / (yMax - yMin)) * iH;

  const line = pts.map((p, i) => `${i ? "L" : "M"}${toX(p.year).toFixed(1)},${toY(p.gdp).toFixed(1)}`).join(" ");
  const area = line
    + ` L${toX(xMax).toFixed(1)},${(PAD.top + iH).toFixed(1)}`
    + ` L${toX(xMin).toFixed(1)},${(PAD.top + iH).toFixed(1)} Z`;

  const firstDecade = Math.ceil(xMin / 10) * 10;
  const xTks = [];
  for (let y = firstDecade; y <= xMax; y += 10) {
    if (xMax - y > 0 && xMax - y < 6) continue;
    xTks.push(y);
  }
  if (xTks[xTks.length - 1] !== xMax) xTks.push(xMax);

  const fmt = v => v >= 1000 ? `$${Math.round(v / 1000)}k` : `$${Math.round(v)}`;

  return (
    <div className="gp-wm-chart">
      <div className="gp-wm-chart-header">
        <div className="gp-wm-chart-title">Guyana GDP per Capita (USD)</div>
        <div className="gp-wm-chart-legend">
          <span className="gp-wm-legend-line" style={{ background: "#15803d" }} />
          GDP per Capita
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="gp-wm-chart-svg">
        <defs>
          <clipPath id="gdpClip">
            <rect x={PAD.left} y={PAD.top} width={iW} height={iH} />
          </clipPath>
        </defs>
        <rect x={PAD.left} y={PAD.top} width={iW} height={iH} fill="#f9f7f4" />
        {yTks.map((t, i) => (
          <g key={i}>
            <line x1={PAD.left} y1={toY(t)} x2={PAD.left + iW} y2={toY(t)} stroke="#ddd5c8" strokeWidth="1" />
            <text x={PAD.left - 6} y={toY(t) + 4} textAnchor="end" className="gp-axis-label">{fmt(t)}</text>
          </g>
        ))}
        {xTks.map((y, i) => (
          <text key={i} x={toX(y)} y={PAD.top + iH + 18} textAnchor="middle" className="gp-axis-label">{Math.round(y)}</text>
        ))}
        <path d={area} fill="rgba(21,128,61,0.10)" clipPath="url(#gdpClip)" />
        <path d={line} fill="none" stroke="#15803d" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" clipPath="url(#gdpClip)" />
        <rect x={PAD.left} y={PAD.top} width={iW} height={iH} fill="none" stroke="#c9bfb0" strokeWidth="1" />
      </svg>
    </div>
  );
}

/* ── Historical table ─────────────────────────────────── */
const DISPLAY_YEARS = new Set([
  2026, 2025, 2024, 2023, 2022, 2020, 2015,
  2010, 2005, 2000, 1995, 1990, 1985, 1980,
  1975, 1970, 1965, 1960, 1955,
]);

function HistoricalTable({ data, currentPop }) {
  if (!data.length) return null;

  const curYear = new Date().getFullYear();
  const latest  = data[data.length - 1];
  const byYear  = Object.fromEntries(data.map(d => [d.year, d]));

  const rows = [];
  for (const y of [...DISPLAY_YEARS].sort((a, b) => b - a)) {
    if (y > curYear) continue;
    if (y === curYear) {
      const prevPop = latest.pop * Math.pow(1 + GROWTH_RATE, curYear - 1 - latest.year);
      const thisPop = Math.round(currentPop);
      rows.push({ year: curYear, pop: thisPop, yearlyChange: Math.round(thisPop - prevPop), yearlyPct: GROWTH_RATE * 100, isProjected: true });
    } else if (byYear[y]) {
      rows.push(byYear[y]);
    }
  }

  return (
    <div className="gp-table-section">
      <div className="gp-table-section-title">Population of Guyana ({curYear} and historical)</div>
      <div className="gp-table-scroll">
        <table className="gp-table">
          <thead>
            <tr>
              <th>Year</th>
              <th>Population</th>
              <th>Yearly % Change</th>
              <th>Yearly Change</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.year} className={row.isProjected ? "row-current" : ""}>
                <td>
                  {row.year}
                  {row.isProjected && <span className="td-proj"> est.</span>}
                </td>
                <td><strong>{row.pop?.toLocaleString() ?? "—"}</strong></td>
                <td className={row.yearlyPct == null ? "" : row.yearlyPct > 0 ? "td-pos" : "td-neg"}>
                  {row.yearlyPct != null ? `${row.yearlyPct.toFixed(2)}%` : "—"}
                </td>
                <td style={{ color: row.yearlyChange > 0 ? "#15803d" : row.yearlyChange < 0 ? "#b91c1c" : undefined }}>
                  {row.yearlyChange != null ? (row.yearlyChange > 0 ? "+" : "") + row.yearlyChange.toLocaleString() : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Demographics section ─────────────────────────────── */
const ICON_HOURGLASS = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 22h14M5 2h14M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22M7 2v4.172a2 2 0 0 1 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2"/>
  </svg>
);
const ICON_BABY = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="7" r="4"/><path d="M5.5 21a9 9 0 0 1 13 0"/><circle cx="17" cy="4" r="1" fill="currentColor"/>
  </svg>
);
const ICON_CROSS = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 2h2v6h6v2h-6v6h-2v-6H5v-2h6z" strokeLinejoin="round"/>
    <rect x="9" y="18" width="6" height="4" rx="1"/>
  </svg>
);

function DemographicCard({ icon, label, value, unit, sub }) {
  return (
    <div className="gp-demo-card">
      <div className="gp-demo-card-header">
        <span className="gp-demo-icon">{icon}</span>
        <span className="gp-demo-label">{label}</span>
      </div>
      <div className="gp-demo-value">
        {value != null ? value : <span className="gp-demo-loading">—</span>}
        {value != null && unit && <span className="gp-demo-unit"> {unit}</span>}
      </div>
      <div className="gp-demo-sub">{sub}</div>
    </div>
  );
}

function DemographicsSection({ lifeExp, infantMort, under5Mort }) {
  const curYear = new Date().getFullYear();
  return (
    <div className="gp-demo-section">
      <div className="gp-demo-section-title">Guyana Demographics ({curYear})</div>
      <div className="gp-demo-grid">
        <DemographicCard
          icon={ICON_HOURGLASS}
          label="Life Expectancy"
          value={lifeExp != null ? lifeExp.toFixed(1) : null}
          unit="years"
          sub="life expectancy at birth, both sexes"
        />
        <DemographicCard
          icon={ICON_BABY}
          label="Infant Mortality Rate"
          value={infantMort != null ? infantMort.toFixed(1) : null}
          unit=""
          sub="infant deaths per 1,000 live births"
        />
        <DemographicCard
          icon={ICON_CROSS}
          label="Deaths Under Age 5"
          value={under5Mort != null ? under5Mort.toFixed(1) : null}
          unit=""
          sub="per 1,000 live births"
        />
      </div>
    </div>
  );
}

/* ── Cities table ─────────────────────────────────────── */
const GUYANA_CITIES = [
  { rank: 1,  city: "Georgetown",    pop: 235017 },
  { rank: 2,  city: "Linden",        pop:  44690 },
  { rank: 3,  city: "New Amsterdam", pop:  35039 },
  { rank: 4,  city: "Rose Hall Town",pop:  20500 },
  { rank: 5,  city: "Corriverton",   pop:  17150 },
  { rank: 6,  city: "Anna Regina",   pop:  12448 },
  { rank: 7,  city: "Bartica",       pop:  11213 },
  { rank: 8,  city: "Lethem",        pop:   8046 },
  { rank: 9,  city: "Mabaruma",      pop:   6014 },
  { rank: 10, city: "Parika",        pop:   5384 },
  { rank: 11, city: "Vreed-en-Hoop", pop:   5372 },
];

function CitiesTable() {
  const curYear = new Date().getFullYear();
  return (
    <div className="gp-table-section">
      <div className="gp-table-section-title">Main Cities by Population in Guyana</div>
      <p className="gp-table-note">Includes urban agglomerations and administrative regions.</p>
      <div className="gp-table-scroll">
        <table className="gp-table">
          <thead>
            <tr>
              <th style={{ textAlign: "center" }}>Rank</th>
              <th style={{ textAlign: "left" }}>City</th>
              <th>Population Estimate ({curYear})</th>
            </tr>
          </thead>
          <tbody>
            {GUYANA_CITIES.map(row => (
              <tr key={row.rank}>
                <td style={{ textAlign: "center", color: "#a8997f", fontWeight: 400 }}>{row.rank}</td>
                <td style={{ textAlign: "left", color: "#1d4ed8", fontWeight: 600 }}>{row.city}</td>
                <td>{row.pop.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Population by region ─────────────────────────────── */
const GUYANA_REGIONS = [
  { id: "R4",  name: "Demerara-Mahaica",                pop: 310320 },
  { id: "R6",  name: "East Berbice-Corentyne",          pop: 109431 },
  { id: "R3",  name: "Essequibo Islands-West Demerara", pop: 107416 },
  { id: "R5",  name: "Mahaica-Berbice",                 pop:  49253 },
  { id: "R2",  name: "Pomeroon-Supenaam",               pop:  46728 },
  { id: "R10", name: "Upper Demerara-Berbice",           pop:  39453 },
  { id: "R1",  name: "Barima-Waini",                    pop:  26942 },
  { id: "R7",  name: "Cuyuni-Mazaruni",                 pop:  19953 },
  { id: "R9",  name: "Upper Takutu-Upper Essequibo",    pop:  19387 },
  { id: "R8",  name: "Potaro-Siparuni",                 pop:  10195 },
];
const REGIONS_TOTAL = GUYANA_REGIONS.reduce((s, r) => s + r.pop, 0);

function RegionsSection() {
  const maxPop = GUYANA_REGIONS[0].pop;
  return (
    <div className="gp-table-section">
      <div className="gp-table-section-title">Population by Region</div>
      <p className="gp-table-note">Source: Guyana 2012 National Census. Region 4 contains Georgetown and accounts for the majority of the population.</p>
      <div className="gp-table-scroll">
        <table className="gp-table">
          <thead>
            <tr>
              <th style={{ textAlign: "left" }}>Region</th>
              <th style={{ minWidth: 140 }}></th>
              <th>Population</th>
              <th>Share</th>
            </tr>
          </thead>
          <tbody>
            {GUYANA_REGIONS.map(row => (
              <tr key={row.id}>
                <td style={{ textAlign: "left", whiteSpace: "normal", minWidth: 180 }}>{row.name}</td>
                <td style={{ paddingRight: 16 }}>
                  <div style={{ height: 8, borderRadius: 4, background: "#e5d9c8", position: "relative" }}>
                    <div style={{
                      position: "absolute", left: 0, top: 0, bottom: 0,
                      width: `${(row.pop / maxPop) * 100}%`,
                      background: "#1d4ed8", borderRadius: 4,
                    }} />
                  </div>
                </td>
                <td>{row.pop.toLocaleString()}</td>
                <td>{((row.pop / REGIONS_TOTAL) * 100).toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Diaspora section ─────────────────────────────────── */
function DiasporaSection() {
  return (
    <div className="gp-table-section">
      <div className="gp-table-section-title">Guyana Diaspora</div>
      <div className="gp-info-box" style={{ marginBottom: "0.5rem" }}>
        <InfoRow label="Estimated Guyanese living abroad" value="~500,000" />
        <InfoRow label="Main destinations"                value="USA, Canada, UK, Caribbean" />
        <InfoRow label="Diaspora vs. resident population" value="~60% of resident population" />
        <InfoRow label="Estimated net emigration (annual)" value="−10,000 per year" />
      </div>
      <p className="gp-table-note">
        Guyana has one of the highest emigration rates in the Western Hemisphere. Figures are estimates based on IOM, World Bank, and national survey data.
      </p>
    </div>
  );
}

/* ── Country comparison ───────────────────────────────── */
const COMPARISON_COUNTRIES = [
  { flag: "🇬🇾", name: "Guyana",              pop: 831087,   growth:  0.99, lifeExp: 67.1, highlight: true },
  { flag: "🇸🇷", name: "Suriname",            pop: 618040,   growth:  0.80, lifeExp: 71.7 },
  { flag: "🇹🇹", name: "Trinidad & Tobago",  pop: 1367558,  growth:  0.30, lifeExp: 73.5 },
  { flag: "🇧🇧", name: "Barbados",            pop: 281635,   growth:  0.10, lifeExp: 79.2 },
];

function CountryComparisonSection() {
  return (
    <div className="gp-table-section">
      <div className="gp-table-section-title">Caribbean Comparison</div>
      <p className="gp-table-note">Guyana vs. neighbouring Caribbean nations. Population and growth rate from World Bank (latest available). Life expectancy at birth, both sexes.</p>
      <div className="gp-table-scroll">
        <table className="gp-table">
          <thead>
            <tr>
              <th style={{ textAlign: "left" }}>Country</th>
              <th>Population</th>
              <th>Annual Growth</th>
              <th>Life Expectancy</th>
            </tr>
          </thead>
          <tbody>
            {COMPARISON_COUNTRIES.map(c => (
              <tr key={c.name} className={c.highlight ? "row-current" : ""}>
                <td style={{ textAlign: "left" }}>
                  <span style={{ marginRight: 8 }}>{c.flag}</span>{c.name}
                </td>
                <td>{c.pop.toLocaleString()}</td>
                <td className={c.growth > 0.5 ? "td-pos" : ""}>{c.growth.toFixed(2)}%</td>
                <td>{c.lifeExp.toFixed(1)} yrs</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Notes & Definitions ──────────────────────────────── */
function NotesSection() {
  const curYear = new Date().getFullYear();
  return (
    <div className="gp-notes-section">
      <div className="gp-notes-block">
        <h3 className="gp-notes-title">Notes</h3>
        <p className="gp-notes-text">
          The <strong>Guyana Population (Live)</strong> counter shows a continuously updated estimate of the current population of Guyana, based on World Bank data and projected forward using birth and death rates from the World Bank.
        </p>
        <p className="gp-notes-text">
          The <strong>Guyana Population (1960 – {curYear})</strong> chart plots the total population count as of January 1 of each year.
        </p>
        <p className="gp-notes-text">
          The <strong>Yearly Population Growth Rate</strong> chart plots the annual percentage change in population from 1961 to {curYear}. Guyana's growth rate has at times been negative due to high levels of emigration.
        </p>
      </div>
      <div className="gp-notes-block">
        <h3 className="gp-notes-title">Definitions</h3>
        <p className="gp-notes-text">
          <strong>Year:</strong> as of January 1 of the year indicated.
        </p>
        <p className="gp-notes-text">
          <strong>Population:</strong> overall total population (both sexes and all ages) in the country as of the year indicated, as reported by the World Bank using data from national censuses and surveys.
        </p>
        <p className="gp-notes-text">
          <strong>Yearly % Change:</strong> the percentage change in total population from one year to the next. Negative values indicate population decline, most commonly driven by net emigration.
        </p>
        <p className="gp-notes-text">
          <strong>Life Expectancy:</strong> the average number of years a newborn would live if current mortality rates remained constant throughout their life (World Bank indicator SP.DYN.LE00.IN).
        </p>
        <p className="gp-notes-text">
          <strong>Infant Mortality Rate:</strong> the number of infants dying before reaching one year of age per 1,000 live births (World Bank indicator SP.DYN.IMRT.IN).
        </p>
      </div>
    </div>
  );
}

/* ── Shared sub-components ────────────────────────────── */
function StatCard({ label, value, prefix = "", pos = true }) {
  return (
    <div className="gp-stat-card">
      <p className="gp-stat-label">{label}</p>
      <p className={`gp-stat-value gp-stat-value--${pos ? "pos" : "neg"}`}>
        {prefix}{value.toLocaleString()}
      </p>
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div className="gp-info-row">
      <span className="gp-info-label">{label}</span>
      <span className="gp-info-value">{value}</span>
    </div>
  );
}

/* ── Main ─────────────────────────────────────────────── */
export default function GuyanaPopulation() {
  const [basePop,  setBasePop]  = useState(FALLBACK_POP);
  const [baseDate, setBaseDate] = useState(new Date("2024-01-01T00:00:00Z"));
  const [dataYear,    setDataYear]    = useState("2024 estimate");
  const [histData,    setHistData]    = useState([]);
  const [gdpData,     setGdpData]     = useState([]);
  const [copied,      setCopied]      = useState(false);
  const [lifeExp,     setLifeExp]     = useState(null);
  const [infantMort,  setInfantMort]  = useState(null);
  const [under5Mort,  setUnder5Mort]  = useState(null);
  const [popExact,    setPopExact]    = useState(() =>
    getPopExact(FALLBACK_POP, new Date("2024-01-01T00:00:00Z"), getRates(FALLBACK_POP).netPerSec)
  );
  const [stats, setStats] = useState(() => {
    const r = getRates(FALLBACK_POP);
    return getTodayStats(r.birthsPerSec, r.deathsPerSec, r.netPerSec);
  });

  // Fetch population history
  useEffect(() => {
    fetch(`${WB}/SP.POP.TOTL?format=json&per_page=100`)
      .then(r => r.json())
      .then(data => {
        const sorted = data[1]
          .filter(e => e.value !== null)
          .map(e => ({ year: parseInt(e.date, 10), pop: e.value }))
          .sort((a, b) => a.year - b.year);

        const withGrowth = sorted.map((e, i) => {
          const prev = sorted[i - 1];
          return { ...e, yearlyChange: prev ? e.pop - prev.pop : null, yearlyPct: prev ? ((e.pop - prev.pop) / prev.pop) * 100 : null };
        });

        setHistData(withGrowth);
        const latest = withGrowth[withGrowth.length - 1];
        if (latest) {
          setBasePop(latest.pop);
          setBaseDate(new Date(`${latest.year}-01-01T00:00:00Z`));
          setDataYear(`${latest.year} World Bank`);
        }
      })
      .catch(() => {});
  }, []);

  // Fetch demographic indicators in parallel
  useEffect(() => {
    fetchIndicator("SP.DYN.LE00.IN").then(v => { if (v) setLifeExp(v); }).catch(() => {});
    fetchIndicator("SP.DYN.IMRT.IN").then(v => { if (v) setInfantMort(v); }).catch(() => {});
    fetchIndicator("SH.DYN.MORT").then(v => { if (v) setUnder5Mort(v); }).catch(() => {});
  }, []);

  // Fetch GDP per capita history
  useEffect(() => {
    fetch(`${WB}/NY.GDP.PCAP.CD?format=json&per_page=100`)
      .then(r => r.json())
      .then(data => {
        const sorted = data[1]
          .filter(e => e.value !== null)
          .map(e => ({ year: parseInt(e.date, 10), gdp: e.value }))
          .sort((a, b) => a.year - b.year);
        setGdpData(sorted);
      })
      .catch(() => {});
  }, []);

  const ratesRef    = useRef(getRates(basePop));
  const baseDateRef = useRef(baseDate);
  const basePopRef  = useRef(basePop);

  useEffect(() => {
    ratesRef.current    = getRates(basePop);
    baseDateRef.current = baseDate;
    basePopRef.current  = basePop;
  }, [basePop, baseDate]);

  useEffect(() => {
    const id = setInterval(() => {
      const { birthsPerSec, deathsPerSec, netPerSec } = ratesRef.current;
      setPopExact(getPopExact(basePopRef.current, baseDateRef.current, netPerSec));
      setStats(getTodayStats(birthsPerSec, deathsPerSec, netPerSec));
    }, 100);
    return () => clearInterval(id);
  }, []);

  const handleShare = () => {
    const url  = "https://guyanapopulation.netlify.app";
    const text = "Guyana Live Population Counter — real-time births, deaths & historical data";
    if (navigator.share) {
      navigator.share({ title: "Guyana Population (Live)", text, url }).catch(() => {});
    } else {
      navigator.clipboard.writeText(url).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }).catch(() => {});
    }
  };

  const whole   = Math.floor(popExact);
  const decimal = (popExact - whole).toFixed(2).slice(1);
  const digits  = whole.toLocaleString().split("");

  return (
    <div className="gp-root">
    <div className="gp-page">
      <div className="gp-container">

        {/* Header */}
        <div className="gp-header">
          <span className="gp-flag">🇬🇾</span>
          <div className="gp-header-text">
            <h1 className="gp-title">Guyana</h1>
            <p className="gp-subtitle">Live Population Counter</p>
          </div>
          <div className="gp-live-badge">
            <span className="gp-live-dot" />
            LIVE
          </div>
          <button className="gp-share-btn" onClick={handleShare} aria-label="Share this page">
            {copied ? (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                Copied!
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/>
                </svg>
                Share
              </>
            )}
          </button>
        </div>

        {/* Counter */}
        <div className="gp-counter-box">
          <div className="gp-counter-digits">
            {digits.map((d, i) => (
              <span key={i} className={d === "," ? "gp-comma" : "gp-digit"}>{d}</span>
            ))}
            <span className="gp-decimal">{decimal}</span>
          </div>
          <p className="gp-counter-label">Current population of Guyana</p>
          <p className="gp-data-freshness">Data: {dataYear} · updated in real time</p>
        </div>

        {/* Today's stats */}
        <h2 className="gp-section-title">Today so far</h2>
        <div className="gp-stats-grid">
          <StatCard label="Births"     value={stats.births}        prefix="+"                          pos={true} />
          <StatCard label="Deaths"     value={stats.deaths}        prefix="−"                          pos={false} />
          <StatCard label="Net growth" value={Math.abs(stats.net)} prefix={stats.net >= 0 ? "+" : "−"} pos={stats.net >= 0} />
        </div>

        {/* Charts */}
        <PopLineChart data={histData} />
        <GrowthRateChart data={histData} />
        <GDPChart data={gdpData} />

        {/* Historical table */}
        <HistoricalTable data={histData} currentPop={whole} />

        {/* Demographics */}
        <DemographicsSection lifeExp={lifeExp} infantMort={infantMort} under5Mort={under5Mort} />

        {/* Cities */}
        <CitiesTable />

        {/* Population by region */}
        <RegionsSection />

        {/* Diaspora */}
        <DiasporaSection />

        {/* Key facts */}
        <h2 className="gp-section-title">Key facts</h2>
        <div className="gp-info-box">
          <InfoRow label="Annual growth rate"  value="0.99%"          />
          <InfoRow label="Birth rate"          value="17.3 per 1,000" />
          <InfoRow label="Death rate"          value="7.4 per 1,000"  />
          <InfoRow label="Population density"  value="4.1 per km²"    />
          <InfoRow label="Land area"           value="214,969 km²"    />
          <InfoRow label="Capital"             value="Georgetown"      />
        </div>

        {/* Country comparison */}
        <CountryComparisonSection />

        {/* Notes */}
        <NotesSection />

        <p className="gp-source">
          Population data from {dataYear} · World Bank indicators · Ticking in real time
        </p>

      </div>
    </div>

    {/* Footer sits outside gp-page so it spans full width below */}
    <footer className="gp-footer">
      <div className="gp-footer-inner">
        <div className="gp-footer-brand">
          <span className="gp-footer-logo">Savanna Studios</span>
          <p className="gp-footer-tagline">
            We build custom websites and software tailored to your needs.
          </p>
        </div>

        <div className="gp-footer-contact">
          <p className="gp-footer-contact-title">Get in touch</p>
          <a className="gp-footer-link" href="mailto:savannaastudios@gmail.com">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
            </svg>
            savannaastudios@gmail.com
          </a>
          <a className="gp-footer-link" href="tel:+5927378846">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.62 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9.91a16 16 0 0 0 6.18 6.18l.96-.96a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
            </svg>
            +592 737-8846
          </a>
        </div>
      </div>

      <div className="gp-footer-bottom">
        <span>© {new Date().getFullYear()} Savanna Studios. All rights reserved.</span>
        <span>Have a project in mind? <a href="mailto:savannaastudios@gmail.com" className="gp-footer-bottom-link">Let's talk</a></span>
      </div>
    </footer>

    </div>
  );
}
