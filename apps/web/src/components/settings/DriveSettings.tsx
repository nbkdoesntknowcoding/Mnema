/**
 * Settings → Integrations → Google Drive (Phase 10).
 *
 * Connect a Google account, then link Mnema folders to Drive folders with a
 * chosen direction + accepted file types. Talks to /api/drive/*.
 */
import { type JSX, useEffect, useRef, useState } from 'react';

interface DriveStatus {
  connected: boolean;
  configured: boolean;
  scope: string | null;
  defaultTypes: string[];
}
interface DriveLink {
  id: string;
  folderId: string;
  driveFolderId: string;
  driveFolderName: string | null;
  direction: 'pull' | 'push' | 'both';
  acceptedTypes: string[];
  conflictPolicy: 'manual' | 'lww';
  status: 'active' | 'paused' | 'error';
  lastSyncedAt: string | null;
  errorMessage: string | null;
}
interface MnemaFolder { id: string; name: string }
interface DriveFolder { id: string; name: string }

async function api<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(opts?.headers ?? {}) },
    ...opts,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

const card: React.CSSProperties = {
  background: 'var(--surface)', border: '1px solid var(--line)',
  borderRadius: 10, padding: 16,
};
const primaryBtn: React.CSSProperties = {
  padding: '8px 16px', borderRadius: 8, border: 'none',
  background: 'var(--accent, #6366f1)', color: 'var(--on-ink)',
  fontSize: 14, fontWeight: 600, cursor: 'pointer',
};
const ghostBtn: React.CSSProperties = {
  padding: '5px 12px', borderRadius: 7, border: '1px solid var(--line-strong)',
  background: 'transparent', color: 'var(--ink-soft)', fontSize: 12.5, cursor: 'pointer',
};
const label: React.CSSProperties = {
  display: 'block', fontSize: 11, color: 'var(--ink-muted)', marginBottom: 5,
  fontWeight: 500, letterSpacing: '0.05em', textTransform: 'uppercase',
};
const input: React.CSSProperties = {
  width: '100%', padding: '8px 10px', borderRadius: 8, boxSizing: 'border-box',
  background: 'var(--surface-2)', border: '1px solid var(--line)', color: 'var(--ink)', fontSize: 13,
};

export function DriveSettings(): JSX.Element {
  const [status, setStatus] = useState<DriveStatus | null>(null);
  const [links, setLinks] = useState<DriveLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [confirmUnlink, setConfirmUnlink] = useState<string | null>(null);

  async function refresh() {
    const s = await api<DriveStatus>('/api/drive/status');
    setStatus(s);
    if (s.connected) {
      const l = await api<{ links: DriveLink[] }>('/api/drive/links');
      setLinks(l.links);
    }
  }

  useEffect(() => {
    // Surface the OAuth redirect result (?drive=connected|error).
    const p = new URLSearchParams(window.location.search).get('drive');
    if (p === 'connected') setBanner('Google Drive connected.');
    else if (p === 'error') setBanner('Could not connect Google Drive — please try again.');
    void refresh().catch((e: Error) => setBanner(e.message)).finally(() => setLoading(false));
  }, []);

  async function syncNow(id: string) {
    setBanner('Sync queued…');
    try { await api(`/api/drive/links/${id}/sync`, { method: 'POST' }); setBanner('Sync queued.'); }
    catch (e) { setBanner((e as Error).message); }
  }
  async function unlink(id: string) {
    await api(`/api/drive/links/${id}`, { method: 'DELETE' });
    setLinks((prev) => prev.filter((l) => l.id !== id));
    setConfirmUnlink(null);
  }
  async function togglePause(l: DriveLink) {
    const next = l.status === 'paused' ? 'active' : 'paused';
    const { link } = await api<{ link: DriveLink }>(`/api/drive/links/${l.id}`, {
      method: 'PATCH', body: JSON.stringify({ status: next }),
    });
    setLinks((prev) => prev.map((x) => (x.id === l.id ? link : x)));
  }

  if (loading) return <div style={{ color: 'var(--ink-muted)', fontSize: 13, padding: '20px 0' }}>Loading…</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: 'var(--ink)' }}>Google Drive</h2>
        <p style={{ margin: '4px 0 0', fontSize: 14, color: 'var(--ink-soft)' }}>
          Link Mnema folders to Google Drive folders and keep their files in sync both ways.
        </p>
      </div>

      {banner && (
        <div style={{ ...card, borderColor: 'var(--accent-line)', background: 'var(--accent-soft)', fontSize: 13, color: 'var(--ink)' }}>
          {banner}
        </div>
      )}

      {!status?.configured ? (
        <div style={card}>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-soft)' }}>
            Google Drive isn’t configured on this server yet. An operator needs to create a Google
            Cloud OAuth client and set <code>GOOGLE_DRIVE_CLIENT_ID</code>,
            <code> GOOGLE_DRIVE_CLIENT_SECRET</code> and <code>GOOGLE_DRIVE_REDIRECT_URI</code> in
            the environment. See <code>docs/connect/drive.md</code>.
          </p>
        </div>
      ) : !status.connected ? (
        <div style={card}>
          <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--ink-soft)' }}>
            Connect your Google account to start linking folders.
          </p>
          <a href="/api/drive/connect" style={{ ...primaryBtn, display: 'inline-block', textDecoration: 'none' }}>
            Connect Google Drive
          </a>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13, color: 'var(--ink-soft)' }}>
              Connected · scope <code>{status.scope?.split('/').pop()}</code>
            </span>
            <button style={primaryBtn} onClick={() => setShowAdd(true)}>+ Link a folder</button>
          </div>

          {links.length === 0 ? (
            <div style={{ ...card, textAlign: 'center', color: 'var(--ink-muted)', fontSize: 13 }}>
              No linked folders yet. Link one to start syncing.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {links.map((l) => (
                <div key={l.id} style={{ ...card, display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>
                      {l.driveFolderName ?? l.driveFolderId}
                    </div>
                    <div style={{ marginTop: 3, fontSize: 12, color: 'var(--ink-muted)' }}>
                      {l.direction === 'both' ? 'Two-way' : l.direction === 'pull' ? 'Drive → Mnema' : 'Mnema → Drive'}
                      {' · '}{(l.acceptedTypes.length ? l.acceptedTypes : status.defaultTypes).join(', ')}
                      {l.status === 'paused' && ' · paused'}
                      {l.status === 'error' && ` · error: ${l.errorMessage ?? 'sync failed'}`}
                      {l.lastSyncedAt && ` · synced ${new Date(l.lastSyncedAt).toLocaleString()}`}
                    </div>
                  </div>
                  <button style={ghostBtn} onClick={() => void syncNow(l.id)}>Sync now</button>
                  <button style={ghostBtn} onClick={() => void togglePause(l)}>{l.status === 'paused' ? 'Resume' : 'Pause'}</button>
                  {confirmUnlink === l.id ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 12, color: 'var(--ink-muted)' }}>Unlink?</span>
                      <button
                        style={{ ...ghostBtn, color: 'var(--status-error)', borderColor: 'var(--status-error)' }}
                        title="Synced docs stay in Mnema; the Drive folder is untouched."
                        onClick={() => void unlink(l.id)}
                      >
                        Confirm
                      </button>
                      <button style={ghostBtn} onClick={() => setConfirmUnlink(null)}>Cancel</button>
                    </span>
                  ) : (
                    <button
                      style={{ ...ghostBtn, color: 'var(--status-error)', borderColor: 'var(--status-error)' }}
                      onClick={() => setConfirmUnlink(l.id)}
                    >
                      Unlink
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {showAdd && status && (
        <AddLinkModal
          defaultTypes={status.defaultTypes}
          onClose={() => setShowAdd(false)}
          onCreated={(link) => { setLinks((prev) => [link, ...prev]); setShowAdd(false); setBanner('Folder linked — initial sync queued.'); }}
        />
      )}
    </div>
  );
}

function AddLinkModal({ defaultTypes, onClose, onCreated }: {
  defaultTypes: string[];
  onClose: () => void;
  onCreated: (link: DriveLink) => void;
}): JSX.Element {
  const [mnemaFolders, setMnemaFolders] = useState<MnemaFolder[]>([]);
  const [driveFolders, setDriveFolders] = useState<DriveFolder[]>([]);
  const [folderId, setFolderId] = useState('');
  const [driveFolderId, setDriveFolderId] = useState('');
  const [createInDrive, setCreateInDrive] = useState(false);
  const [direction, setDirection] = useState<'pull' | 'push' | 'both'>('both');
  const [types, setTypes] = useState<string[]>(defaultTypes);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api<{ folders: MnemaFolder[] }>('/api/folders').then((d) => setMnemaFolders(d.folders ?? [])).catch(() => {});
    void api<{ folders: DriveFolder[] }>('/api/drive/folders').then((d) => setDriveFolders(d.folders ?? [])).catch(() => {});
  }, []);

  // Dialog a11y: focus the dialog on open, trap Tab within it, close on Escape,
  // and restore focus to the trigger on unmount. (onClose via ref so this runs once.)
  const modalRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const node = modalRef.current;
    const prevFocus = document.activeElement as HTMLElement | null;
    const focusables = () => Array.from(
      node?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) ?? [],
    );
    focusables()[0]?.focus();
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.preventDefault(); onCloseRef.current(); return; }
      if (e.key !== 'Tab') return;
      const items = focusables();
      if (items.length === 0) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => { document.removeEventListener('keydown', onKeyDown); prevFocus?.focus(); };
  }, []);

  function toggleType(t: string) {
    setTypes((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  }

  async function submit() {
    if (!folderId) { setError('Choose a Mnema folder.'); return; }
    if (!createInDrive && !driveFolderId) { setError('Choose a Drive folder, or create one.'); return; }
    setSaving(true); setError(null);
    try {
      const driveName = driveFolders.find((f) => f.id === driveFolderId)?.name;
      const { link } = await api<{ link: DriveLink }>('/api/drive/links', {
        method: 'POST',
        body: JSON.stringify({
          folderId,
          ...(createInDrive ? { createInDrive: true } : { driveFolderId, driveFolderName: driveName }),
          direction,
          acceptedTypes: types,
        }),
      });
      onCreated(link);
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="drive-add-title"
        style={{ ...card, width: 460, maxWidth: '92vw', display: 'flex', flexDirection: 'column', gap: 14 }}
      >
        <h3 id="drive-add-title" style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>Link a folder</h3>

        <div>
          <span style={label}>Mnema folder</span>
          <select style={input} value={folderId} onChange={(e) => setFolderId(e.target.value)}>
            <option value="">Choose…</option>
            {mnemaFolders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </div>

        <div>
          <span style={label}>Google Drive folder</span>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--ink-soft)', marginBottom: 8 }}>
            <input type="checkbox" checked={createInDrive} onChange={(e) => setCreateInDrive(e.target.checked)} />
            Create a new folder in Drive from the Mnema folder
          </label>
          {!createInDrive && (
            <select style={input} value={driveFolderId} onChange={(e) => setDriveFolderId(e.target.value)}>
              <option value="">Choose an existing Drive folder…</option>
              {driveFolders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          )}
        </div>

        <div>
          <span style={label}>Direction</span>
          <select style={input} value={direction} onChange={(e) => setDirection(e.target.value as 'pull' | 'push' | 'both')}>
            <option value="both">Two-way (Drive ⇄ Mnema)</option>
            <option value="pull">Drive → Mnema only</option>
            <option value="push">Mnema → Drive only</option>
          </select>
        </div>

        <div>
          <span style={label}>File types to sync</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {defaultTypes.map((t) => {
              const on = types.includes(t);
              return (
                <button key={t} onClick={() => toggleType(t)}
                  aria-pressed={on}
                  style={{ padding: '3px 10px', borderRadius: 20, fontSize: 12, cursor: 'pointer',
                    border: `1px solid ${on ? 'var(--accent-line)' : 'var(--line-strong)'}`,
                    background: on ? 'var(--accent-soft)' : 'transparent',
                    color: on ? 'var(--ink)' : 'var(--ink-muted)' }}>
                  {t}
                </button>
              );
            })}
          </div>
        </div>

        {error && <p style={{ margin: 0, fontSize: 13, color: 'var(--status-error)' }}>{error}</p>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button style={ghostBtn} onClick={onClose}>Cancel</button>
          <button style={{ ...primaryBtn, opacity: saving ? 0.6 : 1 }} disabled={saving} onClick={() => void submit()}>
            {saving ? 'Linking…' : 'Link folder'}
          </button>
        </div>
      </div>
    </div>
  );
}
