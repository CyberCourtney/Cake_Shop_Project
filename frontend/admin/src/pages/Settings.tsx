import { useState } from "react";
import { formatCollectionDate, type CollectionDate, type Season, type Settings as ShopSettings } from "@kvc/shared";
import { api, ApiError } from "../api";
import { ErrorBox, Loading, useLoad } from "../ui";

type All = { settings: ShopSettings; season: Season; dates: CollectionDate[] };

/** <input type="datetime-local"> works in the browser's time zone, which for the baker is UK time. */
const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export function Settings() {
  const { data, error, reload, setData } = useLoad(() => api<All>("/api/admin/settings"));
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!data) return <Loading />;
  return (
    <>
      <div className="page-head">
        <h1>Dates &amp; settings</h1>
        <p className="muted">Changes show on the shop within about a minute.</p>
      </div>
      <SeasonForm key={`${data.settings.version}-${data.season.version}`} data={data} onSaved={setData} />
      <Dates data={data} onSaved={setData} />
    </>
  );
}

function SeasonForm({ data, onSaved }: { data: All; onSaved: (d: All) => void }) {
  const [season, setSeason] = useState({ ...data.season, opens: toLocalInput(data.season.orderingOpensAt), deadline: toLocalInput(data.season.orderingDeadline) });
  const [business, setBusiness] = useState(data.settings.business);
  const [maxPerDay, setMaxPerDay] = useState(data.settings.maxOrdersPerEmailPerDay);
  const [state, setState] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setState(null);
    try {
      const res = await api<All>("/api/admin/settings", {
        method: "PUT",
        body: JSON.stringify({
          settingsVersion: data.settings.version,
          seasonVersion: data.season.version,
          business,
          maxOrdersPerEmailPerDay: maxPerDay,
          season: { label: season.label, isOpen: season.isOpen, orderingOpensAt: new Date(season.opens).toISOString(), orderingDeadline: new Date(season.deadline).toISOString() },
        }),
      });
      onSaved(res);
      setState({ kind: "ok", text: "Saved." });
    } catch (err) {
      setState({ kind: "err", text: err instanceof ApiError ? err.message : "That didn't save." });
    } finally {
      setSaving(false);
    }
  };
  const b = (k: keyof typeof business) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setBusiness({ ...business, [k]: e.target.value });

  return (
    <form className="card pad" onSubmit={save}>
      <div className="split">
        <h2>Ordering season</h2>
        <label className="switch">
          <input type="checkbox" checked={season.isOpen} onChange={(e) => setSeason({ ...season, isOpen: e.target.checked })} />
          <span>{season.isOpen ? "Taking orders" : "Ordering switched off"}</span>
        </label>
      </div>
      <div className="f"><label htmlFor="sl">Season name</label><input id="sl" value={season.label} onChange={(e) => setSeason({ ...season, label: e.target.value })} /></div>
      <div className="grid2">
        <div className="f"><label htmlFor="so">Ordering opens</label><input id="so" type="datetime-local" value={season.opens} onChange={(e) => setSeason({ ...season, opens: e.target.value })} /></div>
        <div className="f"><label htmlFor="sd">Ordering deadline</label><input id="sd" type="datetime-local" value={season.deadline} onChange={(e) => setSeason({ ...season, deadline: e.target.value })} /></div>
      </div>

      <h2>Shown to customers</h2>
      <div className="grid2">
        <div className="f"><label htmlFor="bp">Phone number</label><input id="bp" value={business.phone} onChange={b("phone")} /></div>
        <div className="f"><label htmlFor="be">Email address</label><input id="be" value={business.email} onChange={b("email")} /></div>
      </div>
      <div className="f"><label htmlFor="bc">About collection</label><textarea id="bc" rows={2} value={business.collectionAddressSummary} onChange={b("collectionAddressSummary")} /></div>
      <div className="f"><label htmlFor="bpay">About payment</label><textarea id="bpay" rows={2} value={business.paymentInfo} onChange={b("paymentInfo")} /></div>
      <div className="f"><label htmlFor="ba">Allergen notice</label><textarea id="ba" rows={2} value={business.allergenNotice} onChange={b("allergenNotice")} /></div>
      <div className="f narrow-f"><label htmlFor="mx">Most orders one email address can place in a day</label><input id="mx" type="number" min={1} max={50} value={maxPerDay} onChange={(e) => setMaxPerDay(Number(e.target.value))} /></div>
      <div className="save-row">
        <button className="btn" disabled={saving}>{saving ? "Saving…" : "Save settings"}</button>
        {state && <span className={state.kind === "ok" ? "ok-text" : "danger-text"} role="status">{state.text}</span>}
      </div>
    </form>
  );
}

function Dates({ data, onSaved }: { data: All; onSaved: (d: All) => void }) {
  const [newDate, setNewDate] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const saveDate = async (date: string, body: { enabled: boolean; collectionWindow: string; capacityUnits: number | null }) => {
    setMsg(null);
    try {
      onSaved(await api<All>(`/api/admin/dates/${date}`, { method: "PUT", body: JSON.stringify(body) }));
      return true;
    } catch (err) {
      setMsg(err instanceof ApiError ? err.message : "That didn't save.");
      return false;
    }
  };

  return (
    <section className="card pad">
      <h2>Collection dates</h2>
      <p className="small muted">Customers can choose any date that is switched on and still in the future. Leave "Most orders" empty for no limit. Dates can't be deleted, because they may have orders: switch them off instead.</p>
      {msg && <p className="alert">{msg}</p>}
      <div className="dates">
        {data.dates.map((d) => <DateRow key={`${d.date}-${d.enabled}-${d.collectionWindow}-${d.capacityUnits}-${d.bookedUnits}`} d={d} onSave={saveDate} />)}
      </div>
      <form className="add-date" onSubmit={async (e) => { e.preventDefault(); if (newDate && (await saveDate(newDate, { enabled: true, collectionWindow: "10:00 to 16:00", capacityUnits: null }))) setNewDate(""); }}>
        <div className="f"><label htmlFor="nd">Add a collection date</label><input id="nd" type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} /></div>
        <button className="btn-quiet" disabled={!newDate}>Add date</button>
      </form>
    </section>
  );
}

function DateRow({ d, onSave }: { d: CollectionDate; onSave: (date: string, b: { enabled: boolean; collectionWindow: string; capacityUnits: number | null }) => Promise<boolean> }) {
  const [enabled, setEnabled] = useState(d.enabled);
  const [win, setWin] = useState(d.collectionWindow);
  const [cap, setCap] = useState(d.capacityUnits?.toString() ?? "");
  const dirty = enabled !== d.enabled || win !== d.collectionWindow || cap !== (d.capacityUnits?.toString() ?? "");
  return (
    <div className={`date-row ${enabled ? "" : "off"}`}>
      <span className="date-name">{formatCollectionDate(d.date, { year: true })}</span>
      <label className="check"><input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> On</label>
      <div className="f"><label htmlFor={`w-${d.date}`}>Collection times</label><input id={`w-${d.date}`} value={win} onChange={(e) => setWin(e.target.value)} /></div>
      <div className="f cap"><label htmlFor={`c-${d.date}`}>Most orders</label><input id={`c-${d.date}`} type="number" min={1} value={cap} onChange={(e) => setCap(e.target.value)} /></div>
      <span className="muted small booked">{d.bookedUnits} booked</span>
      <button className="btn-quiet" disabled={!dirty} onClick={() => onSave(d.date, { enabled, collectionWindow: win, capacityUnits: cap ? Number(cap) : null })}>Save</button>
    </div>
  );
}
