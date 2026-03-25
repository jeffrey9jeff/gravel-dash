import { useState, useEffect, useCallback, useRef } from "react";

const RIDE_DATE = new Date("2026-06-06T05:00:00+10:00");

const RIDERS = ["Jeffrey", "Andrew", "Rider 3"];

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

const STORAGE_KEY = "gravel-dash-v1";

function getDefaultState() {
  const checklist = {};
  const training = {};
  RIDERS.forEach((r) => {
    checklist[r] = {};
    DEFAULT_CHECKLIST.forEach((item) => {
      checklist[r][item.id] = item.type === "tick" ? false : 0;
    });
    training[r] = [];
  });
  return { checklist, training, riderNames: [...RIDERS] };
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

// --- Components ---

function CountdownBlock({ countdown }) {
  const units = [
    { label: "DAYS", value: countdown.days },
    { label: "HRS", value: countdown.hours },
    { label: "MIN", value: countdown.mins },
    { label: "SEC", value: countdown.secs },
  ];
  return (
    <div style={styles.countdownRow}>
      {units.map((u, i) => (
        <div key={u.label} style={{ display: "flex", alignItems: "center" }}>
          <div style={styles.countdownUnit}>
            <span style={styles.countdownNumber}>
              {String(u.value).padStart(2, "0")}
            </span>
            <span style={styles.countdownLabel}>{u.label}</span>
          </div>
          {i < units.length - 1 && (
            <span style={styles.countdownSep}>:</span>
          )}
        </div>
      ))}
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
    <div style={styles.trainingCard}>
      <div style={styles.trainingHeader}>
        <span style={styles.trainingTotal}>{totalHrs.toFixed(1)}</span>
        <span style={styles.trainingTotalLabel}>hrs trained</span>
      </div>
      <div style={styles.trainingInputRow}>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          style={{ ...styles.input, flex: 1.2 }}
        />
        <input
          type="number"
          step="0.5"
          min="0"
          placeholder="Hrs"
          value={hrs}
          onChange={(e) => setHrs(e.target.value)}
          style={{ ...styles.input, flex: 0.6 }}
        />
        <input
          placeholder="Note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          style={{ ...styles.input, flex: 1.4 }}
        />
        <button onClick={handleAdd} style={styles.addBtn}>
          +
        </button>
      </div>
      {sessions.length > 0 && (
        <div style={styles.sessionList}>
          {[...sessions]
            .sort((a, b) => b.date.localeCompare(a.date))
            .map((s, i) => (
              <div key={i} style={styles.sessionRow}>
                <span style={styles.sessionDate}>{s.date}</span>
                <span style={styles.sessionHrs}>{s.hours}h</span>
                <span style={styles.sessionNote}>{s.note}</span>
                <button
                  onClick={() => onRemove(i)}
                  style={styles.removeBtn}
                >
                  &times;
                </button>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

function ChecklistPanel({ rider, state, onChange }) {
  const total = DEFAULT_CHECKLIST.length;
  const done = DEFAULT_CHECKLIST.filter((item) => {
    const val = state[item.id];
    return item.type === "tick" ? val === true : val > 0;
  }).length;
  const pct = Math.round((done / total) * 100);

  return (
    <div style={styles.checklistCard}>
      <div style={styles.progressBarOuter}>
        <div
          style={{
            ...styles.progressBarInner,
            width: `${pct}%`,
            background:
              pct === 100
                ? "#22c55e"
                : pct > 50
                ? "#eab308"
                : "#ef4444",
          }}
        />
        <span style={styles.progressText}>
          {done}/{total} — {pct}%
        </span>
      </div>
      <div style={styles.checklistGrid}>
        {DEFAULT_CHECKLIST.map((item) => (
          <div key={item.id} style={styles.checklistItem}>
            {item.type === "tick" ? (
              <button
                onClick={() => onChange(item.id, !state[item.id])}
                style={{
                  ...styles.tickBtn,
                  background: state[item.id]
                    ? "#22c55e"
                    : "rgba(255,255,255,0.06)",
                  color: state[item.id] ? "#000" : "#888",
                  borderColor: state[item.id]
                    ? "#22c55e"
                    : "rgba(255,255,255,0.12)",
                }}
              >
                {state[item.id] ? "\u2713" : ""}
              </button>
            ) : (
              <div style={styles.counterGroup}>
                <button
                  onClick={() =>
                    onChange(
                      item.id,
                      Math.max(0, (state[item.id] || 0) - 1)
                    )
                  }
                  style={styles.counterBtn}
                >
                  &minus;
                </button>
                <span style={styles.counterVal}>
                  {state[item.id] || 0}
                </span>
                <button
                  onClick={() =>
                    onChange(
                      item.id,
                      Math.min(item.max, (state[item.id] || 0) + 1)
                    )
                  }
                  style={styles.counterBtn}
                >
                  +
                </button>
              </div>
            )}
            <span
              style={{
                ...styles.checklistLabel,
                opacity:
                  (item.type === "tick" && state[item.id]) ||
                  (item.type === "count" && state[item.id] > 0)
                    ? 0.5
                    : 1,
                textDecoration:
                  (item.type === "tick" && state[item.id]) ||
                  (item.type === "count" && state[item.id] >= item.max)
                    ? "line-through"
                    : "none",
              }}
            >
              {item.label}
              {item.type === "count" && (
                <span style={styles.maxLabel}> /{item.max}</span>
              )}
            </span>
          </div>
        ))}
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
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        // Ensure all riders have all checklist items
        const def = getDefaultState();
        parsed.riderNames = parsed.riderNames || def.riderNames;
        parsed.riderNames.forEach((r) => {
          if (!parsed.checklist[r]) parsed.checklist[r] = {};
          DEFAULT_CHECKLIST.forEach((item) => {
            if (parsed.checklist[r][item.id] === undefined) {
              parsed.checklist[r][item.id] =
                item.type === "tick" ? false : 0;
            }
          });
          if (!parsed.training[r]) parsed.training[r] = [];
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

  const updateChecklist = useCallback(
    (itemId, value) => {
      setState((prev) => {
        const next = JSON.parse(JSON.stringify(prev));
        next.checklist[riderName][itemId] = value;
        return next;
      });
    },
    [riderName]
  );

  const addSession = useCallback(
    (session) => {
      setState((prev) => {
        const next = JSON.parse(JSON.stringify(prev));
        next.training[riderName].push(session);
        return next;
      });
    },
    [riderName]
  );

  const removeSession = useCallback(
    (idx) => {
      setState((prev) => {
        const next = JSON.parse(JSON.stringify(prev));
        const sorted = [...next.training[riderName]].sort((a, b) =>
          b.date.localeCompare(a.date)
        );
        sorted.splice(idx, 1);
        next.training[riderName] = sorted;
        return next;
      });
    },
    [riderName]
  );

  const renameRider = useCallback(
    (index, newName) => {
      setState((prev) => {
        const next = JSON.parse(JSON.stringify(prev));
        const oldName = next.riderNames[index];
        if (oldName === newName || !newName.trim()) return prev;
        next.riderNames[index] = newName.trim();
        next.checklist[newName.trim()] = next.checklist[oldName];
        delete next.checklist[oldName];
        next.training[newName.trim()] = next.training[oldName];
        delete next.training[oldName];
        return next;
      });
      setEditingName(null);
    },
    []
  );

  if (loading || !state) {
    return (
      <div style={styles.loadingScreen}>
        <div style={styles.spinner} />
      </div>
    );
  }

  return (
    <div style={styles.root}>
      {/* Grain overlay */}
      <div style={styles.grain} />

      {/* Header */}
      <header style={styles.header}>
        <div style={styles.headerBadge}>GRAVEL</div>
        <h1 style={styles.title}>Brisbane &rarr; Sunshine Coast</h1>
        <p style={styles.subtitle}>6 June 2026 &middot; ~100km gravel</p>
      </header>

      {/* Countdown */}
      <section style={styles.countdownSection}>
        <CountdownBlock countdown={countdown} />
      </section>

      {/* Rider tabs */}
      <nav style={styles.riderNav}>
        {state.riderNames.map((r, i) => (
          <div key={i} style={{ position: "relative" }}>
            {editingName === i ? (
              <input
                autoFocus
                defaultValue={r}
                onBlur={(e) => renameRider(i, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") renameRider(i, e.target.value);
                  if (e.key === "Escape") setEditingName(null);
                }}
                style={styles.nameInput}
              />
            ) : (
              <button
                onClick={() => setActiveRider(i)}
                onDoubleClick={() => setEditingName(i)}
                style={{
                  ...styles.riderTab,
                  ...(activeRider === i ? styles.riderTabActive : {}),
                }}
              >
                {r}
              </button>
            )}
          </div>
        ))}
      </nav>

      {/* Section tabs */}
      <div style={styles.sectionTabs}>
        {["checklist", "training"].map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              ...styles.sectionTab,
              ...(tab === t ? styles.sectionTabActive : {}),
            }}
          >
            {t === "checklist" ? "Kit Checklist" : "Training Log"}
          </button>
        ))}
      </div>

      {/* Content */}
      <main style={styles.main}>
        {tab === "checklist" ? (
          <ChecklistPanel
            rider={riderName}
            state={state.checklist[riderName] || {}}
            onChange={updateChecklist}
          />
        ) : (
          <TrainingPanel
            rider={riderName}
            sessions={state.training[riderName] || []}
            onAdd={addSession}
            onRemove={removeSession}
          />
        )}
      </main>
      <footer style={styles.footer}>
        double-tap rider name to rename &middot; data persists across sessions
      </footer>
    </div>
  );
}

// --- Styles ---

const FONT_DISPLAY = "'Oswald', sans-serif";
const FONT_BODY = "'IBM Plex Mono', monospace";
const BG = "#0f0f0f";
const CARD_BG = "rgba(255,255,255,0.03)";
const BORDER = "rgba(255,255,255,0.08)";
const ACCENT = "#f97316";
const TEXT = "#e5e5e5";
const TEXT_DIM = "#777";

const styles = {
  root: {
    fontFamily: FONT_BODY,
    background: BG,
    color: TEXT,
    minHeight: "100vh",
    position: "relative",
    overflow: "hidden",
    maxWidth: 640,
    margin: "0 auto",
    padding: "0 16px 40px",
  },
  grain: {
    position: "fixed",
    inset: 0,
    opacity: 0.04,
    backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
    backgroundSize: "128px",
    pointerEvents: "none",
    zIndex: 0,
  },
  loadingScreen: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    height: "100vh",
    background: BG,
  },
  spinner: {
    width: 32,
    height: 32,
    border: `3px solid ${BORDER}`,
    borderTopColor: ACCENT,
    borderRadius: "50%",
    animation: "spin 0.8s linear infinite",
  },

  // Header
  header: {
    textAlign: "center",
    paddingTop: 40,
    position: "relative",
    zIndex: 1,
  },
  headerBadge: {
    display: "inline-block",
    fontFamily: FONT_DISPLAY,
    fontSize: 11,
    letterSpacing: 6,
    color: ACCENT,
    border: `1px solid ${ACCENT}`,
    padding: "4px 16px",
    marginBottom: 12,
  },
  title: {
    fontFamily: FONT_DISPLAY,
    fontSize: "clamp(22px, 6vw, 32px)",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: 2,
    margin: "8px 0 4px",
    lineHeight: 1.1,
  },
  subtitle: {
    fontSize: 12,
    color: TEXT_DIM,
    letterSpacing: 2,
    textTransform: "uppercase",
    margin: 0,
  },

  // Countdown
  countdownSection: {
    margin: "32px 0 24px",
    position: "relative",
    zIndex: 1,
  },
  countdownRow: {
    display: "flex",
    justifyContent: "center",
    gap: 4,
  },
  countdownUnit: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    minWidth: 56,
  },
  countdownNumber: {
    fontFamily: FONT_DISPLAY,
    fontSize: "clamp(36px, 10vw, 56px)",
    fontWeight: 700,
    lineHeight: 1,
    color: "#fff",
  },
  countdownLabel: {
    fontSize: 9,
    letterSpacing: 3,
    color: TEXT_DIM,
    marginTop: 4,
  },
  countdownSep: {
    fontFamily: FONT_DISPLAY,
    fontSize: "clamp(28px, 8vw, 44px)",
    color: ACCENT,
    marginTop: 2,
    opacity: 0.6,
  },

  // Rider nav
  riderNav: {
    display: "flex",
    gap: 8,
    justifyContent: "center",
    marginBottom: 8,
    position: "relative",
    zIndex: 1,
  },
  riderTab: {
    fontFamily: FONT_BODY,
    fontSize: 12,
    padding: "8px 20px",
    background: "transparent",
    border: `1px solid ${BORDER}`,
    color: TEXT_DIM,
    cursor: "pointer",
    letterSpacing: 1,
    transition: "all 0.2s",
  },
  riderTabActive: {
    color: "#fff",
    borderColor: ACCENT,
    background: "rgba(249,115,22,0.08)",
  },
  nameInput: {
    fontFamily: FONT_BODY,
    fontSize: 12,
    padding: "8px 12px",
    background: "rgba(249,115,22,0.1)",
    border: `1px solid ${ACCENT}`,
    color: "#fff",
    outline: "none",
    width: 100,
    letterSpacing: 1,
  },

  // Section tabs
  sectionTabs: {
    display: "flex",
    gap: 0,
    margin: "8px 0 16px",
    borderBottom: `1px solid ${BORDER}`,
    position: "relative",
    zIndex: 1,
  },
  sectionTab: {
    fontFamily: FONT_BODY,
    fontSize: 11,
    letterSpacing: 2,
    textTransform: "uppercase",
    padding: "12px 20px",
    background: "transparent",
    border: "none",
    borderBottom: "2px solid transparent",
    color: TEXT_DIM,
    cursor: "pointer",
    transition: "all 0.2s",
    flex: 1,
  },
  sectionTabActive: {
    color: ACCENT,
    borderBottomColor: ACCENT,
  },

  main: {
    position: "relative",
    zIndex: 1,
  },

  // Checklist
  checklistCard: {},
  progressBarOuter: {
    position: "relative",
    height: 28,
    background: "rgba(255,255,255,0.04)",
    borderRadius: 2,
    overflow: "hidden",
    marginBottom: 16,
    border: `1px solid ${BORDER}`,
  },
  progressBarInner: {
    height: "100%",
    transition: "width 0.4s ease, background 0.4s ease",
    borderRadius: 2,
  },
  progressText: {
    position: "absolute",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    fontSize: 10,
    letterSpacing: 2,
    fontWeight: 600,
    color: "#fff",
    textShadow: "0 1px 4px rgba(0,0,0,0.8)",
  },
  checklistGrid: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
  },
  checklistItem: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "8px 12px",
    background: CARD_BG,
    borderRadius: 2,
    border: `1px solid ${BORDER}`,
    transition: "background 0.15s",
  },
  tickBtn: {
    width: 28,
    height: 28,
    minWidth: 28,
    border: "1px solid",
    borderRadius: 2,
    cursor: "pointer",
    fontSize: 16,
    fontWeight: 700,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "all 0.2s",
    fontFamily: "system-ui",
  },
  counterGroup: {
    display: "flex",
    alignItems: "center",
    gap: 2,
  },
  counterBtn: {
    width: 26,
    height: 26,
    background: "rgba(255,255,255,0.06)",
    border: `1px solid ${BORDER}`,
    color: TEXT,
    borderRadius: 2,
    cursor: "pointer",
    fontSize: 16,
    fontFamily: "system-ui",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  counterVal: {
    fontFamily: FONT_DISPLAY,
    fontSize: 16,
    minWidth: 20,
    textAlign: "center",
    color: "#fff",
  },
  checklistLabel: {
    fontSize: 13,
    letterSpacing: 0.3,
    transition: "all 0.2s",
  },
  maxLabel: {
    color: TEXT_DIM,
    fontSize: 11,
  },

  // Training
  trainingCard: {},
  trainingHeader: {
    textAlign: "center",
    marginBottom: 16,
    padding: "20px 0",
    background: CARD_BG,
    border: `1px solid ${BORDER}`,
    borderRadius: 2,
  },
  trainingTotal: {
    fontFamily: FONT_DISPLAY,
    fontSize: 52,
    fontWeight: 700,
    color: "#fff",
    lineHeight: 1,
  },
  trainingTotalLabel: {
    display: "block",
    fontSize: 10,
    letterSpacing: 3,
    textTransform: "uppercase",
    color: TEXT_DIM,
    marginTop: 6,
  },
  trainingInputRow: {
    display: "flex",
    gap: 6,
    marginBottom: 12,
    flexWrap: "wrap",
  },
  input: {
    fontFamily: FONT_BODY,
    fontSize: 12,
    padding: "8px 10px",
    background: "rgba(255,255,255,0.04)",
    border: `1px solid ${BORDER}`,
    color: TEXT,
    borderRadius: 2,
    outline: "none",
    minWidth: 0,
  },
  addBtn: {
    fontFamily: FONT_DISPLAY,
    fontSize: 20,
    width: 38,
    height: 38,
    background: ACCENT,
    color: "#000",
    border: "none",
    borderRadius: 2,
    cursor: "pointer",
    fontWeight: 700,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  sessionList: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
  },
  sessionRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "8px 12px",
    background: CARD_BG,
    border: `1px solid ${BORDER}`,
    borderRadius: 2,
    fontSize: 12,
  },
  sessionDate: {
    color: TEXT_DIM,
    minWidth: 90,
  },
  sessionHrs: {
    fontFamily: FONT_DISPLAY,
    color: ACCENT,
    minWidth: 36,
    fontWeight: 600,
  },
  sessionNote: {
    color: TEXT,
    flex: 1,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  removeBtn: {
    background: "transparent",
    border: "none",
    color: "#555",
    fontSize: 18,
    cursor: "pointer",
    padding: "0 4px",
  },

  footer: {
    textAlign: "center",
    fontSize: 10,
    color: "#444",
    letterSpacing: 1,
    marginTop: 32,
    position: "relative",
    zIndex: 1,
  },
};
