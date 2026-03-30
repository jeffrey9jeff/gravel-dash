import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { elevationProfile, routeCoords } from "./routeData.js";

const RIDE_DATE = new Date("2026-06-06T05:00:00+10:00");

const RIDERS = ["Jeffrey", "Andrew", "Gus"];
const RIDERS_WITH_FLIGHTS = ["Jeffrey", "Gus"];

const POWER_METER_COST = 1060.99;

const DEFAULT_PURCHASES = [
  { id: "bike_service", label: "Bike service / tune-up", type: "tick" },
  { id: "spare_tubes", label: "Spare tubes", type: "count", max: 3 },
  { id: "co2_carts", label: "CO\u2082 cartridges", type: "count", max: 4 },
  { id: "tyre_plugs", label: "Tyre plug kit", type: "tick" },
  { id: "multi_tool", label: "Multi-tool", type: "tick" },
  { id: "chain_link", label: "Quick chain link", type: "tick" },
  { id: "electrolytes", label: "Electrolyte tabs", type: "count", max: 10 },
  { id: "gels", label: "Gels / bars", type: "count", max: 12 },
  { id: "sunscreen", label: "Sunscreen", type: "tick" },
  { id: "first_aid", label: "First aid basics", type: "tick" },
  { id: "pump", label: "Mini pump", type: "tick" },
];

const DEFAULT_PACKING = [
  { id: "tyre_sealant", label: "Tyre sealant refreshed", type: "tick" },
  { id: "bottles", label: "Bottles / hydration", type: "count", max: 3 },
  { id: "lights_front", label: "Front light charged", type: "tick" },
  { id: "lights_rear", label: "Rear light charged", type: "tick" },
  { id: "helmet", label: "Helmet", type: "tick" },
  { id: "gloves", label: "Gloves", type: "tick" },
  { id: "kit_layers", label: "Kit / layers packed", type: "tick" },
  { id: "phone_charged", label: "Phone charged + mount", type: "tick" },
  { id: "garmin_charged", label: "GPS / Garmin charged", type: "tick" },
  { id: "route_loaded", label: "Route loaded on device", type: "tick" },
  { id: "cash_card", label: "Cash / card for stops", type: "tick" },
];

const ALL_DEFAULTS = [...DEFAULT_PURCHASES, ...DEFAULT_PACKING];

const STORAGE_KEY = "gravel-dash-v3";

function getDefaultState() {
  const checklist = {};
  const purchaseItems = {};
  const packingItems = {};
  const checklistTargets = {};
  const training = {};
  const flights = {};
  RIDERS.forEach((r) => {
    checklist[r] = {};
    purchaseItems[r] = DEFAULT_PURCHASES.map((item) => ({ ...item }));
    packingItems[r] = DEFAULT_PACKING.map((item) => ({ ...item }));
    checklistTargets[r] = {};
    ALL_DEFAULTS.forEach((item) => {
      checklist[r][item.id] = item.type === "tick" ? false : 0;
      if (item.type === "count") checklistTargets[r][item.id] = item.max;
    });
    training[r] = [];
    flights[r] = [];
  });
  return { checklist, purchaseItems, packingItems, checklistTargets, training, flights, riderNames: [...RIDERS], powerMeterSaved: 0 };
}

function migrateState(parsed) {
  // Migrate from v2/v1: split single checklistItems into purchases + packing
  if (parsed.checklistItems && !parsed.purchaseItems) {
    parsed.purchaseItems = {};
    parsed.packingItems = {};
    const purchaseIds = new Set(DEFAULT_PURCHASES.map((i) => i.id));
    const packingIds = new Set(DEFAULT_PACKING.map((i) => i.id));
    (parsed.riderNames || RIDERS).forEach((r) => {
      const items = parsed.checklistItems[r] || [];
      parsed.purchaseItems[r] = [];
      parsed.packingItems[r] = [];
      items.forEach((item) => {
        if (purchaseIds.has(item.id)) {
          parsed.purchaseItems[r].push(item);
        } else if (packingIds.has(item.id)) {
          parsed.packingItems[r].push(item);
        } else {
          // Custom items go to packing by default
          parsed.packingItems[r].push(item);
        }
      });
      // Add any defaults that weren't in the old list
      DEFAULT_PURCHASES.forEach((d) => {
        if (!parsed.purchaseItems[r].find((i) => i.id === d.id)) {
          parsed.purchaseItems[r].push({ ...d });
        }
      });
      DEFAULT_PACKING.forEach((d) => {
        if (!parsed.packingItems[r].find((i) => i.id === d.id)) {
          parsed.packingItems[r].push({ ...d });
        }
      });
    });
    delete parsed.checklistItems;
  }
  if (!parsed.purchaseItems) {
    parsed.purchaseItems = {};
    parsed.packingItems = {};
    (parsed.riderNames || RIDERS).forEach((r) => {
      parsed.purchaseItems[r] = DEFAULT_PURCHASES.map((item) => ({ ...item }));
      parsed.packingItems[r] = DEFAULT_PACKING.map((item) => ({ ...item }));
    });
  }
  if (!parsed.checklistTargets) {
    parsed.checklistTargets = {};
    (parsed.riderNames || RIDERS).forEach((r) => {
      parsed.checklistTargets[r] = {};
      ALL_DEFAULTS.forEach((item) => {
        if (item.type === "count") parsed.checklistTargets[r][item.id] = item.max;
      });
    });
  }
  if (!parsed.flights) {
    parsed.flights = {};
    (parsed.riderNames || RIDERS).forEach((r) => { parsed.flights[r] = []; });
  }
  if (parsed.powerMeterSaved === undefined) parsed.powerMeterSaved = 0;
  return parsed;
}

// Save immediately + debounced
function useSave(state) {
  const timer = useRef(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  const flushSave = useCallback(() => {
    if (!stateRef.current) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stateRef.current));
    } catch (e) {
      console.error("Save failed:", e);
    }
  }, []);

  useEffect(() => {
    if (!state) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flushSave, 400);
    return () => clearTimeout(timer.current);
  }, [state, flushSave]);

  // Save on page unload
  useEffect(() => {
    const handler = () => flushSave();
    window.addEventListener("beforeunload", handler);
    window.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") flushSave();
    });
    return () => window.removeEventListener("beforeunload", handler);
  }, [flushSave]);
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
  yellowBg: "rgba(181,138,27,0.08)",
  yellowBorder: "rgba(181,138,27,0.25)",
  red: "#c43e2a",
  white: "#ffffff",
  electric: "#3b82f6",
  electricLight: "rgba(59,130,246,0.08)",
  electricBorder: "rgba(59,130,246,0.2)",
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

function PowerMeterTracker({ saved, onUpdate }) {
  const [editing, setEditing] = useState(false);
  const [inputVal, setInputVal] = useState("");
  const pct = Math.min(100, Math.round((saved / POWER_METER_COST) * 100));
  const remaining = Math.max(0, POWER_METER_COST - saved);

  const handleSave = () => {
    const val = parseFloat(inputVal);
    if (!isNaN(val) && val >= 0) onUpdate(val);
    setEditing(false);
  };

  return (
    <div style={s.powerCard}>
      <div style={s.powerHeader}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ marginRight: 8, flexShrink: 0 }}>
          <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill={T.electric} opacity="0.15" stroke={T.electric} strokeWidth="2" strokeLinejoin="round" />
        </svg>
        <span style={s.powerTitle}>Andrew's Power Meter Pedals</span>
        <span style={s.powerCost}>${POWER_METER_COST.toFixed(2)}</span>
      </div>
      <div style={s.powerBarOuter}>
        <div style={{
          ...s.powerBarInner,
          width: `${pct}%`,
          background: pct >= 100
            ? `linear-gradient(90deg, ${T.green}, #34d399)`
            : `linear-gradient(90deg, ${T.electric}, #60a5fa)`,
        }}>
          {pct >= 100 && (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)" }}>
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill="#fff" opacity="0.5" />
            </svg>
          )}
        </div>
        <span style={s.powerBarText}>
          {pct >= 100 ? "FULLY CHARGED!" : `$${saved.toFixed(0)} / $${POWER_METER_COST.toFixed(0)}`}
        </span>
        {/* Lightning bolt decorations */}
        {[15, 35, 55, 75, 90].map((pos) => (
          <svg key={pos} width="10" height="10" viewBox="0 0 24 24" fill="none"
            style={{ position: "absolute", left: `${pos}%`, top: "50%", transform: "translateY(-50%)", opacity: pos < pct ? 0.3 : 0.08, pointerEvents: "none" }}>
            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill={pos < pct ? "#fff" : T.electric} />
          </svg>
        ))}
      </div>
      <div style={s.powerFooter}>
        {editing ? (
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <span style={{ fontSize: 12, color: T.textDim }}>$</span>
            <input
              autoFocus
              type="number"
              step="0.01"
              min="0"
              placeholder="Amount saved"
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") setEditing(false); }}
              style={{ ...s.formInput, width: 110, fontSize: 12 }}
            />
            <button onClick={handleSave} style={s.primaryBtnSmall}>Save</button>
            <button onClick={() => setEditing(false)} style={s.ghostBtnSmall}>Cancel</button>
          </div>
        ) : (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
            <span style={{ fontSize: 11, color: T.textDim }}>
              {pct >= 100 ? "Ready to order!" : `$${remaining.toFixed(2)} to go`}
            </span>
            <button onClick={() => { setInputVal(String(saved || "")); setEditing(true); }} style={s.powerEditBtn}>
              Update savings
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function RoutePanel() {
  const W = 608;
  const MAP_H = 180;
  const ELEV_H = 100;

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

  const { elevPath, elevFill, elevLabels } = useMemo(() => {
    if (!elevationProfile.length) return { elevPath: "", elevFill: "", elevLabels: [] };
    const maxD = elevationProfile[elevationProfile.length - 1].d;
    const minE = Math.min(...elevationProfile.map((p) => p.e));
    const maxE = Math.max(...elevationProfile.map((p) => p.e));
    const w = W, h = ELEV_H;
    const pts = elevationProfile.map((p) => {
      const x = (p.d / maxD) * w;
      const y = h - ((p.e - minE) / (maxE - minE)) * (h - 8);
      return { x, y };
    });
    const path = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
    const fill = path + ` L${pts[pts.length - 1].x.toFixed(1)},${h} L${pts[0].x.toFixed(1)},${h} Z`;
    const labels = [
      { text: `${minE.toFixed(0)}m`, x: 4, y: h - 4 },
      { text: `${maxE.toFixed(0)}m`, x: 4, y: 12 },
    ];
    for (let km = 50; km < maxD / 1000; km += 50) {
      const x = (km / (maxD / 1000)) * w;
      labels.push({ text: `${km}km`, x, y: h - 4, anchor: "middle" });
    }
    return { elevPath: path, elevFill: fill, elevLabels: labels };
  }, []);

  return (
    <div style={s.routePanel}>
      <div style={s.routeMapWrap}>
        <svg width="100%" viewBox={`0 0 ${W} ${MAP_H}`} style={{ display: "block" }}>
          {Array.from({ length: 8 }).map((_, row) =>
            Array.from({ length: 16 }).map((_, col) => (
              <circle key={`${row}-${col}`} cx={col * (W / 15)} cy={row * (MAP_H / 7)} r="0.6" fill={T.border} />
            ))
          )}
          <path d={routePath} fill="none" stroke={T.accent} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" opacity="0.15" />
          <path d={routePath} fill="none" stroke={T.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
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
          <a href="https://hatchedchicken.com.au/" target="_blank" rel="noopener noreferrer" style={s.routeLabelEnd}>
            <img src="https://hatchedchicken.com.au/wp-content/uploads/2025/10/logo-sandhat.png" alt="Hatched Chicken" style={{ height: 18, marginRight: 5, verticalAlign: "middle", borderRadius: 2 }} />
            Hatched Chicken
          </a>
        </div>
      </div>

      <div style={s.elevWrap}>
        <div style={{ fontFamily: FONT_DISPLAY, fontSize: 9, letterSpacing: 3, textTransform: "uppercase", color: T.textMuted, marginBottom: 6 }}>
          Elevation Profile
        </div>
        <svg width="100%" viewBox={`0 0 ${W} ${ELEV_H}`} style={{ display: "block" }}>
          <path d={elevFill} fill="url(#elevGrad)" />
          <path d={elevPath} fill="none" stroke={T.accent} strokeWidth="1.5" strokeLinejoin="round" />
          <defs>
            <linearGradient id="elevGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={T.accent} stopOpacity="0.2" />
              <stop offset="100%" stopColor={T.accent} stopOpacity="0.02" />
            </linearGradient>
          </defs>
          {elevLabels.map((l, i) => (
            <text key={i} x={l.x} y={l.y} fontSize="8" fontFamily={FONT_BODY} fill={T.textMuted} textAnchor={l.anchor || "start"}>{l.text}</text>
          ))}
        </svg>
      </div>

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
          <div style={{ color: T.text, fontWeight: 500 }}>{f.depart || "\u2014"}</div>
        </div>
        <div style={{ color: T.textMuted, alignSelf: "center", fontSize: 16 }}>&rarr;</div>
        <div>
          <div style={{ color: T.textMuted, fontSize: 9, letterSpacing: 2, textTransform: "uppercase" }}>Arrive</div>
          <div style={{ color: T.text, fontWeight: 500 }}>{f.arrive || "\u2014"}</div>
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

function ChecklistPanel({ title, items, targets, values, onChange, onDeleteItem, onAddItem, onEditTarget, onEditItemLabel }) {
  const [newLabel, setNewLabel] = useState("");
  const [newType, setNewType] = useState("tick");
  const [newMax, setNewMax] = useState(3);
  const [showAdd, setShowAdd] = useState(false);
  const [editingTarget, setEditingTarget] = useState(null);
  const [editingLabel, setEditingLabel] = useState(null);
  const [editLabelVal, setEditLabelVal] = useState("");

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

  const handleLabelSave = (itemId) => {
    if (editLabelVal.trim()) {
      onEditItemLabel(itemId, editLabelVal.trim());
    }
    setEditingLabel(null);
  };

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={s.checklistSectionTitle}>{title}</div>

      {/* Add item */}
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
        <button onClick={() => setShowAdd(true)} style={{ ...s.addItemBtn, marginBottom: 8 }}>+ Add item</button>
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
                {editingLabel === item.id ? (
                  <input
                    autoFocus
                    value={editLabelVal}
                    onChange={(e) => setEditLabelVal(e.target.value)}
                    onBlur={() => handleLabelSave(item.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleLabelSave(item.id);
                      if (e.key === "Escape") setEditingLabel(null);
                    }}
                    style={{ ...s.formInput, padding: "2px 6px", fontSize: 12, width: "100%" }}
                  />
                ) : (
                  <span
                    onDoubleClick={() => { setEditingLabel(item.id); setEditLabelVal(item.label); }}
                    title="Double-tap to edit"
                    style={{ cursor: "default" }}
                  >
                    {item.label}
                  </span>
                )}
                {item.type === "count" && editingLabel !== item.id && (
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

  useSave(state);

  useEffect(() => {
    try {
      let raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) raw = localStorage.getItem("gravel-dash-v2");
      if (!raw) raw = localStorage.getItem("gravel-dash-v1");
      if (raw) {
        const parsed = migrateState(JSON.parse(raw));
        parsed.riderNames = parsed.riderNames || [...RIDERS];
        // Rename "Rider 3" to "Gus" if migrating
        const r3idx = parsed.riderNames.indexOf("Rider 3");
        if (r3idx !== -1) {
          const oldName = "Rider 3";
          const newName = "Gus";
          parsed.riderNames[r3idx] = newName;
          for (const key of ["checklist", "purchaseItems", "packingItems", "checklistTargets", "training", "flights"]) {
            if (parsed[key] && parsed[key][oldName]) {
              parsed[key][newName] = parsed[key][oldName];
              delete parsed[key][oldName];
            }
          }
        }
        // Ensure all riders have entries
        parsed.riderNames.forEach((r) => {
          if (!parsed.checklist[r]) parsed.checklist[r] = {};
          if (!parsed.purchaseItems[r]) parsed.purchaseItems[r] = DEFAULT_PURCHASES.map((item) => ({ ...item }));
          if (!parsed.packingItems[r]) parsed.packingItems[r] = DEFAULT_PACKING.map((item) => ({ ...item }));
          if (!parsed.checklistTargets[r]) {
            parsed.checklistTargets[r] = {};
            ALL_DEFAULTS.forEach((item) => {
              if (item.type === "count") parsed.checklistTargets[r][item.id] = item.max;
            });
          }
          [...parsed.purchaseItems[r], ...parsed.packingItems[r]].forEach((item) => {
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

  const addItem = useCallback((category, item) => {
    setState((prev) => {
      const next = JSON.parse(JSON.stringify(prev));
      const key = category === "purchases" ? "purchaseItems" : "packingItems";
      next[key][riderName].push(item);
      next.checklist[riderName][item.id] = item.type === "tick" ? false : 0;
      if (item.type === "count") next.checklistTargets[riderName][item.id] = item.max;
      return next;
    });
  }, [riderName]);

  const deleteItem = useCallback((category, itemId) => {
    setState((prev) => {
      const next = JSON.parse(JSON.stringify(prev));
      const key = category === "purchases" ? "purchaseItems" : "packingItems";
      next[key][riderName] = next[key][riderName].filter((i) => i.id !== itemId);
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

  const editItemLabel = useCallback((category, itemId, newLabel) => {
    setState((prev) => {
      const next = JSON.parse(JSON.stringify(prev));
      const key = category === "purchases" ? "purchaseItems" : "packingItems";
      const item = next[key][riderName].find((i) => i.id === itemId);
      if (item) item.label = newLabel;
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

  const updatePowerMeter = useCallback((amount) => {
    setState((prev) => {
      const next = JSON.parse(JSON.stringify(prev));
      next.powerMeterSaved = amount;
      return next;
    });
  }, []);

  const renameRider = useCallback((index, newName) => {
    setState((prev) => {
      const next = JSON.parse(JSON.stringify(prev));
      const oldName = next.riderNames[index];
      if (oldName === newName || !newName.trim()) return prev;
      next.riderNames[index] = newName.trim();
      for (const key of ["checklist", "purchaseItems", "packingItems", "checklistTargets", "training", "flights"]) {
        next[key][newName.trim()] = next[key][oldName];
        delete next[key][oldName];
      }
      return next;
    });
    setEditingName(null);
  }, []);

  const tabs = hasFlight ? ["checklist", "training", "flights"] : ["checklist", "training"];
  const tabLabels = { checklist: "Checklists", training: "Training Log", flights: "Flights" };

  if (loading || !state) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: T.bg }}>
        <div style={s.spinner} />
      </div>
    );
  }

  return (
    <div style={s.root}>
      <div style={s.grain} />

      <header style={s.header}>
        <div style={s.headerBadge}>GRAVEL</div>
        <h1 style={s.title}>Brisbane &rarr; Sunshine Coast</h1>
        <p style={s.subtitle}>6 June 2026 &middot; The Long Way Round</p>
      </header>

      <section style={s.countdownSection}>
        <CountdownBlock countdown={countdown} />
      </section>

      <PowerMeterTracker saved={state.powerMeterSaved} onUpdate={updatePowerMeter} />

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
          <>
            <ChecklistPanel
              title="Purchases Checklist"
              items={state.purchaseItems[riderName] || []}
              targets={state.checklistTargets[riderName] || {}}
              values={state.checklist[riderName] || {}}
              onChange={updateChecklist}
              onDeleteItem={(id) => deleteItem("purchases", id)}
              onAddItem={(item) => addItem("purchases", item)}
              onEditTarget={editTarget}
              onEditItemLabel={(id, label) => editItemLabel("purchases", id, label)}
            />
            <ChecklistPanel
              title="Packing Checklist"
              items={state.packingItems[riderName] || []}
              targets={state.checklistTargets[riderName] || {}}
              values={state.checklist[riderName] || {}}
              onChange={updateChecklist}
              onDeleteItem={(id) => deleteItem("packing", id)}
              onAddItem={(item) => addItem("packing", item)}
              onEditTarget={editTarget}
              onEditItemLabel={(id, label) => editItemLabel("packing", id, label)}
            />
          </>
        ) : tab === "training" ? (
          <TrainingPanel rider={riderName} sessions={state.training[riderName] || []} onAdd={addSession} onRemove={removeSession} />
        ) : tab === "flights" && hasFlight ? (
          <FlightsPanel rider={riderName} flights={state.flights[riderName] || []} onUpdate={updateFlights} />
        ) : null}
      </main>
      <footer style={s.footer}>
        double-tap to edit item names &middot; data saved locally
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

  countdownSection: { margin: "28px 0 20px", position: "relative", zIndex: 1 },
  countdownRow: { display: "flex", justifyContent: "center", gap: 4 },
  countdownUnit: { display: "flex", flexDirection: "column", alignItems: "center", minWidth: 56 },
  countdownNumber: {
    fontFamily: FONT_DISPLAY, fontSize: "clamp(36px, 10vw, 56px)", fontWeight: 700, lineHeight: 1, color: T.text,
  },
  countdownLabel: { fontSize: 9, letterSpacing: 3, color: T.textMuted, marginTop: 4 },
  countdownSep: { fontFamily: FONT_DISPLAY, fontSize: "clamp(28px, 8vw, 44px)", color: T.accent, marginTop: 2, opacity: 0.5 },

  // Power meter tracker
  powerCard: {
    position: "relative", zIndex: 1,
    margin: "0 0 20px",
    padding: "14px 16px",
    background: T.white,
    border: `1px solid ${T.electricBorder}`,
    borderRadius: 8,
    overflow: "hidden",
  },
  powerHeader: {
    display: "flex", alignItems: "center", marginBottom: 10,
  },
  powerTitle: {
    fontFamily: FONT_DISPLAY, fontSize: 13, letterSpacing: 1, textTransform: "uppercase",
    color: T.text, fontWeight: 600, flex: 1,
  },
  powerCost: {
    fontFamily: FONT_BODY, fontSize: 12, color: T.textDim, fontWeight: 500,
  },
  powerBarOuter: {
    position: "relative", height: 32, background: T.electricLight,
    borderRadius: 16, overflow: "hidden", border: `1px solid ${T.electricBorder}`,
  },
  powerBarInner: {
    height: "100%", borderRadius: 16,
    transition: "width 0.5s ease",
    position: "relative",
  },
  powerBarText: {
    position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
    fontSize: 10, letterSpacing: 1.5, fontWeight: 600, color: T.text,
    fontFamily: FONT_BODY, whiteSpace: "nowrap",
  },
  powerFooter: {
    marginTop: 10, display: "flex", alignItems: "center",
  },
  powerEditBtn: {
    fontFamily: FONT_BODY, fontSize: 11, padding: "5px 12px",
    background: T.electricLight, color: T.electric, border: `1px solid ${T.electricBorder}`,
    borderRadius: 4, cursor: "pointer", letterSpacing: 0.5,
  },

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
  primaryBtnSmall: {
    fontFamily: FONT_BODY, fontSize: 11, padding: "5px 12px",
    background: T.electric, color: T.white, border: "none", borderRadius: 4,
    cursor: "pointer", fontWeight: 600,
  },
  ghostBtn: {
    fontFamily: FONT_BODY, fontSize: 12, padding: "8px 16px",
    background: "transparent", color: T.textDim, border: `1px solid ${T.border}`, borderRadius: 4,
    cursor: "pointer",
  },
  ghostBtnSmall: {
    fontFamily: FONT_BODY, fontSize: 11, padding: "5px 12px",
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
    borderRadius: 6, marginBottom: 8, display: "flex", flexDirection: "column", gap: 8,
  },

  // Checklist
  checklistSectionTitle: {
    fontFamily: FONT_DISPLAY, fontSize: 14, letterSpacing: 3, textTransform: "uppercase",
    color: T.accent, marginBottom: 8, fontWeight: 600,
  },
  progressBarOuter: {
    position: "relative", height: 28, background: T.borderLight, borderRadius: 6,
    overflow: "hidden", marginBottom: 8, border: `1px solid ${T.border}`,
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
    display: "flex", justifyContent: "space-between", alignItems: "center",
  },
  routeLabelStart: {
    fontFamily: FONT_BODY, fontSize: 9, letterSpacing: 2, textTransform: "uppercase",
    color: T.green, fontWeight: 600, background: "rgba(255,255,255,0.9)",
    padding: "3px 8px", borderRadius: 3,
  },
  routeLabelEnd: {
    fontFamily: FONT_BODY, fontSize: 9, letterSpacing: 2, textTransform: "uppercase",
    color: T.accent, fontWeight: 600, background: "rgba(255,255,255,0.9)",
    padding: "3px 8px", borderRadius: 3, textDecoration: "none",
    display: "flex", alignItems: "center",
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
