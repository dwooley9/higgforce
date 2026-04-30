import React, { useState, useEffect, useRef } from 'react';
import { LayoutDashboard, Users, Phone, Send, Plus, X, Edit2, Trash2, Sparkles, Copy, Check, CheckSquare, MessageSquare, Search, Calendar, Building2, Mail, MapPin, User, ChevronDown, Loader2, AlertCircle, Pin, PinOff, Download, Clock, TrendingUp, FileText, ArrowRight, Globe, ExternalLink, Upload, Trophy, XCircle, Briefcase } from 'lucide-react';

// ---------------------------------------------------------------------------
// localStorage shim — replaces window.storage for standalone web deployment.
// Mimics the same async API (get/set/list) so no other code changes needed.
// ---------------------------------------------------------------------------
const _storage = (() => {
  const get = async (key) => {
    try { const v = localStorage.getItem(key); return v !== null ? { key, value: v } : null; } catch { return null; }
  };
  const set = async (key, value) => {
    try { localStorage.setItem(key, value); return { key, value }; } catch { return null; }
  };
  const del = async (key) => {
    try { localStorage.removeItem(key); return { key, deleted: true }; } catch { return null; }
  };
  const list = async (prefix = '') => {
    try { return { keys: Object.keys(localStorage).filter(k => k.startsWith(prefix)) }; } catch { return { keys: [] }; }
  };
  return { get, set, delete: del, list };
})();
window.storage = _storage;
// ---------------------------------------------------------------------------


const TEMPS = {
  warm:    { label: 'Warm',    bg: '#fef3e7', border: '#f59e0b', dot: '#f59e0b', text: '#78350f' },
  neutral: { label: 'Neutral', bg: '#f1f5f9', border: '#64748b', dot: '#64748b', text: '#334155' },
  cold:    { label: 'Cold',    bg: '#eff6ff', border: '#3b82f6', dot: '#3b82f6', text: '#1e3a8a' },
};

// Pre-pipeline holding stage — shown on All Prospects page, not on the Pipeline kanban
const PRE_PIPELINE_STAGES = [
  { key: 'Cold Prospect', sf: 'Lead generation — not yet a target' },
];
// Active pipeline stages with Salesforce equivalents shown as subtitles
const PIPELINE_STAGES = [
  { key: 'Prospecting',          sf: 'Discovery' },
  { key: 'Meeting Scheduled',    sf: 'Analysis' },
  { key: 'Submission Prep',      sf: 'Proof Source' },
  { key: 'Underwriting',         sf: 'Feedback Meeting' },
  { key: 'Proposal Meeting',     sf: 'Solutions Presentation' },
  { key: 'Forecasting - Close',  sf: 'Forecasting - Close $' },
];
const CLOSED_STAGES = [
  { key: 'Won',  sf: 'Won' },
  { key: 'Lost', sf: 'Lost' },
];
const STAGES = [...PRE_PIPELINE_STAGES.map(s => s.key), ...PIPELINE_STAGES.map(s => s.key), ...CLOSED_STAGES.map(s => s.key)];
const STAGE_SUBTITLE = Object.fromEntries([...PRE_PIPELINE_STAGES, ...PIPELINE_STAGES, ...CLOSED_STAGES].map(s => [s.key, s.sf]));

// Client management workflow stages (separate from prospect pipeline)
const CLIENT_MGMT_STAGES = ['Additional Quote', 'Policy Changes', 'Inspection Recs', 'Audit'];

const INDUSTRIES = ['Auto / Tire / Service', 'Church / Religious Org', 'Contractor / Construction', 'Landscaping / Outdoor', 'Manufacturing', 'Non-Profit / Associations', 'Personal Care', 'Professional Services', 'Property Maintenance', 'Real Estate', 'Restaurant / Hospitality', 'Retail', 'Roofing', 'Service Business', 'Other', 'Personal Lines'];
const COMMERCIAL_INDUSTRIES = INDUSTRIES.filter(i => i !== 'Personal Lines');
const IndustryOptions = () => (
  <>
    {COMMERCIAL_INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
    <option disabled>─</option>
    <option value="Personal Lines">Personal Lines</option>
  </>
);

const uid = () => Math.random().toString(36).slice(2, 10);

// Normalize company names for duplicate detection. Strips suffixes, punctuation, casing.
// "Smith Roofing", "smith roofing", "Smith Roofing LLC", "Smith Roofing, Inc." → all match.
const normalizeCompany = (name) => {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/[.,&'"]/g, ' ')                              // strip punctuation
    .replace(/\b(llc|l\.l\.c|inc|incorporated|corp|corporation|co|company|ltd|limited|lp|llp|pllc|pc|pa|gp|the)\b/g, '') // strip suffixes
    .replace(/\s+/g, ' ')                                  // collapse whitespace
    .trim();
};

// Find an existing prospect that matches a candidate company name (loose match).
const findDuplicate = (allAccounts, companyName, excludeId = null) => {
  const target = normalizeCompany(companyName);
  if (!target) return null;
  return allAccounts.find(p => p.id !== excludeId && normalizeCompany(p.company) === target) || null;
};

// Higginbotham brand palette
const BRAND = {
  navy: '#1B2E5C',        // primary deep navy
  navyDark: '#0F1F42',    // sidebar / depth
  navyDarker: '#0A1530',
  teal: '#1FA8C1',        // accent blue/teal
  tealLight: '#5BC4D8',
  gold: '#C8A85A',        // subtle premium accent
  cream: '#F5F1E8',
  paper: '#FAFAF7',
};

// Parse a renewal date string flexibly. Returns Date or null.
const parseRenewal = (s) => {
  if (!s) return null;
  const t = s.trim();
  // Try MM/DD/YYYY, MM-DD-YYYY, YYYY-MM-DD
  let m = t.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) {
    let [_, mo, d, y] = m;
    if (y.length === 2) y = '20' + y;
    const dt = new Date(+y, +mo - 1, +d);
    return isNaN(dt) ? null : dt;
  }
  m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    const dt = new Date(+m[1], +m[2] - 1, +m[3]);
    return isNaN(dt) ? null : dt;
  }
  const dt = new Date(t);
  return isNaN(dt) ? null : dt;
};

const daysUntil = (date) => {
  if (!date) return null;
  const now = new Date(); now.setHours(0,0,0,0);
  const d = new Date(date); d.setHours(0,0,0,0);
  return Math.round((d - now) / 86400000);
};

const downloadCSV = (filename, rows) => {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const escape = (v) => {
    const s = (v ?? '').toString().replace(/"/g, '""');
    return /[",\n]/.test(s) ? `"${s}"` : s;
  };
  const csv = [headers.join(','), ...rows.map(r => headers.map(h => escape(r[h])).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
};

const seed = [];

// Migration: map old stage names to new ones for existing saved prospects
const OLD_TO_NEW_STAGE = {
  'Identified': 'Prospecting',
  'Researched': 'Prospecting',
  'First Contact': 'Meeting Scheduled',
  'Engaged': 'Meeting Scheduled',
  'Quoting': 'Submission Prep',
  'Proposal Sent': 'Proposal Meeting',
};
const migrateStage = (stage) => {
  if (STAGES.includes(stage)) return stage;
  return OLD_TO_NEW_STAGE[stage] || 'Prospecting';
};

// Apply all migrations to a single prospect record
const migrateAccount = (p) => {
  const { pinned, ...rest } = p; // Remove pinned field
  return {
    ...rest,
    stage: migrateStage(p.stage),
    policies: Array.isArray(p.policies) ? p.policies : []
  };
};

// Policy revenue helpers
const policyTotal = (policies) => (policies || []).reduce((sum, x) => sum + (Number(x.revenue) || 0), 0);
const policyEffectiveYear = (policy) => {
  if (!policy.effectiveDate) return null;
  const d = new Date(policy.effectiveDate);
  return isNaN(d.getTime()) ? null : d.getFullYear();
};
const isNewBusinessThisYear = (policy) => policyEffectiveYear(policy) === new Date().getFullYear();
// Compute the nearest upcoming renewal for an account.
// Checks both the top-level renewal field AND individual policy effective dates.
// The effective date is when a policy was FIRST written. The renewal is always
// the next annual anniversary that is >= 1 year from the original effective date.
// Policies marked as 'renewed' for a given year skip to the next year.
// Policies marked as 'nonrenewed' for a given year are excluded from renewals.
const getNextRenewalDays = (account) => {
  const candidates = [];

  // Policy effective dates — compute the next renewal based on policy term
  const today = new Date(); today.setHours(0,0,0,0);
  (account.policies || []).forEach(pol => {
    if (!pol.effectiveDate) return;
    const d = new Date(pol.effectiveDate);
    if (isNaN(d.getTime())) return;
    d.setHours(0,0,0,0);

    const termMonths = pol.termMonths || 12; // default to 12 months if not specified

    // Walk forward by policy term until we find the next
    // renewal that hasn't passed more than 7 days ago.
    // The first renewal is always at least 1 full term after effective date.
    let nextRenewal = new Date(d);
    nextRenewal.setMonth(nextRenewal.getMonth() + termMonths);
    nextRenewal.setHours(0,0,0,0);
    
    const minDays = -7; // allow 7 days overdue to still show
    const maxIterations = 20; // safety
    let iterations = 0;
    let cycleCount = 1; // track which renewal cycle this is
    
    while (iterations < maxIterations) {
      const daysAway = Math.round((nextRenewal - today) / 86400000);
      const renewalYear = nextRenewal.getFullYear(); // the year of this renewal

      // Check if this renewal year has been marked
      if (pol.renewalStatusYear === renewalYear) {
        if (pol.renewalStatus === 'renewed') {
          // Already renewed for this year — skip to next cycle
          nextRenewal = new Date(d);
          cycleCount++;
          nextRenewal.setMonth(nextRenewal.getMonth() + (termMonths * cycleCount));
          nextRenewal.setHours(0,0,0,0);
          iterations++;
          continue;
        }
        if (pol.renewalStatus === 'nonrenewed') {
          // Non-renewed — don't show this policy at all
          return;
        }
      }

      // If this renewal date is within our window, use it
      if (daysAway >= minDays) break;

      // Otherwise advance to next cycle
      cycleCount++;
      nextRenewal = new Date(d);
      nextRenewal.setMonth(nextRenewal.getMonth() + (termMonths * cycleCount));
      nextRenewal.setHours(0,0,0,0);
      iterations++;
    }

    const daysToRenewal = Math.round((nextRenewal - today) / 86400000);
    const label = `${nextRenewal.getMonth()+1}/${nextRenewal.getDate()}/${nextRenewal.getFullYear()}`;
    candidates.push({ days: daysToRenewal, source: 'policy', policyName: pol.name || 'Policy', policyId: pol.id, renewalYear: nextRenewal.getFullYear(), label });
  });

  if (candidates.length === 0) return null;
  // Return the soonest upcoming (closest to today, including slightly overdue)
  candidates.sort((a, b) => a.days - b.days);
  return candidates[0];
};

const formatMoney = (n) => {
  const num = Number(n) || 0;
  return '$' + num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
};

const addActivity = (account, type, text) => ({
  ...account,
  activity: [{ id: uid(), type, text, at: Date.now() }, ...(account.activity || [])]
});

export default function CRM() {
  // Swap tab title and favicon to HiggForce when on CRM page
  useEffect(() => {
    document.title = 'HiggForce';
    const favicon = document.querySelector("link[rel='icon']");
    if (favicon) favicon.href = '/higgforce/favicon.svg';
  }, []);

  const [view, setView] = useState('dashboard');
  const [accounts, setAccounts] = useState([]);
  const [calls, setCalls] = useState([]);
  const [reminders, setReminders] = useState([]);
  const [clientWork, setClientWork] = useState([]);
  const [prospectingTasks, setProspectingTasks] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [selected, setSelected] = useState(null);
  const [editing, setEditing] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [industryFilter, setIndustryFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [duplicateConflict, setDuplicateConflict] = useState(null);

  // Diagnostic state — for recovery if something goes wrong
  const [diagnostic, setDiagnostic] = useState({ rawProspects: null, loadError: null, allKeys: [], loadAttempted: false });
  const [savesEnabled, setSavesEnabled] = useState(false); // Only true after a confirmed-clean load
  const [showBackup, setShowBackup] = useState(false);

  // Load from local storage
  useEffect(() => {
    (async () => {
      const diag = { rawProspects: null, loadError: null, allKeys: [], loadAttempted: true };
      try {
        // Enumerate all keys (diagnostic)
        try {
          const list = await window.storage.list('').catch(() => null);
          if (list && Array.isArray(list.keys)) diag.allKeys = list.keys;
        } catch {}

        // Try to load prospects (also try legacy 'accounts' key for backwards compat)
        let p = null;
        try { p = await window.storage.get('prospects'); } catch (e) { diag.loadError = 'fetch error: ' + (e?.message || e); }
        if (!p || !p.value) { try { p = await window.storage.get('accounts'); } catch {} }

        if (p && p.value) {
          diag.rawProspects = p.value;
          try {
            const parsed = JSON.parse(p.value);
            if (Array.isArray(parsed)) {
              setAccounts(parsed.map(x => migrateAccount(x)));
              setSavesEnabled(true);
            } else {
              diag.loadError = 'Stored prospects is not an array';
            }
          } catch (e) {
            diag.loadError = 'JSON parse error: ' + (e?.message || e);
          }
        } else {
          // No saved data — use empty seed and enable saves
          setAccounts(seed);
          if (seed.length === 0) setSavesEnabled(true);
        }

        try { const c = await window.storage.get('calls'); if (c && c.value) setCalls(JSON.parse(c.value)); } catch {}
        try { const r = await window.storage.get('reminders'); if (r && r.value) setReminders(JSON.parse(r.value)); } catch {}
        try { const cw = await window.storage.get('clientWork'); if (cw && cw.value) setClientWork(JSON.parse(cw.value)); } catch {}
        try { const pt = await window.storage.get('prospectingTasks'); if (pt && pt.value) setProspectingTasks(JSON.parse(pt.value)); } catch {}
      } catch (e) {
        diag.loadError = 'Top-level: ' + (e?.message || e);
      }
      setDiagnostic(diag);
      setLoaded(true);
    })();
  }, []);

  // Save (only when explicitly enabled — protects against overwriting unloaded data)
  useEffect(() => { if (loaded && savesEnabled) window.storage.set('prospects', JSON.stringify(accounts)).catch(()=>{}); }, [accounts, loaded, savesEnabled]);
  useEffect(() => { if (loaded && savesEnabled) window.storage.set('calls', JSON.stringify(calls)).catch(()=>{}); }, [calls, loaded, savesEnabled]);
  useEffect(() => { if (loaded && savesEnabled) window.storage.set('reminders', JSON.stringify(reminders)).catch(()=>{}); }, [reminders, loaded, savesEnabled]);
  useEffect(() => { if (loaded && savesEnabled) window.storage.set('clientWork', JSON.stringify(clientWork)).catch(()=>{}); }, [clientWork, loaded, savesEnabled]);
  useEffect(() => { if (loaded && savesEnabled) window.storage.set('prospectingTasks', JSON.stringify(prospectingTasks)).catch(()=>{}); }, [prospectingTasks, loaded, savesEnabled]);

  // Wipe everything — local state + storage
  const clearAllData = async () => {
    setAccounts([]);
    setCalls([]);
    setReminders([]);
    setClientWork([]);
    try { await window.storage.set('prospects', JSON.stringify([])); } catch {}
    try { await window.storage.set('calls', JSON.stringify([])); } catch {}
    try { await window.storage.set('reminders', JSON.stringify([])); } catch {}
    try { await window.storage.set('clientWork', JSON.stringify([])); } catch {}
    setSavesEnabled(true);
  };

  // Generate backup JSON. Tries to trigger a download; if sandbox blocks it, returns the text for manual copy.
  const exportBackup = async () => {
    // Small delay to ensure any pending storage writes complete
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const backup = {
      version: 1,
      exportedAt: new Date().toISOString(),
      prospects: accounts,
      calls: calls,
      reminders: reminders,
      clientWork: clientWork,
      prospectingTasks: prospectingTasks
    };
    const json = JSON.stringify(backup, null, 2);

    // Try the download approach
    try {
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `higgforce-backup-${new Date().toISOString().slice(0,10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {}

    // Always return the JSON text so the modal can display it for copy/paste fallback
    return json;
  };

  // Import backup from a JSON file
  const importBackup = (file, mode) => {
    // mode: 'replace' or 'merge'
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          applyBackupData(e.target.result, mode);
          resolve();
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(new Error('Could not read file'));
      reader.readAsText(file);
    });
  };

  // Import backup from pasted JSON text
  const importBackupFromText = (text, mode) => {
    return new Promise((resolve, reject) => {
      try {
        applyBackupData(text, mode);
        resolve();
      } catch (err) {
        reject(err);
      }
    });
  };

  const applyBackupData = (jsonText, mode) => {
    const data = JSON.parse(jsonText);
    // Backwards compat: older backups may have used 'accounts' instead of 'prospects'
    if (!data.prospects && Array.isArray(data.accounts)) data.prospects = data.accounts;
    if (!data.prospects && !data.calls && !data.reminders) {
      throw new Error('Does not look like a HiggForce backup');
    }
    if (mode === 'replace') {
      if (Array.isArray(data.prospects)) setAccounts(data.prospects.map(x => migrateAccount(x)));
      if (Array.isArray(data.calls)) setCalls(data.calls);
      if (Array.isArray(data.reminders)) setReminders(data.reminders);
      if (Array.isArray(data.clientWork)) setClientWork(data.clientWork);
      if (Array.isArray(data.prospectingTasks)) setProspectingTasks(data.prospectingTasks);
    } else if (mode === 'merge') {
      if (Array.isArray(data.prospects)) {
        const existingNorm = new Set(accounts.map(p => normalizeCompany(p.company)));
        const newOnes = data.prospects.filter(p => !existingNorm.has(normalizeCompany(p.company)));
        setAccounts([...newOnes.map(x => migrateAccount(x)), ...accounts]);
      }
      if (Array.isArray(data.calls)) setCalls([...data.calls, ...calls]);
      if (Array.isArray(data.reminders)) setReminders([...data.reminders, ...reminders]);
      if (Array.isArray(data.clientWork)) setClientWork([...data.clientWork, ...clientWork]);
      if (Array.isArray(data.prospectingTasks)) setProspectingTasks([...data.prospectingTasks, ...prospectingTasks]);
    }
    setSavesEnabled(true);
  };

  // Internal: actually save without dup check (used after user confirms)
  const _saveAccountRaw = (p) => {
    if (p.id && accounts.find(x => x.id === p.id)) {
      const old = accounts.find(x => x.id === p.id);
      let updated = { ...p };
      if (old.stage !== p.stage) updated = addActivity(updated, 'stage', `Stage changed: ${old.stage} → ${p.stage}`);
      if (old.temp !== p.temp) updated = addActivity(updated, 'temp', `Temperature changed: ${old.temp} → ${p.temp}`);
      setAccounts(prev => prev.map(x => x.id === p.id ? updated : x));
    } else {
      const newP = addActivity({ ...p, id: uid(), createdAt: Date.now(), activity: [] }, 'created', 'Account added');
      setAccounts(prev => [newP, ...prev]);
    }
    setEditing(null);
    setShowNew(false);
  };

  // Merge incoming data into existing prospect (only fills empty fields, appends notes)
  const mergeIntoExisting = (existing, incoming) => {
    const merged = { ...existing };
    const fields = ['contact','phone','email','address','website','renewal'];
    const updatedFields = [];
    fields.forEach(f => {
      if (!existing[f] && incoming[f]) {
        merged[f] = incoming[f];
        updatedFields.push(f);
      }
    });
    // Notes: append rather than overwrite
    if (incoming.notes && incoming.notes.trim()) {
      const stamp = `--- Merged ${new Date().toLocaleDateString()} ---`;
      merged.notes = existing.notes ? `${existing.notes.trim()}\n\n${stamp}\n${incoming.notes.trim()}` : incoming.notes.trim();
      updatedFields.push('notes');
    }
    const summary = updatedFields.length ? `Merged: filled ${updatedFields.join(', ')}` : `Merged duplicate (no new info)`;
    return addActivity(merged, 'created', summary);
  };

  const saveAccount = (p) => {
    // For edits (has existing id), skip dup check
    if (p.id && accounts.find(x => x.id === p.id)) {
      _saveAccountRaw(p);
      return;
    }
    // For new, check for duplicate
    const dup = findDuplicate(accounts, p.company);
    if (dup) {
      setDuplicateConflict({ incoming: p, existing: dup, source: 'single' });
      return;
    }
    _saveAccountRaw(p);
  };

  const bulkSaveAccounts = (newOnes) => {
    // Filter out duplicates of existing prospects AND duplicates within the batch itself
    const fresh = [];
    const skipped = [];
    const seenInBatch = new Set();
    newOnes.forEach(p => {
      const norm = normalizeCompany(p.company);
      if (!norm) return;
      if (seenInBatch.has(norm)) { skipped.push(p.company); return; }
      const dup = findDuplicate(accounts, p.company);
      if (dup) { skipped.push(p.company); return; }
      seenInBatch.add(norm);
      fresh.push(p);
    });

    if (fresh.length > 0) {
      const stamped = fresh.map(p => addActivity({
        ...p,
        id: uid(),
        createdAt: Date.now(),
        activity: []
      }, 'created', 'Imported from list'));
      setAccounts(prev => [...stamped, ...prev]);
    }
    setShowImport(false);
    if (skipped.length > 0) {
      alert(`Imported ${fresh.length} new account${fresh.length===1?'':'s'}. Skipped ${skipped.length} duplicate${skipped.length===1?'':'s'}: ${skipped.slice(0,5).join(', ')}${skipped.length>5?'…':''}`);
    }
  };

  // Called when user resolves the duplicate conflict
  const resolveDuplicate = (action) => {
    if (!duplicateConflict) return;
    const { incoming, existing } = duplicateConflict;
    if (action === 'add') {
      // Force add even though it's a duplicate
      _saveAccountRaw(incoming);
    } else if (action === 'merge') {
      const merged = mergeIntoExisting(existing, incoming);
      setAccounts(prev => prev.map(x => x.id === existing.id ? merged : x));
      setEditing(null);
      setShowNew(false);
    }
    // 'cancel' just dismisses
    setDuplicateConflict(null);
  };

  const deleteAccount = (id) => {
    setAccounts(accounts.filter(x => x.id !== id));
    setSelected(null);
  };

  const togglePin = (id) => {
    // Pin functionality removed - kept for compatibility
  };

  // Mark a policy's renewal status for a given year ('renewed' or 'nonrenewed')
  const markPolicyRenewal = (accountId, policyId, status, renewalYear) => {
    setAccounts(prev => prev.map(p => {
      if (p.id !== accountId) return p;
      const updatedPolicies = (p.policies || []).map(pol => {
        if (pol.id !== policyId) return pol;
        return { ...pol, renewalStatus: status, renewalStatusYear: renewalYear };
      });
      const statusText = status === 'renewed' ? 'Renewed' : 'Non-renewed';
      const polName = (p.policies || []).find(pol => pol.id === policyId)?.name || 'Policy';
      return addActivity({ ...p, policies: updatedPolicies }, 'renewal', `${statusText}: ${polName} for ${renewalYear}`);
    }));
  };

  // Client management work CRUD
  const addClientWork = (work) => {
    setClientWork(prev => [{ id: uid(), createdAt: Date.now(), ...work }, ...prev]);
  };
  const updateClientWork = (id, updates) => {
    setClientWork(prev => prev.map(w => w.id === id ? { ...w, ...updates } : w));
  };
  const deleteClientWork = (id) => {
    setClientWork(prev => prev.filter(w => w.id !== id));
  };

  const logCall = (call) => {
    // If callDate is provided, use that date but preserve current time
    // If no callDate, use exact current timestamp
    let timestamp;
    if (call.callDate) {
      const now = new Date();
      const [year, month, day] = call.callDate.split('-').map(Number);
      const dateWithCurrentTime = new Date(year, month - 1, day, now.getHours(), now.getMinutes(), now.getSeconds());
      timestamp = dateWithCurrentTime.getTime();
    } else {
      timestamp = Date.now();
    }
    
    setCalls([{ ...call, id: uid(), createdAt: timestamp, loggedToSF: false }, ...calls]);
    
    if (call.accountId) {
      setAccounts(prev => prev.map(x => x.id === call.accountId
        ? addActivity(x, 'call', `Call logged: ${call.callType ? call.callType + ' — ' : ''}${call.outcome}${call.notes ? ' — ' + call.notes : ''}`)
        : x));
    }
  };
  const toggleCallLogged = (id) => setCalls(prev => prev.map(c => c.id === id ? { ...c, loggedToSF: !c.loggedToSF } : c));
  const deleteCall = (id) => setCalls(prev => prev.filter(c => c.id !== id));

  const logEmailDraft = (accountId, angle) => {
    setAccounts(prev => prev.map(x => x.id === accountId ? addActivity(x, 'email', `Email drafted: ${angle}`) : x));
  };

  const addReminder = (r) => {
    setReminders([{ ...r, id: uid(), createdAt: Date.now(), done: false }, ...reminders]);
    if (r.accountId) {
      setAccounts(prev => prev.map(x => x.id === r.accountId
        ? addActivity(x, 'reminder', `Reminder set: ${r.text}${r.due ? ' (due ' + r.due + ')' : ''}`)
        : x));
    }
  };
  const toggleReminder = (id) => setReminders(reminders.filter(r => r.id !== id));
  const deleteReminder = (id) => setReminders(reminders.filter(r => r.id !== id));

  // Prospecting tasks management
  const addProspectingTask = (task) => {
    setProspectingTasks([{ ...task, id: uid(), createdAt: Date.now(), done: false }, ...prospectingTasks]);
    if (task.accountId) {
      setAccounts(prev => prev.map(x => x.id === task.accountId
        ? addActivity(x, 'task', `Prospecting task: ${task.text}`)
        : x));
    }
  };
  const toggleProspectingTask = (id) => setProspectingTasks(prospectingTasks.map(t => t.id === id ? { ...t, done: !t.done } : t));
  const deleteProspectingTask = (id) => setProspectingTasks(prospectingTasks.filter(t => t.id !== id));

  // Dashboard = warm + pinned. Prospects page = everything.
  // Dashboard shows active pipeline (excludes Won/Lost)
  // Active pipeline = in one of the 6 pipeline stages (excludes Cold Prospect, Won, Lost)
  const dashboardAccounts = accounts.filter(p => PIPELINE_STAGES.some(s => s.key === p.stage));
  // All Prospects page shows active pipeline + cold prospects (excludes closed)
  const allAccountsForList = accounts.filter(p => p.stage !== 'Won' && p.stage !== 'Lost');
  const wonAccounts = accounts.filter(p => p.stage === 'Won');
  const lostAccounts = accounts.filter(p => p.stage === 'Lost');

  // Renewals page: all prospects with renewal date in the next 90 days (or up to 7 days overdue)
  // Checks both top-level renewal field and policy effective date anniversaries
  const renewalAccounts = accounts
    .map(p => {
      const r = getNextRenewalDays(p);
      return r ? { p, days: r.days, source: r.source, policyName: r.policyName, policyId: r.policyId, renewalYear: r.renewalYear, renewLabel: r.label } : null;
    })
    .filter(x => x !== null && x.days >= -7 && x.days <= 90)
    .sort((a, b) => a.days - b.days);

  if (!loaded) {
    return <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',fontFamily:'Georgia, serif',color:'#475569'}}>Loading…</div>;
  }

  return (
    <div className="app" style={styles.app}>
      <style>{globalCss}</style>

      {/* Sidebar (desktop) */}
      <aside className="sidebar sidebar-desktop-only" style={styles.sidebar}>
        <div style={styles.logo}>
          <div style={styles.logoMark}>
            <svg width="28" height="28" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
              {/* Outer circle ring */}
              <circle cx="50" cy="50" r="46" stroke="currentColor" strokeWidth="3.5" fill="none"/>
              {/* Left pillar - beveled top/bottom, slanted inner edge */}
              <path d="M 26 22 L 40 22 L 40 46 L 48 48 L 48 52 L 40 54 L 40 78 L 26 78 L 22 74 L 22 26 Z" fill="currentColor"/>
              {/* Right pillar - beveled top/bottom, slanted inner edge */}
              <path d="M 60 22 L 74 22 L 78 26 L 78 74 L 74 78 L 60 78 L 60 54 L 52 52 L 52 48 L 60 46 Z" fill="currentColor"/>
              {/* Upper crossbar segment */}
              <path d="M 40 44 L 60 44 L 60 50 L 40 50 Z" fill="currentColor"/>
              {/* Lower crossbar segment (offset) */}
              <path d="M 40 50 L 60 50 L 60 56 L 40 56 Z" fill="currentColor"/>
            </svg>
          </div>
          <div>
            <div style={styles.logoTitle}>Higginbotham</div>
            <div style={styles.logoSub}>HiggForce</div>
          </div>
        </div>

        <nav style={styles.nav}>
          <NavBtn icon={LayoutDashboard} label="Dashboard" active={view==='dashboard'} onClick={()=>setView('dashboard')} />
          <NavBtn icon={Trophy} label="Book of Business" active={view==='won'} onClick={()=>setView('won')} count={wonAccounts.length} />
          <NavBtn icon={Calendar} label="Renewals" active={view==='renewals'} onClick={()=>setView('renewals')} count={renewalAccounts.length} />
          <div style={{height:1, background:'rgba(255,255,255,0.08)', margin:'8px 0'}}/>
          <NavBtn icon={Users} label="Prospecting" active={view==='prospects'} onClick={()=>setView('prospects')} count={allAccountsForList.length} />
          <NavBtn icon={XCircle} label="Lost Accounts" active={view==='lost'} onClick={()=>setView('lost')} count={lostAccounts.length} />
          <div style={{height:1, background:'rgba(255,255,255,0.08)', margin:'8px 0'}}/>
          <NavBtn icon={Phone} label="Calls Report" active={view==='calls'} onClick={()=>setView('calls')} count={calls.filter(c=>!c.loggedToSF).length} highlight />
          <NavBtn icon={CheckSquare} label="To-Do List" active={view==='todo'} onClick={()=>setView('todo')} count={reminders.filter(r=>!r.done).length} />
        </nav>

        <div style={styles.sidebarFooter}>
          <div style={styles.statsBox}>
            <div style={styles.statRow}>
              <span>Active Pipeline</span>
              <span style={{color:'#5BC4D8',fontWeight:600}}>{formatMoney(accounts.filter(p => PIPELINE_STAGES.slice(1).some(s => s.key === p.stage)).reduce((sum, p) => sum + policyTotal(p.policies || []), 0))}</span>
            </div>
            <div style={styles.statRow}>
              <span>Book of Business</span>
              <span style={{color:'#86efac',fontWeight:600}}>{formatMoney(wonAccounts.reduce((sum, p) => sum + policyTotal(p.policies || []), 0))}</span>
            </div>
            <div style={styles.statRow}>
              <span>2026 New Business</span>
              <span style={{color:'#7dd3fc',fontWeight:600}}>{formatMoney(wonAccounts.reduce((sum, p) => sum + (p.policies || []).filter(pol => isNewBusinessThisYear(pol)).reduce((s, pol) => s + (Number(pol.revenue) || 0), 0), 0))}</span>
            </div>
          </div>
          <div style={{padding:'10px 0', borderTop:'1px solid rgba(255,255,255,0.08)', marginTop:8}}>
            <button onClick={() => setShowBackup(true)} style={{width:'100%', padding:'8px 10px', background:'rgba(255,255,255,0.06)', color:'#cbd5e1', border:'none', borderRadius:5, fontSize:11, fontWeight:600, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:6}}>
              <Download size={12}/>Backup / Restore
            </button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="app-main" style={styles.main}>
        <RecoveryBanner
          diagnostic={diagnostic}
          loaded={loaded}
          accountsCount={accounts.length}
          savesEnabled={savesEnabled}
          onRestore={(parsed) => {
            setAccounts(parsed.map(x => migrateAccount(x)));
            setSavesEnabled(true);
          }}
          onAcceptEmpty={() => setSavesEnabled(true)}
        />
        {view === 'dashboard' && (
          <Dashboard
            accounts={dashboardAccounts}
            allAccounts={accounts}
            reminders={reminders}
            clientWork={clientWork}
            onSelect={setSelected}
            onNew={() => setShowNew(true)}
            onImport={() => setShowImport(true)}
            onAddReminder={addReminder}
            onToggleReminder={toggleReminder}
            onDeleteReminder={deleteReminder}
            onAddClientWork={addClientWork}
            onUpdateClientWork={updateClientWork}
            onDeleteClientWork={deleteClientWork}
            onAssistantAction={(action) => {
              if (action.type === 'create') saveAccount(action.payload);
              if (action.type === 'reminder') addReminder(action.payload);
              if (action.type === 'call') logCall(action.payload);
            }}
            onUpdateStage={(id, stage) => saveAccount({ ...accounts.find(p => p.id === id), stage })}
            onMarkRenewal={markPolicyRenewal}
          />
        )}

        {view === 'prospects' && (
          <AccountsPage
            accounts={allAccountsForList}
            industryFilter={industryFilter}
            setIndustryFilter={setIndustryFilter}
            search={search}
            setSearch={setSearch}
            onSelect={setSelected}
            onNew={() => setShowNew(true)}
            onTogglePin={togglePin}
            onUpdateStage={(id, stage) => saveAccount({ ...accounts.find(p => p.id === id), stage })}
            prospectingTasks={prospectingTasks}
            onAddProspectingTask={addProspectingTask}
            onToggleProspectingTask={toggleProspectingTask}
            onDeleteProspectingTask={deleteProspectingTask}
          />
        )}

        {view === 'calls' && (
          <CallsReport calls={calls} onToggle={toggleCallLogged} onDelete={deleteCall} />
        )}

        {view === 'todo' && (
          <TodoPage
            reminders={reminders}
            onAdd={addReminder}
            onToggle={toggleReminder}
            onDelete={deleteReminder}
          />
        )}

        {view === 'renewals' && (
          <RenewalsPage
            renewals={renewalAccounts}
            onSelect={setSelected}
            onMarkRenewal={markPolicyRenewal}
          />
        )}

        {view === 'won' && (
          <BookOfBusiness
            accounts={wonAccounts}
            onSelect={setSelected}
          />
        )}

        {view === 'lost' && (
          <ClosedAccountsPage
            title="Lost Accounts"
            subtitle="Didn't go our way"
            accentColor="#dc2626"
            AccentIcon={XCircle}
            accounts={lostAccounts}
            onSelect={setSelected}
          />
        )}
      </main>

      {/* Detail modal */}
      {selected && (
        <AccountDetail
          account={accounts.find(p => p.id === selected)}
          onClose={() => setSelected(null)}
          onDelete={deleteAccount}
          onTogglePin={togglePin}
          onLogCall={logCall}
          onAddReminder={addReminder}
          onLogEmailDraft={logEmailDraft}
          onUpdateStage={(stage) => saveAccount({ ...accounts.find(p=>p.id===selected), stage })}
          onUpdateTemp={(temp) => saveAccount({ ...accounts.find(p=>p.id===selected), temp })}
          onSaveAccount={saveAccount}
        />
      )}

      {showNew && (
        <AccountForm
          initial={null}
          onSave={saveAccount}
          onClose={() => { setShowNew(false); }}
        />
      )}

      {showImport && (
        <ImportModal
          onImport={bulkSaveAccounts}
          onClose={() => setShowImport(false)}
        />
      )}

      {duplicateConflict && (
        <DuplicateModal
          incoming={duplicateConflict.incoming}
          existing={duplicateConflict.existing}
          onResolve={resolveDuplicate}
        />
      )}

      {showBackup && (
        <BackupModal
          accountsCount={accounts.length}
          callsCount={calls.length}
          remindersCount={reminders.length}
          clientWorkCount={clientWork.length}
          prospectingTasksCount={prospectingTasks.length}
          onExport={exportBackup}
          onImport={importBackup}
          onImportText={importBackupFromText}
          onClearAll={clearAllData}
          onClose={() => setShowBackup(false)}
        />
      )}

      {/* Mobile bottom tab bar */}
      <nav className="mobile-tabbar">
        <button className={view==='dashboard' ? 'active' : ''} onClick={() => setView('dashboard')}>
          <LayoutDashboard size={18} strokeWidth={1.75}/>
          <span>Home</span>
        </button>
        <button className={view==='won' ? 'active' : ''} onClick={() => setView('won')}>
          <Trophy size={18} strokeWidth={1.75}/>
          <span>Book</span>
          {wonAccounts.length > 0 && (
            <span className="badge">{wonAccounts.length}</span>
          )}
        </button>
        <button className={view==='renewals' ? 'active' : ''} onClick={() => setView('renewals')}>
          <Calendar size={18} strokeWidth={1.75}/>
          <span>Renewals</span>
          {renewalAccounts.length > 0 && (
            <span className="badge">{renewalAccounts.length}</span>
          )}
        </button>
        <button className={view==='prospects' ? 'active' : ''} onClick={() => setView('prospects')}>
          <Users size={18} strokeWidth={1.75}/>
          <span>Prospects</span>
        </button>
        <button className={view==='lost' ? 'active' : ''} onClick={() => setView('lost')}>
          <XCircle size={18} strokeWidth={1.75}/>
          <span>Lost</span>
          {lostAccounts.length > 0 && (
            <span className="badge">{lostAccounts.length}</span>
          )}
        </button>
        <button className={view==='calls' ? 'active' : ''} onClick={() => setView('calls')}>
          <Phone size={18} strokeWidth={1.75}/>
          <span>Calls</span>
          {calls.filter(c=>!c.loggedToSF).length > 0 && (
            <span className="badge">{calls.filter(c=>!c.loggedToSF).length}</span>
          )}
        </button>
        <button className={view==='todo' ? 'active' : ''} onClick={() => setView('todo')}>
          <CheckSquare size={18} strokeWidth={1.75}/>
          <span>To-Do</span>
          {reminders.filter(r=>!r.done).length > 0 && (
            <span className="badge">{reminders.filter(r=>!r.done).length}</span>
          )}
        </button>
      </nav>
    </div>
  );
}

/* ========== RECOVERY BANNER ========== */
function RecoveryBanner({ diagnostic, loaded, accountsCount, savesEnabled, onRestore, onAcceptEmpty }) {
  const [showRaw, setShowRaw] = useState(false);
  if (!loaded) return null;

  // Case 1: Saves are NOT enabled — means storage had something but we're holding off auto-saving
  // This is the dangerous case. Show recovery options.
  if (!savesEnabled) {
    let parsedRecoverable = null;
    if (diagnostic.rawProspects) {
      try {
        const p = JSON.parse(diagnostic.rawProspects);
        if (Array.isArray(p) && p.length > 0) parsedRecoverable = p;
      } catch {}
    }

    return (
      <div style={{margin:'16px 32px 0', padding:16, background:'#fef3c7', border:'2px solid #f59e0b', borderRadius:10}}>
        <div style={{display:'flex',alignItems:'flex-start',gap:12}}>
          <AlertCircle size={20} style={{color:'#b45309',flexShrink:0,marginTop:2}}/>
          <div style={{flex:1, minWidth:0}}>
            <div style={{fontWeight:700, fontSize:14, color:'#78350f', marginBottom:6}}>
              ⚠️ Recovery Mode — Auto-save is disabled until you choose what to do
            </div>
            <div style={{fontSize:13, color:'#78350f', lineHeight:1.5, marginBottom:10}}>
              {diagnostic.loadError && (<div><strong>Load error:</strong> {diagnostic.loadError}</div>)}
              {diagnostic.allKeys.length > 0 && (<div>Storage keys found: <code>{diagnostic.allKeys.join(', ')}</code></div>)}
              {parsedRecoverable && <div><strong>Found {parsedRecoverable.length} recoverable accounts in storage.</strong></div>}
              {!diagnostic.rawProspects && <div>No accounts key found in storage. Storage may be empty, or your data may be in a different artifact instance.</div>}
              {diagnostic.rawProspects && !parsedRecoverable && <div>Found data but couldn't parse it as an account list.</div>}
            </div>

            <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:10}}>
              {parsedRecoverable && (
                <button onClick={() => onRestore(parsedRecoverable)} style={{...styles.btnPrimary, background:'#16a34a'}}>
                  <Check size={14}/>Restore {parsedRecoverable.length} accounts
                </button>
              )}
              <button onClick={onAcceptEmpty} style={styles.btnSecondary}>
                Start Fresh (accept empty)
              </button>
              {diagnostic.rawProspects && (
                <button onClick={() => setShowRaw(!showRaw)} style={styles.btnSecondary}>
                  {showRaw ? 'Hide' : 'Show'} raw data
                </button>
              )}
            </div>

            {showRaw && diagnostic.rawProspects && (
              <div>
                <div style={{fontSize:11, color:'#78350f', marginBottom:4, fontWeight:600}}>Copy this and save it somewhere safe (notes app, email yourself):</div>
                <textarea
                  readOnly
                  value={diagnostic.rawProspects}
                  style={{width:'100%', minHeight:120, fontFamily:'Menlo,monospace', fontSize:11, padding:10, border:'1px solid #fbbf24', borderRadius:6, background:'#fffbeb', color:'#451a03'}}
                  onFocus={e => e.target.select()}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return null;
}

/* ========== NAV ========== */
function NavBtn({ icon: Icon, label, active, onClick, count, highlight }) {
  return (
    <button onClick={onClick} style={{...styles.navBtn, ...(active ? styles.navBtnActive : {})}}>
      <Icon size={16} strokeWidth={1.75} />
      <span style={{flex:1,textAlign:'left'}}>{label}</span>
      {count !== undefined && count > 0 && (
        <span style={{...styles.navCount, ...(highlight ? {background:'#dc2626',color:'#fff'} : {})}}>{count}</span>
      )}
    </button>
  );
}

/* ========== DASHBOARD (KANBAN PIPELINE) ========== */
function Dashboard({ accounts, allAccounts, reminders, clientWork, onSelect, onNew, onImport, onAddReminder, onToggleReminder, onDeleteReminder, onAddClientWork, onUpdateClientWork, onDeleteClientWork, onAssistantAction, onUpdateStage, onMarkRenewal }) {
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  
  // Filter reminders: show overdue, undated, today, and anything due within the next 30 days
  const todayDate = new Date();
  todayDate.setHours(0, 0, 0, 0);
  const thirtyDaysOut = new Date(todayDate);
  thirtyDaysOut.setDate(thirtyDaysOut.getDate() + 30);
  
  const dueReminders = reminders
    .filter(r => {
      if (r.done) return false;
      if (!r.due) return true; // undated always show
      const dueDate = new Date(r.due);
      dueDate.setHours(0, 0, 0, 0);
      return dueDate <= thirtyDaysOut;
    })
    .sort((a, b) => {
      // Group order: 0 = overdue, 1 = undated, 2 = upcoming
      const bucket = (r) => {
        if (!r.due) return 1; // undated
        const d = new Date(r.due); d.setHours(0,0,0,0);
        return d < todayDate ? 0 : 2; // overdue or upcoming
      };
      const ba = bucket(a), bb = bucket(b);
      if (ba !== bb) return ba - bb;
      // Within upcoming: sort soonest first
      if (ba === 2) return new Date(a.due) - new Date(b.due);
      // Within overdue: most overdue first
      if (ba === 0) return new Date(a.due) - new Date(b.due);
      return 0;
    });
  
  const [todoText, setTodoText] = useState('');
  const [todoDue, setTodoDue] = useState('');

  const addTodo = () => {
    const v = todoText.trim();
    if (!v) return;
    onAddReminder({ text: v, due: todoDue, company: '' });
    setTodoText('');
    setTodoDue('');
  };

  // Renewal alerts: any prospect with renewal in next 90 days
  // Checks both top-level renewal field and policy effective date anniversaries
  const renewals = allAccounts
    .map(p => {
      const r = getNextRenewalDays(p);
      return r ? { p, days: r.days, renewLabel: r.label, source: r.source, policyName: r.policyName, policyId: r.policyId, renewalYear: r.renewalYear } : null;
    })
    .filter(x => x !== null && x.days >= -7 && x.days <= 30)
    .sort((a, b) => a.days - b.days);

  // Group accounts by stage, sort by revenue (highest first), then alphabetically
  const byStage = Object.fromEntries(PIPELINE_STAGES.map(s => [s.key, []]));
  accounts.forEach(p => {
    if (byStage[p.stage]) byStage[p.stage].push(p);
  });
  Object.keys(byStage).forEach(k => {
    byStage[k].sort((a, b) => {
      // Sort by target close date: soonest first, nulls last
      const aDate = a.targetCloseDate ? new Date(a.targetCloseDate).getTime() : Infinity;
      const bDate = b.targetCloseDate ? new Date(b.targetCloseDate).getTime() : Infinity;
      
      if (aDate !== bDate) return aDate - bDate;
      
      // If dates are equal (or both null), sort by revenue
      const revDiff = policyTotal(b.policies) - policyTotal(a.policies);
      return revDiff !== 0 ? revDiff : a.company.localeCompare(b.company);
    });
  });

  return (
    <div className="page-pad" style={{...styles.page, maxWidth:'none', padding: '40px 32px 80px'}}>
      <header className="page-header" style={styles.pageHeader}>
        <div>
          <div style={styles.eyebrow}>{today}</div>
          <h1 style={styles.h1}>Dashboard</h1>
        </div>
        <div style={{display:'flex',gap:8}}>
          <button onClick={onImport} style={styles.btnSecondary}><Upload size={14}/>Import Accounts</button>
          <button onClick={onNew} style={styles.btnPrimary}><Plus size={15} strokeWidth={2}/>New Account</button>
        </div>
      </header>

      {/* To-do list */}
      <section style={{marginTop:24}}>
        <h2 style={styles.h2}><Check size={15} style={{color:BRAND.teal}}/>To-Do — Next 30 Days <span style={styles.h2Count}>{dueReminders.length}</span></h2>

        {/* Inline add */}
        <div style={{display:'flex',gap:8,marginBottom:10,flexWrap:'wrap'}}>
          <input
            value={todoText}
            onChange={e => setTodoText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addTodo(); }}
            placeholder="Add a task — e.g. Call John at John Smith Plumbing"
            style={{...styles.input, flex:'1 1 280px'}}
          />
          <input
            type="date"
            value={todoDue}
            onChange={e => setTodoDue(e.target.value)}
            style={{...styles.input, flex:'0 0 160px'}}
            title="Due date (optional)"
          />
          <button onClick={addTodo} disabled={!todoText.trim()} style={{...styles.btnPrimary, opacity: todoText.trim() ? 1 : 0.5}}>
            <Plus size={14}/>Add
          </button>
        </div>

        {dueReminders.length === 0 ? (
          <div style={{...styles.empty, padding:'20px'}}>No open tasks. Add one above or set reminders from an account's drawer.</div>
        ) : (
          <div style={styles.remindersList}>
            {dueReminders.map(r => (
              <div key={r.id} style={styles.reminder}>
                <button onClick={() => onToggleReminder(r.id)} style={styles.checkbox}><div style={styles.checkboxInner}/></button>
                <div style={{flex:1}}>
                  <div style={{fontWeight:500,color:'#0f172a'}}>{r.text}</div>
                  {(r.company || r.due) && <div style={{fontSize:12,color:'#64748b',marginTop:2}}>{r.company}{r.company && r.due && ' · '}{r.due && `due ${r.due}`}</div>}
                </div>
                <button onClick={() => onDeleteReminder(r.id)} style={styles.iconBtn}><X size={14}/></button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Renewals */}
      {renewals.length > 0 && (
        <section style={{marginTop:24}}>
          <h2 style={styles.h2}><Clock size={15} style={{color:'#b45309'}}/>Renewals — Next 30 Days <span style={styles.h2Count}>{renewals.length}</span></h2>
          <div style={styles.renewalList}>
            {renewals.map(({ p, days, renewLabel, source, policyName, policyId, renewalYear }) => (
              <div key={`${p.id}-${policyId||'top'}`} className="card" style={styles.renewalRow}>
                <div style={{flex:1,minWidth:0,cursor:'pointer'}} onClick={() => onSelect(p.id)}>
                  <div style={{fontWeight:600,color:'#0f172a',fontSize:14}}>{p.company}</div>
                  <div style={{fontSize:12,color:'#64748b',marginTop:2}}>
                    {p.industry} · renews {renewLabel || p.renewal}
                    {source === 'policy' && policyName && <span style={{fontStyle:'italic'}}> ({policyName})</span>}
                  </div>
                </div>
                <div style={{display:'flex',alignItems:'center',gap:8,flexShrink:0}}>
                  {source === 'policy' && policyId && renewalYear && (
                    <>
                      <button
                        onClick={(e) => { e.stopPropagation(); onMarkRenewal(p.id, policyId, 'renewed', renewalYear); }}
                        style={{padding:'4px 10px', fontSize:11, fontWeight:600, background:'#dcfce7', color:'#166534', border:'1px solid #86efac', borderRadius:5, cursor:'pointer', display:'flex', alignItems:'center', gap:4}}
                        title="Mark as renewed — resets countdown to next year"
                      ><Check size={12}/>Renewed</button>
                      <button
                        onClick={(e) => { e.stopPropagation(); onMarkRenewal(p.id, policyId, 'nonrenewed', renewalYear); }}
                        style={{padding:'4px 10px', fontSize:11, fontWeight:600, background:'#fef2f2', color:'#991b1b', border:'1px solid #fecaca', borderRadius:5, cursor:'pointer', display:'flex', alignItems:'center', gap:4}}
                        title="Mark as non-renewed — removes from renewals"
                      ><X size={12}/>Non-renewed</button>
                    </>
                  )}
                  <div style={{...styles.daysPill, ...(days <= 30 ? {background:'#fee2e2',color:'#b91c1c'} : days <= 60 ? {background:'#fef3c7',color:'#92400e'} : {background:'#dbeafe',color:'#1e40af'})}}>
                    {days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? 'today' : `in ${days}d`}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Client Management kanban */}
      <ClientManagementSection
        clientWork={clientWork}
        onAdd={onAddClientWork}
        onUpdate={onUpdateClientWork}
        onDelete={onDeleteClientWork}
      />

      {/* Kanban pipeline */}
      <section style={{marginTop:32}}>
        {(() => {
          const totalPipelineRev = accounts.reduce((sum, p) => sum + policyTotal(p.policies), 0);
          return (
            <>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:4,flexWrap:'wrap',gap:8}}>
                <h2 style={{...styles.h2,margin:0}}><LayoutDashboard size={15} style={{color:BRAND.navy}}/>The Pipeline</h2>
                {totalPipelineRev > 0 && (
                  <span style={{fontSize:14, fontWeight:700, color:BRAND.navy, fontFamily:'Georgia, serif'}}>Pipeline Total: {formatMoney(totalPipelineRev)}</span>
                )}
              </div>
              <div style={{...styles.subtitle, marginBottom:14}}>{accounts.length} active accounts across {PIPELINE_STAGES.length} stages.</div>
            </>
          );
        })()}
        <div className="kanban-scroll" style={styles.kanbanContainer}>
          {PIPELINE_STAGES.map((stage, idx) => {
            const stageCards = byStage[stage.key] || [];
            const stageRevenue = stageCards.reduce((sum, p) => sum + policyTotal(p.policies), 0);
            return (
              <div key={stage.key} style={styles.kanbanColumn}>
                <div style={styles.kanbanColHeader}>
                  <div style={{display:'flex',alignItems:'center',gap:6}}>
                    <span style={{...styles.kanbanStageNum, background: getStageColor(idx).bg, color: getStageColor(idx).fg}}>{idx + 1}</span>
                    <div>
                      <div style={styles.kanbanStageTitle}>{stage.key}</div>
                      <div style={styles.kanbanStageSub}>{stage.sf}</div>
                    </div>
                  </div>
                  <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:2}}>
                    <span style={styles.kanbanCount}>{stageCards.length}</span>
                    {stageRevenue > 0 && (
                      <span style={{fontSize:11, fontWeight:700, color:BRAND.navy, fontFamily:'Georgia, serif'}}>{formatMoney(stageRevenue)}</span>
                    )}
                  </div>
                </div>
                <div style={styles.kanbanCardList}>
                  {stageCards.length === 0 ? (
                    <div style={styles.kanbanEmpty}>No accounts</div>
                  ) : (
                    stageCards.map(p => (
                      <KanbanCard
                        key={p.id}
                        account={p}
                        onClick={() => onSelect(p.id)}
                        onMoveStage={(newStage) => onUpdateStage(p.id, newStage)}
                      />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

/* ========== CLIENT MANAGEMENT SECTION (Dashboard) ========== */
function ClientManagementSection({ clientWork, onAdd, onUpdate, onDelete }) {
  const [adding, setAdding] = useState(null); // stage being added to
  const [newTitle, setNewTitle] = useState('');
  const [newDue, setNewDue] = useState('');
  const [newNotes, setNewNotes] = useState('');

  const byStage = Object.fromEntries(CLIENT_MGMT_STAGES.map(s => [s, []]));
  clientWork.forEach(w => {
    if (byStage[w.stage]) byStage[w.stage].push(w);
  });
  Object.keys(byStage).forEach(k => byStage[k].sort((a, b) => {
    // Sort by due date asc (no date last), then by title
    const ad = a.due ? new Date(a.due).getTime() : Infinity;
    const bd = b.due ? new Date(b.due).getTime() : Infinity;
    if (ad !== bd) return ad - bd;
    return (a.title || '').localeCompare(b.title || '');
  }));

  const startAdd = (stage) => {
    setAdding(stage);
    setNewTitle('');
    setNewDue('');
    setNewNotes('');
  };

  const submitAdd = () => {
    if (!newTitle.trim()) return;
    onAdd({ title: newTitle.trim(), stage: adding, due: newDue, notes: newNotes.trim() });
    setAdding(null);
    setNewTitle('');
    setNewDue('');
    setNewNotes('');
  };

  return (
    <section style={{marginTop:36}}>
      <h2 style={styles.h2}><Briefcase size={15} style={{color:BRAND.teal}}/>Client Management <span style={styles.h2Count}>{clientWork.length}</span></h2>
      
      <div className="kanban-scroll" style={styles.kanbanContainer}>
        {CLIENT_MGMT_STAGES.map((stage, idx) => {
          const cards = byStage[stage] || [];
          const color = getClientStageColor(idx);
          
          return (
            <div key={stage} style={styles.kanbanColumn}>
              <div style={styles.kanbanColHeader}>
                <div style={{display:'flex', alignItems:'center', gap:8}}>
                  <span style={{width:8, height:8, borderRadius:4, background:color.fg, flexShrink:0}}/>
                  <div style={styles.kanbanStageTitle}>{stage}</div>
                </div>
                <span style={styles.kanbanCount}>{cards.length}</span>
              </div>
              
              <div style={styles.kanbanCardList}>
                {cards.map(w => (
                  <ClientWorkCard
                    key={w.id}
                    work={w}
                    onMoveStage={(newStage) => onUpdate(w.id, { stage: newStage })}
                    onUpdate={(updates) => onUpdate(w.id, updates)}
                    onDelete={() => onDelete(w.id)}
                  />
                ))}
                
                {adding === stage ? (
                  <div style={{padding:10, background:'#fff', border:'2px solid '+BRAND.teal, borderRadius:8, display:'flex', flexDirection:'column', gap:6}}>
                    <input
                      autoFocus
                      value={newTitle}
                      onChange={e => setNewTitle(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitAdd(); } if (e.key === 'Escape') setAdding(null); }}
                      placeholder="Title"
                      style={{...styles.input, padding:'6px 8px', fontSize:12}}
                    />
                    <input
                      type="date"
                      value={newDue}
                      onChange={e => setNewDue(e.target.value)}
                      style={{...styles.input, padding:'6px 8px', fontSize:12}}
                    />
                    <textarea
                      value={newNotes}
                      onChange={e => setNewNotes(e.target.value)}
                      placeholder="Notes (optional)"
                      rows={2}
                      style={{...styles.input, padding:'6px 8px', fontSize:12, fontFamily:'inherit', resize:'vertical'}}
                    />
                    <div style={{display:'flex', gap:6}}>
                      <button onClick={submitAdd} disabled={!newTitle.trim()} style={{...styles.btnPrimary, padding:'5px 10px', fontSize:11, opacity: newTitle.trim() ? 1 : 0.5}}>Save</button>
                      <button onClick={() => setAdding(null)} style={{...styles.btnSecondary, padding:'5px 10px', fontSize:11}}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => startAdd(stage)} style={{padding:'8px', background:'transparent', border:'1px dashed #cbd5e1', borderRadius:6, color:'#64748b', fontSize:11, fontWeight:500, cursor:'pointer'}}>
                    + Add task
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ClientWorkCard({ work, onMoveStage, onUpdate, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(work.title);
  const [editDue, setEditDue] = useState(work.due || '');
  const [editNotes, setEditNotes] = useState(work.notes || '');
  const [showNotes, setShowNotes] = useState(false);
  
  const due = work.due ? new Date(work.due) : null;
  const today = new Date(); today.setHours(0,0,0,0);
  const daysUntilDue = due ? Math.round((due.getTime() - today.getTime()) / 86400000) : null;
  const dueColor = daysUntilDue === null ? null
    : daysUntilDue < 0 ? { bg:'#fee2e2', fg:'#b91c1c' }
    : daysUntilDue === 0 ? { bg:'#fef3c7', fg:'#92400e' }
    : daysUntilDue <= 3 ? { bg:'#fef3c7', fg:'#92400e' }
    : { bg:'#f1f5f9', fg:'#475569' };

  const startEdit = () => {
    setEditTitle(work.title);
    setEditDue(work.due || '');
    setEditNotes(work.notes || '');
    setEditing(true);
  };

  const saveEdit = () => {
    if (!editTitle.trim()) return;
    onUpdate({ title: editTitle.trim(), due: editDue, notes: editNotes.trim() });
    setEditing(false);
  };

  const cancelEdit = () => {
    setEditing(false);
  };

  if (editing) {
    return (
      <div style={{padding:10, background:'#fff', border:'2px solid '+BRAND.teal, borderRadius:8, display:'flex', flexDirection:'column', gap:6}}>
        <input
          autoFocus
          value={editTitle}
          onChange={e => setEditTitle(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEdit(); } if (e.key === 'Escape') cancelEdit(); }}
          placeholder="Title"
          style={{...styles.input, padding:'6px 8px', fontSize:12}}
        />
        <input
          type="date"
          value={editDue}
          onChange={e => setEditDue(e.target.value)}
          style={{...styles.input, padding:'6px 8px', fontSize:12}}
        />
        <textarea
          value={editNotes}
          onChange={e => setEditNotes(e.target.value)}
          placeholder="Notes (optional)"
          rows={2}
          style={{...styles.input, padding:'6px 8px', fontSize:12, fontFamily:'inherit', resize:'vertical'}}
        />
        <div style={{display:'flex', gap:6}}>
          <button onClick={saveEdit} disabled={!editTitle.trim()} style={{...styles.btnPrimary, padding:'5px 10px', fontSize:11, opacity: editTitle.trim() ? 1 : 0.5}}>Save</button>
          <button onClick={cancelEdit} style={{...styles.btnSecondary, padding:'5px 10px', fontSize:11}}>Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{padding:10, background:'#fff', border:'1px solid #e2e8f0', borderRadius:8, display:'flex', flexDirection:'column', gap:6}}>
      <div style={{display:'flex', justifyContent:'space-between', gap:6, alignItems:'flex-start'}}>
        <div onClick={() => setShowNotes(!showNotes)} style={{flex:1, cursor:'pointer', fontSize:12, fontWeight:600, color:'#0f172a', lineHeight:1.4}}>
          {work.title}
        </div>
        <div style={{display:'flex', gap:2}}>
          <button onClick={startEdit} style={{...styles.iconBtn, padding:2, color:'#64748b'}} title="Edit">
            <Edit2 size={12}/>
          </button>
          <button onClick={onDelete} style={{...styles.iconBtn, padding:2, color:'#94a3b8'}} title="Delete">
            <X size={13}/>
          </button>
        </div>
      </div>

      {due && (
        <div style={{...dueColor && {background: dueColor.bg, color: dueColor.fg}, fontSize:10, fontWeight:600, padding:'3px 6px', borderRadius:4, alignSelf:'flex-start'}}>
          {daysUntilDue < 0 ? `${Math.abs(daysUntilDue)}d overdue` : daysUntilDue === 0 ? 'Due today' : daysUntilDue === 1 ? 'Due tomorrow' : `${daysUntilDue}d`}
        </div>
      )}

      {showNotes && work.notes && (
        <div style={{fontSize:11, color:'#475569', whiteSpace:'pre-wrap', lineHeight:1.5, padding:'6px 0', borderTop:'1px solid #f1f5f9'}}>{work.notes}</div>
      )}
    </div>
  );
}

function getClientStageColor(idx) {
  const colors = [
    { bg:'#fef3c7', fg:'#b45309' }, // Policy Changes — amber
    { bg:'#e0e7ff', fg:'#3730a3' }, // Additional Quote — indigo
    { bg:'#fce7f3', fg:'#9d174d' }, // In Underwriting — pink
    { bg:'#dbeafe', fg:'#1e40af' }, // Awaiting Client Decision — blue
  ];
  return colors[idx % colors.length];
}

// Consistent color accents across the 6 pipeline stages
function getStageColor(idx) {
  const colors = [
    { bg:'#dbeafe', fg:'#1e40af' }, // Prospecting — blue
    { bg:'#e0e7ff', fg:'#3730a3' }, // Meeting Scheduled — indigo
    { bg:'#fef3c7', fg:'#92400e' }, // Submission Prep — amber
    { bg:'#fed7aa', fg:'#9a3412' }, // Underwriting — orange
    { bg:'#f3e8ff', fg:'#6b21a8' }, // Proposal Meeting — purple
    { bg:'#dcfce7', fg:'#166534' }, // Forecasting - Close — green
  ];
  return colors[idx] || colors[0];
}

function KanbanCard({ account, onClick, onMoveStage }) {
  const t = TEMPS[account.temp];
  const currentIdx = PIPELINE_STAGES.findIndex(s => s.key === account.stage);
  const canMovePrev = currentIdx > 0;
  const canMoveNext = currentIdx < PIPELINE_STAGES.length - 1;
  const revenue = policyTotal(account.policies);

  return (
    <div onClick={onClick} className="card" style={{...styles.kanbanCard, borderLeftColor: t.border, cursor:'pointer'}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:6,marginBottom:6}}>
        <span style={{...styles.tempPill, background:t.bg, color:t.text, fontSize:9, padding:'1px 6px'}}>
          <span style={{...styles.tempDot, background:t.dot, width:5, height:5}}/>{t.label}
        </span>
        <span style={{fontSize:12, fontWeight:700, color: revenue > 0 ? BRAND.navy : '#94a3b8', fontFamily:'Georgia, serif'}}>
          {revenue > 0 ? formatMoney(revenue) : '$0'}
        </span>
      </div>
      <div style={{fontFamily:'Georgia, serif', fontSize:14, fontWeight:600, color:'#0f172a', lineHeight:1.25, marginBottom:4}}>
        {account.company}
      </div>
      <div style={{fontSize:10, color:'#94a3b8', textTransform:'uppercase', letterSpacing:0.4, marginBottom:8}}>
        {account.industry}
      </div>
      {account.targetCloseDate && (() => {
        // Direct string manipulation - YYYY-MM-DD format
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const parts = account.targetCloseDate.split('-'); // [YYYY, MM, DD]
        const monthIndex = Number(parts[1]) - 1; // Convert '06' to 5
        const day = Number(parts[2]); // Convert '01' to 1
        const year = parts[0]; // Keep as string
        return (
          <div style={{fontSize:10, fontWeight:600, color:'#1e40af', background:'#dbeafe', padding:'3px 6px', borderRadius:4, marginBottom:6, display:'inline-block'}}>
            Target: {monthNames[monthIndex]} {day}, {year}
          </div>
        );
      })()}
      {account.contact && <div style={{fontSize:11,color:'#475569',display:'flex',alignItems:'center',gap:5,marginBottom:3}}><User size={10}/>{account.contact}</div>}
      {account.phone && <div style={{fontSize:11,color:'#475569',display:'flex',alignItems:'center',gap:5,marginBottom:3}}><Phone size={10}/>{account.phone}</div>}

      {/* Stage move controls */}
      <div style={{display:'flex',gap:4,marginTop:10,paddingTop:8,borderTop:'1px dashed #e2e8f0'}}>
        <button
          onClick={(e) => { e.stopPropagation(); if (canMovePrev) onMoveStage(PIPELINE_STAGES[currentIdx-1].key); }}
          disabled={!canMovePrev}
          style={{...styles.kanbanMoveBtn, opacity: canMovePrev ? 1 : 0.3}}
          title="Previous stage"
        >←</button>
        <button
          onClick={(e) => { e.stopPropagation(); if (canMoveNext) onMoveStage(PIPELINE_STAGES[currentIdx+1].key); }}
          disabled={!canMoveNext}
          style={{...styles.kanbanMoveBtn, opacity: canMoveNext ? 1 : 0.3}}
          title="Next stage"
        >→</button>
        <select
          value={account.stage}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => { e.stopPropagation(); onMoveStage(e.target.value); }}
          style={{...styles.kanbanStageSelect}}
        >
          {PIPELINE_STAGES.map(s => <option key={s.key} value={s.key}>{s.key}</option>)}
          <option disabled>──────────</option>
          <option value="Cold Prospect">← Cold Prospect (demote)</option>
          <option value="Won">Won (close pipeline)</option>
          <option value="Lost">Lost (close pipeline)</option>
        </select>
      </div>
    </div>
  );
}

/* ========== PROSPECTS PAGE ========== */
function AccountsPage({ accounts, industryFilter, setIndustryFilter, search, setSearch, onSelect, onNew, onTogglePin, onUpdateStage, prospectingTasks, onAddProspectingTask, onToggleProspectingTask, onDeleteProspectingTask }) {
  const [sortBy, setSortBy] = useState('name'); // name | industry | stage | temp
  const [stageFilter, setStageFilter] = useState('All');
  const [addingTaskFor, setAddingTaskFor] = useState(null);
  const [newTaskText, setNewTaskText] = useState('');

  const filtered = accounts.filter(p => {
    const indMatch = industryFilter === 'All' || p.industry === industryFilter;
    let stageMatch = true;
    if (stageFilter === 'Cold') stageMatch = p.stage === 'Cold Prospect';
    else if (stageFilter === 'Active') stageMatch = PIPELINE_STAGES.some(s => s.key === p.stage);
    else if (stageFilter !== 'All') stageMatch = p.stage === stageFilter;
    const q = search.toLowerCase();
    const sMatch = !q || p.company.toLowerCase().includes(q) || (p.contact||'').toLowerCase().includes(q);
    return indMatch && stageMatch && sMatch;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === 'name') return a.company.localeCompare(b.company);
    if (sortBy === 'industry') return (a.industry || '').localeCompare(b.industry || '') || a.company.localeCompare(b.company);
    if (sortBy === 'stage') {
      const ai = STAGES.indexOf(a.stage); const bi = STAGES.indexOf(b.stage);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi) || a.company.localeCompare(b.company);
    }
    if (sortBy === 'temp') {
      const order = { warm: 0, neutral: 1, cold: 2 };
      return (order[a.temp] ?? 3) - (order[b.temp] ?? 3) || a.company.localeCompare(b.company);
    }
    return 0;
  });

  const coldCount = accounts.filter(p => p.stage === 'Cold Prospect').length;
  const activeCount = accounts.filter(p => PIPELINE_STAGES.some(s => s.key === p.stage)).length;

  const handleAddTask = (accountId) => {
    if (!newTaskText.trim()) return;
    const account = accounts.find(a => a.id === accountId);
    onAddProspectingTask({
      text: newTaskText.trim(),
      company: account.company,
      accountId: accountId
    });
    setNewTaskText('');
    setAddingTaskFor(null);
  };

  const openTasks = prospectingTasks.filter(t => !t.done);

  return (
    <div className="page-pad" style={{...styles.page, maxWidth:'none'}}>
      <header className="page-header" style={styles.pageHeader}>
        <div>
          <div style={styles.eyebrow}>Prospect Pipeline</div>
          <h1 style={styles.h1}>Prospecting</h1>
          <div style={styles.subtitle}>
            {accounts.length} total accounts · {activeCount} active · {coldCount} cold
          </div>
        </div>
        <div style={{display:'flex',gap:8}}>
          <button onClick={() => downloadCSV(`accounts-${new Date().toISOString().slice(0,10)}.csv`, filtered.map(p => ({
            company: p.company, contact: p.contact, phone: p.phone, email: p.email, address: p.address, website: p.website || '',
            industry: p.industry, temperature: p.temp, stage: p.stage, renewal: p.renewal, notes: p.notes,
            created: new Date(p.createdAt).toLocaleDateString()
          })))} style={styles.btnSecondary}><Download size={13}/>Export CSV</button>
          <button onClick={onNew} style={styles.btnPrimary}><Plus size={15} strokeWidth={2}/>New Account</button>
        </div>
      </header>

      {/* Prospecting To-Do List */}
      <section style={{marginTop:20, marginBottom:32}}>
        <h2 style={styles.h2}><CheckSquare size={15} style={{color:BRAND.teal}}/>To-Do <span style={styles.h2Count}>{openTasks.length}</span></h2>
        <div style={{background:'#fff', border:'1px solid #e2e8f0', borderRadius:8, overflow:'hidden'}}>
          {openTasks.length === 0 ? (
            <div style={{padding:24, textAlign:'center', color:'#94a3b8', fontSize:13}}>
              No prospecting tasks yet. Add tasks from prospect cards below.
            </div>
          ) : (
            <div style={{display:'flex', flexDirection:'column', maxHeight: '280px', overflowY: 'auto'}}>
              {openTasks.map(task => (
                <div key={task.id} style={{padding:'12px 16px', borderBottom:'1px solid #f1f5f9', display:'flex', alignItems:'center', gap:12}}>
                  <input 
                    type="checkbox" 
                    checked={task.done}
                    onChange={() => onToggleProspectingTask(task.id)}
                    style={{width:16, height:16, cursor:'pointer'}}
                  />
                  <div style={{flex:1, minWidth:0}}>
                    <div style={{fontSize:13, fontWeight:600, color:'#0f172a'}}>{task.text}</div>
                    <div style={{fontSize:11, color:'#64748b', marginTop:2}}>{task.company}</div>
                  </div>
                  <button 
                    onClick={() => onDeleteProspectingTask(task.id)}
                    style={{...styles.iconBtn, padding:4, color:'#94a3b8'}}
                    title="Delete"
                  >
                    <X size={14}/>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Filters & card grid */}
      <h2 style={{...styles.h2, marginTop:8}}>All Prospects</h2>
      <div className="filter-bar" style={styles.filterBar}>
        <div style={{position:'relative',flex:1,maxWidth:400}}>
          <Search size={14} style={{position:'absolute',left:12,top:'50%',transform:'translateY(-50%)',color:'#94a3b8'}}/>
          <input
            placeholder="Search company or contact…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{...styles.input, paddingLeft:34}}
          />
        </div>
        <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={styles.select}>
          <option value="name">Sort: A → Z</option>
          <option value="industry">Sort: Industry</option>
          <option value="stage">Sort: Stage</option>
          <option value="temp">Sort: Temperature</option>
        </select>
        <select value={stageFilter} onChange={e => setStageFilter(e.target.value)} style={styles.select}>
          <option value="All">All Stages</option>
          <option value="Cold">Cold Accounts only</option>
          <option value="Active">Active pipeline only</option>
          <option disabled>──────────</option>
          {PIPELINE_STAGES.map(s => <option key={s.key} value={s.key}>{s.key}</option>)}
        </select>
        <select value={industryFilter} onChange={e => setIndustryFilter(e.target.value)} style={styles.select}>
          <option value="All">All Industries</option>
          {<IndustryOptions/>}
        </select>
      </div>

      {sorted.length === 0 ? (
        <div style={styles.empty}>No accounts match these filters.</div>
      ) : (
        <div className="prospect-list" style={{display:'flex', flexDirection:'column', gap:8, marginTop:16}}>
          {sorted.map(p => (
            <div key={p.id}>
              {addingTaskFor === p.id ? (
                <>
                  <AccountCard account={p} onClick={() => onSelect(p.id)} />
                  <div style={{marginTop:8, padding:10, background:'#fff', border:'2px solid '+BRAND.teal, borderRadius:8, display:'flex', gap:8}}>
                    <input
                      autoFocus
                      value={newTaskText}
                      onChange={e => setNewTaskText(e.target.value)}
                      onKeyDown={e => { 
                        if (e.key === 'Enter') { e.preventDefault(); handleAddTask(p.id); }
                        if (e.key === 'Escape') setAddingTaskFor(null);
                      }}
                      placeholder="e.g., 1st attempt call, Send intro email..."
                      style={{...styles.input, padding:'6px 10px', fontSize:12, flex:1}}
                    />
                    <button onClick={() => handleAddTask(p.id)} style={{...styles.btnPrimary, padding:'6px 12px', fontSize:11}}>Add</button>
                    <button onClick={() => setAddingTaskFor(null)} style={{...styles.btnSecondary, padding:'6px 12px', fontSize:11}}>Cancel</button>
                  </div>
                </>
              ) : (
                <AccountCard 
                  account={p} 
                  onClick={() => onSelect(p.id)}
                  taskButton={
                    <button 
                      onClick={(e) => { e.stopPropagation(); setAddingTaskFor(p.id); }} 
                      style={{padding:'4px 10px', background:'#f1f5f9', border:'1px solid #e2e8f0', borderRadius:5, fontSize:10, fontWeight:600, color:'#475569', cursor:'pointer', display:'flex', alignItems:'center', gap:4}}
                    >
                      <Plus size={11}/>Task
                    </button>
                  }
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ========== POLICIES EDITOR ========== */
function PoliciesEditor({ policies, onChange }) {
  const addPolicy = () => {
    onChange([...policies, { id: uid(), name: '', revenue: '', effectiveDate: '', termMonths: 12 }]);
  };
  const updatePolicy = (id, field, value) => {
    onChange(policies.map(p => p.id === id ? { ...p, [field]: value } : p));
  };
  const removePolicy = (id) => {
    onChange(policies.filter(p => p.id !== id));
  };

  const total = policyTotal(policies);

  return (
    <div>
      <div style={{...styles.fieldLabel, display:'flex', justifyContent:'space-between', alignItems:'center'}}>
        <span>Policies & Revenue</span>
        {policies.length > 0 && <span style={{color:'#0f172a', fontWeight:700, fontSize:13}}>Total: {formatMoney(total)}</span>}
      </div>

      {policies.length === 0 && (
        <div style={{fontSize:12, color:'#94a3b8', padding:'8px 0 12px', lineHeight:1.5}}>
          Add policies to track revenue and renewal dates. Enter the original effective date and select the policy term (default 1 year). The system calculates renewal dates based on the term length. Policies effective this calendar year count as New Business.
        </div>
      )}

      <div style={{display:'flex', flexDirection:'column', gap:8}}>
        {policies.map(pol => (
          <div key={pol.id} style={{padding:10, background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:6, display:'flex', flexDirection:'column', gap:6}}>
            <div style={{display:'flex', gap:6, flexWrap:'wrap', alignItems:'flex-end'}}>
              <div style={{flex:'2 1 140px', minWidth:120}}>
                <label style={{fontSize:10, color:'#64748b', textTransform:'uppercase', letterSpacing:0.5, fontWeight:600}}>Policy</label>
                <input
                  value={pol.name}
                  onChange={e => updatePolicy(pol.id, 'name', e.target.value)}
                  placeholder="GL, Auto, WC, Package…"
                  style={{...styles.input, padding:'6px 8px', fontSize:13}}
                  list={`policy-types-${pol.id}`}
                />
                <datalist id={`policy-types-${pol.id}`}>
                  <option value="Package" />
                  <option value="General Liability" />
                  <option value="Commercial Auto" />
                  <option value="Workers Comp" />
                  <option value="Property" />
                  <option value="Umbrella" />
                  <option value="Cyber" />
                  <option value="D&O" />
                  <option value="Professional Liability" />
                  <option value="Inland Marine" />
                  <option value="EPLI" />
                </datalist>
              </div>
              <div style={{flex:'1 1 100px', minWidth:90}}>
                <label style={{fontSize:10, color:'#64748b', textTransform:'uppercase', letterSpacing:0.5, fontWeight:600}}>Revenue $</label>
                <input
                  value={pol.revenue}
                  onChange={e => updatePolicy(pol.id, 'revenue', e.target.value.replace(/[^0-9.]/g, ''))}
                  placeholder="0"
                  inputMode="decimal"
                  style={{...styles.input, padding:'6px 8px', fontSize:13}}
                />
              </div>
              <div style={{flex:'1 1 130px', minWidth:120}}>
                <label style={{fontSize:10, color:'#64748b', textTransform:'uppercase', letterSpacing:0.5, fontWeight:600}}>Effective Date</label>
                <input
                  type="date"
                  value={pol.effectiveDate}
                  onChange={e => updatePolicy(pol.id, 'effectiveDate', e.target.value)}
                  style={{...styles.input, padding:'6px 8px', fontSize:13}}
                />
              </div>
              <div style={{flex:'0 0 90px'}}>
                <label style={{fontSize:10, color:'#64748b', textTransform:'uppercase', letterSpacing:0.5, fontWeight:600}}>Term</label>
                <select
                  value={pol.termMonths || 12}
                  onChange={e => updatePolicy(pol.id, 'termMonths', Number(e.target.value))}
                  style={{...styles.input, padding:'6px 8px', fontSize:13}}
                >
                  <option value={1}>1 mo</option>
                  <option value={2}>2 mo</option>
                  <option value={3}>3 mo</option>
                  <option value={4}>4 mo</option>
                  <option value={5}>5 mo</option>
                  <option value={6}>6 mo</option>
                  <option value={7}>7 mo</option>
                  <option value={8}>8 mo</option>
                  <option value={9}>9 mo</option>
                  <option value={10}>10 mo</option>
                  <option value={11}>11 mo</option>
                  <option value={12}>12 mo</option>
                </select>
              </div>
              <button
                onClick={() => removePolicy(pol.id)}
                style={{...styles.iconBtn, color:'#dc2626', alignSelf:'center'}}
                title="Remove policy"
              >
                <Trash2 size={14}/>
              </button>
            </div>
            {pol.effectiveDate && (() => {
              const isNew = isNewBusinessThisYear(pol);
              if (isNew) return <div style={{fontSize:10, fontWeight:700, color:'#166534'}}>NEW BUSINESS ({new Date().getFullYear()})</div>;
              const d = new Date(pol.effectiveDate);
              if (isNaN(d.getTime())) return <div style={{fontSize:10, fontWeight:700, color:'#1e40af'}}>RENEWAL</div>;
              const today = new Date(); today.setHours(0,0,0,0);
              const termMonths = pol.termMonths || 12;
              
              // Calculate next renewal by adding term months
              let nxt = new Date(d);
              nxt.setMonth(nxt.getMonth() + termMonths);
              nxt.setHours(0,0,0,0);
              
              // Keep advancing by term until we get a future date (or within 7 days past)
              while (nxt < today && Math.round((nxt - today) / 86400000) < -7) {
                nxt.setMonth(nxt.getMonth() + termMonths);
              }
              
              return <div style={{fontSize:10, fontWeight:700, color:'#1e40af'}}>RENEWAL — renews {nxt.getMonth()+1}/{nxt.getDate()}/{nxt.getFullYear()}</div>;
            })()}
          </div>
        ))}
      </div>

      <button onClick={addPolicy} style={{...styles.btnSecondary, marginTop:8, fontSize:12}}>
        <Plus size={13}/>Add Policy
      </button>
    </div>
  );
}

/* ========== BOOK OF BUSINESS PAGE ========== */
function BookOfBusiness({ accounts, onSelect }) {
  const [search, setSearch] = useState('');
  const [industryFilter, setIndustryFilter] = useState('All');
  const [sortBy, setSortBy] = useState('revenue'); // revenue | name | renewal

  const currentYear = new Date().getFullYear();

  // Compute per-account stats
  const accountsWithStats = accounts.map(p => {
    const policies = p.policies || [];
    const totalRev = policyTotal(policies);
    const newBizRev = policies.filter(isNewBusinessThisYear).reduce((s, x) => s + (Number(x.revenue) || 0), 0);
    const renewalRev = totalRev - newBizRev;
    // Compute next upcoming renewal for each policy based on policy term
    const today = new Date(); today.setHours(0,0,0,0);
    const policyRenewals = policies
      .map(pol => {
        if (!pol.effectiveDate) return null;
        const d = new Date(pol.effectiveDate);
        if (isNaN(d.getTime())) return null;
        d.setHours(0,0,0,0);
        
        const termMonths = pol.termMonths || 12; // default to 12 months
        
        // Walk forward by term from effective date until we find a renewal in the future
        let nextRenewal = new Date(d);
        nextRenewal.setMonth(nextRenewal.getMonth() + termMonths);
        nextRenewal.setHours(0,0,0,0);
        
        while (nextRenewal < today) {
          nextRenewal.setMonth(nextRenewal.getMonth() + termMonths);
        }
        
        const label = `${nextRenewal.getMonth()+1}/${nextRenewal.getDate()}/${nextRenewal.getFullYear()}`;
        return { ...pol, _date: nextRenewal, _renewalLabel: label };
      })
      .filter(x => x !== null)
      .sort((a, b) => a._date - b._date);
    const upcomingRenewal = policyRenewals[0] || null;
    return { ...p, _totalRev: totalRev, _newBizRev: newBizRev, _renewalRev: renewalRev, _upcomingRenewal: upcomingRenewal };
  });

  // Apply search / industry filter
  const filtered = accountsWithStats.filter(p => {
    const indMatch = industryFilter === 'All' || p.industry === industryFilter;
    const q = search.toLowerCase();
    const sMatch = !q || p.company.toLowerCase().includes(q) || (p.contact||'').toLowerCase().includes(q);
    return indMatch && sMatch;
  });

  // Sort
  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === 'revenue') return b._totalRev - a._totalRev;
    if (sortBy === 'name') return a.company.localeCompare(b.company);
    if (sortBy === 'renewal') {
      const ad = a._upcomingRenewal?._date?.getTime() || Infinity;
      const bd = b._upcomingRenewal?._date?.getTime() || Infinity;
      return ad - bd;
    }
    return 0;
  });

  // Top-of-page totals (across ALL won, not filtered)
  const totalBookRev = accountsWithStats.reduce((s, x) => s + x._totalRev, 0);
  const totalNewBizRev = accountsWithStats.reduce((s, x) => s + x._newBizRev, 0);
  const totalRenewalRev = accountsWithStats.reduce((s, x) => s + x._renewalRev, 0);
  const personalLinesRev = accountsWithStats.filter(x => x.industry === 'Personal Lines').reduce((s, x) => s + x._totalRev, 0);

  // Commercial vs Select: group non-Personal Lines accounts by contact name (case-insensitive).
  // If the combined revenue of all accounts sharing a contact is $3,000+, they're Commercial.
  // Otherwise they're Select. Accounts with no contact are evaluated individually.
  const nonPersonal = accountsWithStats.filter(x => x.industry !== 'Personal Lines');
  const contactGroups = {};
  const noContactAccounts = [];
  nonPersonal.forEach(a => {
    const key = (a.contact || '').trim().toLowerCase();
    if (!key) {
      noContactAccounts.push(a);
    } else {
      if (!contactGroups[key]) contactGroups[key] = [];
      contactGroups[key].push(a);
    }
  });
  let commercialLinesRev = 0;
  let selectLinesRev = 0;
  // Grouped contacts
  Object.values(contactGroups).forEach(group => {
    const groupTotal = group.reduce((s, a) => s + a._totalRev, 0);
    if (groupTotal >= 3000) commercialLinesRev += groupTotal;
    else selectLinesRev += groupTotal;
  });
  // No-contact accounts evaluated individually
  noContactAccounts.forEach(a => {
    if (a._totalRev >= 3000) commercialLinesRev += a._totalRev;
    else selectLinesRev += a._totalRev;
  });

  return (
    <div className="page-pad" style={styles.page}>
      <header className="page-header" style={styles.pageHeader}>
        <div>
          <div style={{...styles.eyebrow, color:'#16a34a'}}>Active Book</div>
          <h1 style={{...styles.h1, display:'flex',alignItems:'center',gap:12}}>
            <Trophy size={28} style={{color:'#16a34a'}}/>Book of Business
          </h1>
          <div style={styles.subtitle}>{accounts.length} account{accounts.length===1?'':'s'} · {currentYear}</div>
        </div>
        <button onClick={() => downloadCSV(`book-of-business-${new Date().toISOString().slice(0,10)}.csv`,
          sorted.flatMap(p => {
            if (!p.policies || p.policies.length === 0) {
              return [{ company: p.company, industry: p.industry, policy: '', revenue: 0, effective_date: '', new_or_renewal: '' }];
            }
            return p.policies.map(pol => ({
              company: p.company,
              industry: p.industry,
              policy: pol.name,
              revenue: pol.revenue,
              effective_date: pol.effectiveDate,
              new_or_renewal: isNewBusinessThisYear(pol) ? 'New' : 'Renewal'
            }));
          })
        )} style={styles.btnSecondary} disabled={sorted.length===0}><Download size={13}/>Export CSV</button>
      </header>

      {/* Revenue summary cards — 3x2 grid */}
      <div style={{display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:12, marginTop:16, marginBottom:24}}>
        {/* Top row */}
        <div style={{padding:16, background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:10}}>
          <div style={{fontSize:11, color:'#15803d', textTransform:'uppercase', letterSpacing:0.5, fontWeight:600, marginBottom:6}}>Total Book Revenue</div>
          <div style={{fontSize:28, fontWeight:700, color:'#14532d', fontFamily:'Georgia, serif'}}>{formatMoney(totalBookRev)}</div>
        </div>
        <div style={{padding:16, background:'#eff6ff', border:'1px solid #bfdbfe', borderRadius:10}}>
          <div style={{fontSize:11, color:'#1e40af', textTransform:'uppercase', letterSpacing:0.5, fontWeight:600, marginBottom:6}}>Renewal Revenue</div>
          <div style={{fontSize:28, fontWeight:700, color:'#1e3a8a', fontFamily:'Georgia, serif'}}>{formatMoney(totalRenewalRev)}</div>
        </div>
        <div style={{padding:16, background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:10}}>
          <div style={{fontSize:11, color:'#15803d', textTransform:'uppercase', letterSpacing:0.5, fontWeight:600, marginBottom:6}}>New Business Revenue</div>
          <div style={{fontSize:28, fontWeight:700, color:'#14532d', fontFamily:'Georgia, serif'}}>{formatMoney(totalNewBizRev)}</div>
        </div>
        {/* Bottom row */}
        <div style={{padding:16, background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:10}}>
          <div style={{fontSize:11, color:'#15803d', textTransform:'uppercase', letterSpacing:0.5, fontWeight:600, marginBottom:6}}>Commercial Lines</div>
          <div style={{fontSize:28, fontWeight:700, color:'#14532d', fontFamily:'Georgia, serif'}}>{formatMoney(commercialLinesRev)}</div>
          <div style={{fontSize:11, color:'#15803d', marginTop:4}}>Accounts $3,000+</div>
        </div>
        <div style={{padding:16, background:'#eff6ff', border:'1px solid #bfdbfe', borderRadius:10}}>
          <div style={{fontSize:11, color:'#1e40af', textTransform:'uppercase', letterSpacing:0.5, fontWeight:600, marginBottom:6}}>Select Lines</div>
          <div style={{fontSize:28, fontWeight:700, color:'#1e3a8a', fontFamily:'Georgia, serif'}}>{formatMoney(selectLinesRev)}</div>
          <div style={{fontSize:11, color:'#1e40af', marginTop:4}}>Accounts under $3,000</div>
        </div>
        <div style={{padding:16, background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:10}}>
          <div style={{fontSize:11, color:'#15803d', textTransform:'uppercase', letterSpacing:0.5, fontWeight:600, marginBottom:6}}>Personal Lines</div>
          <div style={{fontSize:28, fontWeight:700, color:'#14532d', fontFamily:'Georgia, serif'}}>{formatMoney(personalLinesRev)}</div>
        </div>
      </div>

      <div className="filter-bar" style={styles.filterBar}>
        <div style={{position:'relative',flex:1,maxWidth:400}}>
          <Search size={14} style={{position:'absolute',left:12,top:'50%',transform:'translateY(-50%)',color:'#94a3b8'}}/>
          <input
            placeholder="Search company or contact…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{...styles.input, paddingLeft:34}}
          />
        </div>
        <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={styles.select}>
          <option value="revenue">Sort: Revenue (high → low)</option>
          <option value="name">Sort: Company name (A → Z)</option>
          <option value="renewal">Sort: Next renewal date</option>
        </select>
        <select value={industryFilter} onChange={e => setIndustryFilter(e.target.value)} style={styles.select}>
          <option value="All">All Industries</option>
          {<IndustryOptions/>}
        </select>
      </div>

      {sorted.length === 0 ? (
        <div style={styles.empty}>{accounts.length === 0 ? 'No accounts in your book yet. Move an account to "Won" to add it here.' : 'No accounts match these filters.'}</div>
      ) : (
        <div style={{marginTop:16, display:'flex', flexDirection:'column', gap:8}}>
          {sorted.map(p => <BookAccountRow key={p.id} account={p} onClick={() => onSelect(p.id)} />)}
        </div>
      )}
    </div>
  );
}

function BookAccountRow({ account, onClick }) {
  const policies = account.policies || [];
  const upcoming = account._upcomingRenewal;
  return (
    <div onClick={onClick} className="card" style={{padding:16, background:'#fff', border:'1px solid #e2e8f0', borderRadius:10, display:'flex', flexDirection:'column', gap:10}}>
      <div style={{display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:12, flexWrap:'wrap'}}>
        <div style={{flex:1, minWidth:0}}>
          <div style={{fontSize:16, fontWeight:600, color:'#0f172a', marginBottom:2}}>{account.company}</div>
          <div style={{fontSize:12, color:'#64748b'}}>{account.industry} {account.contact && `· ${account.contact}`}</div>
        </div>
        <div style={{textAlign:'right'}}>
          <div style={{fontSize:20, fontWeight:700, color:'#0f172a', fontFamily:'Georgia, serif'}}>{formatMoney(account._totalRev)}</div>
          <div style={{fontSize:11, color:'#64748b'}}>
            {policies.length === 0 ? 'No policies' : `${policies.length} polic${policies.length === 1 ? 'y' : 'ies'}`}
          </div>
        </div>
      </div>

      {policies.length > 0 && (
        <div style={{display:'flex', flexWrap:'wrap', gap:6, paddingTop:8, borderTop:'1px solid #f1f5f9'}}>
          {policies.map(pol => {
            const isNew = isNewBusinessThisYear(pol);
            return (
              <div key={pol.id} style={{
                fontSize:11, padding:'4px 10px', borderRadius:5,
                background: isNew ? '#dcfce7' : '#dbeafe',
                color: isNew ? '#166534' : '#1e40af',
                border: `1px solid ${isNew ? '#86efac' : '#93c5fd'}`,
                display:'flex', alignItems:'center', gap:6
              }}>
                <span style={{fontWeight:600}}>{pol.name || 'Policy'}</span>
                <span>·</span>
                <span>{formatMoney(pol.revenue)}</span>
                {pol.effectiveDate && <><span>·</span><span style={{opacity:0.8}}>{pol.effectiveDate}</span></>}
                <span style={{fontWeight:600, marginLeft:2, padding:'1px 6px', borderRadius:3, background:'rgba(255,255,255,0.6)'}}>
                  {isNew ? 'NEW' : 'REN'}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {upcoming && (
        <div style={{fontSize:11, color:'#475569', display:'flex', alignItems:'center', gap:6}}>
          <Clock size={11}/>Next renewal: <strong>{upcoming.name || 'Policy'}</strong> on {upcoming._renewalLabel}
        </div>
      )}
    </div>
  );
}

/* ========== CLOSED ACCOUNTS PAGE (Won / Lost) ========== */
function ClosedAccountsPage({ title, subtitle, accentColor, AccentIcon, accounts, onSelect }) {
  const [search, setSearch] = useState('');
  const [industryFilter, setIndustryFilter] = useState('All');

  const filtered = accounts.filter(p => {
    const indMatch = industryFilter === 'All' || p.industry === industryFilter;
    const q = search.toLowerCase();
    const sMatch = !q || p.company.toLowerCase().includes(q) || (p.contact||'').toLowerCase().includes(q);
    return indMatch && sMatch;
  });

  return (
    <div className="page-pad" style={styles.page}>
      <header className="page-header" style={styles.pageHeader}>
        <div>
          <div style={{...styles.eyebrow, color: accentColor}}>{subtitle}</div>
          <h1 style={{...styles.h1, display:'flex',alignItems:'center',gap:12}}>
            <AccentIcon size={28} style={{color: accentColor}}/>{title}
          </h1>
          <div style={styles.subtitle}>{accounts.length} total account{accounts.length===1?'':'s'}</div>
        </div>
        <button onClick={() => downloadCSV(`${title.toLowerCase().replace(/\s/g,'-')}-${new Date().toISOString().slice(0,10)}.csv`, filtered.map(p => ({
          company: p.company, contact: p.contact, phone: p.phone, email: p.email, address: p.address, website: p.website || '',
          industry: p.industry, temperature: p.temp, stage: p.stage, renewal: p.renewal, notes: p.notes,
          closed_on: new Date(p.createdAt).toLocaleDateString()
        })))} style={styles.btnSecondary} disabled={filtered.length===0}><Download size={13}/>Export CSV</button>
      </header>

      <div className="filter-bar" style={styles.filterBar}>
        <div style={{position:'relative',flex:1,maxWidth:400}}>
          <Search size={14} style={{position:'absolute',left:12,top:'50%',transform:'translateY(-50%)',color:'#94a3b8'}}/>
          <input
            placeholder="Search company or contact…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{...styles.input, paddingLeft:34}}
          />
        </div>
        <select value={industryFilter} onChange={e => setIndustryFilter(e.target.value)} style={styles.select}>
          <option value="All">All Industries</option>
          {<IndustryOptions/>}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div style={styles.empty}>{accounts.length === 0 ? `No ${title.toLowerCase()} yet.` : 'No accounts match these filters.'}</div>
      ) : (
        <div className="closed-list" style={{display:'flex', flexDirection:'column', gap:8, marginTop:16}}>
          {filtered.map(p => <AccountCard key={p.id} account={p} onClick={() => onSelect(p.id)} />)}
        </div>
      )}
    </div>
  );
}

/* ========== RENEWALS PAGE ========== */
function RenewalsPage({ renewals, onSelect, onMarkRenewal }) {
  const [search, setSearch] = useState('');
  const [timeFilter, setTimeFilter] = useState('all'); // all | overdue | 30 | 60 | 90
  const [industryFilter, setIndustryFilter] = useState('All');

  const filtered = renewals.filter(({ p, days }) => {
    // Time filter
    if (timeFilter === 'overdue' && days >= 0) return false;
    if (timeFilter === '30' && (days < 0 || days > 30)) return false;
    if (timeFilter === '60' && (days < 0 || days > 60)) return false;
    if (timeFilter === '90' && (days < 0 || days > 90)) return false;
    // Industry filter
    if (industryFilter !== 'All' && p.industry !== industryFilter) return false;
    // Search
    const q = search.toLowerCase();
    if (q && !p.company.toLowerCase().includes(q) && !(p.contact || '').toLowerCase().includes(q)) return false;
    return true;
  });

  const overdueCount = renewals.filter(x => x.days < 0).length;
  const within30 = renewals.filter(x => x.days >= 0 && x.days <= 30).length;
  const within60 = renewals.filter(x => x.days > 30 && x.days <= 60).length;
  const within90 = renewals.filter(x => x.days > 60 && x.days <= 90).length;

  return (
    <div className="page-pad" style={styles.page}>
      <header className="page-header" style={styles.pageHeader}>
        <div>
          <div style={{...styles.eyebrow, color:'#b45309'}}>Next 90 Days</div>
          <h1 style={{...styles.h1, display:'flex',alignItems:'center',gap:12}}>
            <Calendar size={28} style={{color:'#b45309'}}/>Renewals
          </h1>
          <div style={styles.subtitle}>{renewals.length} account{renewals.length===1?'':'s'} with upcoming renewals</div>
        </div>
        <button onClick={() => downloadCSV(`renewals-${new Date().toISOString().slice(0,10)}.csv`, filtered.map(({ p, days, renewLabel, source, policyName }) => ({
          company: p.company, contact: p.contact || '', phone: p.phone || '', email: p.email || '',
          industry: p.industry, stage: p.stage, renewal_date: renewLabel || p.renewal,
          source: source === 'policy' ? `Policy: ${policyName}` : 'Renewal date',
          days_until: days, status: days < 0 ? 'Overdue' : days <= 30 ? 'Within 30 days' : days <= 60 ? 'Within 60 days' : 'Within 90 days'
        })))} style={styles.btnSecondary} disabled={filtered.length===0}><Download size={13}/>Export CSV</button>
      </header>

      {/* Summary cards */}
      <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(150px, 1fr))', gap:12, marginTop:16, marginBottom:24}}>
        <div style={{padding:14, background:'#fff', border:'1px solid #e2e8f0', borderRadius:10, textAlign:'center'}}>
          <div style={{fontSize:11, color:'#64748b', textTransform:'uppercase', letterSpacing:0.5, fontWeight:600, marginBottom:6}}>Total</div>
          <div style={{fontSize:28, fontWeight:700, color:'#0f172a', fontFamily:'Georgia, serif'}}>{renewals.length}</div>
        </div>
        {overdueCount > 0 && (
          <div style={{padding:14, background:'#fef2f2', border:'1px solid #fecaca', borderRadius:10, textAlign:'center'}}>
            <div style={{fontSize:11, color:'#b91c1c', textTransform:'uppercase', letterSpacing:0.5, fontWeight:600, marginBottom:6}}>Overdue</div>
            <div style={{fontSize:28, fontWeight:700, color:'#991b1b', fontFamily:'Georgia, serif'}}>{overdueCount}</div>
          </div>
        )}
        <div style={{padding:14, background:'#fef3c7', border:'1px solid #fde68a', borderRadius:10, textAlign:'center'}}>
          <div style={{fontSize:11, color:'#92400e', textTransform:'uppercase', letterSpacing:0.5, fontWeight:600, marginBottom:6}}>Within 30 days</div>
          <div style={{fontSize:28, fontWeight:700, color:'#78350f', fontFamily:'Georgia, serif'}}>{within30}</div>
        </div>
        <div style={{padding:14, background:'#fff7ed', border:'1px solid #fed7aa', borderRadius:10, textAlign:'center'}}>
          <div style={{fontSize:11, color:'#9a3412', textTransform:'uppercase', letterSpacing:0.5, fontWeight:600, marginBottom:6}}>31–60 days</div>
          <div style={{fontSize:28, fontWeight:700, color:'#7c2d12', fontFamily:'Georgia, serif'}}>{within60}</div>
        </div>
        <div style={{padding:14, background:'#eff6ff', border:'1px solid #bfdbfe', borderRadius:10, textAlign:'center'}}>
          <div style={{fontSize:11, color:'#1e40af', textTransform:'uppercase', letterSpacing:0.5, fontWeight:600, marginBottom:6}}>61–90 days</div>
          <div style={{fontSize:28, fontWeight:700, color:'#1e3a8a', fontFamily:'Georgia, serif'}}>{within90}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="filter-bar" style={styles.filterBar}>
        <div style={{position:'relative',flex:1,maxWidth:400}}>
          <Search size={14} style={{position:'absolute',left:12,top:'50%',transform:'translateY(-50%)',color:'#94a3b8'}}/>
          <input
            placeholder="Search company or contact…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{...styles.input, paddingLeft:34}}
          />
        </div>
        <select value={timeFilter} onChange={e => setTimeFilter(e.target.value)} style={styles.select}>
          <option value="all">All upcoming</option>
          {overdueCount > 0 && <option value="overdue">Overdue only</option>}
          <option value="30">Within 30 days</option>
          <option value="60">Within 60 days</option>
          <option value="90">Within 90 days</option>
        </select>
        <select value={industryFilter} onChange={e => setIndustryFilter(e.target.value)} style={styles.select}>
          <option value="All">All Industries</option>
          {<IndustryOptions/>}
        </select>
      </div>

      {/* Renewal list */}
      {filtered.length === 0 ? (
        <div style={styles.empty}>{renewals.length === 0 ? 'No accounts have renewal dates within the next 90 days. Add renewal dates to your accounts to see them here.' : 'No renewals match these filters.'}</div>
      ) : (
        <div style={{marginTop:16, display:'flex', flexDirection:'column', gap:8}}>
          {filtered.map(({ p, days, renewLabel, source, policyName, policyId, renewalYear }) => {
            const t = TEMPS[p.temp];
            const isOverdue = days < 0;
            const urgencyStyle = isOverdue
              ? { background:'#fef2f2', border:'1px solid #fecaca', borderLeft:'3px solid #dc2626' }
              : days <= 30
                ? { background:'#fffbeb', border:'1px solid #fde68a', borderLeft:'3px solid #f59e0b' }
                : days <= 60
                  ? { background:'#fff7ed', border:'1px solid #fed7aa', borderLeft:'3px solid #ea580c' }
                  : { background:'#fff', border:'1px solid #e2e8f0', borderLeft:'3px solid #3b82f6' };

            return (
              <div key={`${p.id}-${policyId||'top'}`} className="card" style={{...urgencyStyle, borderRadius:8, padding:'14px 16px', display:'flex', alignItems:'center', gap:14}}>
                <div style={{flex:1, minWidth:0, cursor:'pointer'}} onClick={() => onSelect(p.id)}>
                  <div style={{display:'flex', alignItems:'center', gap:8, flexWrap:'wrap'}}>
                    <span style={{fontSize:15, fontWeight:600, color:'#0f172a', fontFamily:'Georgia, serif'}}>{p.company}</span>
                    <span style={{...styles.tempPill, background: t.bg, color: t.text, border:`1px solid ${t.border}`}}>
                      <span style={{...styles.tempDot, background: t.dot}}/>{t.label}
                    </span>
                    <span style={styles.stagePill}>{p.stage}</span>
                  </div>
                  <div style={{fontSize:12, color:'#64748b', marginTop:4, display:'flex', alignItems:'center', gap:12, flexWrap:'wrap'}}>
                    <span>{p.industry}</span>
                    {p.contact && <span>· {p.contact}</span>}
                    {p.phone && <span>· {p.phone}</span>}
                    <span style={{color:'#b45309', fontWeight:500}}>
                      · Renews {renewLabel || p.renewal}
                      {source === 'policy' && policyName && <span style={{fontWeight:400, fontStyle:'italic'}}> ({policyName})</span>}
                    </span>
                  </div>
                </div>
                <div style={{display:'flex',alignItems:'center',gap:8,flexShrink:0,flexWrap:'wrap',justifyContent:'flex-end'}}>
                  {source === 'policy' && policyId && renewalYear && (
                    <>
                      <button
                        onClick={(e) => { e.stopPropagation(); onMarkRenewal(p.id, policyId, 'renewed', renewalYear); }}
                        style={{padding:'4px 10px', fontSize:11, fontWeight:600, background:'#dcfce7', color:'#166534', border:'1px solid #86efac', borderRadius:5, cursor:'pointer', display:'flex', alignItems:'center', gap:4}}
                        title="Mark as renewed — resets countdown to next year"
                      ><Check size={12}/>Renewed</button>
                      <button
                        onClick={(e) => { e.stopPropagation(); onMarkRenewal(p.id, policyId, 'nonrenewed', renewalYear); }}
                        style={{padding:'4px 10px', fontSize:11, fontWeight:600, background:'#fef2f2', color:'#991b1b', border:'1px solid #fecaca', borderRadius:5, cursor:'pointer', display:'flex', alignItems:'center', gap:4}}
                        title="Mark as non-renewed — removes from renewals"
                      ><X size={12}/>Non-renewed</button>
                    </>
                  )}
                  <div style={{
                    ...styles.daysPill,
                    ...(isOverdue
                      ? { background:'#fee2e2', color:'#b91c1c' }
                      : days <= 30
                        ? { background:'#fef3c7', color:'#92400e' }
                        : days <= 60
                          ? { background:'#ffedd5', color:'#9a3412' }
                          : { background:'#dbeafe', color:'#1e40af' }),
                    fontSize:12, padding:'6px 12px', fontWeight:700, whiteSpace:'nowrap'
                  }}>
                    {isOverdue ? `${Math.abs(days)}d overdue` : days === 0 ? 'Today' : `${days}d`}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ========== PROSPECT CARD ========== */
function AccountCard({ account, onClick, onTogglePin, taskButton }) {
  const t = TEMPS[account.temp];
  return (
    <div onClick={onClick} className="card" style={{
      ...styles.card, 
      borderLeftColor: t.border,
      display: 'flex',
      alignItems: 'center',
      gap: 16,
      padding: '12px 16px'
    }}>
      {/* Left: Company & Industry */}
      <div style={{flex: '0 0 240px', minWidth: 0}}>
        <div style={styles.cardCompany}>{account.company}</div>
        <div style={styles.cardIndustry}>{account.industry}</div>
      </div>
      
      {/* Middle: Contact Info */}
      <div style={{flex: 1, display: 'flex', gap: 16, flexWrap: 'wrap', minWidth: 0}}>
        {account.contact && <div style={styles.cardField}><User size={11}/>{account.contact}</div>}
        {account.phone && <div style={styles.cardField}><Phone size={11}/>{account.phone}</div>}
        {account.email && <div style={styles.cardField}><Mail size={11}/>{account.email}</div>}
        {account.address && <div style={styles.cardField}><MapPin size={11}/>{account.address}</div>}
        {account.website && <div style={styles.cardField}><Globe size={11}/><span style={{color:BRAND.teal}}>{account.website.replace(/^https?:\/\//i, '').replace(/\/$/, '')}</span></div>}
      </div>
      
      {/* Right: Status Pills & Task Button */}
      <div style={{flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 8}}>
        <span style={{...styles.tempPill, background:t.bg, color:t.text}}>
          <span style={{...styles.tempDot, background:t.dot}}/>{t.label}
        </span>
        <span style={styles.stagePill}>{account.stage}</span>
        {taskButton}
      </div>
    </div>
  );
}

/* ========== PROSPECT DETAIL DRAWER ========== */
function AccountDetail({ account, onClose, onEdit, onDelete, onTogglePin, onLogCall, onAddReminder, onLogEmailDraft, onUpdateStage, onUpdateTemp, onSaveAccount }) {
  if (!account) return null;
  const t = TEMPS[account.temp];
  const [tab, setTab] = useState('overview');
  const [callOutcome, setCallOutcome] = useState('');
  const [callNotes, setCallNotes] = useState('');
  const [callType, setCallType] = useState('');
  const [callDate, setCallDate] = useState('');
  const [reminderText, setReminderText] = useState('');
  const [reminderDue, setReminderDue] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showImportInfo, setShowImportInfo] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editBuf, setEditBuf] = useState(account);

  // Reset buffer when prospect changes (different card opened)
  React.useEffect(() => { setEditBuf(account); setEditMode(false); }, [account.id]);

  const updEdit = (k, v) => setEditBuf({ ...editBuf, [k]: v });

  const saveEdits = () => {
    if (!editBuf.company || !editBuf.company.trim()) { alert('Company name required'); return; }
    onSaveAccount(editBuf);
    setEditMode(false);
  };

  const cancelEdits = () => {
    setEditBuf(account);
    setEditMode(false);
  };

  const handleLogCall = () => {
    if (!callOutcome.trim()) return;
    onLogCall({ 
      company: account.company, 
      contact: account.contact, 
      outcome: callOutcome, 
      notes: callNotes, 
      accountId: account.id,
      callType: callType || 'General',
      callDate: callDate || new Date().toISOString().split('T')[0]
    });
    setCallOutcome(''); 
    setCallNotes('');
    setCallType('');
    setCallDate('');
  };

  const handleAddReminder = () => {
    if (!reminderText.trim()) return;
    onAddReminder({ text: reminderText, due: reminderDue, company: account.company, accountId: account.id });
    setReminderText(''); setReminderDue('');
  };

  return (
    <>
      <div style={styles.scrim} onClick={editMode ? cancelEdits : onClose}/>
      <div className="account-modal" style={styles.accountModal}>
        <div style={styles.drawerHeader}>
          <button onClick={editMode ? cancelEdits : onClose} style={styles.iconBtn}><X size={18}/></button>
          <div style={{display:'flex',gap:6}}>
            {!editMode && (
              <>
                <button onClick={() => setShowImportInfo(true)} style={styles.iconBtn} title="Import info"><Upload size={15}/></button>
                <button onClick={() => setEditMode(true)} style={styles.iconBtn} title="Edit"><Edit2 size={15}/></button>
                <button onClick={() => setConfirmDelete(true)} style={{...styles.iconBtn, color:'#dc2626'}}><Trash2 size={15}/></button>
              </>
            )}
            {editMode && (
              <>
                <button onClick={cancelEdits} style={styles.btnSecondary}>Cancel</button>
                <button onClick={saveEdits} style={styles.btnPrimary}><Check size={14}/>Save</button>
              </>
            )}
          </div>
        </div>

        {confirmDelete && (
          <div style={{margin:'0 28px 12px',padding:'14px 16px',background:'#fef2f2',border:'1px solid #fecaca',borderRadius:8}}>
            <div style={{fontSize:13,color:'#991b1b',fontWeight:600,marginBottom:4}}>Delete {account.company}?</div>
            <div style={{fontSize:12,color:'#7f1d1d',marginBottom:10}}>This removes the account and all its activity history. Cannot be undone.</div>
            <div style={{display:'flex',gap:8}}>
              <button onClick={() => { onDelete(account.id); setConfirmDelete(false); }} style={{...styles.btnPrimary, background:'#dc2626', padding:'6px 12px', fontSize:12}}>Delete</button>
              <button onClick={() => setConfirmDelete(false)} style={{...styles.btnSecondary, padding:'6px 12px', fontSize:12}}>Cancel</button>
            </div>
          </div>
        )}

        <div style={{padding:'8px 28px 24px'}}>
          {!editMode ? (
            <>
              <div style={{display:'flex',gap:8,marginBottom:12}}>
                <span style={{...styles.tempPill, background:t.bg, color:t.text, fontSize:11}}>
                  <span style={{...styles.tempDot, background:t.dot}}/>{t.label}
                </span>
                <span style={styles.stagePill}>{account.stage}</span>
              </div>
              <h2 style={styles.drawerTitle}>{account.company}</h2>
              <div style={{color:'#64748b',fontSize:13,marginTop:4}}>{account.industry}</div>

              <div style={styles.tempControls}>
                <span style={{fontSize:11,color:'#64748b',textTransform:'uppercase',letterSpacing:0.5,marginRight:8}}>Temp:</span>
                {Object.keys(TEMPS).map(k => (
                  <button key={k} onClick={() => onUpdateTemp(k)}
                    style={{...styles.tempBtn, ...(account.temp===k ? {background:TEMPS[k].bg, color:TEMPS[k].text, borderColor:TEMPS[k].border} : {})}}>
                    {TEMPS[k].label}
                  </button>
                ))}
              </div>

              <div style={styles.tempControls}>
                <span style={{fontSize:11,color:'#64748b',textTransform:'uppercase',letterSpacing:0.5,marginRight:8}}>Stage:</span>
                <select value={account.stage} onChange={e => onUpdateStage(e.target.value)} style={{...styles.select, fontSize:12, padding:'4px 8px'}}>
                  <optgroup label="Pre-Pipeline">
                    {PRE_PIPELINE_STAGES.map(s => <option key={s.key} value={s.key}>{s.key}</option>)}
                  </optgroup>
                  <optgroup label="Active Pipeline">
                    {PIPELINE_STAGES.map(s => <option key={s.key} value={s.key}>{s.key} — {s.sf}</option>)}
                  </optgroup>
                  <optgroup label="Closed">
                    {CLOSED_STAGES.map(s => <option key={s.key} value={s.key}>{s.key}</option>)}
                  </optgroup>
                </select>
              </div>
            </>
          ) : (
            <>
              <div style={{fontSize:11,color:BRAND.teal,textTransform:'uppercase',letterSpacing:1,fontWeight:600,marginBottom:8}}>Editing</div>
              <input
                value={editBuf.company}
                onChange={e => updEdit('company', e.target.value)}
                style={{...styles.input, fontSize:24, fontFamily:'Georgia, serif', fontWeight:600, padding:'8px 12px', border:'1px solid #e2e8f0'}}
                placeholder="Company name *"
              />
            </>
          )}
        </div>

        {!editMode && (
          <div className="tab-bar" style={styles.tabBar}>
            {['overview', 'history', 'email', 'log call', 'remind'].map(tk => (
              <button key={tk} onClick={() => setTab(tk)}
                style={{...styles.tab, ...(tab===tk ? styles.tabActive : {})}}>{tk}</button>
            ))}
          </div>
        )}

        <div style={{padding:'24px 28px',overflowY:'auto',flex:1}}>
          {editMode && (
            <div style={{display:'flex',flexDirection:'column',gap:14}}>
              <div className="form-row" style={styles.formRow}>
                <FormField label="Industry">
                  <select value={editBuf.industry} onChange={e=>updEdit('industry',e.target.value)} style={styles.input}>
                    {<IndustryOptions/>}
                  </select>
                </FormField>
                <FormField label="Stage">
                  <select value={editBuf.stage} onChange={e=>updEdit('stage',e.target.value)} style={styles.input}>
                    <optgroup label="Pre-Pipeline">
                      {PRE_PIPELINE_STAGES.map(s => <option key={s.key} value={s.key}>{s.key}</option>)}
                    </optgroup>
                    <optgroup label="Active Pipeline">
                      {PIPELINE_STAGES.map(s => <option key={s.key} value={s.key}>{s.key} — {s.sf}</option>)}
                    </optgroup>
                    <optgroup label="Closed">
                      {CLOSED_STAGES.map(s => <option key={s.key} value={s.key}>{s.key}</option>)}
                    </optgroup>
                  </select>
                </FormField>
              </div>
              <FormField label="Temperature">
                <div style={{display:'flex',gap:8}}>
                  {Object.keys(TEMPS).map(k => (
                    <button key={k} onClick={()=>updEdit('temp',k)} style={{...styles.tempBtn, flex:1, ...(editBuf.temp===k ? {background:TEMPS[k].bg, color:TEMPS[k].text, borderColor:TEMPS[k].border} : {})}}>
                      <span style={{...styles.tempDot, background:TEMPS[k].dot}}/>{TEMPS[k].label}
                    </button>
                  ))}
                </div>
              </FormField>
              <FormField label="Key Contact"><input value={editBuf.contact || ''} onChange={e=>updEdit('contact',e.target.value)} style={styles.input}/></FormField>
              <div className="form-row" style={styles.formRow}>
                <FormField label="Phone"><input value={editBuf.phone || ''} onChange={e=>updEdit('phone',e.target.value)} style={styles.input}/></FormField>
                <FormField label="Email"><input value={editBuf.email || ''} onChange={e=>updEdit('email',e.target.value)} style={styles.input}/></FormField>
              </div>
              <FormField label="Mailing Address"><input value={editBuf.address || ''} onChange={e=>updEdit('address',e.target.value)} style={styles.input}/></FormField>
              <FormField label="Website"><input value={editBuf.website || ''} onChange={e=>updEdit('website',e.target.value)} placeholder="example.com" style={styles.input}/></FormField>
              <FormField label="Target Close Date">
                <input 
                  type="date" 
                  value={editBuf.targetCloseDate || ''} 
                  onChange={e=>updEdit('targetCloseDate',e.target.value)} 
                  style={styles.input}
                />
              </FormField>

              <PoliciesEditor
                policies={editBuf.policies || []}
                onChange={(policies) => updEdit('policies', policies)}
              />

              <FormField label="Notes"><textarea value={editBuf.notes || ''} onChange={e=>updEdit('notes',e.target.value)} rows={5} style={{...styles.input, fontFamily:'inherit', resize:'vertical'}}/></FormField>
            </div>
          )}

          {!editMode && tab === 'overview' && (
            <div style={{display:'flex',flexDirection:'column',gap:14}}>
              <Field icon={User} label="Key Contact" value={account.contact} />
              <Field icon={Phone} label="Phone" value={account.phone} />
              <Field icon={Mail} label="Email" value={account.email} />
              <Field icon={MapPin} label="Address" value={account.address} />
              <WebsiteField website={account.website} />

              {account.policies && account.policies.length > 0 && (
                <div>
                  <div style={{...styles.fieldLabel, display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                    <span>Policies ({account.policies.length})</span>
                    <span style={{color:'#0f172a', fontWeight:700, fontSize:13}}>{formatMoney(policyTotal(account.policies))}</span>
                  </div>
                  <div style={{display:'flex', flexDirection:'column', gap:6, marginTop:6}}>
                    {account.policies.map(pol => {
                      const isNew = isNewBusinessThisYear(pol);
                      return (
                        <div key={pol.id} style={{padding:'8px 10px', background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:6, display:'flex', justifyContent:'space-between', alignItems:'center', gap:8, flexWrap:'wrap'}}>
                          <div style={{flex:1, minWidth:0}}>
                            <div style={{fontSize:13, fontWeight:600, color:'#0f172a'}}>{pol.name || 'Untitled policy'}</div>
                            {pol.effectiveDate && <div style={{fontSize:11, color:'#64748b', marginTop:2}}>Eff. {pol.effectiveDate}</div>}
                          </div>
                          <div style={{textAlign:'right'}}>
                            <div style={{fontSize:13, fontWeight:600, color:'#0f172a'}}>{formatMoney(pol.revenue)}</div>
                            <div style={{fontSize:10, fontWeight:700, color: isNew ? '#166534' : '#1e40af', marginTop:1}}>{isNew ? 'NEW' : 'RENEWAL'}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {account.notes && (
                <div>
                  <div style={styles.fieldLabel}>Notes</div>
                  <div style={{fontSize:13,color:'#334155',lineHeight:1.6,whiteSpace:'pre-wrap'}}>{account.notes}</div>
                </div>
              )}
            </div>
          )}

          {!editMode && tab === 'history' && <ActivityTimeline activity={account.activity || []} />}

          {!editMode && tab === 'email' && <EmailDrafter account={account} onLogDraft={(angle) => onLogEmailDraft(account.id, angle)} />}

          {!editMode && tab === 'log call' && (
            <div style={{display:'flex',flexDirection:'column',gap:12}}>
              <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12}}>
                <div>
                  <label style={styles.fieldLabel}>Activity Type</label>
                  <select value={callType} onChange={e => setCallType(e.target.value)} style={styles.input}>
                    <option value="">Select type…</option>
                    <option>1st Attempt</option>
                    <option>2nd Attempt</option>
                    <option>3rd Attempt</option>
                    <option>Contact Made</option>
                    <option>Follow-up</option>
                    <option>Closing Call</option>
                    <option>Discovery Call</option>
                    <option>Check-in</option>
                    <option>Email</option>
                    <option>Text</option>
                  </select>
                </div>
                <div>
                  <label style={styles.fieldLabel}>Activity Date</label>
                  <input 
                    type="date" 
                    value={callDate} 
                    onChange={e => setCallDate(e.target.value)} 
                    style={styles.input}
                    placeholder="Today"
                  />
                </div>
              </div>
              <div>
                <label style={styles.fieldLabel}>Outcome</label>
                <select value={callOutcome} onChange={e => setCallOutcome(e.target.value)} style={styles.input}>
                  <option value="">Select outcome…</option>
                  <option>Connected — Interested</option>
                  <option>Connected — Not interested</option>
                  <option>Connected — Call back later</option>
                  <option>Left voicemail</option>
                  <option>No answer</option>
                  <option>Wrong number</option>
                  <option>Gatekeeper</option>
                  <option>Email sent</option>
                  <option>Text sent</option>
                </select>
              </div>
              <div>
                <label style={styles.fieldLabel}>Notes</label>
                <textarea value={callNotes} onChange={e => setCallNotes(e.target.value)} rows={4} style={{...styles.input, fontFamily:'inherit', resize:'vertical'}} placeholder="What was discussed, next steps…"/>
              </div>
              <button onClick={handleLogCall} style={styles.btnPrimary}><Phone size={14}/>Log Call</button>
              <div style={{fontSize:11,color:'#94a3b8',textAlign:'center',marginTop:4}}>Calls appear in the Calls Report for end-of-day Salesforce logging.</div>
            </div>
          )}

          {!editMode && tab === 'remind' && (
            <div style={{display:'flex',flexDirection:'column',gap:12}}>
              <div style={{fontSize:12, color:'#64748b', marginBottom:6, lineHeight:1.5}}>
                Create a reminder that will appear in your Dashboard To-Do list. Tasks due within the next 30 days show automatically — great for scheduling follow-ups ahead of meetings or close dates.
              </div>
              <div>
                <label style={styles.fieldLabel}>Task Description</label>
                <input value={reminderText} onChange={e => setReminderText(e.target.value)} style={styles.input} placeholder={`Follow up with ${account.company}…`}/>
              </div>
              <div>
                <label style={styles.fieldLabel}>Show on Dashboard on this date</label>
                <input type="date" value={reminderDue} onChange={e => setReminderDue(e.target.value)} style={styles.input} placeholder="Leave blank for immediate"/>
              </div>
              <button onClick={handleAddReminder} style={styles.btnPrimary}><Plus size={14}/>Schedule Task</button>
              <div style={{fontSize:11, color:'#94a3b8', marginTop:4}}>
                Tip: Tasks with a future date appear on the Dashboard up to 30 days in advance. Tasks with no date always show.
              </div>
            </div>
          )}
        </div>
      </div>

      {showImportInfo && (
        <ImportInfoModal
          account={account}
          onClose={() => setShowImportInfo(false)}
          onSave={(merged) => { onSaveAccount(merged); setShowImportInfo(false); }}
        />
      )}
    </>
  );
}

function ActivityTimeline({ activity }) {
  if (!activity || activity.length === 0) {
    return <div style={styles.empty}>No activity yet. Logged calls, email drafts, stage changes, and reminders will appear here.</div>;
  }
  const iconFor = (type) => {
    if (type === 'call') return Phone;
    if (type === 'email') return Mail;
    if (type === 'reminder') return Clock;
    if (type === 'stage') return TrendingUp;
    if (type === 'temp') return Sparkles;
    return FileText;
  };
  const colorFor = (type) => {
    if (type === 'call') return '#0891b2';
    if (type === 'email') return '#a16207';
    if (type === 'reminder') return '#7c3aed';
    if (type === 'stage') return '#16a34a';
    if (type === 'temp') return '#f59e0b';
    return '#64748b';
  };
  return (
    <div style={{display:'flex',flexDirection:'column',gap:0,position:'relative'}}>
      {activity.map((a, i) => {
        const Icon = iconFor(a.type);
        return (
          <div key={a.id} style={{display:'flex',gap:12,position:'relative',paddingBottom: i === activity.length - 1 ? 0 : 18}}>
            {i !== activity.length - 1 && <div style={{position:'absolute',left:13,top:28,bottom:0,width:1,background:'#e2e8f0'}}/>}
            <div style={{width:26,height:26,borderRadius:13,background:'#fff',border:`1.5px solid ${colorFor(a.type)}`,display:'flex',alignItems:'center',justifyContent:'center',color:colorFor(a.type),flexShrink:0,zIndex:1}}>
              <Icon size={12}/>
            </div>
            <div style={{flex:1,minWidth:0,paddingTop:3}}>
              <div style={{fontSize:13,color:'#0f172a',lineHeight:1.4}}>{a.text}</div>
              <div style={{fontSize:11,color:'#94a3b8',marginTop:3}}>{new Date(a.at).toLocaleString()}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

const normalizeUrl = (url) => {
  if (!url) return '';
  const trimmed = url.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return 'https://' + trimmed;
};

function WebsiteField({ website }) {
  const href = normalizeUrl(website);
  return (
    <div style={{display:'flex',gap:12,alignItems:'flex-start'}}>
      <div style={{width:28,height:28,borderRadius:6,background:'#f1f5f9',display:'flex',alignItems:'center',justifyContent:'center',color:'#64748b',flexShrink:0}}>
        <Globe size={13}/>
      </div>
      <div style={{flex:1,minWidth:0}}>
        <div style={styles.fieldLabel}>Website</div>
        {website ? (
          <a href={href} target="_blank" rel="noopener noreferrer" style={{fontSize:13,color:BRAND.teal,textDecoration:'none',display:'inline-flex',alignItems:'center',gap:4,wordBreak:'break-all'}}>
            {website}<ExternalLink size={11}/>
          </a>
        ) : (
          <div style={{fontSize:13,color:'#cbd5e1'}}>—</div>
        )}
      </div>
    </div>
  );
}

function Field({ icon: Icon, label, value }) {
  return (
    <div style={{display:'flex',gap:12,alignItems:'flex-start'}}>
      <div style={{width:28,height:28,borderRadius:6,background:'#f1f5f9',display:'flex',alignItems:'center',justifyContent:'center',color:'#64748b',flexShrink:0}}>
        <Icon size={13}/>
      </div>
      <div style={{flex:1,minWidth:0}}>
        <div style={styles.fieldLabel}>{label}</div>
        <div style={{fontSize:13,color: value ? '#0f172a' : '#cbd5e1', wordBreak:'break-word'}}>{value || '—'}</div>
      </div>
    </div>
  );
}

/* ========== EMAIL DRAFTER (AI) ========== */
function EmailDrafter({ account, onLogDraft }) {
  const [angle, setAngle] = useState('Initial cold outreach');
  const [extra, setExtra] = useState('');
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState('');

  const generate = async () => {
    setLoading(true); setErr(''); setDraft('');
    const prompt = `You are drafting a cold/warm prospecting email on behalf of a Commercial P&C Insurance Producer at Higginbotham Insurance in Waco, TX. The producer specializes in churches, contractors, and Central Texas local businesses, and works with the Higginbotham 1225 United church insurance program when relevant.

ACCOUNT:
- Company: ${account.company}
- Industry: ${account.industry}
- Contact: ${account.contact || '(unknown — keep generic)'}
- Stage: ${account.stage}
- Temperature: ${account.temp}
- Notes: ${account.notes || '(none)'}
${account.renewal ? `- Renewal date: ${account.renewal}` : ''}

EMAIL ANGLE: ${angle}
${extra ? `ADDITIONAL CONTEXT: ${extra}` : ''}

Write a short, direct, conversational email (under 150 words). No corporate fluff. Specific, personalized to their industry. Use a clear subject line. Sign as "Higginbotham Insurance | Waco, TX". Output ONLY the email — subject line on first line as "Subject: ...", then blank line, then body. No preamble.`;

    try {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          messages: [{ role: "user", content: prompt }]
        })
      });
      if (!r.ok) {
        if (r.status === 401 || r.status === 403) {
          setErr(`Auth error. AI features only work when this artifact is opened from inside your logged-in Claude session.`);
        } else {
          setErr(`API error ${r.status}. Try again.`);
        }
        setLoading(false);
        return;
      }
      const data = await r.json();
      const text = data.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
      setDraft(text);
      if (onLogDraft) onLogDraft(angle);
    } catch (e) {
      const msg = e?.message || '';
      if (msg.toLowerCase().includes('failed to fetch')) {
        setErr('Network blocked. Open this artifact from inside Claude (logged in), not a shared link.');
      } else {
        setErr(`Could not generate: ${msg}`);
      }
    }
    setLoading(false);
  };

  const copy = () => {
    navigator.clipboard.writeText(draft);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div style={{display:'flex',flexDirection:'column',gap:12}}>
      <div>
        <label style={styles.fieldLabel}>Email Type</label>
        <select value={angle} onChange={e => setAngle(e.target.value)} style={styles.input}>
          <option>Initial cold outreach</option>
          <option>Follow-up after no response</option>
          <option>Referral introduction</option>
          <option>Renewal date approaching</option>
          <option>Quote follow-up</option>
          <option>Reconnect with old contact</option>
          <option>Industry-specific value pitch</option>
        </select>
      </div>
      <div>
        <label style={styles.fieldLabel}>Anything to mention? (optional)</label>
        <textarea value={extra} onChange={e => setExtra(e.target.value)} rows={2} style={{...styles.input, fontFamily:'inherit', resize:'vertical'}} placeholder="e.g., met at chamber event, referred by John…"/>
      </div>
      <button onClick={generate} disabled={loading} style={{...styles.btnPrimary, opacity: loading ? 0.6 : 1}}>
        {loading ? <Loader2 size={14} className="spin"/> : <Sparkles size={14}/>}
        {loading ? 'Drafting…' : 'Draft Email'}
      </button>
      {err && <div style={styles.errBox}><AlertCircle size={13}/>{err}</div>}
      {draft && (
        <div style={styles.draftBox}>
          <div style={styles.draftHeader}>
            <span style={{fontSize:11,color:'#64748b',textTransform:'uppercase',letterSpacing:0.5}}>Draft</span>
            <button onClick={copy} style={styles.iconBtn}>
              {copied ? <><Check size={13}/>Copied</> : <><Copy size={13}/>Copy</>}
            </button>
          </div>
          <pre style={styles.draftBody}>{draft}</pre>
        </div>
      )}
    </div>
  );
}

/* ========== AI ASSISTANT ========== */
function Assistant({ allAccounts, onAction }) {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [reply, setReply] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [err, setErr] = useState('');

  const TOOLS = [
    {
      name: 'create_account',
      description: 'Create a new account card in the CRM from information the user explicitly provides. Use when the user wants to add a new company to track.',
      input_schema: {
        type: 'object',
        properties: {
          company: { type: 'string', description: 'Company name exactly as the user stated it. Required.' },
          contact: { type: 'string', description: 'Key contact name ONLY if the user mentioned one. Empty string otherwise. NEVER invent.' },
          phone: { type: 'string', description: 'Phone number ONLY if the user provided it verbatim. Empty string otherwise. NEVER invent or guess.' },
          email: { type: 'string', description: 'Email ONLY if the user provided it verbatim. Empty string otherwise. NEVER invent or guess.' },
          address: { type: 'string', description: 'Address or city ONLY if the user mentioned it. Empty string otherwise. NEVER invent.' },
          website: { type: 'string', description: 'Website ONLY if the user provided it. Empty string otherwise. NEVER invent or guess a URL.' },
          renewal: { type: 'string', description: 'Renewal date ONLY if the user mentioned it. Empty string otherwise.' },
          industry: { type: 'string', enum: INDUSTRIES, description: 'Best-fit industry based on company name/type. Default Other if unclear.' },
          temp: { type: 'string', enum: ['warm','neutral','cold'], description: 'Temperature the user specified. Default neutral if not stated.' },
          stage: { type: 'string', enum: STAGES, description: 'Pipeline stage the user specified. Default Prospecting if not stated.' },
          notes: { type: 'string', description: 'Any context the user provided verbatim, otherwise empty string.' }
        },
        required: ['company']
      }
    },
    {
      name: 'add_reminder',
      description: 'Add a reminder for the user. Use when they say "remind me to..." or similar.',
      input_schema: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'What the reminder says. Required.' },
          due: { type: 'string', description: 'Due date in YYYY-MM-DD format if mentioned, otherwise empty string.' },
          company: { type: 'string', description: 'Related company name if mentioned, otherwise empty string.' }
        },
        required: ['text']
      }
    },
    {
      name: 'log_call',
      description: 'Log a call that the user made. Use when they say "I called X" or "log a call with Y".',
      input_schema: {
        type: 'object',
        properties: {
          company: { type: 'string', description: 'Company called. Required.' },
          contact: { type: 'string', description: 'Person spoken with if mentioned, otherwise empty string.' },
          outcome: { type: 'string', description: 'One of: Connected — Interested, Connected — Not interested, Connected — Call back later, Left voicemail, No answer, Wrong number, Gatekeeper. Required.' },
          notes: { type: 'string', description: 'What was discussed or next steps, otherwise empty string.' }
        },
        required: ['company', 'outcome']
      }
    }
  ];

  const send = async () => {
    if (!input.trim() || loading) return;
    setLoading(true); setErr(''); setReply(''); setConfirmation('');

    const summary = allAccounts.length
      ? allAccounts.map(p => `- ${p.company} (${p.industry}, ${p.temp}, ${p.stage})${p.contact ? ' — '+p.contact : ''}${p.renewal ? ' — renews '+p.renewal : ''}`).join('\n')
      : '(no accounts yet)';

    const systemPrompt = `You are an account management assistant inside the user's personal CRM. The user is a Commercial P&C Insurance Producer at Higginbotham Insurance in Waco, TX, focused on churches, contractors, and Central Texas businesses.

CURRENT ACCOUNTS:
${summary}

CRITICAL RULES — INFORMATION SAFETY:
- You have NO ability to browse the web or look up live information.
- NEVER invent, guess, or fabricate phone numbers, emails, websites, addresses, or contact names. Wrong data is worse than missing data — the user will call wrong numbers or email strangers.
- If the user gives you a company name but no contact details, leave those fields EMPTY. Do not fill them in from training data, even if you think you know them.
- Industry and temperature/stage can be reasonable defaults or inferences from what the user said (e.g., "Roofing" from "Smith Roofing"). Contact details cannot.
- If the user asks you to look something up or research a company, tell him you can't browse the web and ask him to paste the details he's found.

Behavior:
- For requests to add an account, log a call, or set a reminder: USE THE APPROPRIATE TOOL with ONLY the information the user provided. Missing fields stay empty.
- For pipeline questions ("what should I do today", "summarize my pipeline", "any churches in the warm column"): respond conversationally with insights based on the account list above. Do not call a tool.
- Keep replies short (1-3 sentences). Direct, no fluff.
- If the user mentions a church, default the industry to "Church / Religious Org".`;

    try {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1024,
          system: systemPrompt,
          tools: TOOLS,
          messages: [{ role: "user", content: input }]
        })
      });

      if (!r.ok) {
        let detail = '';
        try { const ej = await r.json(); detail = ej?.error?.message || ''; } catch {}
        if (r.status === 401 || r.status === 403) {
          setErr(`Auth error (${r.status}). Open this artifact from your logged-in Claude session, not a shared link.`);
        } else if (r.status === 429) {
          setErr('Rate limited. Wait a moment and try again.');
        } else {
          setErr(`API error ${r.status}${detail ? ': ' + detail : ''}`);
        }
        setLoading(false);
        return;
      }

      const data = await r.json();
      const blocks = data?.content || [];

      // Collect text reply
      const textBlocks = blocks.filter(b => b.type === 'text').map(b => b.text).filter(Boolean);
      const textReply = textBlocks.join('\n').trim();

      // Collect tool uses
      const toolUses = blocks.filter(b => b.type === 'tool_use');

      if (toolUses.length === 0 && !textReply) {
        setErr('Empty response from assistant. Try rephrasing.');
        setLoading(false);
        return;
      }

      // Process each tool call
      const confirmations = [];
      for (const tu of toolUses) {
        const inp = tu.input || {};
        if (tu.name === 'create_account') {
          if (!inp.company || !inp.company.trim()) continue;
          onAction({ type: 'create', payload: {
            company: inp.company.trim(),
            contact: inp.contact || '',
            phone: inp.phone || '',
            email: inp.email || '',
            address: inp.address || '',
            website: inp.website || '',
            renewal: inp.renewal || '',
            industry: INDUSTRIES.includes(inp.industry) ? inp.industry : 'Other',
            temp: ['warm','neutral','cold'].includes(inp.temp) ? inp.temp : 'neutral',
            stage: STAGES.includes(inp.stage) ? inp.stage : 'Prospecting',
            notes: inp.notes || ''
          }});
          confirmations.push(`Saved "${inp.company.trim()}"`);
        } else if (tu.name === 'add_reminder') {
          if (!inp.text || !inp.text.trim()) continue;
          onAction({ type: 'reminder', payload: {
            text: inp.text.trim(),
            due: inp.due || '',
            company: inp.company || ''
          }});
          confirmations.push('Reminder added');
        } else if (tu.name === 'log_call') {
          if (!inp.company || !inp.outcome) continue;
          onAction({ type: 'call', payload: {
            company: inp.company,
            contact: inp.contact || '',
            outcome: inp.outcome,
            notes: inp.notes || ''
          }});
          confirmations.push(`Call logged for ${inp.company}`);
        }
      }

      if (confirmations.length) setConfirmation('✓ ' + confirmations.join(' · '));
      if (textReply) setReply(textReply);
      else if (!confirmations.length) setReply("I didn't catch an action there. Try: \"Add Smith Roofing as a warm account\" or \"What should I focus on today?\"");
      setInput('');
    } catch (e) {
      const m = e?.message || '';
      if (m.toLowerCase().includes('failed to fetch')) {
        setErr('Network blocked. Open this artifact from inside Claude (logged in).');
      } else {
        setErr(`Error: ${m || 'unknown'}`);
      }
    }
    setLoading(false);
  };

  return (
    <div style={styles.assistant}>
      <div style={styles.assistantHeader}>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <Sparkles size={14} style={{color:BRAND.teal}}/>
          <span style={{fontWeight:600,fontSize:13,color:'#0f172a'}}>Assistant</span>
        </div>
        <span style={{fontSize:11,color:'#94a3b8'}}>Try: "Add Smith Roofing, warm, phone 254-555-1234" — paste what you found</span>
      </div>
      <div style={styles.assistantInputRow}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !loading) send(); }}
          placeholder="Tell the assistant what to do…"
          style={styles.assistantInput}
          disabled={loading}
        />
        <button onClick={send} disabled={loading || !input.trim()} style={{...styles.btnPrimary, opacity: (loading || !input.trim()) ? 0.5 : 1}}>
          {loading ? <Loader2 size={14} className="spin"/> : <Send size={14}/>}
        </button>
      </div>
      {err && <div style={{...styles.errBox, marginTop:10}}><AlertCircle size={13}/>{err}</div>}
      {confirmation && (
        <div style={{display:'flex',alignItems:'center',gap:8,marginTop:10,padding:'10px 12px',background:'#ecfdf5',border:'1px solid #a7f3d0',color:'#065f46',fontSize:12,borderRadius:6,fontWeight:600}}>
          {confirmation}
        </div>
      )}
      {reply && (
        <div style={styles.assistantReply}>
          <MessageSquare size={13} style={{color:'#64748b',marginTop:2,flexShrink:0}}/>
          <div style={{fontSize:13,color:'#334155',lineHeight:1.5,whiteSpace:'pre-wrap'}}>{reply}</div>
        </div>
      )}
    </div>
  );
}


/* ========== CALLS REPORT ========== */
/* ========== TO-DO LIST PAGE ========== */
function TodoPage({ reminders, onAdd, onToggle, onDelete }) {
  const [text, setText] = useState('');
  const [due, setDue] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('open'); // open | done | all

  const today = new Date(); today.setHours(0,0,0,0);

  const getGroup = (r) => {
    if (r.done) return 'done';
    if (!r.due) return 'undated';
    const d = new Date(r.due); d.setHours(0,0,0,0);
    return d < today ? 'overdue' : 'upcoming';
  };

  const allSorted = [...reminders]
    .filter(r => {
      const q = search.toLowerCase();
      if (q && !r.text.toLowerCase().includes(q) && !(r.company || '').toLowerCase().includes(q)) return false;
      if (filter === 'open') return !r.done;
      if (filter === 'done') return r.done;
      return true;
    })
    .sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1; // done tasks always last
      const order = { overdue: 0, undated: 1, upcoming: 2 };
      const ga = order[getGroup(a)] ?? 2;
      const gb = order[getGroup(b)] ?? 2;
      if (ga !== gb) return ga - gb;
      // within upcoming: soonest first; within overdue: most overdue first
      if (!a.done && a.due && b.due) return new Date(a.due) - new Date(b.due);
      return 0;
    });

  const openCount = reminders.filter(r => !r.done).length;
  const overdueCount = reminders.filter(r => !r.done && r.due && (() => { const d = new Date(r.due); d.setHours(0,0,0,0); return d < today; })()).length;
  const undatedCount = reminders.filter(r => !r.done && !r.due).length;
  const doneCount = reminders.filter(r => r.done).length;

  const addTask = () => {
    const v = text.trim();
    if (!v) return;
    onAdd({ text: v, due, company: '' });
    setText(''); setDue('');
  };

  const dayLabel = (r) => {
    if (!r.due) return null;
    const d = new Date(r.due); d.setHours(0,0,0,0);
    const diff = Math.round((d - today) / 86400000);
    if (diff < 0) return { label: `${Math.abs(diff)}d overdue`, bg:'#fee2e2', color:'#b91c1c' };
    if (diff === 0) return { label: 'Today', bg:'#fef3c7', color:'#92400e' };
    if (diff === 1) return { label: 'Tomorrow', bg:'#fef3c7', color:'#92400e' };
    if (diff <= 7) return { label: `${diff}d`, bg:'#fff7ed', color:'#9a3412' };
    return { label: d.toLocaleDateString('en-US', { month:'short', day:'numeric', year: d.getFullYear() !== today.getFullYear() ? 'numeric' : undefined }), bg:'#f1f5f9', color:'#475569' };
  };

  // Group label for section dividers
  const groupLabel = (r) => {
    if (r.done) return null;
    return getGroup(r);
  };

  // Render with section headers between groups
  let lastGroup = null;

  return (
    <div className="page-pad" style={styles.page}>
      <header className="page-header" style={styles.pageHeader}>
        <div>
          <div style={styles.eyebrow}>All Tasks</div>
          <h1 style={{...styles.h1, display:'flex', alignItems:'center', gap:12}}>
            <CheckSquare size={28} style={{color:BRAND.teal}}/>To-Do List
          </h1>
          <div style={styles.subtitle}>{openCount} open · {overdueCount} overdue · {undatedCount} undated · {doneCount} completed</div>
        </div>
      </header>

      {/* Summary pills */}
      <div style={{display:'flex', gap:10, marginBottom:24, flexWrap:'wrap'}}>
        {overdueCount > 0 && (
          <div style={{padding:'8px 14px', background:'#fef2f2', border:'1px solid #fecaca', borderRadius:8, fontSize:13, fontWeight:600, color:'#b91c1c'}}>
            ⚠️ {overdueCount} overdue
          </div>
        )}
        <div style={{padding:'8px 14px', background:'#f0f9ff', border:'1px solid #bae6fd', borderRadius:8, fontSize:13, fontWeight:600, color:'#0369a1'}}>
          {openCount} open
        </div>
        <div style={{padding:'8px 14px', background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:8, fontSize:13, fontWeight:600, color:'#15803d'}}>
          {doneCount} completed
        </div>
      </div>

      {/* Add task */}
      <div style={{display:'flex', gap:8, marginBottom:20, flexWrap:'wrap', padding:'14px 16px', background:'#fff', border:'1px solid #e2e8f0', borderRadius:10}}>
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') addTask(); }}
          placeholder="Add a task…"
          style={{...styles.input, flex:'1 1 260px'}}
        />
        <input
          type="date"
          value={due}
          onChange={e => setDue(e.target.value)}
          style={{...styles.input, flex:'0 0 160px'}}
          title="Due date (optional)"
        />
        <button onClick={addTask} disabled={!text.trim()} style={{...styles.btnPrimary, opacity: text.trim() ? 1 : 0.5}}>
          <Plus size={14}/>Add Task
        </button>
      </div>

      {/* Filters + search */}
      <div className="filter-bar" style={{...styles.filterBar, marginBottom:16}}>
        <div style={{position:'relative', flex:1, maxWidth:360}}>
          <Search size={13} style={{position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'#94a3b8'}}/>
          <input
            placeholder="Search tasks…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{...styles.input, paddingLeft:30}}
          />
        </div>
        <div style={{display:'flex', gap:0, border:'1px solid #e2e8f0', borderRadius:7, overflow:'hidden'}}>
          {[['open','Open'],['done','Completed'],['all','All']].map(([val, label]) => (
            <button key={val} onClick={() => setFilter(val)} style={{
              padding:'7px 14px', border:'none', fontSize:12, fontWeight:500, cursor:'pointer',
              background: filter === val ? BRAND.navy : '#fff',
              color: filter === val ? '#fff' : '#475569',
              borderRight: val !== 'all' ? '1px solid #e2e8f0' : 'none'
            }}>{label}</button>
          ))}
        </div>
      </div>

      {/* Task list */}
      {allSorted.length === 0 ? (
        <div style={styles.empty}>
          {search ? 'No tasks match that search.' : filter === 'done' ? 'No completed tasks yet.' : 'No open tasks. Add one above or set reminders from an account drawer.'}
        </div>
      ) : (
        <div style={{display:'flex', flexDirection:'column', gap:0}}>
          {allSorted.map((r, i) => {
            const group = groupLabel(r);
            const showHeader = !r.done && group !== lastGroup;
            if (!r.done) lastGroup = group;
            const dl = dayLabel(r);

            return (
              <React.Fragment key={r.id}>
                {showHeader && (
                  <div style={{
                    fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:1.2,
                    color: group === 'overdue' ? '#b91c1c' : group === 'undated' ? '#64748b' : '#0369a1',
                    padding:'16px 0 6px',
                    borderBottom: '1px solid #f1f5f9',
                    marginBottom:6
                  }}>
                    {group === 'overdue' ? '⚠️ Overdue' : group === 'undated' ? 'No Due Date' : 'Upcoming'}
                  </div>
                )}
                {/* done section header */}
                {r.done && i > 0 && !allSorted[i-1].done && (
                  <div style={{fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:1.2, color:'#94a3b8', padding:'16px 0 6px', borderBottom:'1px solid #f1f5f9', marginBottom:6}}>
                    Completed
                  </div>
                )}
                <div style={{
                  display:'flex', alignItems:'center', gap:12,
                  padding:'11px 14px',
                  background: r.done ? 'transparent' : '#fff',
                  border: r.done ? 'none' : '1px solid #e2e8f0',
                  borderRadius: r.done ? 0 : 8,
                  marginBottom: r.done ? 0 : 6,
                  opacity: r.done ? 0.5 : 1,
                  borderLeft: !r.done && group === 'overdue' ? '3px solid #dc2626' : !r.done && group === 'undated' ? '3px solid #94a3b8' : !r.done ? '3px solid #3b82f6' : 'none',
                }}>
                  <button
                    onClick={() => onToggle(r.id)}
                    style={{
                      ...styles.checkbox,
                      ...(r.done ? styles.checkboxChecked : {}),
                      flexShrink: 0
                    }}
                  >
                    {r.done && <Check size={11} color="#fff" strokeWidth={3}/>}
                  </button>
                  <div style={{flex:1, minWidth:0}}>
                    <div style={{fontSize:13, fontWeight:500, color: r.done ? '#94a3b8' : '#0f172a', textDecoration: r.done ? 'line-through' : 'none'}}>
                      {r.text}
                    </div>
                    {r.company && <div style={{fontSize:11, color:'#94a3b8', marginTop:2}}>{r.company}</div>}
                  </div>
                  {dl && !r.done && (
                    <div style={{fontSize:11, fontWeight:600, padding:'3px 9px', borderRadius:12, background:dl.bg, color:dl.color, flexShrink:0}}>
                      {dl.label}
                    </div>
                  )}
                  {r.due && !r.done && (
                    <div style={{fontSize:11, color:'#94a3b8', flexShrink:0}}>
                      {new Date(r.due + 'T00:00:00').toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' })}
                    </div>
                  )}
                  <button onClick={() => onDelete(r.id)} style={{...styles.iconBtn, color:'#94a3b8', flexShrink:0}}><Trash2 size={13}/></button>
                </div>
              </React.Fragment>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CallsReport({ calls, onToggle, onDelete }) {
  // Default to today's date in YYYY-MM-DD format
  const todayString = new Date().toISOString().split('T')[0];
  const [selectedDate, setSelectedDate] = useState(todayString);
  
  const today = new Date().toDateString();
  const todayCalls = calls.filter(c => new Date(c.createdAt).toDateString() === today);
  const earlierUnlogged = calls.filter(c => new Date(c.createdAt).toDateString() !== today && !c.loggedToSF);
  const unloggedCalls = calls.filter(c => !c.loggedToSF);
  const loggedToday = calls.filter(c => c.loggedToSF && new Date(c.createdAt).toDateString() === today);
  
  // Filter calls by selected date if one is chosen
  const selectedDateCalls = selectedDate ? calls.filter(c => {
    const callDate = new Date(c.createdAt);
    const [selYear, selMonth, selDay] = selectedDate.split('-').map(Number);
    const selectedDateObj = new Date(selYear, selMonth - 1, selDay);
    
    // Compare just the date parts (year, month, day)
    return callDate.getFullYear() === selectedDateObj.getFullYear() &&
           callDate.getMonth() === selectedDateObj.getMonth() &&
           callDate.getDate() === selectedDateObj.getDate();
  }) : [];
  
  // Navigate to previous/next day
  const goToPreviousDay = () => {
    if (!selectedDate) return;
    const date = new Date(selectedDate + 'T00:00:00');
    date.setDate(date.getDate() - 1);
    setSelectedDate(date.toISOString().split('T')[0]);
  };
  
  const goToNextDay = () => {
    if (!selectedDate) return;
    const date = new Date(selectedDate + 'T00:00:00');
    date.setDate(date.getDate() + 1);
    setSelectedDate(date.toISOString().split('T')[0]);
  };

  const exportCalls = (which) => {
    const rows = which.map(c => ({
      date: new Date(c.createdAt).toLocaleString(),
      company: c.company,
      contact: c.contact,
      call_type: c.callType || '',
      outcome: c.outcome,
      notes: c.notes,
      logged_to_salesforce: c.loggedToSF ? 'Yes' : 'No'
    }));
    downloadCSV(`calls-${new Date().toISOString().slice(0,10)}.csv`, rows);
  };

  return (
    <div className="page-pad" style={styles.page}>
      <header className="page-header" style={styles.pageHeader}>
        <div>
          <div style={styles.eyebrow}>End-of-Day Workflow</div>
          <h1 style={styles.h1}>Calls Report</h1>
          <div style={styles.subtitle}>Check off each call as you log it in Salesforce.</div>
        </div>
        {calls.length > 0 && (
          <button onClick={() => exportCalls(calls)} style={styles.btnSecondary}><Download size={13}/>Export CSV</button>
        )}
      </header>
      
      {/* Date Picker Filter */}
      <div style={{marginTop:20, padding:16, background:'#fff', border:'1px solid #e2e8f0', borderRadius:8, display:'flex', alignItems:'center', gap:12}}>
        <label style={{fontSize:13, fontWeight:600, color:'#0f172a'}}>View calls from:</label>
        <button 
          onClick={goToPreviousDay}
          style={{...styles.btnSecondary, padding:'6px 10px', fontSize:12, minWidth:'auto'}}
          title="Previous day"
        >
          ←
        </button>
        <input 
          type="date" 
          value={selectedDate} 
          onChange={e => setSelectedDate(e.target.value)} 
          style={{...styles.input, padding:'6px 10px', fontSize:13, flex:'0 0 180px'}}
        />
        <button 
          onClick={goToNextDay}
          style={{...styles.btnSecondary, padding:'6px 10px', fontSize:12, minWidth:'auto'}}
          title="Next day"
        >
          →
        </button>
        <button 
          onClick={() => setSelectedDate(todayString)} 
          style={{...styles.btnSecondary, padding:'6px 12px', fontSize:12}}
        >
          Today
        </button>
      </div>

      <CallSection 
        title={`Calls on ${new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}`} 
        calls={selectedDateCalls} 
        onToggle={onToggle} 
        onDelete={onDelete} 
        emptyText="No calls logged on this date."
      />
      
      {unloggedCalls.length > 0 && (
        <CallSection 
          title="Not Yet in Salesforce" 
          calls={unloggedCalls} 
          onToggle={onToggle} 
          onDelete={onDelete} 
          warning
        />
      )}
      
      {loggedToday.length > 0 && (
        <CallSection 
          title="Already in Salesforce (Today)" 
          calls={loggedToday} 
          onToggle={onToggle} 
          onDelete={onDelete} 
          muted 
        />
      )}
    </div>
  );
}

function CallSection({ title, calls, onToggle, onDelete, emptyText, warning, muted }) {
  return (
    <section style={{marginTop:28}}>
      <h2 style={{...styles.h2, ...(warning ? {color:'#b45309'} : {})}}>{title} <span style={styles.h2Count}>{calls.length}</span></h2>
      {calls.length === 0 ? (
        emptyText ? <div style={styles.empty}>{emptyText}</div> : null
      ) : (
        <div style={styles.callsList}>
          {calls.map(c => (
            <div key={c.id} style={{...styles.callRow, opacity: muted ? 0.55 : 1}}>
              <button onClick={() => onToggle(c.id)} style={{...styles.checkbox, ...(c.loggedToSF ? styles.checkboxChecked : {})}}>
                {c.loggedToSF && <Check size={12} color="#fff" strokeWidth={3}/>}
              </button>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:'flex',alignItems:'baseline',gap:8,flexWrap:'wrap'}}>
                  <span style={{fontWeight:600,color:'#0f172a',fontSize:14}}>{c.company}</span>
                  {c.contact && <span style={{color:'#64748b',fontSize:12}}>· {c.contact}</span>}
                  {c.callType && <span style={{fontSize:10, color:'#0f172a', background:'#f1f5f9', padding:'2px 8px', borderRadius:10, fontWeight:600, textTransform:'uppercase', letterSpacing:0.3}}>{c.callType}</span>}
                  <span style={{...styles.outcomePill}}>{c.outcome}</span>
                </div>
                {c.notes && <div style={{fontSize:12,color:'#475569',marginTop:4,lineHeight:1.5}}>{c.notes}</div>}
                <div style={{fontSize:11,color:'#94a3b8',marginTop:4}}>{new Date(c.createdAt).toLocaleString()}</div>
              </div>
              <button onClick={() => onDelete(c.id)} style={styles.iconBtn} title="Delete"><Trash2 size={13}/></button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/* ========== PROSPECT FORM ========== */
function AccountForm({ initial, onSave, onClose }) {
  const [p, setP] = useState(initial || { company:'', contact:'', phone:'', email:'', address:'', website:'', renewal:'', industry:'Other', temp:'neutral', stage:'Prospecting', notes:'' });
  const upd = (k, v) => setP({ ...p, [k]: v });

  const submit = () => {
    if (!p.company.trim()) { alert('Company name required'); return; }
    onSave(p);
  };

  return (
    <>
      <div style={styles.scrim} onClick={onClose}/>
      <div className="modal" style={styles.modal}>
        <div style={styles.drawerHeader}>
          <h2 style={{margin:0,fontSize:18,fontFamily:'Georgia, serif',color:'#0f172a'}}>{initial ? 'Edit Account' : 'New Account'}</h2>
          <button onClick={onClose} style={styles.iconBtn}><X size={18}/></button>
        </div>
        <div style={{padding:'8px 28px 24px',overflowY:'auto'}}>
          <FormField label="Company *"><input value={p.company} onChange={e=>upd('company',e.target.value)} style={styles.input} autoFocus/></FormField>
          <div className="form-row" style={styles.formRow}>
            <FormField label="Industry"><select value={p.industry} onChange={e=>upd('industry',e.target.value)} style={styles.input}>{<IndustryOptions/>}</select></FormField>
            <FormField label="Stage"><select value={p.stage} onChange={e=>upd('stage',e.target.value)} style={styles.input}>
              <optgroup label="Pre-Pipeline">
                {PRE_PIPELINE_STAGES.map(s => <option key={s.key} value={s.key}>{s.key}</option>)}
              </optgroup>
              <optgroup label="Active Pipeline">
                {PIPELINE_STAGES.map(s => <option key={s.key} value={s.key}>{s.key} — {s.sf}</option>)}
              </optgroup>
              <optgroup label="Closed">
                {CLOSED_STAGES.map(s => <option key={s.key} value={s.key}>{s.key}</option>)}
              </optgroup>
            </select></FormField>
          </div>
          <FormField label="Temperature">
            <div style={{display:'flex',gap:8}}>
              {Object.keys(TEMPS).map(k => (
                <button key={k} onClick={()=>upd('temp',k)} style={{...styles.tempBtn, flex:1, ...(p.temp===k ? {background:TEMPS[k].bg, color:TEMPS[k].text, borderColor:TEMPS[k].border} : {})}}>
                  <span style={{...styles.tempDot, background:TEMPS[k].dot}}/>{TEMPS[k].label}
                </button>
              ))}
            </div>
          </FormField>
          <FormField label="Key Contact"><input value={p.contact} onChange={e=>upd('contact',e.target.value)} style={styles.input}/></FormField>
          <div className="form-row" style={styles.formRow}>
            <FormField label="Phone"><input value={p.phone} onChange={e=>upd('phone',e.target.value)} style={styles.input}/></FormField>
            <FormField label="Email"><input value={p.email} onChange={e=>upd('email',e.target.value)} style={styles.input}/></FormField>
          </div>
          <FormField label="Mailing Address"><input value={p.address} onChange={e=>upd('address',e.target.value)} style={styles.input}/></FormField>
          <FormField label="Website"><input value={p.website || ''} onChange={e=>upd('website',e.target.value)} placeholder="example.com" style={styles.input}/></FormField>
          <FormField label="Notes"><textarea value={p.notes} onChange={e=>upd('notes',e.target.value)} rows={4} style={{...styles.input, fontFamily:'inherit', resize:'vertical'}}/></FormField>
          <div style={{display:'flex',gap:10,justifyContent:'flex-end',marginTop:16}}>
            <button onClick={onClose} style={styles.btnSecondary}>Cancel</button>
            <button onClick={submit} style={styles.btnPrimary}><Check size={14}/>Save</button>
          </div>
        </div>
      </div>
    </>
  );
}

function FormField({ label, children }) {
  return (
    <div style={{marginBottom:14}}>
      <label style={styles.fieldLabel}>{label}</label>
      {children}
    </div>
  );
}

/* ========== IMPORT MODAL ========== */
function ImportModal({ onImport, onClose }) {
  const [mode, setMode] = useState('csv'); // 'csv' or 'paste'
  const [rawText, setRawText] = useState('');
  const [csvFile, setCsvFile] = useState(null);
  const [parsed, setParsed] = useState([]); // preview rows
  const [defaultTemp, setDefaultTemp] = useState('neutral');
  const [defaultIndustry, setDefaultIndustry] = useState('Other');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const fileInput = useRef();

  // CSV parser — handles quoted fields with commas/newlines
  const parseCSV = (text) => {
    const rows = [];
    let cur = [];
    let field = '';
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQuotes) {
        if (c === '"' && text[i+1] === '"') { field += '"'; i++; }
        else if (c === '"') { inQuotes = false; }
        else { field += c; }
      } else {
        if (c === '"') { inQuotes = true; }
        else if (c === ',') { cur.push(field); field = ''; }
        else if (c === '\n' || c === '\r') {
          if (c === '\r' && text[i+1] === '\n') i++;
          cur.push(field); field = '';
          if (cur.some(v => v.trim())) rows.push(cur);
          cur = [];
        } else { field += c; }
      }
    }
    if (field || cur.length) { cur.push(field); if (cur.some(v => v.trim())) rows.push(cur); }
    return rows;
  };

  // Match common header names (case-insensitive) to our fields
  const normalizeHeader = (h) => {
    const x = (h || '').toLowerCase().trim().replace(/[_\-\s]+/g, '');
    if (/^(company|companyname|business|businessname|account|accountname|name|organization)$/.test(x)) return 'company';
    if (/^(contact|contactname|owner|ownername|primarycontact|decisionmaker|firstname|fullname)$/.test(x)) return 'contact';
    if (/^(phone|phonenumber|tel|telephone|mobile|cell|primaryphone|workphone|mainphone)$/.test(x)) return 'phone';
    if (/^(email|emailaddress|primaryemail|workemail)$/.test(x)) return 'email';
    if (/^(address|mailingaddress|street|streetaddress|location|city|addressline1|fulladdress)$/.test(x)) return 'address';
    if (/^(website|url|web|site|domain|homepage)$/.test(x)) return 'website';
    if (/^(renewal|renewaldate|xdate|expirationdate|policyenddate)$/.test(x)) return 'renewal';
    if (/^(industry|sector|vertical|businesstype|category)$/.test(x)) return 'industry';
    if (/^(temp|temperature|priority|heat)$/.test(x)) return 'temp';
    if (/^(stage|status|pipelinestage|phase)$/.test(x)) return 'stage';
    if (/^(notes|note|comments|description)$/.test(x)) return 'notes';
    return null;
  };

  const matchIndustry = (val) => {
    if (!val) return defaultIndustry;
    const lower = val.toLowerCase();
    const found = INDUSTRIES.find(i => i.toLowerCase() === lower || lower.includes(i.toLowerCase().split(' ')[0]));
    return found || defaultIndustry;
  };

  const matchTemp = (val) => {
    if (!val) return defaultTemp;
    const lower = val.toLowerCase().trim();
    if (lower === 'warm' || lower === 'hot' || lower === 'high') return 'warm';
    if (lower === 'cold' || lower === 'low') return 'cold';
    if (lower === 'neutral' || lower === 'medium' || lower === 'mid') return 'neutral';
    return defaultTemp;
  };

  const matchStage = (val) => {
    if (!val) return 'Prospecting';
    const found = STAGES.find(s => s.toLowerCase() === val.toLowerCase().trim());
    return found || 'Prospecting';
  };

  const processCSV = (text) => {
    setErr('');
    const rows = parseCSV(text);
    if (rows.length === 0) { setErr('CSV appears to be empty.'); return; }

    const headers = rows[0].map(h => h.trim());
    const mapped = headers.map(normalizeHeader);
    if (!mapped.includes('company')) {
      setErr(`Could not find a Company column. Headers found: ${headers.join(', ')}. Need a column named Company, Business, Account, or similar.`);
      return;
    }

    const dataRows = rows.slice(1);
    const results = dataRows.map(row => {
      const obj = { company:'', contact:'', phone:'', email:'', address:'', website:'', renewal:'', industry:defaultIndustry, temp:defaultTemp, stage:'Prospecting', notes:'' };
      mapped.forEach((field, i) => {
        if (!field) return;
        const val = (row[i] || '').trim();
        if (field === 'industry') obj.industry = matchIndustry(val);
        else if (field === 'temp') obj.temp = matchTemp(val);
        else if (field === 'stage') obj.stage = matchStage(val);
        else obj[field] = val;
      });
      return obj;
    }).filter(r => r.company);

    if (results.length === 0) { setErr('No rows with a company name found.'); return; }
    setParsed(results);
  };

  const processPaste = (text) => {
    setErr('');
    if (!text.trim()) { setErr('Nothing to parse.'); return; }

    // Simple paste mode: one company per line. Handles patterns like:
    // "Company Name"
    // "Company Name - contact info"
    // "Company Name, 254-555-1234, email@co.com"
    const lines = text.split(/\n+/).map(l => l.trim()).filter(Boolean);
    const results = lines.map(line => {
      const obj = { company:'', contact:'', phone:'', email:'', address:'', website:'', renewal:'', industry:defaultIndustry, temp:defaultTemp, stage:'Prospecting', notes:'' };

      // Extract phone (loose pattern)
      const phoneMatch = line.match(/(\+?1?[\s.\-]?\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4})/);
      if (phoneMatch) obj.phone = phoneMatch[1];

      // Extract email
      const emailMatch = line.match(/([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/i);
      if (emailMatch) obj.email = emailMatch[1];

      // Extract website (look for domain-ish)
      const urlMatch = line.match(/(https?:\/\/[^\s,]+|(?:www\.)?[a-z0-9-]+\.(?:com|org|net|io|co|biz|us)(?:\/[^\s,]*)?)/i);
      if (urlMatch && !urlMatch[1].includes('@')) obj.website = urlMatch[1];

      // Company name = line with phone/email/url stripped
      let name = line;
      if (phoneMatch) name = name.replace(phoneMatch[1], '');
      if (emailMatch) name = name.replace(emailMatch[1], '');
      if (urlMatch && !urlMatch[1].includes('@')) name = name.replace(urlMatch[1], '');
      name = name.replace(/[,\-|]+/g, ' ').replace(/\s+/g, ' ').trim();
      obj.company = name;

      return obj;
    }).filter(r => r.company);

    if (results.length === 0) { setErr('Could not extract any company names.'); return; }
    setParsed(results);
  };

  const handleFile = (file) => {
    if (!file) return;
    setCsvFile(file);
    const reader = new FileReader();
    reader.onload = (e) => processCSV(e.target.result);
    reader.onerror = () => setErr('Could not read file.');
    reader.readAsText(file);
  };

  const updateParsedField = (idx, field, value) => {
    setParsed(parsed.map((p, i) => i === idx ? { ...p, [field]: value } : p));
  };

  const removeParsedRow = (idx) => {
    setParsed(parsed.filter((_, i) => i !== idx));
  };

  const doImport = () => {
    if (parsed.length === 0) return;
    onImport(parsed);
  };

  return (
    <>
      <div style={styles.scrim} onClick={onClose}/>
      <div style={{...styles.modal, width:700, maxHeight:'90vh'}}>
        <div style={styles.drawerHeader}>
          <h2 style={{margin:0,fontSize:18,fontFamily:'Georgia, serif',color:'#0f172a'}}>Import Accounts</h2>
          <button onClick={onClose} style={styles.iconBtn}><X size={18}/></button>
        </div>

        <div style={{padding:'8px 28px 24px',overflowY:'auto',flex:1}}>
          {/* Mode tabs */}
          <div style={{display:'flex',gap:0,borderBottom:'1px solid #e2e8f0',marginBottom:20}}>
            <button onClick={() => { setMode('csv'); setParsed([]); setErr(''); }} style={{padding:'10px 16px',background:'transparent',border:'none',borderBottom: mode==='csv' ? `2px solid ${BRAND.teal}` : '2px solid transparent',color: mode==='csv' ? '#0f172a' : '#64748b',fontSize:13,fontWeight:500}}>
              CSV File
            </button>
            <button onClick={() => { setMode('paste'); setParsed([]); setErr(''); }} style={{padding:'10px 16px',background:'transparent',border:'none',borderBottom: mode==='paste' ? `2px solid ${BRAND.teal}` : '2px solid transparent',color: mode==='paste' ? '#0f172a' : '#64748b',fontSize:13,fontWeight:500}}>
              Paste List
            </button>
          </div>

          {/* Defaults */}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:16}}>
            <FormField label="Default Industry (when missing)">
              <select value={defaultIndustry} onChange={e => setDefaultIndustry(e.target.value)} style={styles.input}>
                {<IndustryOptions/>}
              </select>
            </FormField>
            <FormField label="Default Temperature (when missing)">
              <select value={defaultTemp} onChange={e => setDefaultTemp(e.target.value)} style={styles.input}>
                <option value="warm">Warm</option>
                <option value="neutral">Neutral</option>
                <option value="cold">Cold</option>
              </select>
            </FormField>
          </div>

          {mode === 'csv' ? (
            <div>
              <div style={{padding:'20px',border:'1px dashed #cbd5e1',borderRadius:8,background:'#f8fafc',textAlign:'center'}}>
                <Upload size={24} style={{color:'#94a3b8',marginBottom:8}}/>
                <div style={{fontSize:13,color:'#475569',marginBottom:10}}>
                  {csvFile ? csvFile.name : 'Drop a CSV or click to choose'}
                </div>
                <input
                  ref={fileInput}
                  type="file"
                  accept=".csv,text/csv"
                  style={{display:'none'}}
                  onChange={e => handleFile(e.target.files[0])}
                />
                <button onClick={() => fileInput.current?.click()} style={styles.btnSecondary}>
                  <Upload size={13}/>{csvFile ? 'Choose different file' : 'Choose CSV'}
                </button>
              </div>
              <div style={{fontSize:11,color:'#94a3b8',marginTop:10,lineHeight:1.5}}>
                Supports: Company, Contact, Phone, Email, Address, Website, Renewal, Industry, Temp, Stage, Notes (header names matched loosely — "Business Name", "Email Address", etc. all work). Only Company is required.
              </div>
            </div>
          ) : (
            <div>
              <FormField label="Paste your list — one company per line">
                <textarea
                  value={rawText}
                  onChange={e => setRawText(e.target.value)}
                  rows={8}
                  style={{...styles.input, fontFamily:'inherit', resize:'vertical'}}
                  placeholder={`Smith Roofing\nABC Landscaping, info@abclandscape.com, abclandscape.com\nJoe's Auto Shop, Waco TX`}
                />
              </FormField>
              <button onClick={() => processPaste(rawText)} style={styles.btnSecondary}>
                <Sparkles size={13}/>Parse List
              </button>
              <div style={{fontSize:11,color:'#94a3b8',marginTop:10,lineHeight:1.5}}>
                Each line becomes one account. The parser auto-detects phone numbers, emails, and websites from each line. Everything else becomes the company name.
              </div>
            </div>
          )}

          {err && <div style={{...styles.errBox, marginTop:14}}><AlertCircle size={13}/>{err}</div>}

          {/* Preview */}
          {parsed.length > 0 && (
            <div style={{marginTop:24}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
                <div style={{fontSize:13,fontWeight:600,color:'#0f172a'}}>Preview ({parsed.length} account{parsed.length===1?'':'s'})</div>
                <button onClick={() => setParsed([])} style={styles.iconBtn}><X size={13}/>Clear</button>
              </div>
              <div style={{maxHeight:300,overflowY:'auto',border:'1px solid #e2e8f0',borderRadius:8}}>
                {parsed.map((p, i) => (
                  <div key={i} style={{padding:'10px 12px',borderBottom: i === parsed.length - 1 ? 'none' : '1px solid #f1f5f9',display:'flex',alignItems:'center',gap:10}}>
                    <div style={{flex:1,minWidth:0}}>
                      <input
                        value={p.company}
                        onChange={e => updateParsedField(i, 'company', e.target.value)}
                        style={{...styles.input, padding:'4px 8px', fontSize:13, fontWeight:500, border:'1px solid transparent', background:'transparent'}}
                        onFocus={e => e.target.style.border='1px solid #e2e8f0'}
                        onBlur={e => e.target.style.border='1px solid transparent'}
                      />
                      <div style={{fontSize:11,color:'#64748b',padding:'0 8px',display:'flex',gap:10,flexWrap:'wrap'}}>
                        {p.phone && <span>📞 {p.phone}</span>}
                        {p.email && <span>✉ {p.email}</span>}
                        {p.website && <span>🌐 {p.website}</span>}
                        {p.contact && <span>👤 {p.contact}</span>}
                        <span style={{color:TEMPS[p.temp].dot,fontWeight:500}}>{p.temp}</span>
                        <span>{p.industry}</span>
                      </div>
                    </div>
                    <button onClick={() => removeParsedRow(i)} style={styles.iconBtn}><Trash2 size={13}/></button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{display:'flex',gap:10,justifyContent:'flex-end',marginTop:20}}>
            <button onClick={onClose} style={styles.btnSecondary}>Cancel</button>
            <button onClick={doImport} disabled={parsed.length === 0} style={{...styles.btnPrimary, opacity: parsed.length === 0 ? 0.5 : 1}}>
              <Check size={14}/>Import {parsed.length > 0 ? `${parsed.length} account${parsed.length===1?'':'s'}` : ''}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

/* ========== IMPORT INFO MODAL (merge into existing account) ========== */
function ImportInfoModal({ account, onClose, onSave }) {
  const [step, setStep] = useState('input'); // 'input' or 'review'
  const [rawText, setRawText] = useState('');
  const [parsed, setParsed] = useState(null); // extracted fields
  const [selections, setSelections] = useState({}); // per-field: 'old' or 'new'
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const FIELDS = [
    { key: 'contact', label: 'Key Contact' },
    { key: 'phone', label: 'Phone' },
    { key: 'email', label: 'Email' },
    { key: 'address', label: 'Address' },
    { key: 'website', label: 'Website' },
    { key: 'renewal', label: 'Renewal Date' },
    { key: 'notes', label: 'Notes (appended)' },
  ];

  // Quick local parser — extracts common patterns without needing AI
  const localParse = (text) => {
    const out = { contact:'', phone:'', email:'', address:'', website:'', renewal:'', notes:'' };

    const phoneMatch = text.match(/(\+?1?[\s.\-]?\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4})/);
    if (phoneMatch) out.phone = phoneMatch[1];

    const emailMatch = text.match(/([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/i);
    if (emailMatch) out.email = emailMatch[1];

    const urlMatch = text.match(/(https?:\/\/[^\s,]+|(?:www\.)?[a-z0-9-]+\.(?:com|org|net|io|co|biz|us)(?:\/[^\s,]*)?)/i);
    if (urlMatch && !urlMatch[1].includes('@')) out.website = urlMatch[1];

    // Renewal date patterns
    const dateMatch = text.match(/(?:renewal|x-date|x\/?date|expir\w*)[\s:]+([A-Za-z0-9\/\-.,\s]{5,25})/i);
    if (dateMatch) out.renewal = dateMatch[1].trim().split(/[,\n]/)[0].trim();

    // Address (loose — city + state pattern)
    const addrMatch = text.match(/(\d+\s+[A-Za-z0-9\s,.]+(?:St|Street|Ave|Avenue|Rd|Road|Blvd|Dr|Drive|Ln|Lane|Ct|Court|Pkwy|Hwy)[A-Za-z0-9\s,.]*\d{5})/i);
    if (addrMatch) out.address = addrMatch[1].trim();
    else {
      const cityMatch = text.match(/([A-Za-z][A-Za-z\s]+,\s*(?:TX|Texas)[\s\d]*)/);
      if (cityMatch) out.address = cityMatch[1].trim();
    }

    // Contact — try "Name: John Smith" or "Contact: ..." patterns
    const contactMatch = text.match(/(?:contact|owner|name|decision maker)[\s:]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/i);
    if (contactMatch) out.contact = contactMatch[1].trim();

    return out;
  };

  // AI-powered parser for messier pastes
  const aiParse = async (text) => {
    setLoading(true); setErr('');
    try {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1024,
          tools: [{
            name: 'extract_info',
            description: 'Extract account contact info from pasted text',
            input_schema: {
              type: 'object',
              properties: {
                contact: { type: 'string', description: 'Primary contact name if mentioned, else empty' },
                phone: { type: 'string', description: 'Primary phone in original format if mentioned, else empty. Never invent.' },
                email: { type: 'string', description: 'Primary email if mentioned, else empty. Never invent.' },
                address: { type: 'string', description: 'Physical address if mentioned, else empty.' },
                website: { type: 'string', description: 'Website/URL if mentioned, else empty. Never invent.' },
                renewal: { type: 'string', description: 'Policy renewal date if mentioned, else empty.' },
                notes: { type: 'string', description: 'A 1-2 sentence summary of any other useful context from the text (company size, recent news, relationships, decision factors). Empty if nothing notable.' }
              },
              required: []
            }
          }],
          tool_choice: { type: 'tool', name: 'extract_info' },
          messages: [{
            role: 'user',
            content: `Extract account contact info from this pasted text. The account is "${account.company}". Only extract fields that are EXPLICITLY in the text — never invent phone numbers, emails, or URLs.\n\nTEXT:\n${text}`
          }]
        })
      });

      if (!r.ok) {
        setErr(`AI error ${r.status}. Falling back to local parser.`);
        const local = localParse(text);
        setParsed(local);
        initSelections(local);
        setStep('review');
        setLoading(false);
        return;
      }

      const data = await r.json();
      const toolUse = data.content?.find(b => b.type === 'tool_use');
      if (toolUse && toolUse.input) {
        const aiParsed = { contact:'', phone:'', email:'', address:'', website:'', renewal:'', notes:'', ...toolUse.input };
        setParsed(aiParsed);
        initSelections(aiParsed);
        setStep('review');
      } else {
        setErr('AI returned no data. Try the local parser instead.');
        const local = localParse(text);
        setParsed(local);
        initSelections(local);
        setStep('review');
      }
    } catch (e) {
      setErr(`Error: ${e.message || 'unknown'}. Using local parser.`);
      const local = localParse(text);
      setParsed(local);
      initSelections(local);
      setStep('review');
    }
    setLoading(false);
  };

  const initSelections = (newData) => {
    const sel = {};
    FIELDS.forEach(f => {
      const oldVal = prospect[f.key] || '';
      const newVal = newData[f.key] || '';
      if (!newVal) sel[f.key] = 'old'; // nothing to import
      else if (!oldVal) sel[f.key] = 'new'; // empty field, default to new
      else sel[f.key] = 'old'; // existing value, default to keeping it (safer)
    });
    setSelections(sel);
  };

  const useLocalParser = () => {
    if (!rawText.trim()) { setErr('Paste some text first.'); return; }
    const local = localParse(rawText);
    setParsed(local);
    initSelections(local);
    setStep('review');
  };

  const applyImport = () => {
    const merged = { ...prospect };
    FIELDS.forEach(f => {
      if (selections[f.key] === 'new' && parsed[f.key]) {
        if (f.key === 'notes') {
          // Append notes rather than replace
          const existing = account.notes ? account.notes.trim() : '';
          const imported = parsed.notes.trim();
          merged.notes = existing ? `${existing}\n\n--- Imported ${new Date().toLocaleDateString()} ---\n${imported}` : imported;
        } else {
          merged[f.key] = parsed[f.key];
        }
      }
    });
    onSave(merged);
  };

  const hasChanges = parsed && FIELDS.some(f => selections[f.key] === 'new' && parsed[f.key]);

  return (
    <>
      <div style={{...styles.scrim, zIndex:60}} onClick={onClose}/>
      <div style={{...styles.modal, width:720, maxHeight:'90vh', zIndex:61}}>
        <div style={styles.drawerHeader}>
          <div>
            <h2 style={{margin:0,fontSize:18,fontFamily:'Georgia, serif',color:'#0f172a'}}>Import Info</h2>
            <div style={{fontSize:12,color:'#64748b',marginTop:2}}>for {account.company}</div>
          </div>
          <button onClick={onClose} style={styles.iconBtn}><X size={18}/></button>
        </div>

        <div style={{padding:'8px 28px 24px',overflowY:'auto',flex:1}}>
          {step === 'input' && (
            <div>
              <div style={{fontSize:13,color:'#475569',marginBottom:14,lineHeight:1.5}}>
                Paste info from ZoomInfo, LinkedIn, a website, an email — anything. I'll extract contact info and show you what would change before saving.
              </div>

              <FormField label="Paste text">
                <textarea
                  value={rawText}
                  onChange={e => setRawText(e.target.value)}
                  rows={10}
                  style={{...styles.input, fontFamily:'inherit', resize:'vertical'}}
                  placeholder="Paste from ZoomInfo, LinkedIn, a company website, an email signature, or anywhere else..."
                />
              </FormField>

              {err && <div style={{...styles.errBox, marginBottom:12}}><AlertCircle size={13}/>{err}</div>}

              <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                <button onClick={() => aiParse(rawText)} disabled={loading || !rawText.trim()} style={{...styles.btnPrimary, opacity: (loading || !rawText.trim()) ? 0.5 : 1}}>
                  {loading ? <Loader2 size={14} className="spin"/> : <Sparkles size={14}/>}
                  {loading ? 'Parsing…' : 'Parse with AI'}
                </button>
                <button onClick={useLocalParser} disabled={!rawText.trim()} style={{...styles.btnSecondary, opacity: !rawText.trim() ? 0.5 : 1}}>
                  Quick parse (offline)
                </button>
                <button onClick={onClose} style={styles.btnSecondary}>Cancel</button>
              </div>
              <div style={{fontSize:11,color:'#94a3b8',marginTop:10,lineHeight:1.5}}>
                AI parse works best for messy text. Quick parse catches common patterns (phone, email, URL) without calling the AI.
              </div>
            </div>
          )}

          {step === 'review' && parsed && (
            <div>
              <div style={{fontSize:13,color:'#475569',marginBottom:14,lineHeight:1.5}}>
                Review each field and pick which value to keep. Fields where nothing was found are grayed out.
              </div>

              <div style={{display:'flex',flexDirection:'column',gap:10}}>
                {FIELDS.map(f => {
                  const oldVal = prospect[f.key] || '';
                  const newVal = parsed[f.key] || '';
                  const nothingToImport = !newVal;
                  const noChange = oldVal === newVal;

                  return (
                    <div key={f.key} style={{border:'1px solid #e2e8f0', borderRadius:8, padding:12, opacity: nothingToImport ? 0.5 : 1}}>
                      <div style={{fontSize:11,color:'#64748b',textTransform:'uppercase',letterSpacing:0.5,fontWeight:600,marginBottom:8}}>{f.label}</div>
                      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                        <button
                          onClick={() => !nothingToImport && setSelections({...selections, [f.key]: 'old'})}
                          disabled={nothingToImport}
                          style={{
                            textAlign:'left',
                            padding:'10px 12px',
                            borderRadius:6,
                            border: selections[f.key] === 'old' ? `2px solid ${BRAND.navy}` : '1px solid #e2e8f0',
                            background: selections[f.key] === 'old' ? '#f8fafc' : '#fff',
                            cursor: nothingToImport ? 'default' : 'pointer',
                            position:'relative'
                          }}
                        >
                          <div style={{fontSize:10,color:'#94a3b8',textTransform:'uppercase',letterSpacing:0.5,fontWeight:600,marginBottom:4}}>Current {selections[f.key] === 'old' && !nothingToImport && '✓'}</div>
                          <div style={{fontSize:13,color: oldVal ? '#0f172a' : '#cbd5e1', wordBreak:'break-word', whiteSpace:'pre-wrap'}}>{oldVal || '(empty)'}</div>
                        </button>
                        <button
                          onClick={() => !nothingToImport && setSelections({...selections, [f.key]: 'new'})}
                          disabled={nothingToImport}
                          style={{
                            textAlign:'left',
                            padding:'10px 12px',
                            borderRadius:6,
                            border: selections[f.key] === 'new' ? `2px solid ${BRAND.teal}` : '1px solid #e2e8f0',
                            background: selections[f.key] === 'new' ? '#F0F7FA' : '#fff',
                            cursor: nothingToImport ? 'default' : 'pointer'
                          }}
                        >
                          <div style={{fontSize:10,color:BRAND.teal,textTransform:'uppercase',letterSpacing:0.5,fontWeight:600,marginBottom:4}}>Imported {selections[f.key] === 'new' && '✓'}</div>
                          <div style={{fontSize:13,color: newVal ? '#0f172a' : '#cbd5e1', wordBreak:'break-word', whiteSpace:'pre-wrap'}}>{newVal || '(nothing found)'}</div>
                        </button>
                      </div>
                      {noChange && !nothingToImport && (
                        <div style={{fontSize:10,color:'#16a34a',marginTop:6}}>Values match — no change either way</div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div style={{display:'flex',gap:8,justifyContent:'space-between',marginTop:20,flexWrap:'wrap'}}>
                <button onClick={() => setStep('input')} style={styles.btnSecondary}>← Back to paste</button>
                <div style={{display:'flex',gap:8}}>
                  <button onClick={onClose} style={styles.btnSecondary}>Cancel</button>
                  <button onClick={applyImport} disabled={!hasChanges} style={{...styles.btnPrimary, opacity: hasChanges ? 1 : 0.5}}>
                    <Check size={14}/>Apply Changes
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

/* ========== DUPLICATE WARNING MODAL ========== */
function DuplicateModal({ incoming, existing, onResolve }) {
  const compare = (label, a, b, isNotes = false) => {
    const both = a && b;
    return (
      <div style={{display:'grid', gridTemplateColumns:'120px 1fr 1fr', gap:10, padding:'8px 0', borderBottom:'1px solid #f1f5f9', fontSize:12, alignItems:'flex-start'}}>
        <div style={{color:'#64748b', fontWeight:600, textTransform:'uppercase', fontSize:10, letterSpacing:0.5, paddingTop:2}}>{label}</div>
        <div style={{color: a ? '#0f172a' : '#cbd5e1', wordBreak:'break-word', whiteSpace: isNotes ? 'pre-wrap' : 'normal'}}>{a || '—'}</div>
        <div style={{color: b ? (both && a !== b ? '#1FA8C1' : '#0f172a') : '#cbd5e1', wordBreak:'break-word', whiteSpace: isNotes ? 'pre-wrap' : 'normal', fontWeight: both && a !== b ? 600 : 400}}>{b || '—'}</div>
      </div>
    );
  };

  return (
    <>
      <div style={{...styles.scrim, zIndex:80}} onClick={() => onResolve('cancel')}/>
      <div style={{...styles.modal, width:680, maxHeight:'85vh', zIndex:81}}>
        <div style={{padding:'18px 24px 4px'}}>
          <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:6}}>
            <div style={{width:32,height:32,borderRadius:8,background:'#fef3c7',display:'flex',alignItems:'center',justifyContent:'center',color:'#b45309'}}>
              <AlertCircle size={18}/>
            </div>
            <h2 style={{margin:0,fontSize:18,fontFamily:'Georgia, serif',color:'#0f172a'}}>Possible Duplicate</h2>
          </div>
          <div style={{fontSize:13, color:'#475569', marginLeft:42, lineHeight:1.5}}>
            <strong>{existing.company}</strong> already exists in your CRM. Compare below and choose what to do.
          </div>
        </div>

        <div style={{padding:'12px 24px', overflowY:'auto', flex:1}}>
          <div style={{display:'grid', gridTemplateColumns:'120px 1fr 1fr', gap:10, padding:'8px 0', borderBottom:'2px solid #e2e8f0', fontSize:11, fontWeight:600, color:'#94a3b8', textTransform:'uppercase', letterSpacing:0.5}}>
            <div></div>
            <div>Existing</div>
            <div>Incoming</div>
          </div>
          {compare('Company', existing.company, incoming.company)}
          {compare('Industry', existing.industry, incoming.industry)}
          {compare('Stage', existing.stage, incoming.stage)}
          {compare('Contact', existing.contact, incoming.contact)}
          {compare('Phone', existing.phone, incoming.phone)}
          {compare('Email', existing.email, incoming.email)}
          {compare('Address', existing.address, incoming.address)}
          {compare('Website', existing.website, incoming.website)}
          {compare('Renewal', existing.renewal, incoming.renewal)}
          {compare('Notes', existing.notes, incoming.notes, true)}
        </div>

        <div style={{padding:'14px 24px 18px', borderTop:'1px solid #e2e8f0', display:'flex', gap:8, justifyContent:'flex-end', flexWrap:'wrap'}}>
          <button onClick={() => onResolve('cancel')} style={styles.btnSecondary}>Cancel</button>
          <button onClick={() => onResolve('add')} style={styles.btnSecondary} title="Create a new account anyway, ignoring the existing one">
            <Plus size={13}/>Add Anyway
          </button>
          <button onClick={() => onResolve('merge')} style={styles.btnPrimary} title="Fill empty fields on the existing account with new info; append notes">
            <Check size={14}/>Merge into Existing
          </button>
        </div>
        <div style={{padding:'0 24px 16px', fontSize:11, color:'#94a3b8', lineHeight:1.5}}>
          <strong>Merge</strong> only fills empty fields on the existing account. It never overwrites data you already have. Notes get appended with a date stamp.
        </div>
      </div>
    </>
  );
}

/* ========== BACKUP / RESTORE MODAL ========== */
function BackupModal({ accountsCount, callsCount, remindersCount, clientWorkCount, prospectingTasksCount, onExport, onImport, onImportText, onClearAll, onClose }) {
  const fileRef = useRef();
  const [importMode, setImportMode] = useState('replace');
  const [err, setErr] = useState('');
  const [success, setSuccess] = useState('');
  const [exportText, setExportText] = useState('');
  const [pasteText, setPasteText] = useState('');
  const [copied, setCopied] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  const handleExport = () => {
    setErr(''); setSuccess('');
    const json = onExport();
    setExportText(json);
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(exportText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: select the textarea so user can ⌘C
      const ta = document.getElementById('backup-export-text');
      if (ta) { ta.focus(); ta.select(); }
    }
  };

  const handleFile = async (file) => {
    if (!file) return;
    setErr(''); setSuccess('');
    try {
      await onImport(file, importMode);
      setSuccess(`Restored from ${file.name}`);
      setTimeout(() => { setSuccess(''); onClose(); }, 1500);
    } catch (e) {
      setErr(e.message || 'Import failed');
    }
  };

  const handlePastedRestore = async () => {
    if (!pasteText.trim()) return;
    setErr(''); setSuccess('');
    try {
      await onImportText(pasteText.trim(), importMode);
      setSuccess(`Restored from pasted backup`);
      setTimeout(() => { setSuccess(''); onClose(); }, 1500);
    } catch (e) {
      setErr(e.message || 'Restore failed');
    }
  };

  return (
    <>
      <div style={{...styles.scrim, zIndex:90}} onClick={onClose}/>
      <div style={{...styles.modal, width:620, maxHeight:'90vh', zIndex:91}}>
        <div style={styles.drawerHeader}>
          <h2 style={{margin:0, fontSize:18, fontFamily:'Georgia, serif', color:'#0f172a'}}>Backup & Restore</h2>
          <button onClick={onClose} style={styles.iconBtn}><X size={18}/></button>
        </div>

        <div style={{padding:'8px 28px 24px', overflowY:'auto', flex:1}}>
          <div style={{fontSize:13, lineHeight:1.5, marginBottom:18, padding:12, background:'#fef3c7', borderRadius:6, border:'1px solid #fde68a', color:'#78350f'}}>
            <strong>Why this matters:</strong> Your CRM data lives in this artifact's storage. Code updates can wipe it. Back up weekly so you never lose your accounts.
          </div>

          {/* Export section */}
          <div style={{marginBottom:24, padding:16, border:'1px solid #e2e8f0', borderRadius:8}}>
            <div style={{fontSize:14, fontWeight:600, color:'#0f172a', marginBottom:6, display:'flex', alignItems:'center', gap:8}}>
              <Download size={15} style={{color:BRAND.teal}}/>Export Backup
            </div>
            <div style={{fontSize:12, color:'#64748b', marginBottom:12}}>
              {accountsCount} accounts, {callsCount} calls, {remindersCount} reminders, {clientWorkCount} client tasks, {prospectingTasksCount} prospecting tasks.
            </div>

            {!exportText ? (
              <button onClick={handleExport} style={styles.btnPrimary}>
                <Download size={14}/>Generate Backup
              </button>
            ) : (
              <>
                <div style={{fontSize:12, color:'#475569', marginBottom:8, lineHeight:1.5}}>
                  Tap <strong>Copy</strong>, then paste into a note in your iCloud Notes app, an email to yourself, or any safe text file.
                </div>
                <textarea
                  id="backup-export-text"
                  readOnly
                  value={exportText}
                  onFocus={e => e.target.select()}
                  style={{
                    width:'100%', minHeight:140, maxHeight:240,
                    fontFamily:'Menlo, monospace', fontSize:11,
                    padding:10, border:'1px solid #e2e8f0', borderRadius:6,
                    background:'#f8fafc', color:'#0f172a',
                    resize:'vertical'
                  }}
                />
                <div style={{display:'flex', gap:8, marginTop:8}}>
                  <button onClick={copyToClipboard} style={styles.btnPrimary}>
                    <Check size={14}/>{copied ? 'Copied!' : 'Copy to Clipboard'}
                  </button>
                  <button onClick={() => setExportText('')} style={styles.btnSecondary}>
                    Hide
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Import section */}
          <div style={{padding:16, border:'1px solid #e2e8f0', borderRadius:8}}>
            <div style={{fontSize:14, fontWeight:600, color:'#0f172a', marginBottom:6, display:'flex', alignItems:'center', gap:8}}>
              <Upload size={15} style={{color:BRAND.teal}}/>Restore from Backup
            </div>

            <div style={{marginBottom:12, marginTop:10}}>
              <label style={{...styles.fieldLabel, marginBottom:8}}>Restore mode</label>
              <div style={{display:'flex', gap:8}}>
                <button onClick={() => setImportMode('replace')} style={{...styles.tempBtn, flex:1, ...(importMode==='replace' ? {background:'#fee2e2', color:'#991b1b', borderColor:'#fca5a5'} : {})}}>
                  Replace All
                </button>
                <button onClick={() => setImportMode('merge')} style={{...styles.tempBtn, flex:1, ...(importMode==='merge' ? {background:'#dbeafe', color:'#1e40af', borderColor:'#93c5fd'} : {})}}>
                  Merge (skip duplicates)
                </button>
              </div>
              <div style={{fontSize:11, color:'#94a3b8', marginTop:6, lineHeight:1.4}}>
                {importMode === 'replace'
                  ? 'Wipes current data and replaces with backup contents.'
                  : 'Adds backup contents alongside current data. Skips accounts already present.'}
              </div>
            </div>

            <div style={{marginBottom:14}}>
              <label style={styles.fieldLabel}>Paste backup text</label>
              <textarea
                value={pasteText}
                onChange={e => setPasteText(e.target.value)}
                placeholder="Paste your backup JSON here…"
                style={{
                  width:'100%', minHeight:100,
                  fontFamily:'Menlo, monospace', fontSize:11,
                  padding:10, border:'1px solid #e2e8f0', borderRadius:6,
                  background:'#fff', resize:'vertical'
                }}
              />
              <button onClick={handlePastedRestore} disabled={!pasteText.trim()} style={{...styles.btnPrimary, marginTop:8, opacity: pasteText.trim() ? 1 : 0.5}}>
                <Upload size={13}/>Restore from Pasted Text
              </button>
            </div>

            <div style={{borderTop:'1px solid #f1f5f9', paddingTop:12, marginTop:6}}>
              <div style={{fontSize:11, color:'#94a3b8', marginBottom:8}}>Or, if you have a saved file:</div>
              <input
                ref={fileRef}
                type="file"
                accept=".json,application/json,text/plain"
                style={{display:'none'}}
                onChange={e => handleFile(e.target.files[0])}
              />
              <button onClick={() => fileRef.current?.click()} style={styles.btnSecondary}>
                <Upload size={13}/>Choose Backup File
              </button>
            </div>

            {err && <div style={{...styles.errBox, marginTop:12}}><AlertCircle size={13}/>{err}</div>}
            {success && (
              <div style={{padding:'10px 12px', background:'#ecfdf5', border:'1px solid #a7f3d0', color:'#065f46', fontSize:12, borderRadius:6, fontWeight:600, marginTop:12}}>
                ✓ {success}
              </div>
            )}
          </div>

          {/* Danger Zone */}
          <div style={{marginTop:24, padding:16, border:'2px solid #fecaca', borderRadius:8, background:'#fef2f2'}}>
            <div style={{fontSize:14, fontWeight:700, color:'#991b1b', marginBottom:6, display:'flex', alignItems:'center', gap:8}}>
              <AlertCircle size={15}/>Danger Zone
            </div>
            <div style={{fontSize:12, color:'#7f1d1d', marginBottom:12, lineHeight:1.5}}>
              Permanently deletes all {accountsCount} accounts, {callsCount} call logs, {remindersCount} reminders, {clientWorkCount} client tasks, and {prospectingTasksCount} prospecting tasks. Cannot be undone. Export a backup first if you might want this data later.
            </div>

            {!confirmClear ? (
              <button onClick={() => setConfirmClear(true)} style={{...styles.btnSecondary, color:'#991b1b', borderColor:'#fca5a5'}}>
                <Trash2 size={13}/>Clear All Data…
              </button>
            ) : (
              <div>
                <div style={{fontSize:12, color:'#7f1d1d', marginBottom:8, fontWeight:600}}>
                  Type <code style={{background:'#fff', padding:'2px 6px', borderRadius:4, border:'1px solid #fca5a5'}}>DELETE</code> to confirm:
                </div>
                <input
                  value={confirmText}
                  onChange={e => setConfirmText(e.target.value)}
                  placeholder="DELETE"
                  style={{...styles.input, marginBottom:8, borderColor:'#fca5a5'}}
                  autoFocus
                />
                <div style={{display:'flex', gap:8}}>
                  <button
                    onClick={async () => {
                      if (confirmText !== 'DELETE') return;
                      await onClearAll();
                      setConfirmClear(false);
                      setConfirmText('');
                      setSuccess('All data cleared');
                      setTimeout(() => { setSuccess(''); onClose(); }, 1500);
                    }}
                    disabled={confirmText !== 'DELETE'}
                    style={{...styles.btnPrimary, background:'#dc2626', opacity: confirmText === 'DELETE' ? 1 : 0.5}}
                  >
                    <Trash2 size={13}/>Permanently Delete Everything
                  </button>
                  <button onClick={() => { setConfirmClear(false); setConfirmText(''); }} style={styles.btnSecondary}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

/* ========== STYLES ========== */
const globalCss = `
  * { box-sizing: border-box; }
  body { margin: 0; }
  html, body, #root { height: 100%; }
  .card { transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease; cursor: pointer; }
  .card:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(15,23,42,0.08); }
  button { font-family: inherit; cursor: pointer; }
  input, select, textarea { font-family: inherit; font-size: 16px; } /* 16px prevents iOS zoom on focus */
  input:focus, select:focus, textarea:focus { outline: none; border-color: #0f172a !important; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .spin { animation: spin 0.8s linear infinite; }
  ::-webkit-scrollbar { width: 8px; height: 8px; }
  ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
  ::-webkit-scrollbar-track { background: transparent; }

  /* Layout */
  .app { display: flex; height: 100vh; height: 100dvh; }
  .app-main { flex: 1; overflow-y: auto; -webkit-overflow-scrolling: touch; }
  .page-pad { max-width: 1200px; margin: 0 auto; padding: 40px 48px 80px; }

  /* Sidebar (desktop default) */
  .sidebar { width: 240px; flex-shrink: 0; display: flex; flex-direction: column; }
  .sidebar-mobile-only { display: none; }
  .sidebar-desktop-only { display: flex; }
  .mobile-tabbar { display: none; }

  /* Drawer / Modal */
  .drawer { position: fixed; top: 0; right: 0; bottom: 0; width: 480px; max-width: 100vw; }
  .modal { width: 560px; max-width: 92vw; }

  /* Grid */
  .card-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 14px; }

  /* Page header (desktop) */
  .page-header { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 24px; gap: 20px; flex-wrap: wrap; }

  /* ===== MOBILE: under 768px ===== */
  @media (max-width: 767px) {
    .sidebar-desktop-only { display: none !important; }
    .sidebar { display: none; }
    .app-main { padding-bottom: 70px; } /* leave room for bottom nav */
    .page-pad { padding: 24px 18px 40px; }

    /* Bottom tab bar */
    .mobile-tabbar {
      display: flex;
      position: fixed; bottom: 0; left: 0; right: 0;
      background: #0F1F42;
      border-top: 1px solid rgba(255,255,255,0.08);
      padding: 8px 4px calc(8px + env(safe-area-inset-bottom));
      z-index: 40;
      justify-content: space-around;
    }
    .mobile-tabbar button {
      flex: 1;
      display: flex; flex-direction: column; align-items: center; gap: 2px;
      background: transparent; border: none;
      color: #64748b; font-size: 8.5px; font-weight: 600;
      padding: 5px 2px; border-radius: 6px;
      text-transform: uppercase; letter-spacing: 0.3px;
    }
    .mobile-tabbar button.active { color: #5BC4D8; }
    .mobile-tabbar .badge {
      position: absolute; top: 2px; right: 30%;
      background: #dc2626; color: #fff;
      font-size: 9px; font-weight: 700;
      padding: 1px 5px; border-radius: 8px;
      min-width: 14px; text-align: center;
    }
    .mobile-tabbar button { position: relative; }

    /* Drawer becomes full-screen on mobile */
    .drawer { width: 100vw; }
    .modal { width: 96vw; max-height: 92vh; }
    .account-modal { width: 100vw !important; height: 100vh !important; max-width: 100vw !important; max-height: 100vh !important; border-radius: 0 !important; transform: none !important; top: 0 !important; left: 0 !important; }

    /* Headers stack */
    .page-header { flex-direction: column; align-items: stretch; }
    .page-header h1 { font-size: 26px !important; }
    .page-header > div:last-child { display: flex; gap: 8px; flex-wrap: wrap; }

    /* Single-column cards */
    .card-grid { grid-template-columns: 1fr; gap: 10px; }

    /* Filter bar stacks */
    .filter-bar { flex-direction: column; align-items: stretch !important; }
    .filter-bar > div { max-width: 100% !important; }

    /* Form rows stack */
    .form-row { grid-template-columns: 1fr !important; }

    /* Tabs scroll horizontally if needed */
    .tab-bar { overflow-x: auto; -webkit-overflow-scrolling: touch; }
    .tab-bar::-webkit-scrollbar { display: none; }

    /* Drawer header padding tightens */
    .drawer-content { padding: 8px 18px 20px !important; }
    .drawer-tab-content { padding: 20px 18px !important; }

    /* Kanban: full-width columns that snap horizontally */
    .kanban-scroll { scroll-padding-left: 18px; }
    .kanban-scroll > div { flex: 0 0 85vw !important; }
  }
`;

const styles = {
  app: { display:'flex', height:'100vh', fontFamily:'-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', background:'#F4F6FA', color:'#0f172a' },

  sidebar: { width:240, background:BRAND.navyDark, color:'#cbd5e1', display:'flex', flexDirection:'column', flexShrink:0 },
  logo: { padding:'24px 20px 28px', display:'flex', alignItems:'center', gap:12, borderBottom:'1px solid rgba(255,255,255,0.08)' },
  logoMark: { width:40, height:40, display:'flex',alignItems:'center',justifyContent:'center', color:'#fff', flexShrink:0 },
  logoTitle: { fontFamily:'Georgia, serif', fontSize:15, color:'#fff', fontWeight:600 },
  logoSub: { fontSize:11, color:'#64748b', textTransform:'uppercase', letterSpacing:1, marginTop:2 },
  nav: { padding:'20px 12px', flex:1, display:'flex', flexDirection:'column', gap:2 },
  navBtn: { display:'flex', alignItems:'center', gap:10, padding:'10px 12px', background:'transparent', border:'none', color:'#94a3b8', borderRadius:6, fontSize:13, fontWeight:500 },
  navBtnActive: { background:'rgba(255,255,255,0.08)', color:'#fff' },
  navCount: { fontSize:11, background:'rgba(255,255,255,0.1)', color:'#fff', padding:'2px 7px', borderRadius:10, fontWeight:600 },
  sidebarFooter: { padding:'16px 20px', borderTop:'1px solid rgba(255,255,255,0.08)' },
  statsBox: { display:'flex',flexDirection:'column',gap:6, marginBottom:14 },
  statRow: { display:'flex', justifyContent:'space-between', fontSize:12, color:'#94a3b8' },
  userTag: { fontSize:11, color:'#64748b', borderTop:'1px solid rgba(255,255,255,0.08)', paddingTop:12, fontFamily:'Georgia, serif', fontStyle:'italic' },

  main: { flex:1, overflowY:'auto' },
  page: { maxWidth:1200, margin:'0 auto', padding:'40px 48px 80px' },
  pageHeader: { display:'flex', justifyContent:'space-between', alignItems:'flex-end', marginBottom:24, gap:20 },
  eyebrow: { fontSize:11, color:'#94a3b8', textTransform:'uppercase', letterSpacing:1.5, marginBottom:6, fontWeight:600 },
  h1: { fontFamily:'Georgia, serif', fontSize:34, fontWeight:600, margin:0, color:'#0f172a', letterSpacing:'-0.02em' },
  subtitle: { fontSize:13, color:'#64748b', marginTop:6 },
  h2: { fontFamily:'Georgia, serif', fontSize:18, fontWeight:600, margin:'0 0 14px', color:'#0f172a', display:'flex',alignItems:'center',gap:10 },
  h2Count: { fontSize:11, color:'#94a3b8', fontFamily:'-apple-system,sans-serif', fontWeight:500, background:'#f1f5f9', padding:'2px 8px', borderRadius:10 },
  industryHeader: { fontFamily:'Georgia, serif', fontSize:14, fontWeight:600, color:'#475569', textTransform:'uppercase', letterSpacing:1, margin:'0 0 12px', display:'flex',alignItems:'center',gap:10 },

  btnPrimary: { display:'inline-flex', alignItems:'center', gap:6, padding:'8px 14px', background:BRAND.navy, color:'#fff', border:'none', borderRadius:6, fontSize:13, fontWeight:500 },
  btnSecondary: { display:'inline-flex', alignItems:'center', gap:6, padding:'8px 14px', background:'transparent', color:'#475569', border:'1px solid #e2e8f0', borderRadius:6, fontSize:13, fontWeight:500 },
  iconBtn: { display:'inline-flex', alignItems:'center', gap:4, padding:6, background:'transparent', color:'#64748b', border:'none', borderRadius:5, fontSize:12 },

  filterBar: { display:'flex', gap:10, marginBottom:8, alignItems:'center' },
  input: { width:'100%', padding:'8px 12px', border:'1px solid #e2e8f0', borderRadius:6, fontSize:13, color:'#0f172a', background:'#fff' },
  select: { padding:'8px 12px', border:'1px solid #e2e8f0', borderRadius:6, fontSize:13, background:'#fff', color:'#0f172a', cursor:'pointer' },

  grid: { display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(280px, 1fr))', gap:14 },
  card: { background:'#fff', border:'1px solid #e2e8f0', borderLeft:'3px solid', borderRadius:8, padding:'14px 16px' },
  cardTop: { display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 },
  tempPill: { display:'inline-flex', alignItems:'center', gap:5, padding:'2px 8px', borderRadius:10, fontSize:10, fontWeight:600, textTransform:'uppercase', letterSpacing:0.5 },
  tempDot: { width:6, height:6, borderRadius:3, display:'inline-block' },
  stagePill: { fontSize:10, color:'#475569', background:'#f1f5f9', padding:'2px 8px', borderRadius:10, fontWeight:500 },
  cardCompany: { fontFamily:'Georgia, serif', fontSize:17, fontWeight:600, color:'#0f172a', marginBottom:2, lineHeight:1.2 },
  cardIndustry: { fontSize:11, color:'#94a3b8', textTransform:'uppercase', letterSpacing:0.5 },
  cardDivider: { borderTop:'1px dashed #e2e8f0', margin:'12px 0 10px' },
  cardFields: { display:'flex',flexDirection:'column', gap:5 },
  cardField: { fontSize:12, color:'#475569', display:'flex', alignItems:'center', gap:7 },

  empty: { padding:'40px 20px', textAlign:'center', color:'#94a3b8', fontSize:13, background:'#fff', borderRadius:8, border:'1px dashed #e2e8f0' },

  /* Drawer */
  scrim: { position:'fixed', inset:0, background:'rgba(15,23,42,0.4)', zIndex:50 },
  drawer: { position:'fixed', top:0, right:0, bottom:0, width:480, maxWidth:'100vw', background:'#fff', zIndex:51, display:'flex', flexDirection:'column', boxShadow:'-8px 0 24px rgba(15,23,42,0.1)' },
  accountModal: { position:'fixed', top:'50%', left:'50%', transform:'translate(-50%,-50%)', width:640, maxWidth:'94vw', height:'85vh', maxHeight:'85vh', background:'#fff', zIndex:51, borderRadius:12, display:'flex', flexDirection:'column', boxShadow:'0 24px 60px rgba(15,23,42,0.25)', overflow:'hidden' },
  drawerHeader: { display:'flex', justifyContent:'space-between', alignItems:'center', padding:'18px 24px 8px' },
  drawerTitle: { fontFamily:'Georgia, serif', fontSize:26, fontWeight:600, color:'#0f172a', margin:0, letterSpacing:'-0.02em' },
  tempControls: { display:'flex', alignItems:'center', gap:6, marginTop:14, flexWrap:'wrap' },
  tempBtn: { padding:'4px 10px', background:'#fff', color:'#64748b', border:'1px solid #e2e8f0', borderRadius:5, fontSize:11, fontWeight:500, display:'inline-flex', alignItems:'center', gap:5, textTransform:'uppercase', letterSpacing:0.4 },
  tabBar: { display:'flex', gap:0, borderTop:'1px solid #e2e8f0', borderBottom:'1px solid #e2e8f0', background:'#f8fafc' },
  tab: { flex:1, padding:'12px 16px', background:'transparent', border:'none', borderBottom:'2px solid transparent', color:'#64748b', fontSize:12, fontWeight:500, textTransform:'capitalize' },
  tabActive: { color:'#0f172a', borderBottomColor:BRAND.teal, background:'#fff' },

  fieldLabel: { display:'block', fontSize:11, color:'#64748b', textTransform:'uppercase', letterSpacing:0.5, marginBottom:5, fontWeight:600 },

  /* Modal form */
  modal: { position:'fixed', top:'50%', left:'50%', transform:'translate(-50%,-50%)', width:560, maxWidth:'92vw', maxHeight:'90vh', background:'#fff', zIndex:51, borderRadius:10, display:'flex', flexDirection:'column', boxShadow:'0 24px 48px rgba(15,23,42,0.2)' },
  formRow: { display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 },

  /* Assistant */
  assistant: { background:'#fff', border:'1px solid #e2e8f0', borderRadius:10, padding:16, boxShadow:'0 1px 2px rgba(15,23,42,0.04)' },
  assistantHeader: { display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12, flexWrap:'wrap', gap:6 },
  assistantInputRow: { display:'flex', gap:8 },
  assistantInput: { flex:1, padding:'10px 14px', border:'1px solid #e2e8f0', borderRadius:6, fontSize:13, color:'#0f172a', background:'#f8fafc' },
  assistantReply: { display:'flex', gap:10, marginTop:12, padding:12, background:'#F0F7FA', border:'1px solid #C8E2EA', borderRadius:6, alignItems:'flex-start' },

  /* Reminders */
  remindersList: { display:'flex', flexDirection:'column', gap:6 },
  reminder: { display:'flex', alignItems:'center', gap:12, padding:'12px 14px', background:'#fff', border:'1px solid #e2e8f0', borderRadius:6 },
  checkbox: { width:18, height:18, border:'1.5px solid #cbd5e1', borderRadius:4, background:'#fff', display:'flex', alignItems:'center', justifyContent:'center', padding:0, flexShrink:0 },
  checkboxChecked: { background:BRAND.navy, borderColor:'#0f172a' },
  checkboxInner: { width:0, height:0 },

  /* Email draft */
  draftBox: { background:'#fafaf9', border:'1px solid #e7e5e4', borderRadius:8, marginTop:4 },
  draftHeader: { display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 14px', borderBottom:'1px solid #e7e5e4' },
  draftBody: { margin:0, padding:'14px 16px', fontSize:13, color:'#1c1917', lineHeight:1.6, fontFamily:'Georgia, serif', whiteSpace:'pre-wrap', wordBreak:'break-word' },
  errBox: { display:'flex', alignItems:'center', gap:8, padding:'10px 12px', background:'#fef2f2', color:'#b91c1c', fontSize:12, borderRadius:6, border:'1px solid #fecaca' },

  /* Calls */
  callsList: { display:'flex', flexDirection:'column', gap:6 },
  callRow: { display:'flex', alignItems:'flex-start', gap:12, padding:'14px 16px', background:'#fff', border:'1px solid #e2e8f0', borderRadius:8 },
  outcomePill: { fontSize:10, color:'#475569', background:'#f1f5f9', padding:'2px 8px', borderRadius:10, fontWeight:500, textTransform:'uppercase', letterSpacing:0.4 },

  /* Quick add */
  quickAdd: { display:'flex', alignItems:'center', gap:10, marginTop:14, padding:'10px 14px', background:'#fff', border:'1px dashed #cbd5e1', borderRadius:8 },
  quickAddInput: { flex:1, border:'none', outline:'none', background:'transparent', fontSize:13, color:'#0f172a' },

  /* Renewals */
  renewalList: { display:'flex', flexDirection:'column', gap:6 },
  renewalRow: { display:'flex', alignItems:'center', gap:12, padding:'12px 16px', background:'#fff', border:'1px solid #e2e8f0', borderRadius:8, cursor:'pointer' },
  daysPill: { fontSize:11, fontWeight:600, padding:'4px 10px', borderRadius:12, textTransform:'lowercase', letterSpacing:0.3, flexShrink:0 },

  /* Kanban */
  kanbanContainer: { display:'flex', gap:14, overflowX:'auto', paddingBottom:20, scrollSnapType:'x mandatory', WebkitOverflowScrolling:'touch' },
  kanbanColumn: { flex:'1 1 0', minWidth:150, background:'#fff', border:'1px solid #e2e8f0', borderRadius:10, display:'flex', flexDirection:'column', maxHeight:'75vh', scrollSnapAlign:'start' },
  kanbanColHeader: { padding:'12px 14px', borderBottom:'1px solid #e2e8f0', display:'flex', justifyContent:'space-between', alignItems:'center', gap:8 },
  kanbanStageNum: { width:22, height:22, borderRadius:11, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, flexShrink:0 },
  kanbanStageTitle: { fontSize:13, fontWeight:600, color:'#0f172a', fontFamily:'Georgia, serif' },
  kanbanStageSub: { fontSize:10, color:'#94a3b8', fontStyle:'italic', marginTop:1 },
  kanbanCount: { fontSize:11, color:'#64748b', background:'#f1f5f9', padding:'2px 8px', borderRadius:10, fontWeight:600 },
  kanbanCardList: { padding:10, display:'flex', flexDirection:'column', gap:8, overflowY:'auto', flex:1 },
  kanbanCard: { background:'#fff', border:'1px solid #e2e8f0', borderLeft:'3px solid', borderRadius:6, padding:'10px 12px', cursor:'pointer' },
  kanbanEmpty: { padding:'20px 10px', textAlign:'center', color:'#cbd5e1', fontSize:11, fontStyle:'italic' },
  kanbanMoveBtn: { width:26, height:26, border:'1px solid #e2e8f0', background:'#fff', color:'#475569', borderRadius:5, fontSize:13, fontWeight:600, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' },
  kanbanStageSelect: { flex:1, border:'1px solid #e2e8f0', borderRadius:5, fontSize:11, padding:'3px 6px', background:'#fff', color:'#475569', cursor:'pointer', minWidth:0 },
};
