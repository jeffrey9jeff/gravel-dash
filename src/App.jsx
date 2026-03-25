import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { elevationProfile, routeCoords } from "./routeData.js";

const RIDE_DATE = new Date("2026-06-06T05:00:00+10:00");

const RIDERS = ["Jeffrey", "Andrew", "Gus"];
const RIDERS_WITH_FLIGHTS = ["Jeffrey", "Gus"];

const DEFAULT_CHECKLIST = [
  { id: "bike_service", label: "Bike service / tune-up", type: "tick" },
  { id: "tyre_sealant", label: "Tyre sealant refreshed", type: "tick" },
  { id: "spare_tubes", label: "Spare tubes", type: "count", max: 3 },
  { id: "co2_carts", label: "CO\u2082 cartridges", type: "count", max: 4 },
  { id: "tyre_plugs", label: "Tyre plug kit", type: "tick" },
  { id: "multi_tool", label: "Multi-tool", type: "tick" },
  { id: "chain_link", label: "Quick chain link", type: "tick" },
  { id: "bottles", label: "Bottles / hydration", type: "count", max: 3 },
  { id: "electrolytes", label: "Electrolyte tabs", type: "count", max: 10 },
  { id: "gels", label: "Gels / bars", type: "count", max: 12 },
  { id: "lights_front", label: "Front light charged", type: "tick" },
  { id: "lights_rear", label: "Rear light charged", type: "tick" },
  { id: "helmet", label: "Helmet", type: "tick" },
  { id: "gloves", label: "Gloves", type: "tick" },
  { id: "kit_layers", label: "Kit / layers packed", type: "tick" },
  { id: "sunscreen", label: "Sunscreen", type: "tick" },
  { id: "phone_charged", label: "Phone charged + mount", type: "tick" },
  { id: "garmin_charged", label: "GPS / Garmin charged", type: "tick" },
  { id: "route_loaded", label: "Route loaded on device", type: "tick" },
  { id: "cash_card", label: "Cash / card for stops", type: "tick" },
  { id: "first_aid", label: "First aid basics", type: "tick" },
  { id: "pump", label: "Mini pump", type: "tick" },
];

const STORAGE_KEY = "gravel-dash-v2";

function getDefaultState() {
  const checklist = {};
  const checklistItems = {};
  const checklistTargets = {};
  const training = {};
  const flights = {};
  RIDERS.forEach((r) => {
    checklist[r] = {};
    checklistItems[r] = DEFAULT_CHECKLIST.map((item) => ({ ...item }));
    checklistTargets[r] = {};
    DEFAULT_CHECKLIST.forEach((item) => {
      checklist[r][item.id] = item.type === "tick" ? false : 0;
      if (item.type === "count") checklistTargets[r][item.id] = item.max;
    });
    training[r] = [];
    flights[r] = [];
  });
  return { checklist, checklistItems, checklistTargets, training, flights, riderNames: [...RIDERS] };
}

function migrateState(parsed) {
  // Migrate from v1 format
  if (!parsed.checklistItems) {
    parsed.checklistItems = {};
    parsed.checklistTargets = {};
    (parsed.riderNames || RIDERS).forEach((r) => {
      parsed.checklistItems[r] = DEFAULT_CHECKLIST.map((item) => ({ ...item }));
      parsed.checklistTargets[r] = {};
      DEFAULT_CHECKLIST.forEach((item) => {
        if (item.type === "count") {
          parsed.checklistTargets[r][item.id] = item.max;
        }
      });
    });
  }
  if (!parsed.flights) {
    parsed.flights = {};
    (parsed.riderNames || RIDERS).forEach((r) => {
      parsed.flights[r] = [];
    });
  }
  return parsed;
}

// Debounced save
function useDebouncedSave(state, delay = 800) {
  const timer = useRef(null);
  useEffect(() => {
    if (!state) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch (e) {
        console.error("Save failed:", e);
      }
    }, delay);
    return () => clearTimeout(timer.current);
  }, [state, delay]);
}

function useCountdown(target) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const diff = Math.max(0, target - now);
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  const secs = Math.floor((diff % 60000) / 1000);
  return { days, hours, mins, secs, total: diff };
}

// --- Theme ---
const T = {
  bg: "#f5f3ef",
  bgCard: "#ffffff",
  bgCardHover: "#fafaf8",
  border: "#e0dcd4",
  borderLight: "#ece8e1",
  text: "#2c2825",
  textDim: "#8a847a",
  textMuted: "#b5afa5",
  accent: "#d45a1f",
  accentLight: "rgba(212,90,31,0.08)",
  accentBorder: "rgba(212,90,31,0.25)",
  green: "#2d8a4e",
  greenBg: "rgba(45,138,78,0.1)",
  yellow: "#b58a1b",
  red: "#c43e2a",
  white: "#ffffff",
};

const FONT_DISPLAY = "'Oswald', sans-serif";
const FONT_BODY = "'IBM Plex Mono', monospace";

// --- Components ---

function CountdownBlock({ countdown }) {
  const units = [
    { label: "DAYS", value: countdown.days },
    { label: "HRS", value: countdown.hours },
    { label: "MIN", value: countdown.mins },
    { label: "SEC", value: countdown.secs },
  ];
  return (
    <div style={s.countdownRow}>
      {units.map((u, i) => (
        <div key={u.label} style={{ display: "flex", alignItems: "center" }}>
          <div style={s.countdownUnit}>
            <span style={s.countdownNumber}>
              {String(u.value).padStart(2, "0")}
            </span>
            <span style={s.countdownLabel}>{u.label}</span>
          </div>
          {i < units.length - 1 && <span style={s.countdownSep}>:</span>}
        </div>
      ))}
    </div>
  );
}

function RoutePanel() {
  const W = 608;
  const MAP_H = 180;
  const ELEV_H = 100;

  // Build route SVG path
  const routePath = useMemo(() => {
    if (!routeCoords.length) return "";
    const lats = routeCoords.map((c) => c[0]);
    const lons = routeCoords.map((c) => c[1]);
    const minLat = Math.min(...lats), maxLat = Math.max(...lats);
    const minLon = Math.min(...lons), maxLon = Math.max(...lons);
    const pad = 16;
    const w = W - pad * 2, h = MAP_H - pad * 2;
    const scale = Math.min(w / (maxLon - minLon), h / (maxLat - minLat));
    return routeCoords
      .map((c, i) => {
        const x = pad + (c[1] - minLon) * scale;
        const y = pad + (maxLat - c[0]) * scale;
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  }, []);

  // Build elevation SVG
  const { elevPath, elevFill, elevLabels } = useMemo(() => {
    if (!elevationProfile.length) return { elevPath: "", elevFill: "", elevLabels: [] };
    const maxD = elevationProfile[elevationProfile.length - 1].d;
    const minE = Math.min(...elevationProfile.map((p) => p.e));
    const maxE = Math.max(...elevationProfile.map((p) => p.e));
    const pad = 0;
    const w = W, h = ELEV_H;
    const pts = elevationProfile.map((p) => {
      const x = pad + (p.d / maxD) * (w - pad * 2);
      const y = h - pad - ((p.e - minE) / (maxE - minE)) * (h - pad * 2 - 8);
      return { x, y };
    });
    const path = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
    const fill = path + ` L${pts[pts.length - 1].x.toFixed(1)},${h} L${pts[0].x.toFixed(1)},${h} Z`;
    const labels = [
      { text: `${minE.toFixed(0)}m`, x: 4, y: h - 4 },
      { text: `${maxE.toFixed(0)}m`, x: 4, y: 12 },
    ];
    // Distance markers
    for (let km = 50; km < maxD / 1000; km += 50) {
      const x = (km / (maxD / 1000)) * w;
      labels.push({ text: `${km}km`, x, y: h - 4, anchor: "middle" });
    }
    return { elevPath: path, elevFill: fill, elevLabels: labels };
  }, []);

  return (
    <div style={s.routePanel}>
      {/* Route map */}
      <div style={s.routeMapWrap}>
        <svg width="100%" viewBox={`0 0 ${W} ${MAP_H}`} style={{ display: "block" }}>
          {/* Grid dots */}
          {Array.from({ length: 8 }).map((_, row) =>
            Array.from({ length: 16 }).map((_, col) => (
              <circle key={`${row}-${col}`} cx={col * (W / 15)} cy={row * (MAP_H / 7)} r="0.6" fill={T.border} />
            ))
          )}
          {/* Route line shadow */}
          <path d={routePath} fill="none" stroke={T.accent} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" opacity="0.15" />
          {/* Route line */}
          <path d={routePath} fill="none" stroke={T.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          {/* Start dot */}
          {routeCoords.length > 0 && (() => {
            const lats = routeCoords.map(c => c[0]), lons = routeCoords.map(c => c[1]);
            const minLat = Math.min(...lats), maxLat = Math.max(...lats);
            const minLon = Math.min(...lons), maxLon = Math.max(...lons);
            const scale = Math.min((W - 32) / (maxLon - minLon), (MAP_H - 32) / (maxLat - minLat));
            const sx = 16 + (routeCoords[0][1] - minLon) * scale;
            const sy = 16 + (maxLat - routeCoords[0][0]) * scale;
            const ex = 16 + (routeCoords[routeCoords.length-1][1] - minLon) * scale;
            const ey = 16 + (maxLat - routeCoords[routeCoords.length-1][0]) * scale;
            return <>
              <circle cx={sx} cy={sy} r="5" fill={T.green} />
              <circle cx={sx} cy={sy} r="2" fill={T.white} />
              <circle cx={ex} cy={ey} r="5" fill={T.accent} />
              <circle cx={ex} cy={ey} r="2" fill={T.white} />
            </>;
          })()}
        </svg>
        <div style={s.routeLabels}>
          <span style={s.routeLabelStart}>Brisbane</span>
          <span style={s.routeLabelEnd}>Sunshine Coast</span>
        </div>
      </div>

      {/* Elevation profile */}
      <div style={s.elevWrap}>
        <div style={{ fontFamily: FONT_DISPLAY, fontSize: 9, letterSpacing: 3, textTransform: "uppercase", color: T.textMuted, marginBottom: 6 }}>
          Elevation Profile
        </div>
        <svg width="100%" viewBox={`0 0 ${W} ${ELEV_H}`} style={{ display: "block" }}>
          {/* Fill */}
          <path d={elevFill} fill="url(#elevGrad)" />
          {/* Line */}
          <path d={elevPath} fill="none" stroke={T.accent} strokeWidth="1.5" strokeLinejoin="round" />
          {/* Gradient def */}
          <defs>
            <linearGradient id="elevGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={T.accent} stopOpacity="0.2" />
              <stop offset="100%" stopColor={T.accent} stopOpacity="0.02" />
            </linearGradient>
          </defs>
          {/* Labels */}
          {elevLabels.map((l, i) => (
            <text key={i} x={l.x} y={l.y} fontSize="8" fontFamily={FONT_BODY} fill={T.textMuted} textAnchor={l.anchor || "start"}>{l.text}</text>
          ))}
        </svg>
      </div>

      {/* Stats row */}
      <div style={s.statsRow}>
        <div style={s.statItem}>
          <span style={s.statValue}>260</span>
          <span style={s.statLabel}>KM</span>
        </div>
        <div style={s.statDivider} />
        <div style={s.statItem}>
          <span style={s.statValue}>3,650</span>
          <span style={s.statLabel}>M ELEV</span>
        </div>
        <div style={s.statDivider} />
        <div style={s.statItem}>
          <span style={s.statValue}>358</span>
          <span style={s.statLabel}>M PEAK</span>
        </div>
      </div>
    </div>
  );
}

function FlightsPanel({ rider, flights, onUpdate }) {
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ direction: "outbound", airline: "", flightNo: "", date: "", depart: "", arrive: "", conf: "", notes: "" });

  const handleAdd = () => {
    if (!form.date || !form.flightNo) return;
    onUpdate([...flights, { ...form, id: Date.now() }]);
    setForm({ direction: "outbound", airline: "", flightNo: "", date: "", depart: "", arrive: "", conf: "", notes: "" });
    setAdding(false);
  };

  const handleRemove = (id) => {
    onUpdate(flights.filter((f) => f.id !== id));
  };

  const outbound = flights.filter((f) => f.direction === "outbound");
  const returnFlights = flights.filter((f) => f.direction === "return");

  const renderFlight = (f) => (
    <div key={f.id} style={s.flightCard}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontFamily: FONT_DISPLAY, fontSize: 18, fontWeight: 600, color: T.text }}>
            {f.airline} {f.flightNo}
          </div>
          <div style={{ fontSize: 12, color: T.textDim, marginTop: 2 }}>{f.date}</div>
        </div>
        <button onClick={() => handleRemove(f.id)} style={s.deleteBtn}>&times;</button>
      </div>
      <div style={{ display: "flex", gap: 24, marginTop: 10, fontSize: 12 }}>
        <div>
          <div style={{ color: T.textMuted, fontSize: 9, letterSpacing: 2, textTransform: "uppercase" }}>Depart</div>
          <div style={{ color: T.text, fontWeight: 500 }}>{f.depart || "—"}</div>
        </div>
        <div style={{ color: T.textMuted, alignSelf: "center", fontSize: 16 }}>&rarr;</div>
        <div>
          <div style={{ color: T.textMuted, fontSize: 9, letterSpacing: 2, textTransform: "uppercase" }}>Arrive</div>
          <div style={{ color: T.text, fontWeight: 500 }}>{f.arrive || "—"}</div>
        </div>
      </div>
      {f.conf && (
        <div style={{ marginTop: 8, fontSize: 11, color: T.textDim }}>
          Conf: <span style={{ color: T.text, fontWeight: 500 }}>{f.conf}</span>
        </div>
      )}
      {f.notes && (
        <div style={{ marginTop: 4, fontSize: 11, color: T.textDim, fontStyle: "italic" }}>{f.notes}</div>
      )}
    </div>
  );

  return (
    <div>
      {outbound.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={s.flightSectionLabel}>Outbound</div>
          {outbound.map(renderFlight)}
        </div>
      )}
      {returnFlights.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={s.flightSectionLabel}>Return</div>
          {returnFlights.map(renderFlight)}
        </div>
      )}
      {flights.length === 0 && !adding && (
        <div style={{ textAlign: "center", padding: "40px 0", color: T.textMuted, fontSize: 12 }}>
          No flights added yet
        </div>
      )}

      {adding ? (
        <div style={s.flightForm}>
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            {["outbound", "return"].map((d) => (
              <button key={d} onClick={() => setForm({ ...form, direction: d })} style={{
                ...s.dirBtn,
                ...(form.direction === d ? s.dirBtnActive : {}),
              }}>
                {d}
              </button>
            ))}
          </div>
          <div style={s.formGrid}>
            <input placeholder="Airline" value={form.airline} onChange={(e) => setForm({ ...form, airline: e.target.value })} style={s.formInput} />
            <input placeholder="Flight #" value={form.flightNo} onChange={(e) => setForm({ ...form, flightNo: e.target.value })} style={s.formInput} />
            <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} style={s.formInput} />
            <input placeholder="Depart time" value={form.depart} onChange={(e) => setForm({ ...form, depart: e.target.value })} style={s.formInput} />
            <input placeholder="Arrive time" value={form.arrive} onChange={(e) => setForm({ ...form, arrive: e.target.value })} style={s.formInput} />
            <input placeholder="Confirmation #" value={form.conf} onChange={(e) => setForm({ ...form, conf: e.target.value })} style={s.formInput} />
          </div>
          <input placeholder="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} style={{ ...s.formInput, width: "100%", marginTop: 6 }} />
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button onClick={handleAdd} style={s.primaryBtn}>Add flight</button>
            <button onClick={() => setAdding(false)} style={s.ghostBtn}>Cancel</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setAdding(true)} style={s.addItemBtn}>+ Add flight</button>
      )}
    </div>
  );
}

function TrainingPanel({ rider, sessions, onAdd, onRemove }) {
  const [date, setDate] = useState("");
  const [hrs, setHrs] = useState("");
  const [note, setNote] = useState("");
  const totalHrs = sessions.reduce((s, x) => s + x.hours, 0);

  const handleAdd = () => {
    if (!date || !hrs || isNaN(parseFloat(hrs))) return;
    onAdd({ date, hours: parseFloat(hrs), note });
    setDate("");
    setHrs("");
    setNote("");
  };

  return (
    <div>
      <div style={s.trainingHeader}>
        <span style={s.trainingTotal}>{totalHrs.toFixed(1)}</span>
        <span style={s.trainingTotalLabel}>hrs trained</span>
      </div>
      <div style={s.trainingInputRow}>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ ...s.formInput, flex: 1.2 }} />
        <input type="number" step="0.5" min="0" placeholder="Hrs" value={hrs} onChange={(e) => setHrs(e.target.value)} style={{ ...s.formInput, flex: 0.6 }} />
        <input placeholder="Note" value={note} onChange={(e) => setNote(e.target.value)} style={{ ...s.formInput, flex: 1.4 }} />
        <button onClick={handleAdd} style={s.primaryBtn}>+</button>
      </div>
      {sessions.length > 0 && (
        <div style={s.sessionList}>
          {[...sessions]
            .sort((a, b) => b.date.localeCompare(a.date))
            .map((sess, i) => (
              <div key={i} style={s.sessionRow}>
                <span style={s.sessionDate}>{sess.date}</span>
                <span style={s.sessionHrs}>{sess.hours}h</span>
                <span style={s.sessionNote}>{sess.note}</span>
                <button onClick={() => onRemove(i)} style={s.deleteBtn}>&times;</button>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

function ChecklistPanel({ rider, items, targets, values, onChange, onDeleteItem, onAddItem, onEditTarget }) {
  const [newLabel, setNewLabel] = useState("");
  const [newType, setNewType] = useState("tick");
  const [newMax, setNewMax] = useState(3);
  const [showAdd, setShowAdd] = useState(false);
  const [editingTarget, setEditingTarget] = useState(null);

  const total = items.length;
  const done = items.filter((item) => {
    const val = values[item.id];
    return item.type === "tick" ? val === true : val > 0;
  }).length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  const handleAdd = () => {
    if (!newLabel.trim()) return;
    const id = "custom_" + Date.now();
    const max = newType === "count" ? parseInt(newMax) || 3 : undefined;
    onAddItem({ id, label: newLabel.trim(), type: newType, max });
    setNewLabel("");
    setNewType("tick");
    setNewMax(3);
    setShowAdd(false);
  };

  return (
    <div>
      {/* Add item button */}
      {showAdd ? (
        <div style={s.addItemForm}>
          <input placeholder="Item name" value={newLabel} onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()} style={{ ...s.formInput, flex: 1 }} />
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            {["tick", "count"].map((t) => (
              <button key={t} onClick={() => setNewType(t)} style={{
                ...s.dirBtn,
                ...(newType === t ? s.dirBtnActive : {}),
              }}>{t}</button>
            ))}
            {newType === "count" && (
              <input type="number" min="1" value={newMax} onChange={(e) => setNewMax(e.target.value)}
                style={{ ...s.formInput, width: 50, textAlign: "center" }} placeholder="Max" />
            )}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={handleAdd} style={s.primaryBtn}>Add</button>
            <button onClick={() => setShowAdd(false)} style={s.ghostBtn}>Cancel</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setShowAdd(true)} style={{ ...s.addItemBtn, marginBottom: 12 }}>+ Add item</button>
      )}

      {/* Progress bar */}
      <div style={s.progressBarOuter}>
        <div style={{
          ...s.progressBarInner,
          width: `${pct}%`,
          background: pct === 100 ? T.green : pct > 50 ? T.yellow : T.red,
        }} />
        <span style={s.progressText}>{done}/{total} — {pct}%</span>
      </div>

      {/* Items */}
      <div style={s.checklistGrid}>
        {items.map((item) => {
          const target = targets[item.id] || item.max;
          return (
            <div key={item.id} style={s.checklistItem}>
              {item.type === "tick" ? (
                <button onClick={() => onChange(item.id, !values[item.id])} style={{
                  ...s.tickBtn,
                  background: values[item.id] ? T.green : T.white,
                  color: values[item.id] ? T.white : T.textMuted,
                  borderColor: values[item.id] ? T.green : T.border,
                }}>
                  {values[item.id] ? "\u2713" : ""}
                </button>
              ) : (
                <div style={s.counterGroup}>
                  <button onClick={() => onChange(item.id, Math.max(0, (values[item.id] || 0) - 1))} style={s.counterBtn}>&minus;</button>
                  <span style={s.counterVal}>{values[item.id] || 0}</span>
                  <button onClick={() => onChange(item.id, Math.min(target || 99, (values[item.id] || 0) + 1))} style={s.counterBtn}>+</button>
                </div>
              )}
              <span style={{
                ...s.checklistLabel,
                flex: 1,
                opacity: (item.type === "tick" && values[item.id]) || (item.type === "count" && values[item.id] > 0) ? 0.45 : 1,
                textDecoration: (item.type === "tick" && values[item.id]) || (item.type === "count" && values[item.id] >= target) ? "line-through" : "none",
              }}>
                {item.label}
                {item.type === "count" && (
                  editingTarget === item.id ? (
                    <input
                      autoFocus
                      type="number"
                      min="1"
                      defaultValue={target}
                      onBlur={(e) => { onEditTarget(item.id, parseInt(e.target.value) || target); setEditingTarget(null); }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") { onEditTarget(item.id, parseInt(e.target.value) || target); setEditingTarget(null); }
                        if (e.key === "Escape") setEditingTarget(null);
                      }}
                      style={{ ...s.formInput, width: 40, marginLeft: 6, padding: "2px 4px", textAlign: "center", fontSize: 11 }}
                    />
                  ) : (
                    <span onClick={() => setEditingTarget(item.id)} style={s.targetLabel} title="Click to edit target"> /{target}</span>
                  )
                )}
              </span>
              <button onClick={() => onDeleteItem(item.id)} style={s.deleteBtn}>&times;</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// --- Main ---

export default function GravelDashboard() {
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeRider, setActiveRider] = useState(0);
  const [tab, setTab] = useState("checklist");
  const [editingName, setEditingName] = useState(null);
  const countdown = useCountdown(RIDE_DATE.getTime());

  useDebouncedSave(state);

  useEffect(() => {
    try {
      // Try v2 first, then fall back to v1
      let raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) raw = localStorage.getItem("gravel-dash-v1");
      if (raw) {
        const parsed = migrateState(JSON.parse(raw));
        parsed.riderNames = parsed.riderNames || [...RIDERS];
        // Rename "Rider 3" to "Gus" if migrating
        const r3idx = parsed.riderNames.indexOf("Rider 3");
        if (r3idx !== -1) {
          parsed.riderNames[r3idx] = "Gus";
          if (parsed.checklist["Rider 3"]) {
            parsed.checklist["Gus"] = parsed.checklist["Rider 3"];
            delete parsed.checklist["Rider 3"];
          }
          if (parsed.training["Rider 3"]) {
            parsed.training["Gus"] = parsed.training["Rider 3"];
            delete parsed.training["Rider 3"];
          }
          if (parsed.checklistItems["Rider 3"]) {
            parsed.checklistItems["Gus"] = parsed.checklistItems["Rider 3"];
            delete parsed.checklistItems["Rider 3"];
          }
          if (parsed.checklistTargets["Rider 3"]) {
            parsed.checklistTargets["Gus"] = parsed.checklistTargets["Rider 3"];
            delete parsed.checklistTargets["Rider 3"];
          }
          if (parsed.flights["Rider 3"]) {
            parsed.flights["Gus"] = parsed.flights["Rider 3"];
            delete parsed.flights["Rider 3"];
          }
        }
        // Ensure all riders have entries
        parsed.riderNames.forEach((r) => {
          if (!parsed.checklist[r]) parsed.checklist[r] = {};
          if (!parsed.checklistItems[r]) parsed.checklistItems[r] = DEFAULT_CHECKLIST.map((item) => ({ ...item }));
          if (!parsed.checklistTargets[r]) {
            parsed.checklistTargets[r] = {};
            DEFAULT_CHECKLIST.forEach((item) => {
              if (item.type === "count") parsed.checklistTargets[r][item.id] = item.max;
            });
          }
          parsed.checklistItems[r].forEach((item) => {
            if (parsed.checklist[r][item.id] === undefined) {
              parsed.checklist[r][item.id] = item.type === "tick" ? false : 0;
            }
          });
          if (!parsed.training[r]) parsed.training[r] = [];
          if (!parsed.flights[r]) parsed.flights[r] = [];
        });
        setState(parsed);
      } else {
        setState(getDefaultState());
      }
    } catch {
      setState(getDefaultState());
    }
    setLoading(false);
  }, []);

  const riderName = state?.riderNames?.[activeRider] || RIDERS[activeRider];
  const hasFlight = RIDERS_WITH_FLIGHTS.includes(riderName);

  const updateChecklist = useCallback((itemId, value) => {
    setState((prev) => {
      const next = JSON.parse(JSON.stringify(prev));
      next.checklist[riderName][itemId] = value;
      return next;
    });
  }, [riderName]);

  const addChecklistItem = useCallback((item) => {
    setState((prev) => {
      const next = JSON.parse(JSON.stringify(prev));
      next.checklistItems[riderName].push(item);
      next.checklist[riderName][item.id] = item.type === "tick" ? false : 0;
      if (item.type === "count") next.checklistTargets[riderName][item.id] = item.max;
      return next;
    });
  }, [riderName]);

  const deleteChecklistItem = useCallback((itemId) => {
    setState((prev) => {
      const next = JSON.parse(JSON.stringify(prev));
      next.checklistItems[riderName] = next.checklistItems[riderName].filter((i) => i.id !== itemId);
      delete next.checklist[riderName][itemId];
      delete next.checklistTargets[riderName][itemId];
      return next;
    });
  }, [riderName]);

  const editTarget = useCallback((itemId, newMax) => {
    setState((prev) => {
      const next = JSON.parse(JSON.stringify(prev));
      next.checklistTargets[riderName][itemId] = newMax;
      return next;
    });
  }, [riderName]);

  const addSession = useCallback((session) => {
    setState((prev) => {
      const next = JSON.parse(JSON.stringify(prev));
      next.training[riderName].push(session);
      return next;
    });
  }, [riderName]);

  const removeSession = useCallback((idx) => {
    setState((prev) => {
      const next = JSON.parse(JSON.stringify(prev));
      const sorted = [...next.training[riderName]].sort((a, b) => b.date.localeCompare(a.date));
      sorted.splice(idx, 1);
      next.training[riderName] = sorted;
      return next;
    });
  }, [riderName]);

  const updateFlights = useCallback((flights) => {
    setState((prev) => {
      const next = JSON.parse(JSON.stringify(prev));
      next.flights[riderName] = flights;
      return next;
    });
  }, [riderName]);

  const renameRider = useCallback((index, newName) => {
    setState((prev) => {
      const next = JSON.parse(JSON.stringify(prev));
      const oldName = next.riderNames[index];
      if (oldName === newName || !newName.trim()) return prev;
      next.riderNames[index] = newName.trim();
      for (const key of ["checklist", "checklistItems", "checklistTargets", "training", "flights"]) {
        next[key][newName.trim()] = next[key][oldName];
        delete next[key][oldName];
      }
      return next;
    });
    setEditingName(null);
  }, []);

  const tabs = hasFlight ? ["checklist", "training", "flights"] : ["checklist", "training"];
  const tabLabels = { checklist: "Kit Checklist", training: "Training Log", flights: "Flights" };

  if (loading || !state) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: T.bg }}>
        <div style={s.spinner} />
      </div>
    );
  }

  return (
    <div style={s.root}>
      {/* Grain texture overlay */}
      <div style={s.grain} />

      {/* Header */}
      <header style={s.header}>
        <div style={s.headerBadge}>GRAVEL</div>
        <h1 style={s.title}>Brisbane &rarr; Sunshine Coast</h1>
        <p style={s.subtitle}>6 June 2026 &middot; The Long Way Round</p>
      </header>

      {/* Countdown */}
      <section style={s.countdownSection}>
        <CountdownBlock countdown={countdown} />
      </section>

      {/* Route & Elevation */}
      <RoutePanel />

      {/* Rider tabs */}
      <nav style={s.riderNav}>
        {state.riderNames.map((r, i) => (
          <div key={i} style={{ position: "relative" }}>
            {editingName === i ? (
              <input autoFocus defaultValue={r}
                onBlur={(e) => renameRider(i, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") renameRider(i, e.target.value);
                  if (e.key === "Escape") setEditingName(null);
                }}
                style={s.nameInput} />
            ) : (
              <button onClick={() => setActiveRider(i)} onDoubleClick={() => setEditingName(i)}
                style={{ ...s.riderTab, ...(activeRider === i ? s.riderTabActive : {}) }}>
                {r}
              </button>
            )}
          </div>
        ))}
      </nav>

      {/* Section tabs */}
      <div style={s.sectionTabs}>
        {tabs.map((t) => (
          <button key={t} onClick={() => setTab(t)}
            style={{ ...s.sectionTab, ...(tab === t ? s.sectionTabActive : {}) }}>
            {tabLabels[t]}
          </button>
        ))}
      </div>

      {/* Content */}
      <main style={s.main}>
        {tab === "checklist" ? (
          <ChecklistPanel
            rider={riderName}
            items={state.checklistItems[riderName] || []}
            targets={state.checklistTargets[riderName] || {}}
            values={state.checklist[riderName] || {}}
            onChange={updateChecklist}
            onDeleteItem={deleteChecklistItem}
            onAddItem={addChecklistItem}
            onEditTarget={editTarget}
          />
        ) : tab === "training" ? (
          <TrainingPanel rider={riderName} sessions={state.training[riderName] || []} onAdd={addSession} onRemove={removeSession} />
        ) : tab === "flights" && hasFlight ? (
          <FlightsPanel rider={riderName} flights={state.flights[riderName] || []} onUpdate={updateFlights} />
        ) : null}
      </main>
      <footer style={s.footer}>
        double-tap rider name to rename &middot; data saved locally
      </footer>
    </div>
  );
}

// --- Styles ---

const s = {
  root: {
    fontFamily: FONT_BODY,
    background: T.bg,
    color: T.text,
    minHeight: "100vh",
    position: "relative",
    maxWidth: 640,
    margin: "0 auto",
    padding: "0 16px 40px",
    overflow: "hidden",
  },
  grain: {
    position: "fixed",
    inset: 0,
    opacity: 0.035,
    backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
    backgroundSize: "128px",
    pointerEvents: "none",
    zIndex: 0,
    mixBlendMode: "multiply",
  },
  spinner: {
    width: 32, height: 32,
    border: `3px solid ${T.border}`,
    borderTopColor: T.accent,
    borderRadius: "50%",
    animation: "spin 0.8s linear infinite",
  },

  header: { textAlign: "center", paddingTop: 40, position: "relative", zIndex: 1 },
  headerBadge: {
    display: "inline-block", fontFamily: FONT_DISPLAY, fontSize: 11,
    letterSpacing: 6, color: T.accent, border: `1.5px solid ${T.accent}`,
    padding: "4px 16px", marginBottom: 12, borderRadius: 2,
  },
  title: {
    fontFamily: FONT_DISPLAY, fontSize: "clamp(22px, 6vw, 32px)", fontWeight: 700,
    textTransform: "uppercase", letterSpacing: 2, margin: "8px 0 4px", lineHeight: 1.1, color: T.text,
  },
  subtitle: { fontSize: 11, color: T.textDim, letterSpacing: 3, textTransform: "uppercase", margin: 0 },

  countdownSection: { margin: "28px 0 24px", position: "relative", zIndex: 1 },
  countdownRow: { display: "flex", justifyContent: "center", gap: 4 },
  countdownUnit: { display: "flex", flexDirection: "column", alignItems: "center", minWidth: 56 },
  countdownNumber: {
    fontFamily: FONT_DISPLAY, fontSize: "clamp(36px, 10vw, 56px)", fontWeight: 700, lineHeight: 1, color: T.text,
  },
  countdownLabel: { fontSize: 9, letterSpacing: 3, color: T.textMuted, marginTop: 4 },
  countdownSep: { fontFamily: FONT_DISPLAY, fontSize: "clamp(28px, 8vw, 44px)", color: T.accent, marginTop: 2, opacity: 0.5 },

  riderNav: { display: "flex", gap: 8, justifyContent: "center", marginBottom: 8, position: "relative", zIndex: 1 },
  riderTab: {
    fontFamily: FONT_BODY, fontSize: 12, padding: "8px 20px", background: "transparent",
    border: `1px solid ${T.border}`, color: T.textDim, cursor: "pointer", letterSpacing: 1,
    transition: "all 0.2s", borderRadius: 4,
  },
  riderTabActive: { color: T.accent, borderColor: T.accent, background: T.accentLight, fontWeight: 600 },
  nameInput: {
    fontFamily: FONT_BODY, fontSize: 12, padding: "8px 12px", background: T.accentLight,
    border: `1px solid ${T.accent}`, color: T.text, outline: "none", width: 100, letterSpacing: 1, borderRadius: 4,
  },

  sectionTabs: {
    display: "flex", gap: 0, margin: "8px 0 16px", borderBottom: `1px solid ${T.border}`, position: "relative", zIndex: 1,
  },
  sectionTab: {
    fontFamily: FONT_BODY, fontSize: 11, letterSpacing: 2, textTransform: "uppercase",
    padding: "12px 16px", background: "transparent", border: "none",
    borderBottom: "2px solid transparent", color: T.textDim, cursor: "pointer", transition: "all 0.2s", flex: 1,
  },
  sectionTabActive: { color: T.accent, borderBottomColor: T.accent },

  main: { position: "relative", zIndex: 1 },

  // Shared form elements
  formInput: {
    fontFamily: FONT_BODY, fontSize: 12, padding: "8px 10px",
    background: T.white, border: `1px solid ${T.border}`, color: T.text,
    borderRadius: 4, outline: "none", minWidth: 0,
  },
  primaryBtn: {
    fontFamily: FONT_BODY, fontSize: 12, padding: "8px 16px",
    background: T.accent, color: T.white, border: "none", borderRadius: 4,
    cursor: "pointer", fontWeight: 600, letterSpacing: 0.5,
  },
  ghostBtn: {
    fontFamily: FONT_BODY, fontSize: 12, padding: "8px 16px",
    background: "transparent", color: T.textDim, border: `1px solid ${T.border}`, borderRadius: 4,
    cursor: "pointer",
  },
  deleteBtn: {
    background: "transparent", border: "none", color: T.textMuted, fontSize: 18,
    cursor: "pointer", padding: "0 4px", lineHeight: 1, transition: "color 0.15s",
  },
  addItemBtn: {
    fontFamily: FONT_BODY, fontSize: 12, padding: "10px 0", width: "100%",
    background: T.accentLight, color: T.accent, border: `1px dashed ${T.accentBorder}`,
    borderRadius: 4, cursor: "pointer", letterSpacing: 1, fontWeight: 500,
  },
  addItemForm: {
    padding: 12, background: T.white, border: `1px solid ${T.border}`,
    borderRadius: 6, marginBottom: 12, display: "flex", flexDirection: "column", gap: 8,
  },

  // Checklist
  progressBarOuter: {
    position: "relative", height: 28, background: T.borderLight, borderRadius: 6,
    overflow: "hidden", marginBottom: 12, border: `1px solid ${T.border}`,
  },
  progressBarInner: { height: "100%", transition: "width 0.4s ease, background 0.4s ease", borderRadius: 6 },
  progressText: {
    position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
    fontSize: 10, letterSpacing: 2, fontWeight: 600, color: T.text,
  },
  checklistGrid: { display: "flex", flexDirection: "column", gap: 2 },
  checklistItem: {
    display: "flex", alignItems: "center", gap: 10, padding: "8px 12px",
    background: T.white, borderRadius: 4, border: `1px solid ${T.borderLight}`, transition: "background 0.15s",
  },
  tickBtn: {
    width: 26, height: 26, minWidth: 26, border: "1.5px solid", borderRadius: 4,
    cursor: "pointer", fontSize: 14, fontWeight: 700, display: "flex",
    alignItems: "center", justifyContent: "center", transition: "all 0.2s", fontFamily: "system-ui",
  },
  counterGroup: { display: "flex", alignItems: "center", gap: 2 },
  counterBtn: {
    width: 26, height: 26, background: T.bgCard, border: `1px solid ${T.border}`,
    color: T.text, borderRadius: 4, cursor: "pointer", fontSize: 16, fontFamily: "system-ui",
    display: "flex", alignItems: "center", justifyContent: "center",
  },
  counterVal: { fontFamily: FONT_DISPLAY, fontSize: 16, minWidth: 20, textAlign: "center", color: T.text },
  checklistLabel: { fontSize: 13, letterSpacing: 0.3, transition: "all 0.2s" },
  targetLabel: { color: T.textMuted, fontSize: 11, cursor: "pointer", borderBottom: `1px dashed ${T.textMuted}` },

  // Training
  trainingHeader: {
    textAlign: "center", marginBottom: 16, padding: "20px 0",
    background: T.white, border: `1px solid ${T.borderLight}`, borderRadius: 6,
  },
  trainingTotal: { fontFamily: FONT_DISPLAY, fontSize: 52, fontWeight: 700, color: T.text, lineHeight: 1 },
  trainingTotalLabel: {
    display: "block", fontSize: 10, letterSpacing: 3, textTransform: "uppercase", color: T.textMuted, marginTop: 6,
  },
  trainingInputRow: { display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" },
  sessionList: { display: "flex", flexDirection: "column", gap: 2 },
  sessionRow: {
    display: "flex", alignItems: "center", gap: 12, padding: "8px 12px",
    background: T.white, border: `1px solid ${T.borderLight}`, borderRadius: 4, fontSize: 12,
  },
  sessionDate: { color: T.textDim, minWidth: 90 },
  sessionHrs: { fontFamily: FONT_DISPLAY, color: T.accent, minWidth: 36, fontWeight: 600 },
  sessionNote: { color: T.text, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },

  // Flights
  flightCard: {
    padding: 14, background: T.white, border: `1px solid ${T.borderLight}`,
    borderRadius: 6, marginBottom: 6,
  },
  flightSectionLabel: {
    fontFamily: FONT_DISPLAY, fontSize: 12, letterSpacing: 3, textTransform: "uppercase",
    color: T.textMuted, marginBottom: 8,
  },
  flightForm: {
    padding: 14, background: T.white, border: `1px solid ${T.border}`,
    borderRadius: 6, marginTop: 8,
  },
  formGrid: {
    display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6,
  },
  dirBtn: {
    fontFamily: FONT_BODY, fontSize: 11, padding: "6px 14px", background: "transparent",
    border: `1px solid ${T.border}`, color: T.textDim, borderRadius: 4, cursor: "pointer",
    textTransform: "capitalize", letterSpacing: 0.5,
  },
  dirBtnActive: { color: T.accent, borderColor: T.accent, background: T.accentLight },

  // Route panel
  routePanel: {
    margin: "0 0 20px", position: "relative", zIndex: 1,
    background: T.white, border: `1px solid ${T.borderLight}`, borderRadius: 8,
    overflow: "hidden",
  },
  routeMapWrap: {
    position: "relative", padding: "0",
    borderBottom: `1px solid ${T.borderLight}`,
  },
  routeLabels: {
    position: "absolute", bottom: 8, left: 12, right: 12,
    display: "flex", justifyContent: "space-between",
  },
  routeLabelStart: {
    fontFamily: FONT_BODY, fontSize: 9, letterSpacing: 2, textTransform: "uppercase",
    color: T.green, fontWeight: 600, background: "rgba(255,255,255,0.85)",
    padding: "2px 6px", borderRadius: 3,
  },
  routeLabelEnd: {
    fontFamily: FONT_BODY, fontSize: 9, letterSpacing: 2, textTransform: "uppercase",
    color: T.accent, fontWeight: 600, background: "rgba(255,255,255,0.85)",
    padding: "2px 6px", borderRadius: 3,
  },
  elevWrap: {
    padding: "12px 16px 8px",
    borderBottom: `1px solid ${T.borderLight}`,
  },
  statsRow: {
    display: "flex", justifyContent: "center", alignItems: "center",
    padding: "14px 16px", gap: 0,
  },
  statItem: {
    display: "flex", flexDirection: "column", alignItems: "center", flex: 1,
  },
  statValue: {
    fontFamily: FONT_DISPLAY, fontSize: 22, fontWeight: 700, color: T.text, lineHeight: 1,
  },
  statLabel: {
    fontFamily: FONT_BODY, fontSize: 8, letterSpacing: 3, color: T.textMuted, marginTop: 3,
    textTransform: "uppercase",
  },
  statDivider: {
    width: 1, height: 28, background: T.borderLight,
  },

  footer: {
    textAlign: "center", fontSize: 10, color: T.textMuted, letterSpacing: 1, marginTop: 32, position: "relative", zIndex: 1,
  },
};
