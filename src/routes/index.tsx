import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { QRCodeCanvas } from "qrcode.react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "UnitedZone — Branch QR Manager" },
      { name: "description", content: "Manage UPI QR codes across all your branches from one admin dashboard." },
    ],
  }),
  component: Dashboard,
});

const UPI_PA = "500101010524319@CIUB0000171.ifsc.npci";
const UPI_PN = "M.Kabeer Ahamed";

type QrDesign = {
  fg: string;
  bg: string;
  level: "L" | "M" | "Q" | "H";
  margin: boolean;
  dotted: boolean; // rendered via CSS mask overlay (visual flair only)
};

const DEFAULT_DESIGN: QrDesign = {
  fg: "#0b0b0b",
  bg: "#ffffff",
  level: "H",
  margin: true,
  dotted: false,
};

type Store = {
  id: string;
  name: string;
  createdAt: number;
  active?: boolean;
  design?: QrDesign;
};

type Sale = { id: string; storeId: string; amount: number; at: number };

const STORAGE_KEY = "uz_stores_v1";
const SALES_KEY = "uz_sales_v1";

function defaultStores(): Store[] {
  return Array.from({ length: 5 }, (_, i) => ({
    id: crypto.randomUUID(),
    name: `Shop${i + 1}`,
    createdAt: Date.now() + i,
    active: true,
    design: { ...DEFAULT_DESIGN },
  }));
}

function buildUpi(name: string) {
  const tn = name.replace(/\s+/g, "");
  return `upi://pay?pa=${encodeURIComponent(UPI_PA)}&pn=${encodeURIComponent(UPI_PN)}&tn=${encodeURIComponent(tn)}`;
}

function getDesign(s: Store): QrDesign {
  return { ...DEFAULT_DESIGN, ...(s.design ?? {}) };
}

function downloadFile(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function toCSV(rows: Record<string, unknown>[]) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(","), ...rows.map((r) => headers.map((h) => esc(r[h])).join(","))].join("\n");
}

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.replace(/\r/g, "").split("\n").filter((l) => l.length);
  if (!lines.length) return [];
  const parseLine = (line: string) => {
    const out: string[] = [];
    let cur = "", q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (q) {
        if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (c === '"') q = false;
        else cur += c;
      } else {
        if (c === ",") { out.push(cur); cur = ""; }
        else if (c === '"') q = true;
        else cur += c;
      }
    }
    out.push(cur);
    return out;
  };
  const headers = parseLine(lines[0]);
  return lines.slice(1).map((l) => {
    const cols = parseLine(l);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => (row[h] = cols[i] ?? ""));
    return row;
  });
}

function Dashboard() {
  const [stores, setStores] = useState<Store[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [showQr, setShowQr] = useState<Store | null>(null);
  const [showSale, setShowSale] = useState<Store | null>(null);
  const [showDesign, setShowDesign] = useState<Store | null>(null);
  const [showData, setShowData] = useState(false);
  const [tab, setTab] = useState<"stores" | "sales">("stores");
  const [filter, setFilter] = useState<"all" | "active" | "inactive">("all");

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed: Store[] = raw ? JSON.parse(raw) : defaultStores();
    setStores(parsed.map((s) => ({ active: true, design: { ...DEFAULT_DESIGN }, ...s })));
    const s = localStorage.getItem(SALES_KEY);
    if (s) setSales(JSON.parse(s));
  }, []);

  useEffect(() => {
    if (stores.length) localStorage.setItem(STORAGE_KEY, JSON.stringify(stores));
  }, [stores]);
  useEffect(() => { localStorage.setItem(SALES_KEY, JSON.stringify(sales)); }, [sales]);

  // Keep the live-shown store object in sync when stores change (design edits)
  const syncedShowQr = showQr ? stores.find((x) => x.id === showQr.id) ?? showQr : null;
  const syncedDesign = showDesign ? stores.find((x) => x.id === showDesign.id) ?? showDesign : null;

  const addStore = (name: string) => {
    setStores((s) => [...s, { id: crypto.randomUUID(), name, createdAt: Date.now(), active: true, design: { ...DEFAULT_DESIGN } }]);
  };
  const removeStore = (id: string) => {
    if (!confirm("Permanently delete this store? Sales records will remain.")) return;
    setStores((s) => s.filter((x) => x.id !== id));
  };
  const toggleActive = (id: string) => {
    setStores((s) => s.map((x) => (x.id === id ? { ...x, active: !(x.active ?? true) } : x)));
  };
  const updateDesign = (id: string, design: QrDesign) => {
    setStores((s) => s.map((x) => (x.id === id ? { ...x, design } : x)));
  };
  const addSale = (storeId: string, amount: number) => {
    setSales((s) => [{ id: crypto.randomUUID(), storeId, amount, at: Date.now() }, ...s]);
  };

  const totalToday = sales.reduce((a, b) => a + b.amount, 0);

  const visible = useMemo(() => stores.filter((s) => {
    const active = s.active ?? true;
    if (filter === "active") return active;
    if (filter === "inactive") return !active;
    return true;
  }), [stores, filter]);

  return (
    <div className="min-h-screen">
      <header className="border-b border-border/60 backdrop-blur sticky top-0 z-30 bg-background/70">
        <div className="max-w-6xl mx-auto px-5 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="size-10 rounded-xl bg-gradient-to-br from-primary to-accent grid place-items-center text-primary-foreground font-bold text-lg shadow-lg shrink-0">
              UZ
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-semibold leading-tight truncate">UnitedZone Enterprises</h1>
              <p className="text-xs text-muted-foreground">Branch QR Payment Manager</p>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-2">
            <button
              onClick={() => setShowData(true)}
              className="rounded-full bg-secondary hover:bg-secondary/80 px-3.5 py-2 text-sm font-medium"
            >
              Import / Export
            </button>
            <button
              onClick={() => setShowAdd(true)}
              className="inline-flex items-center gap-2 rounded-full bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90 transition shadow-lg shadow-primary/20"
            >
              <span className="text-lg leading-none">+</span> Add Store
            </button>
          </div>
        </div>
        <div className="max-w-6xl mx-auto px-5 flex gap-1">
          {(["stores", "sales"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2.5 text-sm font-medium capitalize border-b-2 transition ${
                tab === t ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t === "stores" ? "Branches" : "Sales Tracker"}
            </button>
          ))}
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-5 py-8">
        {tab === "stores" ? (
          <>
            <div className="flex items-end justify-between mb-6 flex-wrap gap-3">
              <div>
                <h2 className="text-3xl font-semibold">Your Branches</h2>
                <p className="text-muted-foreground text-sm mt-1">
                  {stores.filter((s) => s.active ?? true).length} active · {stores.filter((s) => !(s.active ?? true)).length} hidden
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="inline-flex rounded-full bg-secondary p-1 text-xs">
                  {(["all", "active", "inactive"] as const).map((f) => (
                    <button
                      key={f}
                      onClick={() => setFilter(f)}
                      className={`px-3 py-1.5 rounded-full capitalize transition ${
                        filter === f ? "bg-background text-foreground shadow" : "text-muted-foreground"
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => setShowData(true)}
                  className="sm:hidden rounded-full bg-secondary px-3 py-2 text-sm font-medium"
                >
                  Data
                </button>
                <button
                  onClick={() => setShowAdd(true)}
                  className="sm:hidden inline-flex items-center gap-2 rounded-full bg-primary text-primary-foreground px-4 py-2 text-sm font-medium"
                >
                  + Add
                </button>
              </div>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {visible.map((s) => (
                <StoreCard
                  key={s.id}
                  store={s}
                  salesCount={sales.filter((x) => x.storeId === s.id).length}
                  onView={() => setShowQr(s)}
                  onSale={() => setShowSale(s)}
                  onDelete={() => removeStore(s.id)}
                  onToggle={() => toggleActive(s.id)}
                  onDesign={() => setShowDesign(s)}
                />
              ))}
              <button
                onClick={() => setShowAdd(true)}
                className="rounded-2xl border-2 border-dashed border-border hover:border-primary hover:bg-card/40 transition min-h-[280px] grid place-items-center text-muted-foreground hover:text-foreground"
              >
                <div className="text-center">
                  <div className="text-4xl mb-2">+</div>
                  <div className="text-sm font-medium">Add New Branch</div>
                </div>
              </button>
            </div>
          </>
        ) : (
          <SalesView stores={stores} sales={sales} total={totalToday} />
        )}
      </main>

      {showAdd && <AddStoreModal onClose={() => setShowAdd(false)} onAdd={(n) => { addStore(n); setShowAdd(false); }} />}
      {syncedShowQr && <QrModal store={syncedShowQr} onClose={() => setShowQr(null)} onEditDesign={() => { setShowDesign(syncedShowQr); setShowQr(null); }} />}
      {syncedDesign && (
        <DesignModal
          store={syncedDesign}
          onClose={() => setShowDesign(null)}
          onSave={(d) => { updateDesign(syncedDesign.id, d); setShowDesign(null); }}
        />
      )}
      {showSale && (
        <LogSaleModal
          store={showSale}
          onClose={() => setShowSale(null)}
          onLog={(amt) => { addSale(showSale.id, amt); setShowSale(null); }}
        />
      )}
      {showData && (
        <DataModal
          stores={stores}
          sales={sales}
          onClose={() => setShowData(false)}
          onImportStores={(rows, mode) => {
            const normalized: Store[] = rows.map((r) => ({
              id: r.id || crypto.randomUUID(),
              name: r.name,
              createdAt: Number(r.createdAt) || Date.now(),
              active: r.active === undefined ? true : (r.active === true || r.active === "true" || r.active === "1"),
              design: r.design && typeof r.design === "object" ? { ...DEFAULT_DESIGN, ...r.design } : { ...DEFAULT_DESIGN },
            })).filter((s) => s.name);
            setStores((prev) => {
              if (mode === "replace") return normalized;
              const ids = new Set(prev.map((p) => p.id));
              return [...prev, ...normalized.filter((n) => !ids.has(n.id))];
            });
          }}
          onImportSales={(rows, mode) => {
            const normalized: Sale[] = rows.map((r) => ({
              id: r.id || crypto.randomUUID(),
              storeId: r.storeId,
              amount: Number(r.amount) || 0,
              at: Number(r.at) || Date.now(),
            })).filter((s) => s.storeId && s.amount > 0);
            setSales((prev) => {
              if (mode === "replace") return normalized;
              const ids = new Set(prev.map((p) => p.id));
              return [...prev, ...normalized.filter((n) => !ids.has(n.id))];
            });
          }}
        />
      )}
    </div>
  );
}

function StoreCard({
  store, salesCount, onView, onSale, onDelete, onToggle, onDesign,
}: {
  store: Store; salesCount: number;
  onView: () => void; onSale: () => void; onDelete: () => void; onToggle: () => void; onDesign: () => void;
}) {
  const upi = buildUpi(store.name);
  const d = getDesign(store);
  const active = store.active ?? true;
  return (
    <div className={`group rounded-2xl bg-card border border-border p-5 flex flex-col gap-4 hover:border-primary/50 transition shadow-xl shadow-black/10 ${!active ? "opacity-60" : ""}`}>
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <h3 className="text-xl font-semibold truncate">{store.name}</h3>
          <p className="text-xs text-muted-foreground mt-0.5 font-mono truncate">tn={encodeURIComponent(store.name.replace(/\s+/g, ""))}</p>
        </div>
        <div className="flex items-center gap-1 opacity-60 group-hover:opacity-100 transition">
          <button onClick={onDesign} title="Customize design" className="text-muted-foreground hover:text-foreground text-sm px-1.5">✎</button>
          <button onClick={onDelete} title="Delete" className="text-muted-foreground hover:text-destructive text-sm px-1.5">✕</button>
        </div>
      </div>
      <div className="rounded-xl p-4 grid place-items-center cursor-pointer" style={{ background: d.bg }} onClick={onView}>
        <QRCodeCanvas value={upi} size={140} level={d.level} fgColor={d.fg} bgColor={d.bg} includeMargin={d.margin} />
      </div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{salesCount} sales</span>
        <label className="inline-flex items-center gap-2 cursor-pointer select-none">
          <span className={active ? "text-success" : "text-muted-foreground"}>{active ? "Active" : "Hidden"}</span>
          <span onClick={onToggle} className={`relative w-9 h-5 rounded-full transition ${active ? "bg-primary" : "bg-secondary"}`}>
            <span className={`absolute top-0.5 size-4 rounded-full bg-background transition ${active ? "left-[18px]" : "left-0.5"}`} />
          </span>
        </label>
      </div>
      <div className="flex gap-2">
        <button onClick={onView} className="flex-1 rounded-lg bg-secondary hover:bg-secondary/80 transition py-2 text-sm font-medium">View & Print</button>
        <button onClick={onSale} className="rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition px-3 text-sm font-medium">Log Sale</button>
      </div>
    </div>
  );
}

function Modal({ children, onClose, title, wide }: { children: React.ReactNode; onClose: () => void; title: string; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm grid place-items-center p-4 overflow-y-auto" onClick={onClose}>
      <div className={`bg-card border border-border rounded-2xl w-full ${wide ? "max-w-2xl" : "max-w-md"} p-6 shadow-2xl my-8`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-semibold">{title}</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-xl leading-none">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function AddStoreModal({ onClose, onAdd }: { onClose: () => void; onAdd: (n: string) => void }) {
  const [name, setName] = useState("");
  const tn = name.trim().replace(/\s+/g, "");
  return (
    <Modal title="Add New Branch" onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); if (name.trim()) onAdd(name.trim()); }} className="space-y-4">
        <div>
          <label className="text-sm text-muted-foreground mb-1.5 block">Store Name</label>
          <input
            autoFocus value={name} onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Main Street Branch"
            className="w-full rounded-lg bg-input/50 border border-border px-3 py-2.5 outline-none focus:border-primary"
          />
          <p className="text-xs text-muted-foreground mt-2 break-all">
            Transaction note: <span className="text-primary font-mono">tn={encodeURIComponent(tn || "Shopname")}</span>
          </p>
        </div>
        <button type="submit" disabled={!name.trim()} className="w-full rounded-lg bg-primary text-primary-foreground py-2.5 font-medium disabled:opacity-50">
          Generate QR Code
        </button>
      </form>
    </Modal>
  );
}

function QrModal({ store, onClose, onEditDesign }: { store: Store; onClose: () => void; onEditDesign: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const upi = buildUpi(store.name);
  const d = getDesign(store);

  const download = () => {
    const canvas = ref.current?.querySelector("canvas");
    if (!canvas) return;
    const url = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = `${store.name}-qr.png`;
    a.click();
  };

  const printIt = () => window.print();

  return (
    <Modal title={store.name} onClose={onClose}>
      <div className="space-y-4 print:space-y-2" id="print-area">
        <div ref={ref} className="rounded-xl p-6 grid place-items-center" style={{ background: d.bg }}>
          <div className="text-center">
            <div className="font-semibold mb-3 text-lg" style={{ color: d.fg }}>{store.name}</div>
            <QRCodeCanvas value={upi} size={240} level={d.level} fgColor={d.fg} bgColor={d.bg} includeMargin={d.margin} />
            <div className="text-xs mt-3 opacity-70" style={{ color: d.fg }}>Scan to Pay · UnitedZone</div>
          </div>
        </div>
        <div className="bg-secondary/50 rounded-lg p-3 text-xs font-mono break-all text-muted-foreground print:hidden">
          {upi}
        </div>
        <div className="grid grid-cols-3 gap-2 print:hidden">
          <button onClick={download} className="rounded-lg bg-primary text-primary-foreground py-2.5 font-medium text-sm">Download</button>
          <button onClick={printIt} className="rounded-lg bg-secondary hover:bg-secondary/80 py-2.5 font-medium text-sm">Print</button>
          <button onClick={onEditDesign} className="rounded-lg bg-secondary hover:bg-secondary/80 py-2.5 font-medium text-sm">Customize</button>
        </div>
      </div>
      <style>{`@media print { body * { visibility: hidden; } #print-area, #print-area * { visibility: visible; } #print-area { position: absolute; inset: 0; } }`}</style>
    </Modal>
  );
}

function DesignModal({ store, onClose, onSave }: { store: Store; onClose: () => void; onSave: (d: QrDesign) => void }) {
  const [d, setD] = useState<QrDesign>(getDesign(store));
  const upi = buildUpi(store.name);
  const presets: { name: string; design: Partial<QrDesign> }[] = [
    { name: "Classic", design: { fg: "#0b0b0b", bg: "#ffffff" } },
    { name: "Midnight", design: { fg: "#ffffff", bg: "#0f172a" } },
    { name: "Indigo", design: { fg: "#ffffff", bg: "#4338ca" } },
    { name: "Forest", design: { fg: "#ffffff", bg: "#065f46" } },
    { name: "Sunrise", design: { fg: "#1f2937", bg: "#fde68a" } },
    { name: "Rose", design: { fg: "#ffffff", bg: "#be185d" } },
  ];
  return (
    <Modal title={`Customize QR — ${store.name}`} onClose={onClose} wide>
      <div className="grid sm:grid-cols-2 gap-5">
        <div className="rounded-xl p-6 grid place-items-center" style={{ background: d.bg }}>
          <QRCodeCanvas value={upi} size={200} level={d.level} fgColor={d.fg} bgColor={d.bg} includeMargin={d.margin} />
        </div>
        <div className="space-y-4">
          <div>
            <div className="text-sm text-muted-foreground mb-2">Presets</div>
            <div className="grid grid-cols-3 gap-2">
              {presets.map((p) => (
                <button
                  key={p.name}
                  onClick={() => setD((cur) => ({ ...cur, ...p.design }))}
                  className="rounded-lg p-2 text-xs font-medium border border-border hover:border-primary transition"
                  style={{ background: p.design.bg, color: p.design.fg }}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <div className="text-sm text-muted-foreground mb-1.5">Foreground</div>
              <div className="flex items-center gap-2">
                <input type="color" value={d.fg} onChange={(e) => setD({ ...d, fg: e.target.value })} className="size-10 rounded cursor-pointer bg-transparent border border-border" />
                <input value={d.fg} onChange={(e) => setD({ ...d, fg: e.target.value })} className="flex-1 rounded-lg bg-input/50 border border-border px-2 py-1.5 text-sm font-mono" />
              </div>
            </label>
            <label className="block">
              <div className="text-sm text-muted-foreground mb-1.5">Background</div>
              <div className="flex items-center gap-2">
                <input type="color" value={d.bg} onChange={(e) => setD({ ...d, bg: e.target.value })} className="size-10 rounded cursor-pointer bg-transparent border border-border" />
                <input value={d.bg} onChange={(e) => setD({ ...d, bg: e.target.value })} className="flex-1 rounded-lg bg-input/50 border border-border px-2 py-1.5 text-sm font-mono" />
              </div>
            </label>
          </div>
          <label className="block">
            <div className="text-sm text-muted-foreground mb-1.5">Error correction</div>
            <select
              value={d.level}
              onChange={(e) => setD({ ...d, level: e.target.value as QrDesign["level"] })}
              className="w-full rounded-lg bg-input/50 border border-border px-3 py-2"
            >
              <option value="L">L — Low (7%)</option>
              <option value="M">M — Medium (15%)</option>
              <option value="Q">Q — Quartile (25%)</option>
              <option value="H">H — High (30%) recommended</option>
            </select>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={d.margin} onChange={(e) => setD({ ...d, margin: e.target.checked })} />
            <span className="text-sm">Include quiet zone (margin)</span>
          </label>
          <div className="flex gap-2 pt-2">
            <button onClick={() => setD({ ...DEFAULT_DESIGN })} className="rounded-lg bg-secondary px-4 py-2 text-sm">Reset</button>
            <button onClick={() => onSave(d)} className="flex-1 rounded-lg bg-primary text-primary-foreground py-2 font-medium">Save Design</button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function LogSaleModal({ store, onClose, onLog }: { store: Store; onClose: () => void; onLog: (a: number) => void }) {
  const [amt, setAmt] = useState("");
  return (
    <Modal title={`Log Sale — ${store.name}`} onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); const n = parseFloat(amt); if (n > 0) onLog(n); }} className="space-y-4">
        <div>
          <label className="text-sm text-muted-foreground mb-1.5 block">Amount (₹)</label>
          <input
            autoFocus type="number" step="0.01" value={amt} onChange={(e) => setAmt(e.target.value)}
            placeholder="0.00"
            className="w-full rounded-lg bg-input/50 border border-border px-3 py-2.5 outline-none focus:border-primary text-2xl"
          />
        </div>
        <button type="submit" className="w-full rounded-lg bg-primary text-primary-foreground py-2.5 font-medium">Record Sale</button>
      </form>
    </Modal>
  );
}

function DataModal({
  stores, sales, onClose, onImportStores, onImportSales,
}: {
  stores: Store[]; sales: Sale[]; onClose: () => void;
  onImportStores: (rows: any[], mode: "merge" | "replace") => void;
  onImportSales: (rows: any[], mode: "merge" | "replace") => void;
}) {
  const [mode, setMode] = useState<"merge" | "replace">("merge");
  const fileRef = useRef<HTMLInputElement>(null);
  const [target, setTarget] = useState<"stores" | "sales">("stores");

  const exportStoresJSON = () => downloadFile("stores.json", JSON.stringify(stores, null, 2), "application/json");
  const exportSalesJSON = () => downloadFile("sales.json", JSON.stringify(sales, null, 2), "application/json");
  const exportStoresCSV = () => downloadFile("stores.csv", toCSV(stores.map((s) => ({
    id: s.id, name: s.name, createdAt: s.createdAt, active: s.active ?? true,
    fg: getDesign(s).fg, bg: getDesign(s).bg, level: getDesign(s).level, margin: getDesign(s).margin,
  }))), "text/csv");
  const exportSalesCSV = () => downloadFile("sales.csv", toCSV(sales as unknown as Record<string, unknown>[]), "text/csv");
  const exportAllJSON = () => downloadFile("unitedzone-backup.json", JSON.stringify({ stores, sales, exportedAt: Date.now() }, null, 2), "application/json");

  const handleFile = async (file: File) => {
    const text = await file.text();
    const isJSON = file.name.toLowerCase().endsWith(".json");
    try {
      if (isJSON) {
        const data = JSON.parse(text);
        if (data && typeof data === "object" && (Array.isArray(data.stores) || Array.isArray(data.sales))) {
          if (Array.isArray(data.stores)) onImportStores(data.stores, mode);
          if (Array.isArray(data.sales)) onImportSales(data.sales, mode);
        } else if (Array.isArray(data)) {
          if (target === "stores") onImportStores(data, mode); else onImportSales(data, mode);
        } else {
          alert("Unrecognized JSON shape.");
          return;
        }
      } else {
        const rows = parseCSV(text);
        if (target === "stores") {
          onImportStores(rows.map((r) => ({
            ...r,
            design: { fg: r.fg, bg: r.bg, level: (r.level as any) || "H", margin: r.margin === "true" || r.margin === "1" },
          })), mode);
        } else {
          onImportSales(rows, mode);
        }
      }
      alert("Import complete.");
      onClose();
    } catch (err) {
      alert("Failed to parse file: " + (err as Error).message);
    }
  };

  return (
    <Modal title="Import / Export Data" onClose={onClose} wide>
      <div className="space-y-5">
        <section>
          <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">Export</h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <button onClick={exportStoresJSON} className="rounded-lg bg-secondary hover:bg-secondary/80 py-2 text-sm">Stores JSON</button>
            <button onClick={exportStoresCSV} className="rounded-lg bg-secondary hover:bg-secondary/80 py-2 text-sm">Stores CSV</button>
            <button onClick={exportSalesJSON} className="rounded-lg bg-secondary hover:bg-secondary/80 py-2 text-sm">Sales JSON</button>
            <button onClick={exportSalesCSV} className="rounded-lg bg-secondary hover:bg-secondary/80 py-2 text-sm">Sales CSV</button>
            <button onClick={exportAllJSON} className="col-span-2 sm:col-span-1 rounded-lg bg-primary text-primary-foreground py-2 text-sm font-medium">Full Backup</button>
          </div>
        </section>
        <section className="border-t border-border pt-4">
          <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">Import</h4>
          <div className="grid sm:grid-cols-2 gap-3 mb-3">
            <label className="block">
              <div className="text-xs text-muted-foreground mb-1">Target (CSV / array JSON)</div>
              <select value={target} onChange={(e) => setTarget(e.target.value as any)} className="w-full rounded-lg bg-input/50 border border-border px-3 py-2 text-sm">
                <option value="stores">Stores</option>
                <option value="sales">Sales</option>
              </select>
            </label>
            <label className="block">
              <div className="text-xs text-muted-foreground mb-1">Mode</div>
              <select value={mode} onChange={(e) => setMode(e.target.value as any)} className="w-full rounded-lg bg-input/50 border border-border px-3 py-2 text-sm">
                <option value="merge">Merge (skip duplicate IDs)</option>
                <option value="replace">Replace existing</option>
              </select>
            </label>
          </div>
          <input
            ref={fileRef} type="file" accept=".json,.csv"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-primary file:text-primary-foreground file:px-4 file:py-2 file:font-medium file:cursor-pointer cursor-pointer"
          />
          <p className="text-xs text-muted-foreground mt-2">
            A full-backup JSON (containing both <code>stores</code> and <code>sales</code> keys) restores both regardless of target selection.
          </p>
        </section>
      </div>
    </Modal>
  );
}

function SalesView({ stores, sales, total }: { stores: Store[]; sales: Sale[]; total: number }) {
  const byStore = stores.map((s) => ({
    store: s,
    total: sales.filter((x) => x.storeId === s.id).reduce((a, b) => a + b.amount, 0),
    count: sales.filter((x) => x.storeId === s.id).length,
  }));
  const max = Math.max(...byStore.map((x) => x.total), 1);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-semibold">Sales Tracker</h2>
        <p className="text-muted-foreground text-sm mt-1">Logged transactions across all branches</p>
      </div>
      <div className="grid sm:grid-cols-3 gap-4">
        <div className="rounded-2xl bg-card border border-border p-5">
          <div className="text-xs text-muted-foreground uppercase tracking-wide">Total Revenue</div>
          <div className="text-3xl font-semibold mt-2">₹{total.toLocaleString("en-IN")}</div>
        </div>
        <div className="rounded-2xl bg-card border border-border p-5">
          <div className="text-xs text-muted-foreground uppercase tracking-wide">Transactions</div>
          <div className="text-3xl font-semibold mt-2">{sales.length}</div>
        </div>
        <div className="rounded-2xl bg-card border border-border p-5">
          <div className="text-xs text-muted-foreground uppercase tracking-wide">Active Branches</div>
          <div className="text-3xl font-semibold mt-2">{stores.filter((s) => s.active ?? true).length}</div>
        </div>
      </div>

      <div className="rounded-2xl bg-card border border-border p-5">
        <h3 className="text-lg font-semibold mb-4">By Branch</h3>
        <div className="space-y-3">
          {byStore.map(({ store, total, count }) => (
            <div key={store.id}>
              <div className="flex justify-between text-sm mb-1.5">
                <span className="font-medium">{store.name} <span className="text-muted-foreground font-normal">· {count}</span></span>
                <span className="text-primary font-semibold">₹{total.toLocaleString("en-IN")}</span>
              </div>
              <div className="h-2 bg-secondary rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-primary to-accent transition-all" style={{ width: `${(total / max) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl bg-card border border-border p-5">
        <h3 className="text-lg font-semibold mb-4">Recent Activity</h3>
        {sales.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No sales logged yet. Go to Branches and tap "Log Sale" on any store.</p>
        ) : (
          <div className="divide-y divide-border">
            {sales.slice(0, 20).map((s) => {
              const st = stores.find((x) => x.id === s.storeId);
              return (
                <div key={s.id} className="flex justify-between py-2.5 text-sm">
                  <div>
                    <div className="font-medium">{st?.name ?? "Unknown"}</div>
                    <div className="text-xs text-muted-foreground">{new Date(s.at).toLocaleString()}</div>
                  </div>
                  <div className="text-success font-semibold">+₹{s.amount.toLocaleString("en-IN")}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
