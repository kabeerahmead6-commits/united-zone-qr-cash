import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
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

type Store = { id: string; name: string; createdAt: number; sales?: number[] };

const STORAGE_KEY = "uz_stores_v1";
const SALES_KEY = "uz_sales_v1";

function defaultStores(): Store[] {
  return Array.from({ length: 5 }, (_, i) => ({
    id: crypto.randomUUID(),
    name: `Shop${i + 1}`,
    createdAt: Date.now() + i,
  }));
}

function buildUpi(name: string) {
  const tn = name.replace(/\s+/g, "");
  return `upi://pay?pa=${UPI_PA}&pn=${encodeURIComponent(UPI_PN)}&tn=${encodeURIComponent(tn)}`;
}

type Sale = { id: string; storeId: string; amount: number; at: number };

function Dashboard() {
  const [stores, setStores] = useState<Store[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [showQr, setShowQr] = useState<Store | null>(null);
  const [showSale, setShowSale] = useState<Store | null>(null);
  const [tab, setTab] = useState<"stores" | "sales">("stores");

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    setStores(raw ? JSON.parse(raw) : defaultStores());
    const s = localStorage.getItem(SALES_KEY);
    if (s) setSales(JSON.parse(s));
  }, []);

  useEffect(() => {
    if (stores.length) localStorage.setItem(STORAGE_KEY, JSON.stringify(stores));
  }, [stores]);
  useEffect(() => { localStorage.setItem(SALES_KEY, JSON.stringify(sales)); }, [sales]);

  const addStore = (name: string) => {
    setStores((s) => [...s, { id: crypto.randomUUID(), name, createdAt: Date.now() }]);
  };
  const removeStore = (id: string) => {
    if (!confirm("Delete this store?")) return;
    setStores((s) => s.filter((x) => x.id !== id));
  };
  const addSale = (storeId: string, amount: number) => {
    setSales((s) => [{ id: crypto.randomUUID(), storeId, amount, at: Date.now() }, ...s]);
  };

  const totalToday = sales.reduce((a, b) => a + b.amount, 0);

  return (
    <div className="min-h-screen">
      <header className="border-b border-border/60 backdrop-blur sticky top-0 z-30 bg-background/70">
        <div className="max-w-6xl mx-auto px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-xl bg-gradient-to-br from-primary to-accent grid place-items-center text-primary-foreground font-bold text-lg shadow-lg">
              UZ
            </div>
            <div>
              <h1 className="text-lg font-semibold leading-tight">UnitedZone Enterprises</h1>
              <p className="text-xs text-muted-foreground">Branch QR Payment Manager</p>
            </div>
          </div>
          <button
            onClick={() => setShowAdd(true)}
            className="hidden sm:inline-flex items-center gap-2 rounded-full bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90 transition shadow-lg shadow-primary/20"
          >
            <span className="text-lg leading-none">+</span> Add Store
          </button>
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
                  {stores.length} active · All payments route to your primary GPay account
                </p>
              </div>
              <button
                onClick={() => setShowAdd(true)}
                className="sm:hidden inline-flex items-center gap-2 rounded-full bg-primary text-primary-foreground px-4 py-2 text-sm font-medium"
              >
                + Add Store
              </button>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {stores.map((s) => (
                <StoreCard
                  key={s.id}
                  store={s}
                  salesCount={sales.filter((x) => x.storeId === s.id).length}
                  onView={() => setShowQr(s)}
                  onSale={() => setShowSale(s)}
                  onDelete={() => removeStore(s.id)}
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
      {showQr && <QrModal store={showQr} onClose={() => setShowQr(null)} />}
      {showSale && (
        <LogSaleModal
          store={showSale}
          onClose={() => setShowSale(null)}
          onLog={(amt) => { addSale(showSale.id, amt); setShowSale(null); }}
        />
      )}
    </div>
  );
}

function StoreCard({
  store, salesCount, onView, onSale, onDelete,
}: { store: Store; salesCount: number; onView: () => void; onSale: () => void; onDelete: () => void }) {
  const upi = buildUpi(store.name);
  return (
    <div className="group rounded-2xl bg-card border border-border p-5 flex flex-col gap-4 hover:border-primary/50 transition shadow-xl shadow-black/10">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-xl font-semibold">{store.name}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">tn={store.name.replace(/\s+/g, "")}</p>
        </div>
        <button onClick={onDelete} className="text-muted-foreground hover:text-destructive text-sm opacity-0 group-hover:opacity-100 transition">✕</button>
      </div>
      <div className="bg-white rounded-xl p-4 grid place-items-center cursor-pointer" onClick={onView}>
        <QRCodeCanvas value={upi} size={140} level="M" />
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{salesCount} sales logged</span>
        <span className="text-success">● Active</span>
      </div>
      <div className="flex gap-2">
        <button onClick={onView} className="flex-1 rounded-lg bg-secondary hover:bg-secondary/80 transition py-2 text-sm font-medium">View & Print</button>
        <button onClick={onSale} className="rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition px-3 text-sm font-medium">Log Sale</button>
      </div>
    </div>
  );
}

function Modal({ children, onClose, title }: { children: React.ReactNode; onClose: () => void; title: string }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm grid place-items-center p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-2xl w-full max-w-md p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
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
          <p className="text-xs text-muted-foreground mt-2">
            Transaction note will be: <span className="text-primary font-mono">tn={name.trim().replace(/\s+/g, "") || "Shopname"}</span>
          </p>
        </div>
        <button type="submit" disabled={!name.trim()} className="w-full rounded-lg bg-primary text-primary-foreground py-2.5 font-medium disabled:opacity-50">
          Generate QR Code
        </button>
      </form>
    </Modal>
  );
}

function QrModal({ store, onClose }: { store: Store; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const upi = buildUpi(store.name);

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
        <div ref={ref} className="bg-white rounded-xl p-6 grid place-items-center">
          <div className="text-center">
            <div className="text-black font-semibold mb-3 text-lg">{store.name}</div>
            <QRCodeCanvas value={upi} size={240} level="H" includeMargin />
            <div className="text-black/70 text-xs mt-3">Scan to Pay · UnitedZone</div>
          </div>
        </div>
        <div className="bg-secondary/50 rounded-lg p-3 text-xs font-mono break-all text-muted-foreground print:hidden">
          {upi}
        </div>
        <div className="flex gap-2 print:hidden">
          <button onClick={download} className="flex-1 rounded-lg bg-primary text-primary-foreground py-2.5 font-medium">Download PNG</button>
          <button onClick={printIt} className="flex-1 rounded-lg bg-secondary hover:bg-secondary/80 py-2.5 font-medium">Print Sticker</button>
        </div>
      </div>
      <style>{`@media print { body * { visibility: hidden; } #print-area, #print-area * { visibility: visible; } #print-area { position: absolute; inset: 0; } }`}</style>
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
          <div className="text-3xl font-semibold mt-2">{stores.length}</div>
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
