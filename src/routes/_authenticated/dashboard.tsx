import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — UnitedZone QR Manager" },
      { name: "description", content: "Manage UPI QR codes across all your branches." },
    ],
  }),
  component: Dashboard,
});

const UPI_PA = "500101010524319@CIUB0000171.ifsc.npci";
const UPI_PN = "M.Kabeer Ahamed";

type QrDesign = { fg: string; bg: string; level: "L" | "M" | "Q" | "H"; margin: boolean };
const DEFAULT_DESIGN: QrDesign = { fg: "#0b0b0b", bg: "#ffffff", level: "H", margin: true };

type Store = {
  id: string;
  name: string;
  active: boolean;
  design: QrDesign;
  holder_name: string | null;
  phone: string | null;
  photo_url: string | null;
  created_at: string;
};
type Sale = { id: string; store_id: string; amount: number; note: string | null; occurred_at: string };

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
  a.href = url; a.download = filename; a.click();
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

function Dashboard() {
  const nav = useNavigate();
  const [userEmail, setUserEmail] = useState<string>("");
  const [stores, setStores] = useState<Store[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"stores" | "sales">("stores");
  const [filter, setFilter] = useState<"all" | "active" | "inactive">("all");
  const [showAdd, setShowAdd] = useState(false);
  const [showQr, setShowQr] = useState<Store | null>(null);
  const [showEdit, setShowEdit] = useState<Store | null>(null);
  const [showSale, setShowSale] = useState<Store | null>(null);
  const [showData, setShowData] = useState(false);

  // Load user + data, run one-time migration from localStorage
  useEffect(() => {
    (async () => {
      const { data: ures } = await supabase.auth.getUser();
      if (!ures.user) { nav({ to: "/auth" }); return; }
      setUserEmail(ures.user.email ?? "");
      await migrateLocalIfNeeded(ures.user.id);
      await refresh();
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refresh = async () => {
    const [{ data: s, error: se }, { data: sa, error: sae }] = await Promise.all([
      supabase.from("stores").select("*").order("created_at", { ascending: true }),
      supabase.from("sales").select("*").order("occurred_at", { ascending: false }),
    ]);
    if (se) toast.error(se.message); else setStores((s ?? []) as unknown as Store[]);
    if (sae) toast.error(sae.message); else setSales((sa ?? []) as unknown as Sale[]);
  };

  const migrateLocalIfNeeded = async (userId: string) => {
    if (localStorage.getItem("uz_migrated_v1")) return;
    try {
      const rawS = localStorage.getItem("uz_stores_v1");
      const rawSales = localStorage.getItem("uz_sales_v1");
      // Only migrate if user has no cloud stores yet
      const { count } = await supabase.from("stores").select("*", { count: "exact", head: true });
      if ((count ?? 0) > 0) { localStorage.setItem("uz_migrated_v1", "1"); return; }
      const idMap = new Map<string, string>();
      if (rawS) {
        const local = JSON.parse(rawS) as Array<any>;
        for (const s of local) {
          const newId = crypto.randomUUID();
          idMap.set(s.id, newId);
          await supabase.from("stores").insert({
            id: newId, user_id: userId, name: s.name,
            active: s.active ?? true,
            design: s.design ?? DEFAULT_DESIGN,
          });
        }
      }
      if (rawSales) {
        const local = JSON.parse(rawSales) as Array<any>;
        for (const sale of local) {
          const sid = idMap.get(sale.storeId);
          if (!sid) continue;
          await supabase.from("sales").insert({
            user_id: userId, store_id: sid, amount: sale.amount,
            occurred_at: new Date(sale.at).toISOString(),
          });
        }
      }
      localStorage.setItem("uz_migrated_v1", "1");
      if (rawS || rawSales) toast.success("Migrated your local data to your account.");
    } catch (e) {
      console.error(e);
    }
  };

  const addStore = async (name: string) => {
    const { data: ures } = await supabase.auth.getUser();
    if (!ures.user) return;
    const { error } = await supabase.from("stores").insert({
      user_id: ures.user.id, name, active: true, design: DEFAULT_DESIGN,
    });
    if (error) return toast.error(error.message);
    toast.success(`${name} added`);
    refresh();
  };
  const updateStore = async (id: string, patch: Partial<Store>) => {
    const { error } = await supabase.from("stores").update(patch).eq("id", id);
    if (error) return toast.error(error.message);
    refresh();
  };
  const removeStore = async (id: string) => {
    if (!confirm("Permanently delete this store? Its sales will also be removed.")) return;
    const { error } = await supabase.from("stores").delete().eq("id", id);
    if (error) return toast.error(error.message);
    refresh();
  };
  const addSale = async (storeId: string, amount: number) => {
    const { data: ures } = await supabase.auth.getUser();
    if (!ures.user) return;
    const { error } = await supabase.from("sales").insert({
      user_id: ures.user.id, store_id: storeId, amount,
    });
    if (error) return toast.error(error.message);
    toast.success("Sale recorded");
    refresh();
  };
  const signOut = async () => {
    await supabase.auth.signOut();
    nav({ to: "/auth" });
  };

  const visible = useMemo(() => stores.filter((s) => {
    if (filter === "active") return s.active;
    if (filter === "inactive") return !s.active;
    return true;
  }), [stores, filter]);

  const totalAll = sales.reduce((a, b) => a + Number(b.amount), 0);
  const syncedShowQr = showQr ? stores.find((x) => x.id === showQr.id) ?? showQr : null;
  const syncedEdit = showEdit ? stores.find((x) => x.id === showEdit.id) ?? showEdit : null;

  if (loading) {
    return <div className="min-h-screen grid place-items-center text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-border/60 backdrop-blur sticky top-0 z-30 bg-background/70">
        <div className="max-w-6xl mx-auto px-5 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="size-10 rounded-xl bg-gradient-to-br from-primary to-accent grid place-items-center text-primary-foreground font-bold text-lg shadow-lg shrink-0">UZ</div>
            <div className="min-w-0">
              <h1 className="text-lg font-semibold leading-tight truncate">UnitedZone Enterprises</h1>
              <p className="text-xs text-muted-foreground truncate">{userEmail}</p>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-2">
            <button onClick={() => setShowData(true)} className="rounded-full bg-secondary hover:bg-secondary/80 px-3.5 py-2 text-sm font-medium">Export</button>
            <button onClick={() => setShowAdd(true)} className="inline-flex items-center gap-2 rounded-full bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90 shadow-lg shadow-primary/20">+ Add Store</button>
            <button onClick={signOut} className="rounded-full bg-secondary hover:bg-secondary/80 px-3.5 py-2 text-sm font-medium">Sign out</button>
          </div>
          <button onClick={signOut} className="sm:hidden text-xs text-muted-foreground">Sign out</button>
        </div>
        <div className="max-w-6xl mx-auto px-5 flex gap-1">
          {(["stores", "sales"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2.5 text-sm font-medium capitalize border-b-2 transition ${tab === t ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
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
                  {stores.filter((s) => s.active).length} active · {stores.filter((s) => !s.active).length} hidden
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="inline-flex rounded-full bg-secondary p-1 text-xs">
                  {(["all", "active", "inactive"] as const).map((f) => (
                    <button key={f} onClick={() => setFilter(f)}
                      className={`px-3 py-1.5 rounded-full capitalize transition ${filter === f ? "bg-background text-foreground shadow" : "text-muted-foreground"}`}>{f}</button>
                  ))}
                </div>
                <button onClick={() => setShowData(true)} className="sm:hidden rounded-full bg-secondary px-3 py-2 text-sm font-medium">Export</button>
                <button onClick={() => setShowAdd(true)} className="sm:hidden inline-flex items-center gap-2 rounded-full bg-primary text-primary-foreground px-4 py-2 text-sm font-medium">+ Add</button>
              </div>
            </div>

            {stores.length === 0 ? (
              <div className="rounded-2xl border-2 border-dashed border-border p-10 text-center">
                <p className="text-muted-foreground mb-4">No branches yet. Add your first store to generate a Paytm-style QR code.</p>
                <button onClick={() => setShowAdd(true)} className="rounded-full bg-primary text-primary-foreground px-5 py-2.5 font-medium">+ Add Store</button>
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {visible.map((s) => (
                  <StoreCard key={s.id} store={s}
                    salesCount={sales.filter((x) => x.store_id === s.id).length}
                    onView={() => setShowQr(s)}
                    onSale={() => setShowSale(s)}
                    onEdit={() => setShowEdit(s)}
                    onDelete={() => removeStore(s.id)}
                    onToggle={() => updateStore(s.id, { active: !s.active })}
                  />
                ))}
                <button onClick={() => setShowAdd(true)}
                  className="rounded-2xl border-2 border-dashed border-border hover:border-primary hover:bg-card/40 transition min-h-[280px] grid place-items-center text-muted-foreground hover:text-foreground">
                  <div className="text-center"><div className="text-4xl mb-2">+</div><div className="text-sm font-medium">Add New Branch</div></div>
                </button>
              </div>
            )}
          </>
        ) : (
          <SalesView stores={stores} sales={sales} total={totalAll} />
        )}
      </main>

      {showAdd && <AddStoreModal onClose={() => setShowAdd(false)} onAdd={(n) => { addStore(n); setShowAdd(false); }} />}
      {syncedShowQr && <QrModal store={syncedShowQr} onClose={() => setShowQr(null)} onEdit={() => { setShowEdit(syncedShowQr); setShowQr(null); }} />}
      {syncedEdit && <EditStoreModal store={syncedEdit} onClose={() => setShowEdit(null)} onSave={(p) => { updateStore(syncedEdit.id, p); setShowEdit(null); }} />}
      {showSale && <LogSaleModal store={showSale} onClose={() => setShowSale(null)} onLog={(a) => { addSale(showSale.id, a); setShowSale(null); }} />}
      {showData && <DataModal stores={stores} sales={sales} onClose={() => setShowData(false)} />}
    </div>
  );
}

function StoreCard({ store, salesCount, onView, onSale, onEdit, onDelete, onToggle }: {
  store: Store; salesCount: number;
  onView: () => void; onSale: () => void; onEdit: () => void; onDelete: () => void; onToggle: () => void;
}) {
  const upi = buildUpi(store.name);
  const d = getDesign(store);
  return (
    <div className={`group rounded-2xl bg-card border border-border p-5 flex flex-col gap-4 hover:border-primary/50 transition shadow-xl shadow-black/10 ${!store.active ? "opacity-60" : ""}`}>
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <h3 className="text-xl font-semibold truncate">{store.name}</h3>
          <p className="text-xs text-muted-foreground mt-0.5 font-mono truncate">tn={encodeURIComponent(store.name.replace(/\s+/g, ""))}</p>
        </div>
        <div className="flex items-center gap-1 opacity-60 group-hover:opacity-100 transition">
          <button onClick={onEdit} title="Edit" className="text-muted-foreground hover:text-foreground text-sm px-1.5">✎</button>
          <button onClick={onDelete} title="Delete" className="text-muted-foreground hover:text-destructive text-sm px-1.5">✕</button>
        </div>
      </div>
      <div className="rounded-xl p-4 grid place-items-center cursor-pointer" style={{ background: d.bg }} onClick={onView}>
        <QRCodeCanvas value={upi} size={140} level={d.level} fgColor={d.fg} bgColor={d.bg} includeMargin={d.margin} />
      </div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{salesCount} sales</span>
        <label className="inline-flex items-center gap-2 cursor-pointer select-none">
          <span className={store.active ? "text-success" : "text-muted-foreground"}>{store.active ? "Active" : "Hidden"}</span>
          <span onClick={onToggle} className={`relative w-9 h-5 rounded-full transition ${store.active ? "bg-primary" : "bg-secondary"}`}>
            <span className={`absolute top-0.5 size-4 rounded-full bg-background transition ${store.active ? "left-[18px]" : "left-0.5"}`} />
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
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Main Street Branch"
            className="w-full rounded-lg bg-input/50 border border-border px-3 py-2.5 outline-none focus:border-primary" />
          <p className="text-xs text-muted-foreground mt-2 break-all">
            Transaction note: <span className="text-primary font-mono">tn={encodeURIComponent(tn || "Shopname")}</span>
          </p>
        </div>
        <button type="submit" disabled={!name.trim()} className="w-full rounded-lg bg-primary text-primary-foreground py-2.5 font-medium disabled:opacity-50">Generate QR Code</button>
      </form>
    </Modal>
  );
}

function EditStoreModal({ store, onClose, onSave }: { store: Store; onClose: () => void; onSave: (p: Partial<Store>) => void }) {
  const [name, setName] = useState(store.name);
  const [holder, setHolder] = useState(store.holder_name ?? "Mr KABEER AHAMED M");
  const [phone, setPhone] = useState(store.phone ?? "8122944794");
  const [photo, setPhoto] = useState(store.photo_url ?? "");
  const [d, setD] = useState<QrDesign>(getDesign(store));
  const presets: { name: string; design: Partial<QrDesign> }[] = [
    { name: "Paytm", design: { fg: "#0b0b0b", bg: "#ffffff" } },
    { name: "Classic", design: { fg: "#0b0b0b", bg: "#ffffff" } },
    { name: "Midnight", design: { fg: "#ffffff", bg: "#0f172a" } },
    { name: "Indigo", design: { fg: "#ffffff", bg: "#4338ca" } },
    { name: "Sunrise", design: { fg: "#1f2937", bg: "#fde68a" } },
    { name: "Rose", design: { fg: "#ffffff", bg: "#be185d" } },
  ];
  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    const reader = new FileReader();
    reader.onload = () => setPhoto(String(reader.result));
    reader.readAsDataURL(f);
  };
  return (
    <Modal title={`Edit — ${store.name}`} onClose={onClose} wide>
      <div className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="block">
            <div className="text-xs text-muted-foreground mb-1">Store name</div>
            <input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-lg bg-input/50 border border-border px-3 py-2 text-sm" />
          </label>
          <label className="block">
            <div className="text-xs text-muted-foreground mb-1">Holder name (on sticker)</div>
            <input value={holder} onChange={(e) => setHolder(e.target.value)} className="w-full rounded-lg bg-input/50 border border-border px-3 py-2 text-sm" />
          </label>
          <label className="block">
            <div className="text-xs text-muted-foreground mb-1">Phone</div>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full rounded-lg bg-input/50 border border-border px-3 py-2 text-sm" />
          </label>
          <label className="block">
            <div className="text-xs text-muted-foreground mb-1">Photo</div>
            <input type="file" accept="image/*" onChange={handleFile} className="w-full text-sm file:mr-2 file:rounded file:border-0 file:bg-secondary file:px-2 file:py-1 file:text-xs" />
          </label>
        </div>

        <div>
          <div className="text-sm text-muted-foreground mb-2">QR presets</div>
          <div className="grid grid-cols-3 gap-2">
            {presets.map((p) => (
              <button key={p.name} onClick={() => setD((cur) => ({ ...cur, ...p.design }))}
                className="rounded-lg p-2 text-xs font-medium border border-border hover:border-primary transition"
                style={{ background: p.design.bg, color: p.design.fg }}>{p.name}</button>
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
          <select value={d.level} onChange={(e) => setD({ ...d, level: e.target.value as QrDesign["level"] })}
            className="w-full rounded-lg bg-input/50 border border-border px-3 py-2">
            <option value="L">L — Low</option><option value="M">M — Medium</option>
            <option value="Q">Q — Quartile</option><option value="H">H — High (recommended)</option>
          </select>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={d.margin} onChange={(e) => setD({ ...d, margin: e.target.checked })} />
          <span className="text-sm">Include quiet zone (margin)</span>
        </label>
        <div className="flex gap-2 pt-2">
          <button onClick={onClose} className="rounded-lg bg-secondary px-4 py-2 text-sm">Cancel</button>
          <button onClick={() => onSave({
            name: name.trim() || store.name, holder_name: holder.trim() || null,
            phone: phone.trim() || null, photo_url: photo || null, design: d,
          })} className="flex-1 rounded-lg bg-primary text-primary-foreground py-2 font-medium">Save</button>
        </div>
      </div>
    </Modal>
  );
}

function QrModal({ store, onClose, onEdit }: { store: Store; onClose: () => void; onEdit: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const upi = buildUpi(store.name);
  const d = getDesign(store);
  const holder = store.holder_name ?? "Mr KABEER AHAMED M";
  const phone = store.phone ?? "8122944794";

  const download = () => {
    const canvas = ref.current?.querySelector("canvas");
    if (!canvas) return;
    const url = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url; a.download = `${store.name}-qr.png`; a.click();
  };
  const printIt = () => window.print();

  return (
    <Modal title={store.name} onClose={onClose} wide>
      <div className="space-y-4 print:space-y-0" id="print-area">
        {/* Paytm-style sticker */}
        <div className="mx-auto max-w-sm rounded-2xl overflow-hidden bg-[#bfe6ff] border border-border shadow-2xl">
          {/* Top white card — photo + name + phone */}
          <div className="p-3 grid grid-cols-[96px_1fr] gap-3 bg-[#e8f5ff]">
            <div className="aspect-square rounded-md overflow-hidden bg-white grid place-items-center border border-white">
              {store.photo_url ? (
                <img src={store.photo_url} alt={holder} className="w-full h-full object-cover" />
              ) : (
                <span className="text-[10px] text-muted-foreground text-center px-1">Add photo in Edit</span>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <div className="bg-white rounded-md px-3 py-2 font-bold text-[#0b0b0b] leading-tight text-sm">{holder}</div>
              <div className="bg-white rounded-md px-3 py-2 font-bold text-[#0b0b0b] text-sm tracking-wide">{phone}</div>
            </div>
          </div>
          {/* Blue body with QR card */}
          <div className="bg-[#00BAF2] pt-4 pb-2 px-4">
            <div ref={ref} className="bg-white rounded-xl px-4 pt-3 pb-2 grid place-items-center">
              <div className="text-center">
                <div className="font-extrabold text-2xl" style={{ color: "#002970" }}>
                  <span style={{ color: "#002970" }}>Pay</span><span style={{ color: "#00BAF2" }}>tm</span>
                </div>
                <div className="text-[13px] font-semibold text-black -mt-0.5 mb-2">Accepted Here</div>
                <QRCodeCanvas value={upi} size={220} level={d.level} fgColor={d.fg} bgColor={d.bg} includeMargin={d.margin} />
                <div className="mt-2 text-[11px] font-semibold tracking-wide" style={{ color: "#002970" }}>
                  {store.name.toUpperCase()}
                </div>
              </div>
            </div>
          </div>
          <div className="bg-[#002970] py-2 text-center text-[11px] font-bold text-white">
            Paytm से UPI
          </div>
          <div className="bg-white py-2 px-3 flex items-center justify-around text-[9px] font-semibold text-[#002970]">
            <span>Paytm UPI &amp; Wallet</span><span>Paytm Postpaid</span><span>UPI</span>
          </div>
        </div>

        <div className="bg-secondary/50 rounded-lg p-3 text-xs font-mono break-all text-muted-foreground print:hidden">{upi}</div>
        <div className="grid grid-cols-3 gap-2 print:hidden">
          <button onClick={download} className="rounded-lg bg-primary text-primary-foreground py-2.5 font-medium text-sm">Download QR</button>
          <button onClick={printIt} className="rounded-lg bg-secondary hover:bg-secondary/80 py-2.5 font-medium text-sm">Print Sticker</button>
          <button onClick={onEdit} className="rounded-lg bg-secondary hover:bg-secondary/80 py-2.5 font-medium text-sm">Edit</button>
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
          <input autoFocus type="number" step="0.01" value={amt} onChange={(e) => setAmt(e.target.value)}
            placeholder="0.00"
            className="w-full rounded-lg bg-input/50 border border-border px-3 py-2.5 outline-none focus:border-primary text-2xl" />
        </div>
        <button type="submit" className="w-full rounded-lg bg-primary text-primary-foreground py-2.5 font-medium">Record Sale</button>
      </form>
    </Modal>
  );
}

function DataModal({ stores, sales, onClose }: { stores: Store[]; sales: Sale[]; onClose: () => void }) {
  const exportStoresCSV = () => downloadFile("stores.csv", toCSV(stores as unknown as Record<string, unknown>[]), "text/csv");
  const exportSalesCSV = () => downloadFile("sales.csv", toCSV(sales as unknown as Record<string, unknown>[]), "text/csv");
  const exportAll = () => downloadFile("unitedzone-backup.json", JSON.stringify({ stores, sales, exportedAt: Date.now() }, null, 2), "application/json");
  return (
    <Modal title="Export Data" onClose={onClose}>
      <div className="grid grid-cols-2 gap-2">
        <button onClick={exportStoresCSV} className="rounded-lg bg-secondary hover:bg-secondary/80 py-2.5 text-sm font-medium">Stores CSV</button>
        <button onClick={exportSalesCSV} className="rounded-lg bg-secondary hover:bg-secondary/80 py-2.5 text-sm font-medium">Sales CSV</button>
        <button onClick={exportAll} className="col-span-2 rounded-lg bg-primary text-primary-foreground py-2.5 text-sm font-medium">Full Backup (JSON)</button>
      </div>
      <p className="text-xs text-muted-foreground mt-3">Your data is securely stored in your account; this is for offline backups.</p>
    </Modal>
  );
}

function SalesView({ stores, sales, total }: { stores: Store[]; sales: Sale[]; total: number }) {
  const [period, setPeriod] = useState<"month" | "year">("month");
  const now = new Date();
  const [cursor, setCursor] = useState<{ y: number; m: number }>({ y: now.getFullYear(), m: now.getMonth() });

  // Filter by period
  const inPeriod = useMemo(() => sales.filter((s) => {
    const d = new Date(s.occurred_at);
    if (period === "year") return d.getFullYear() === cursor.y;
    return d.getFullYear() === cursor.y && d.getMonth() === cursor.m;
  }), [sales, period, cursor]);

  const periodTotal = inPeriod.reduce((a, b) => a + Number(b.amount), 0);

  // Buckets
  const buckets = useMemo(() => {
    if (period === "year") {
      const arr = Array.from({ length: 12 }, (_, i) => ({ label: new Date(2000, i, 1).toLocaleString("en", { month: "short" }), total: 0 }));
      for (const s of inPeriod) arr[new Date(s.occurred_at).getMonth()].total += Number(s.amount);
      return arr;
    }
    const days = new Date(cursor.y, cursor.m + 1, 0).getDate();
    const arr = Array.from({ length: days }, (_, i) => ({ label: String(i + 1), total: 0 }));
    for (const s of inPeriod) arr[new Date(s.occurred_at).getDate() - 1].total += Number(s.amount);
    return arr;
  }, [inPeriod, period, cursor]);

  const bucketMax = Math.max(...buckets.map((b) => b.total), 1);

  const byStore = stores.map((s) => ({
    store: s,
    total: inPeriod.filter((x) => x.store_id === s.id).reduce((a, b) => a + Number(b.amount), 0),
    count: inPeriod.filter((x) => x.store_id === s.id).length,
  })).sort((a, b) => b.total - a.total);
  const storeMax = Math.max(...byStore.map((x) => x.total), 1);

  const prev = () => {
    if (period === "year") setCursor((c) => ({ ...c, y: c.y - 1 }));
    else { const m = cursor.m - 1; setCursor(m < 0 ? { y: cursor.y - 1, m: 11 } : { y: cursor.y, m }); }
  };
  const next = () => {
    if (period === "year") setCursor((c) => ({ ...c, y: c.y + 1 }));
    else { const m = cursor.m + 1; setCursor(m > 11 ? { y: cursor.y + 1, m: 0 } : { y: cursor.y, m }); }
  };
  const label = period === "year" ? String(cursor.y) : new Date(cursor.y, cursor.m, 1).toLocaleString("en", { month: "long", year: "numeric" });

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-3xl font-semibold">Sales Tracker</h2>
          <p className="text-muted-foreground text-sm mt-1">All-time total: ₹{total.toLocaleString("en-IN")}</p>
        </div>
        <div className="inline-flex rounded-full bg-secondary p-1 text-xs">
          {(["month", "year"] as const).map((p) => (
            <button key={p} onClick={() => setPeriod(p)}
              className={`px-4 py-1.5 rounded-full capitalize transition ${period === p ? "bg-background text-foreground shadow" : "text-muted-foreground"}`}>
              {p === "month" ? "Monthly" : "Yearly"}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between rounded-2xl bg-card border border-border px-4 py-3">
        <button onClick={prev} className="rounded-full size-9 grid place-items-center bg-secondary hover:bg-secondary/80">‹</button>
        <div className="text-center">
          <div className="text-xs text-muted-foreground uppercase tracking-wide">{period === "year" ? "Year" : "Month"}</div>
          <div className="text-lg font-semibold">{label}</div>
        </div>
        <button onClick={next} className="rounded-full size-9 grid place-items-center bg-secondary hover:bg-secondary/80">›</button>
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        <div className="rounded-2xl bg-card border border-border p-5">
          <div className="text-xs text-muted-foreground uppercase tracking-wide">{period === "year" ? "Year" : "Month"} Revenue</div>
          <div className="text-3xl font-semibold mt-2">₹{periodTotal.toLocaleString("en-IN")}</div>
        </div>
        <div className="rounded-2xl bg-card border border-border p-5">
          <div className="text-xs text-muted-foreground uppercase tracking-wide">Transactions</div>
          <div className="text-3xl font-semibold mt-2">{inPeriod.length}</div>
        </div>
        <div className="rounded-2xl bg-card border border-border p-5">
          <div className="text-xs text-muted-foreground uppercase tracking-wide">Avg / Sale</div>
          <div className="text-3xl font-semibold mt-2">₹{inPeriod.length ? Math.round(periodTotal / inPeriod.length).toLocaleString("en-IN") : 0}</div>
        </div>
      </div>

      <div className="rounded-2xl bg-card border border-border p-5">
        <h3 className="text-lg font-semibold mb-4">{period === "year" ? "Monthly breakdown" : "Daily breakdown"}</h3>
        <div className="flex items-end gap-1 h-40">
          {buckets.map((b, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1 group">
              <div className="text-[10px] text-muted-foreground opacity-0 group-hover:opacity-100">₹{b.total.toLocaleString("en-IN")}</div>
              <div className="w-full bg-gradient-to-t from-primary to-accent rounded-t transition-all" style={{ height: `${(b.total / bucketMax) * 100}%`, minHeight: b.total > 0 ? 2 : 0 }} />
              <div className="text-[10px] text-muted-foreground">{period === "year" ? b.label : (Number(b.label) % 5 === 1 ? b.label : "")}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl bg-card border border-border p-5">
        <h3 className="text-lg font-semibold mb-4">By Branch</h3>
        {byStore.length === 0 ? <p className="text-sm text-muted-foreground">No branches yet.</p> : (
          <div className="space-y-3">
            {byStore.map(({ store, total: t, count }) => (
              <div key={store.id}>
                <div className="flex justify-between text-sm mb-1.5">
                  <span className="font-medium">{store.name} <span className="text-muted-foreground font-normal">· {count}</span></span>
                  <span className="text-primary font-semibold">₹{t.toLocaleString("en-IN")}</span>
                </div>
                <div className="h-2 bg-secondary rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-primary to-accent transition-all" style={{ width: `${(t / storeMax) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-2xl bg-card border border-border p-5">
        <h3 className="text-lg font-semibold mb-4">Recent Activity</h3>
        {inPeriod.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No sales in this {period}.</p>
        ) : (
          <div className="divide-y divide-border">
            {inPeriod.slice(0, 30).map((s) => {
              const st = stores.find((x) => x.id === s.store_id);
              return (
                <div key={s.id} className="flex justify-between py-2.5 text-sm">
                  <div>
                    <div className="font-medium">{st?.name ?? "Unknown"}</div>
                    <div className="text-xs text-muted-foreground">{new Date(s.occurred_at).toLocaleString()}</div>
                  </div>
                  <div className="text-success font-semibold">+₹{Number(s.amount).toLocaleString("en-IN")}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
