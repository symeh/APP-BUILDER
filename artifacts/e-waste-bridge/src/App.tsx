import { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Route, Switch, Link, Router as WouterRouter, useLocation } from 'wouter';
import {
  ArrowRight, BadgeCheck, BatteryWarning, Bell, Box, Camera, Check,
  CheckCircle2, ChevronRight, CircleDollarSign, Cloud, CloudOff, CreditCard,
  FileText, GitCompare, HandCoins, Headphones, ImagePlus, Info, Landmark,
  Leaf, MapPin, MonitorSmartphone, PackageCheck, Phone, Plus, RefreshCw,
  Recycle, Search, ShieldCheck, Sparkles, TriangleAlert, WalletCards,
  WifiOff, X, Zap
} from 'lucide-react';
import NotFound from '@/pages/not-found';

type Role = 'collector' | 'recycler';
type Language = 'English' | 'हिंदी' | 'मराठी';
type LotStatus = 'Draft' | 'Matching' | 'Pickup ready' | 'Handed over' | 'Paid';
type MaterialLot = {
  id: string; category: string; description: string; image?: string; weightKg: number;
  condition: string; estimatedValue: number; quotedPrice: number; finalPrice: number;
  collectedAt: string; collectionLocation: string; status: LotStatus; recyclerId: string;
  revision?: number; syncState?: 'synced' | 'pending' | 'conflict'; lastSyncedAt?: string;
};
type PricePoint = {
  category: string; subcategory: string; location: string; date: string; buyingPrice: number;
  unit: string; marketRange: string; offeredPrice: number; trend: 'up' | 'down' | 'flat';
};
type Recycler = {
  name: string; facilityLocation: string; materialsAccepted: string[]; authorizationId: string;
  authorizationStatus: string; contact: string; offeredRates: string; pickupAvailability: string;
  serviceArea: string; distanceKm: number;
};
type Transaction = {
  lotId: string; collectorId: string; recyclerId: string; quotedPrice: number; finalPrice: number;
  paymentStatus: 'Paid' | 'Pending'; transactionStatus: string; handoverReference: string;
  timestamp: string; gpsLabel: string;
};
type Earnings = { transactionId: string; amount: number; status: 'Paid' | 'Pending'; method: string; date: string };
type SafetyTip = { title: string; copy: string; risk: string; pictogram: string; audioAvailable: boolean };
type SyncActionType = 'create' | 'update' | 'offer' | 'handover';
type SyncActionStatus = 'pending' | 'conflict' | 'synced';
type SyncAction = {
  id: string; type: SyncActionType; lotId: string; label: string; queuedAt: string;
  baseRevision: number; sourceRole: Role; status: SyncActionStatus;
  changes?: Partial<MaterialLot>; conflictMessage?: string; syncedAt?: string;
};

const storageKeys = {
  lots: 'e-waste-bridge:lots',
  transactions: 'e-waste-bridge:transactions',
  syncQueue: 'e-waste-bridge:sync-queue',
  lastSyncedAt: 'e-waste-bridge:last-synced',
};
function readLocal<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const saved = window.localStorage.getItem(key);
    return saved ? JSON.parse(saved) as T : fallback;
  } catch {
    return fallback;
  }
}
function syncTime() {
  return new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}
function actionLabel(type: SyncActionType, lotId: string) {
  if (type === 'create') return `New lot ${lotId}`;
  if (type === 'offer') return `Recycler offer · ${lotId}`;
  if (type === 'handover') return `Handover · ${lotId}`;
  return `Lot details edited · ${lotId}`;
}

const queryClient = new QueryClient();
const prices: PricePoint[] = [
  { category: 'Circuit boards', subcategory: 'Mixed PCB', location: 'Pune', date: 'Today', buyingPrice: 285, unit: 'kg', marketRange: '₹250–₹310', offeredPrice: 275, trend: 'up' },
  { category: 'Copper wire', subcategory: 'Insulated wire', location: 'Pune', date: 'Today', buyingPrice: 505, unit: 'kg', marketRange: '₹470–₹530', offeredPrice: 490, trend: 'flat' },
  { category: 'Aluminium', subcategory: 'Frames & heat sinks', location: 'Mumbai', date: 'Today', buyingPrice: 142, unit: 'kg', marketRange: '₹125–₹155', offeredPrice: 135, trend: 'up' },
  { category: 'Batteries', subcategory: 'Lead-acid', location: 'Pune', date: 'Today', buyingPrice: 92, unit: 'kg', marketRange: '₹78–₹100', offeredPrice: 88, trend: 'down' },
  { category: 'Screens', subcategory: 'LCD / LED', location: 'Nashik', date: 'Yesterday', buyingPrice: 68, unit: 'piece', marketRange: '₹55–₹75', offeredPrice: 62, trend: 'flat' },
];
const recyclers: Recycler[] = [
  { name: 'GreenLoop Recovery', facilityLocation: 'Bhosari, Pune', materialsAccepted: ['PCB', 'Wire', 'Aluminium'], authorizationId: 'MPCB / EPR-4421', authorizationStatus: 'Verified', contact: '+91 98220 18442', offeredRates: '₹275/kg PCB', pickupAvailability: 'Tomorrow, 9–12', serviceArea: 'Pune north', distanceKm: 4.8 },
  { name: 'Sahyadri E-Cycle', facilityLocation: 'Kondhwa, Pune', materialsAccepted: ['Batteries', 'Screens', 'Wire'], authorizationId: 'MPCB / EPR-1937', authorizationStatus: 'Verified', contact: '+91 90110 66208', offeredRates: '₹490/kg wire', pickupAvailability: 'Today, 3–6', serviceArea: 'Pune city', distanceKm: 8.2 },
];
const safetyTips: SafetyTip[] = [
  { title: 'Batteries', copy: 'Keep batteries separate. Cover loose terminals with tape. Do not crush or throw into fire.', risk: 'Fire and chemical risk', pictogram: 'battery', audioAvailable: true },
  { title: 'CRT screens', copy: 'Do not break old TV or monitor glass. Keep the screen face up and ask for trained handling.', risk: 'Glass and lead risk', pictogram: 'screen', audioAvailable: true },
  { title: 'No burning', copy: 'Burning wires makes poisonous smoke. Use a recycler who can recover the metal safely.', risk: 'Toxic smoke', pictogram: 'fire', audioAvailable: false },
  { title: 'Opening devices', copy: 'Remove power first. Use gloves and tools. Stop if a battery is swollen or hot.', risk: 'Shock and sharp parts', pictogram: 'tools', audioAvailable: true },
];
const initialLots: MaterialLot[] = [
  { id: 'LOT-2407', category: 'Circuit boards', description: 'Mixed boards from desktop towers', weightKg: 8.5, condition: 'Sorted, dry', estimatedValue: 2412, quotedPrice: 2337, finalPrice: 0, collectedAt: 'Today, 10:20', collectionLocation: 'Shivaji Nagar, Pune', status: 'Matching', recyclerId: 'GreenLoop Recovery' },
  { id: 'LOT-2398', category: 'Copper wire', description: 'Insulated cable, mixed lengths', weightKg: 12, condition: 'Needs sorting', estimatedValue: 6060, quotedPrice: 5880, finalPrice: 5880, collectedAt: '18 Jun 2024', collectionLocation: 'Pimpri market', status: 'Paid', recyclerId: 'Sahyadri E-Cycle' },
  { id: 'LOT-2385', category: 'Screens', description: 'LCD screens, 6 pieces', weightKg: 14, condition: 'Intact', estimatedValue: 952, quotedPrice: 868, finalPrice: 0, collectedAt: '11 Jun 2024', collectionLocation: 'Akurdi', status: 'Pickup ready', recyclerId: 'Sahyadri E-Cycle' },
];
const initialTransactions: Transaction[] = [
  { lotId: 'LOT-2398', collectorId: 'COL-1042', recyclerId: 'Sahyadri E-Cycle', quotedPrice: 5880, finalPrice: 5880, paymentStatus: 'Paid', transactionStatus: 'Completed', handoverReference: 'HB-18JUN-2398', timestamp: '18 Jun 2024, 16:40', gpsLabel: 'Pimpri market' },
  { lotId: 'LOT-2370', collectorId: 'COL-1042', recyclerId: 'GreenLoop Recovery', quotedPrice: 4120, finalPrice: 4120, paymentStatus: 'Paid', transactionStatus: 'Completed', handoverReference: 'HB-08JUN-2370', timestamp: '08 Jun 2024, 12:12', gpsLabel: 'Bhosari MIDC' },
];

function formatMoney(value: number) { return `₹${value.toLocaleString('en-IN')}`; }
function IconFor({ name }: { name: string }) {
  if (name === 'battery') return <BatteryWarning />;
  if (name === 'screen') return <MonitorSmartphone />;
  if (name === 'fire') return <TriangleAlert />;
  return <Zap />;
}
function StatusPill({ status }: { status: string }) {
  const kind = status.toLowerCase().includes('paid') || status.toLowerCase().includes('complete') || status.toLowerCase().includes('verified') ? 'paid' : status.toLowerCase().includes('pending') || status.toLowerCase().includes('matching') ? 'waiting' : 'matched';
  return <span className={`lot-status ${kind}`} data-testid={`status-${status.toLowerCase().replaceAll(' ', '-')}`}><span>{status}</span></span>;
}
function SyncBadge({ status }: { status: SyncActionStatus }) {
  const label = status === 'conflict' ? 'Needs review' : status === 'pending' ? 'Pending' : 'Synced';
  return <span className={`sync-badge ${status}`}><span className="sync-badge-dot" />{label}</span>;
}
type SyncPanelProps = {
  queue: SyncAction[]; lastSyncedAt: string; networkAvailable: boolean; offlineMode: boolean;
  onToggleOffline: () => void; onSync: () => void;
  onResolveConflict: (actionId: string, resolution: 'local' | 'shared') => void;
};
function SyncQueuePanel({ queue, lastSyncedAt, networkAvailable, offlineMode, onToggleOffline, onSync, onResolveConflict }: SyncPanelProps) {
  const active = queue.filter(action => action.status !== 'synced');
  const recent = queue.filter(action => action.status === 'synced').slice(-3).reverse();
  const pendingCount = active.filter(action => action.status === 'pending').length;
  return <div className="card card-pad sync-panel" data-testid="card-sync-queue">
    <div className="card-header">
      <div><h2 className="section-title"><Cloud size={17} style={{ verticalAlign: 'middle', marginRight: 7 }} />Sync queue</h2><div className="small-copy" style={{ marginTop: 5 }}>Saved locally first. Nothing is lost when the signal drops.</div></div>
      <span className={`network-state ${networkAvailable ? 'online' : 'offline'}`}><span className="network-state-dot" />{networkAvailable ? 'Connection available' : 'Working offline'}</span>
    </div>
    <div className="sync-summary">
      <div><strong>{active.length}</strong> waiting {active.length === 1 ? 'item' : 'items'} <span className="small-copy">· Last synchronized {lastSyncedAt}</span></div>
      <div className="sync-actions"><button className="button button-quiet button-small" onClick={onToggleOffline} data-testid="button-toggle-offline"><WifiOff size={14} />{offlineMode ? 'Use connection' : 'Work offline'}</button><button className="button button-primary button-small" onClick={onSync} disabled={!networkAvailable || pendingCount === 0} data-testid="button-sync-now"><RefreshCw size={14} />Sync now</button></div>
    </div>
    {active.length > 0 ? <div className="sync-list">{active.map(action => <div className="sync-row" key={action.id} data-testid={`sync-row-${action.lotId}-${action.type}`}>
      <div className="sync-row-icon">{action.status === 'conflict' ? <GitCompare size={15} /> : <CloudOff size={15} />}</div>
      <div className="sync-row-copy"><strong>{action.label}</strong><span>Queued {action.queuedAt} · {action.sourceRole === 'collector' ? 'Collector' : 'Recycler'}</span>{action.conflictMessage && <em>{action.conflictMessage}</em>}</div>
      <div className="sync-row-end"><SyncBadge status={action.status} />{action.status === 'conflict' && <div className="conflict-actions"><button className="button button-outline button-small" onClick={() => onResolveConflict(action.id, 'local')} data-testid={`button-keep-local-${action.lotId}`}>Keep my copy</button><button className="button button-quiet button-small" onClick={() => onResolveConflict(action.id, 'shared')} data-testid={`button-use-shared-${action.lotId}`}>Use shared</button></div>}</div>
    </div>)}</div> : <div className="sync-empty"><CheckCircle2 size={17} /><span>No pending changes. New lots, edits and handovers will appear here.</span></div>}
    {recent.length > 0 && <div className="sync-history"><div className="section-meta">Recent completed sync</div>{recent.map(action => <div className="sync-history-row" key={`${action.id}-history`}><CheckCircle2 size={14} /><span>{action.label}</span><span className="small-copy">Completed {action.syncedAt}</span></div>)}</div>}
  </div>;
}

function LoginPage({ onSelectRole }: { onSelectRole: (role: Role) => void }) {
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        background: '#f7f4ec',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 760,
          textAlign: 'center',
        }}
      >
        <div
          className="brand-mark"
          style={{
            width: 58,
            height: 58,
            margin: '0 auto 18px',
            fontSize: 18,
          }}
        >
          e•w
        </div>

        <div className="eyebrow">E-waste Bridge</div>

        <h1
          className="page-title"
          style={{
            fontSize: 38,
            marginTop: 8,
          }}
        >
          Choose how you want to continue
        </h1>

        <p
          className="page-intro"
          style={{
            maxWidth: 520,
            margin: '10px auto 30px',
          }}
        >
          Select your role to enter the E-waste Bridge workspace.
        </p>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: 18,
            textAlign: 'left',
          }}
        >
          {/* Collector */}
          <button
            className="card card-pad"
            style={{
              cursor: 'pointer',
              border: '1px solid #e4ddce',
              background: '#fffdf7',
              textAlign: 'left',
            }}
            onClick={() => onSelectRole('collector')}
            data-testid="button-login-collector"
          >
            <div
              className="quick-icon"
              style={{
                width: 48,
                height: 48,
                marginBottom: 18,
              }}
            >
              <Recycle size={22} />
            </div>

            <div className="section-meta">COLLECTOR</div>

            <h2
              className="section-title"
              style={{
                fontSize: 24,
                marginTop: 7,
              }}
            >
              I collect e-waste
            </h2>

            <p
              className="small-copy"
              style={{
                fontSize: 12,
                lineHeight: 1.6,
                marginTop: 8,
              }}
            >
              Create lots, check prices, find recyclers and track your
              handovers and earnings.
            </p>

            <div
              className="button button-primary"
              style={{
                marginTop: 20,
                width: '100%',
                justifyContent: 'center',
              }}
            >
              Continue as Collector
              <ArrowRight size={15} />
            </div>
          </button>

          {/* Recycler */}
          <button
            className="card card-pad"
            style={{
              cursor: 'pointer',
              border: '1px solid #e4ddce',
              background: '#fffdf7',
              textAlign: 'left',
            }}
            onClick={() => onSelectRole('recycler')}
            data-testid="button-login-recycler"
          >
            <div
              className="quick-icon"
              style={{
                width: 48,
                height: 48,
                marginBottom: 18,
                background: '#e4e9db',
                color: '#597649',
              }}
            >
              <PackageCheck size={22} />
            </div>

            <div className="section-meta">RECYCLER</div>

            <h2
              className="section-title"
              style={{
                fontSize: 24,
                marginTop: 7,
              }}
            >
              I recycle e-waste
            </h2>

            <p
              className="small-copy"
              style={{
                fontSize: 12,
                lineHeight: 1.6,
                marginTop: 8,
              }}
            >
              Review incoming lots, send offers, confirm pickups and record
              traceable handovers.
            </p>

            <div
              className="button button-gold"
              style={{
                marginTop: 20,
                width: '100%',
                justifyContent: 'center',
              }}
            >
              Continue as Recycler
              <ArrowRight size={15} />
            </div>
          </button>
        </div>

        <div
          className="small-copy"
          style={{
            marginTop: 24,
          }}
        >
          Demo access · No account or password required
        </div>
      </div>
    </main>
  );
}

function Navigation({ role }: { role: Role }) {
  const [location] = useLocation();
  const items = role === 'collector'
    ? [{ href: '/', label: 'My home', icon: Landmark }, { href: '/new-lot', label: 'New lot', icon: Plus }, { href: '/prices', label: 'Price board', icon: CircleDollarSign }, { href: '/lots', label: 'My lots', icon: Box }, { href: '/earnings', label: 'Earnings', icon: WalletCards }, { href: '/safety', label: 'Safety guide', icon: ShieldCheck }]
    : [{ href: '/', label: 'Intake overview', icon: Landmark }, { href: '/recycler', label: 'Intake queue', icon: PackageCheck }, { href: '/prices', label: 'Price board', icon: CircleDollarSign }, { href: '/safety', label: 'Safety guide', icon: ShieldCheck }];
  return <><aside className="app-rail">
    <div className="brand-lockup"><div className="brand-mark">e•w</div><div><div className="brand-name">E-waste Bridge</div><div className="brand-sub">field exchange</div></div></div>
    <div className="nav-label">{role === 'collector' ? 'Collector view' : 'Recycler view'}</div>
    <nav className="nav-stack">{items.map(({ href, label, icon: Icon }) => <Link key={href} href={href} className={`nav-item ${location === href ? 'active' : ''}`} data-testid={`link-nav-${label.toLowerCase().replaceAll(' ', '-')}`}><Icon /><span>{label}</span></Link>)}</nav>
    <div className="rail-bottom"><div className="demo-stamp"><strong>Demo workspace</strong>Local data only. Your lots stay on this phone until sync.</div></div>
  </aside>
  <nav className="mobile-nav">{items.slice(0, 4).map(({ href, label, icon: Icon }) => <Link key={href} href={href} className={location === href ? 'active' : ''} data-testid={`link-mobile-${label.toLowerCase().replaceAll(' ', '-')}`}><Icon /><span>{label}</span></Link>)}</nav></>;
}

function Topbar({
  language,
  setLanguage,
  queue,
  networkAvailable
}: {
  language: Language;
  setLanguage: (l: Language) => void;
  queue: SyncAction[];
  networkAvailable: boolean;
}) {
  const activeCount = queue.filter(action => action.status !== 'synced').length;
  return <header className="topbar"><div className="top-context"><Leaf size={16} /> Practical tools for a fair handover <span className={`offline-pill ${networkAvailable ? 'connected' : ''}`}><span className="offline-dot" />{networkAvailable ? 'Sync ready' : 'Offline mode'}{activeCount > 0 ? ` · ${activeCount} pending` : ''}</span></div>
  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
    <select className="select" style={{ width: 104, height: 34, padding: '0 8px', fontSize: 11 }} value={language} onChange={e => setLanguage(e.target.value as Language)} data-testid="select-language"><option>English</option><option>हिंदी</option><option>मराठी</option></select>
    <button className="button button-quiet button-small" aria-label="Notifications" data-testid="button-notifications"><Bell size={15} /></button>
  </div></header>;
}

function Shell({
  children,
  role,
  language,
  setLanguage,
  queue,
  networkAvailable
}: {
  children: React.ReactNode;
  role: Role;
  language: Language;
  setLanguage: (l: Language) => void;
  queue: SyncAction[];
  networkAvailable: boolean;
}) {
  return (
    <div className="app-shell">
      <Navigation role={role} />

      <div className="main-column">
        <Topbar
          language={language}
          setLanguage={setLanguage}
          queue={queue}
          networkAvailable={networkAvailable}
        />

        {children}
      </div>
    </div>
  );
}

function Home({ role, lots, applyChange, showToast, sync }: { role: Role; lots: MaterialLot[]; applyChange: (id: string, changes: Partial<MaterialLot>, type: SyncActionType, label?: string) => void; showToast: (text: string) => void; sync: SyncPanelProps }) {
  const latest = lots[0];
  if (role === 'recycler') return <RecyclerHome lots={lots} applyChange={applyChange} showToast={showToast} sync={sync} />;
  return <main className="page">
    <div className="page-heading"><div><div className="eyebrow">Tuesday · 25 June 2024 · Pune</div>
      <h1 className="page-title">Good morning, userName.</h1>
      <p className="page-intro">Turn today’s collection into a fair, visible handover. You are ready to go.</p></div>
      <Link href="/new-lot" className="button button-gold" data-testid="button-start-lot">
      <Plus size={16} /> Start a new lot</Link></div>
    <div className="grid grid-4" style={{ marginBottom: 18 }}>
      <div className="card stat-card">
      <div className="stat-label">Lots handed over</div><div className="stat-value">06</div>
      <div className="stat-note">All traceable</div></div><div className="card stat-card">
      <div className="stat-label">Waiting for pickup</div><div className="stat-value">02</div>
      <div className="stat-note" style={{ color: '#b7684e' }}>Action needed</div></div><div className="card stat-card">
      <div className="stat-label">Saved offline</div><div className="stat-value">03</div>
      <div className="stat-note">Will sync later</div></div></div>
    <div className="grid grid-2" style={{ marginBottom: 18 }}><div className="hero-card"><div className="hero-tag">One clear bridge</div><h2>Your material has a value. Let’s show it.</h2><p>Photograph, weigh and share one lot. Nearby verified recyclers can see the same details and make a fair offer.</p><Link href="/new-lot" className="button button-gold" data-testid="button-create-first-lot">Create a lot <ArrowRight size={15} /></Link></div><div className="card card-pad"><div className="card-header"><h2 className="section-title">Quick actions</h2><span className="section-meta">3 useful steps</span></div><div className="grid grid-2"><Link href="/new-lot" className="quick-action" data-testid="link-quick-new-lot"><span className="quick-icon"><Camera size={18} /></span><span><span className="quick-label">Add a lot</span><span className="quick-sub">Photo + weight</span></span></Link><Link href="/prices" className="quick-action" data-testid="link-quick-prices"><span className="quick-icon" style={{ background: '#f6e9c8', color: '#9c6d1e' }}><CircleDollarSign size={18} /></span><span><span className="quick-label">Check prices</span><span className="quick-sub">Today in Pune</span></span></Link><Link href="/safety" className="quick-action" data-testid="link-quick-safety"><span className="quick-icon" style={{ background: '#f5dfd8', color: '#a45339' }}><ShieldCheck size={18} /></span><span><span className="quick-label">Stay safe</span><span className="quick-sub">4 simple guides</span></span></Link><Link href="/earnings" className="quick-action" data-testid="link-quick-earnings"><span className="quick-icon" style={{ background: '#e4e9db', color: '#597649' }}><HandCoins size={18} /></span><span><span className="quick-label">See earnings</span><span className="quick-sub">Your ledger</span></span></Link></div></div></div>
    <div className="grid grid-2"><div className="card card-pad"><div className="card-header"><h2 className="section-title">Active lot</h2><Link href="/lots" className="section-meta" data-testid="link-view-all-lots">View all <ChevronRight size={13} style={{ verticalAlign: 'middle' }} /></Link></div><div className="lot-row"><div className="lot-thumb"><Recycle size={21} /></div><div><div className="lot-name">{latest.category}</div><div className="lot-desc">{latest.weightKg} kg · {latest.collectionLocation}</div></div><div className="lot-amount"><strong>{formatMoney(latest.quotedPrice)}</strong><br /><StatusPill status={latest.status} /></div></div><div className="divider" /><div className="small-copy" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}><span>Handover progress</span><strong style={{ color: '#3d7253' }}>2 of 4 steps</strong></div><div className="progress-line"><span style={{ width: '50%' }} /></div></div><div className="card card-pad match-card"><div className="card-header"><h2 className="section-title">Nearby recycler match</h2><span className="lot-status matched">Best match</span></div><div className="match-facility"><div className="facility-badge">GR</div><div><div className="lot-name">GreenLoop Recovery</div><div className="lot-desc"><MapPin size={11} style={{ verticalAlign: 'middle' }} /> 4.8 km · Bhosari</div></div></div><div className="divider" /><div className="grid grid-2"><div><div className="section-meta">Their offer</div><div className="stat-value" style={{ fontSize: 22, marginTop: 5 }}>₹275<span style={{ fontSize: 11, letterSpacing: 0 }}>/kg</span></div></div><div><div className="section-meta">Pickup</div><div className="lot-name" style={{ marginTop: 10 }}>Tomorrow, 9–12</div></div></div><button className="button button-primary" style={{ width: '100%', marginTop: 16 }} onClick={() => showToast('GreenLoop marked for your handover')} data-testid="button-choose-recycler">Choose this recycler <ArrowRight size={15} /></button></div></div>
    <div className="card card-pad" style={{ marginTop: 18 }}><div className="card-header"><h2 className="section-title">Today’s price snapshot</h2><Link href="/prices" className="section-meta" data-testid="link-see-price-board">Full price board <ChevronRight size={13} style={{ verticalAlign: 'middle' }} /></Link></div><div className="grid grid-3">{prices.slice(0, 3).map(p => <div key={p.category}><div className="section-meta">{p.category}</div><div style={{ color: '#294d44', fontFamily: 'Space Grotesk', fontSize: 22, marginTop: 7 }}>{formatMoney(p.buyingPrice)}<small style={{ color: '#7b8c83', fontFamily: 'Manrope', fontSize: 10 }}> / {p.unit}</small></div><div className={p.trend === 'up' ? 'trend-up' : 'trend-flat'} style={{ fontSize: 10, marginTop: 3 }}>{p.trend === 'up' ? '↑ Up today' : '→ Stable today'}</div></div>)}</div></div>
    <div className="notice" style={{ marginTop: 18 }}><ShieldCheck size={16} /><span><strong>Safety first:</strong> Keep batteries separate from the rest of your pile. Never burn wires. <Link href="/safety" style={{ color: '#2f694d', fontWeight: 800 }} data-testid="link-safety-reminder">See the picture guide.</Link></span></div>
    <SyncQueuePanel {...sync} />
  </main>;
}

function RecyclerHome({ lots, applyChange, showToast, sync }: { lots: MaterialLot[]; applyChange: (id: string, changes: Partial<MaterialLot>, type: SyncActionType, label?: string) => void; showToast: (text: string) => void; sync: SyncPanelProps }) {
  const active = lots.filter(l => l.status === 'Matching' || l.status === 'Pickup ready');
return <main className="page"><div className="page-heading"><div><div className="eyebrow">Recycler workspace · local intake</div><h1 className="page-title">Good morning, Priya.</h1><p className="page-intro">A clear queue for material that is ready to move safely into your facility.</p></div><Link href="/recycler" className="button button-gold" data-testid="button-open-queue"><PackageCheck size={16} /> Open intake queue</Link></div><div className="grid grid-4" style={{ marginBottom: 18 }}><div className="card stat-card"><div className="stat-label">Awaiting your review</div><div className="stat-value">{active.length}</div><div className="stat-note">Collector lots nearby</div></div><div className="card stat-card"><div className="stat-label">Pickup today</div><div className="stat-value">04</div><div className="stat-note">Across Pune</div></div><div className="card stat-card"><div className="stat-label">Material received</div><div className="stat-value">1.8 t</div><div className="stat-note">This month</div></div><div className="card stat-card"><div className="stat-label">Authorization</div><div className="stat-value" style={{ fontSize: 19, marginTop: 18 }}>Verified</div><div className="stat-note">MPCB / EPR-4421</div></div></div><div className="grid grid-2"><div className="hero-card"><div className="hero-tag">Operations view</div><h2>Review the collector’s material, offer a rate and leave a trace of the handover.</h2><Link href="/recycler" className="button button-gold" data-testid="button-review-intake">Review intake <ArrowRight size={15} /> </Link></div></div><SyncQueuePanel {...sync} /></main>;}

function Prices() {
  const [category, setCategory] = useState('All materials');
  const [location, setLocation] = useState('Pune');
  const [trendView, setTrendView] = useState(false);
  const filtered = prices.filter(p => (category === 'All materials' || p.category === category) && (location === 'All locations' || p.location === location));
  const speak = (p: PricePoint) => { if ('speechSynthesis' in window) window.speechSynthesis.speak(new SpeechSynthesisUtterance(`${p.category} is ${p.buyingPrice} rupees per ${p.unit} in ${p.location}`)); };
  return <main className="page"><div className="page-heading"><div><div className="eyebrow">Live board · updated 25 June, 10:30</div><h1 className="page-title">Know your rate.</h1><p className="page-intro">A simple view of what verified recyclers are buying today. Rates are a guide; your lot gets a clear quote.</p></div><button className="button button-primary" onClick={() => { if ('speechSynthesis' in window) window.speechSynthesis.speak(new SpeechSynthesisUtterance('Today’s price board for Pune.')); }} data-testid="button-speak-prices"><Headphones size={16} /> Speak prices</button></div><div className="card card-pad"><div className="filter-row"><div className="field"><label className="field-label">Material</label><select className="select" value={category} onChange={e => setCategory(e.target.value)} data-testid="select-price-material"><option>All materials</option>{Array.from(new Set(prices.map(p => p.category))).map(x => <option key={x}>{x}</option>)}</select></div><div className="field"><label className="field-label">Location</label><select className="select" value={location} onChange={e => setLocation(e.target.value)} data-testid="select-price-location"><option>All locations</option><option>Pune</option><option>Mumbai</option><option>Nashik</option></select></div><div style={{ marginLeft: 'auto', alignSelf: 'end' }}><button className={`button button-small ${!trendView ? 'button-primary' : 'button-quiet'}`} onClick={() => setTrendView(false)} data-testid="button-current-rates">Current rates</button><button className={`button button-small ${trendView ? 'button-primary' : 'button-quiet'}`} onClick={() => setTrendView(true)} data-testid="button-price-trend">7-day trend</button></div></div>{trendView ? <div><div className="card-header" style={{ marginTop: 22 }}><div><h2 className="section-title">Mixed PCB · Pune</h2><div className="small-copy">Buying rate movement over the last 7 days</div></div><span className="trend-up">↑ 8.4%</span></div><div className="trend-chart">{[46, 59, 53, 68, 72, 79, 88].map((height, i) => <div key={i} style={{ flex: 1 }}><div className={`bar ${i === 6 ? 'highlight' : ''}`} style={{ height: `${height}%` }} /><div className="bar-label">{['19','20','21','22','23','24','25'][i]} Jun</div></div>)}</div><div className="small-copy" style={{ marginTop: 16 }}>Rates move with metal recovery value and local demand. Confirm the offer before handover.</div></div> : <div className="table-wrap"><table className="price-table"><thead><tr><th>Material</th><th>Today’s buy rate</th><th>Market range</th><th>Movement</th><th aria-label="Listen" /></tr></thead><tbody>{filtered.map((p, i) => <tr key={`${p.category}-${i}`} data-testid={`row-price-${i}`}><td><strong>{p.category}</strong><br /><span className="small-copy">{p.subcategory} · {p.location}</span></td><td><strong style={{ fontFamily: 'DM Mono' }}>{formatMoney(p.buyingPrice)}</strong> <span className="small-copy">/ {p.unit}</span></td><td className="small-copy">{p.marketRange}</td><td className={p.trend === 'up' ? 'trend-up' : p.trend === 'down' ? 'trend-down' : 'trend-flat'}>{p.trend === 'up' ? '↑ Rising' : p.trend === 'down' ? '↓ Softer' : '→ Steady'}</td><td><button className="audio-button" style={{ position: 'static' }} onClick={() => speak(p)} aria-label={`Speak ${p.category} price`} data-testid={`button-speak-${i}`}><Headphones size={14} /></button></td></tr>)}</tbody></table>{filtered.length === 0 && <div className="empty-state"><Search size={28} /><h3>No rate found</h3><p>Try another material or location.</p></div>}</div>}</div><div className="notice" style={{ marginTop: 16 }}><Info size={16} /><span><strong>How to use this:</strong> Show this board when discussing a quote. The offered price can change with condition, sorting and weight.</span></div></main>;
}

function NewLot({ onCreate, showToast }: { onCreate: (lot: MaterialLot) => void; showToast: (text: string) => void }) {
  const [category, setCategory] = useState('Circuit boards'); const [weight, setWeight] = useState('8'); const [condition, setCondition] = useState('Sorted, dry'); const [description, setDescription] = useState(''); const [image, setImage] = useState(''); const [submitted, setSubmitted] = useState(false);
  const rate = category === 'Circuit boards' ? 285 : category === 'Copper wire' ? 505 : category === 'Batteries' ? 92 : 68;
  const estimate = Math.round((Number(weight) || 0) * rate * .95);
  const handleCreate = () => { if (!Number(weight) || Number(weight) <= 0) return; onCreate({ id: `LOT-${Math.floor(2400 + Math.random() * 500)}`, category, description: description || `Collected ${category.toLowerCase()} for safe recovery`, image, weightKg: Number(weight), condition, estimatedValue: estimate, quotedPrice: 0, finalPrice: 0, collectedAt: 'Just now', collectionLocation: 'Current location · Pune', status: 'Matching', recyclerId: 'GreenLoop Recovery' }); setSubmitted(true); showToast('Lot saved on this phone'); };
  if (submitted) return <main className="page"><div className="card" style={{ maxWidth: 620, margin: '46px auto', padding: 34, textAlign: 'center' }}><div className="facility-badge" style={{ margin: '0 auto 18px', width: 58, height: 58, background: '#e1f0e3', color: '#3d7b56' }}><CheckCircle2 size={29} /></div><div className="eyebrow">Lot saved offline</div><h1 className="page-title" style={{ fontSize: 32 }}>Your lot is ready to be matched.</h1><p className="page-intro" style={{ margin: '0 auto 22px' }}>Nearby recyclers can now see what you have. Keep the material dry and separate until pickup.</p><div className="estimate-card" style={{ textAlign: 'left', marginBottom: 20 }}><div className="section-meta" style={{ color: '#b9cec2' }}>Instant estimate</div><div className="estimate-value">{formatMoney(estimate)}</div><div className="estimate-range">Based on {weight} kg of {category.toLowerCase()} · final amount after weighing</div></div><div style={{ display: 'flex', gap: 9, justifyContent: 'center', flexWrap: 'wrap' }}><Link href="/lots" className="button button-primary" data-testid="link-see-new-lot">See my lot <ArrowRight size={15} /></Link><button className="button button-quiet" onClick={() => setSubmitted(false)} data-testid="button-add-another-lot"><Plus size={15} /> Add another</button></div></div></main>;
return <main className="page"><div className="page-heading"><div><div className="eyebrow">New lot · step 1 of 1</div><h1 className="page-title">Show what you collected.</h1><p className="page-intro">One lot means one clear quote. Use simple details — approximate is okay.</p></div><div className="offline-pill"><span className="offline-dot" />Saved on this phone</div></div><div className="grid grid-2"><div className="card card-pad"><div className="field" style={{ marginBottom: 19 }}><label className="field-label">What material is this?</label><select className="select" value={category} onChange={e => setCategory(e.target.value)} data-testid="select-lot-category"><option>Circuit boards</option><option>Copper wire</option><option>Aluminium</option><option>Batteries</option><option>Screens</option></select></div><div className="grid grid-2" style={{ marginBottom: 19 }}><div><label className="field-label">Approx. weight</label><div style={{ display: 'flex', gap: 7 }}><input className="input" type="number" min="0" value={weight} onChange={e => setWeight(e.target.value)} data-testid="input-lot-weight" /><span className="button button-quiet" style={{ minWidth: 48, padding: 0, cursor: 'default' }}>kg</span></div></div><div><label className="field-label">Condition</label><select className="select" value={condition} onChange={e => setCondition(e.target.value)} data-testid="select-lot-condition"><option>Sorted, dry</option><option>Needs sorting</option><option>Intact</option><option>Mixed / unknown</option></select></div></div><div style={{ marginBottom: 19 }}><label className="field-label">Short note <span style={{ fontWeight: 400 }}>(optional)</span></label><input className="input" value={description} onChange={e => setDescription(e.target.value)} placeholder="For example: from desktop towers" data-testid="input-lot-description" /></div><label className="field-label">Add a picture <span style={{ fontWeight: 400, color: '#b44' }}>* required</span></label><label className="upload-zone">{image ? <><CheckCircle2 size={25} className="upload-icon" /><strong>{image}</strong><span className="small-copy">Picture selected. Tap to change.</span></> : <><ImagePlus size={28} className="upload-icon" /><strong>Tap to take or choose a photo</strong><span className="small-copy">A photo is required to create the lot.</span></>}<input type="file" accept="image/*" required onChange={e => setImage(e.target.files?.[0]?.name || '')} data-testid="input-lot-photo" /></label></div><div><div className="estimate-card"><div className="section-meta" style={{ color: '#b9cec2' }}>Instant estimate</div><div className="estimate-value">{formatMoney(estimate || 0)}</div><div className="estimate-range">₹{Math.round((Number(weight) || 0) * rate * .85).toLocaleString('en-IN')} – ₹{Math.round((Number(weight) || 0) * rate).toLocaleString('en-IN')} likely range</div><div className="divider" style={{ background: '#436960', margin: '18px 0' }} /><div className="small-copy" style={{ color: '#c3d6c9' }}>Today’s guide rate</div><div style={{ marginTop: 6, fontSize: 15, fontFamily: 'DM Mono', color: '#f7f0df' }}>₹{rate} / kg</div><div className="small-copy" style={{ color: '#c3d6c9', marginTop: 12 }}>A recycler confirms the final rate after seeing the material.</div></div><div className="notice" style={{ marginTop: 15 }}><ShieldCheck size={16} /><span>Keep batteries in a separate bag. Do not burn or break screens.</span></div><button className="button button-gold" style={{ width: '100%', marginTop: 15 }} onClick={() => { if (!image) { alert('Please add a picture before saving the lot.'); return; } handleCreate(); }} data-testid="button-save-lot"><Sparkles size={16} /> Save lot and find recyclers</button></div></div></main>;
}

function Lots({ lots, onEdit }: { lots: MaterialLot[]; onEdit: (id: string, changes: Partial<MaterialLot>) => void }) {
  const [selected, setSelected] = useState<MaterialLot | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ weightKg: '', condition: '', description: '' });
  const openLot = (lot: MaterialLot) => { setSelected(lot); setEditing(false); setDraft({ weightKg: String(lot.weightKg), condition: lot.condition, description: lot.description }); };
  const saveEdit = () => {
    if (!selected || !Number(draft.weightKg) || Number(draft.weightKg) <= 0) return;
    const changes = { weightKg: Number(draft.weightKg), condition: draft.condition, description: draft.description.trim() || selected.description };
    onEdit(selected.id, changes);
    setSelected({ ...selected, ...changes });
    setEditing(false);
  };
  return <main className="page"><div className="page-heading"><div><div className="eyebrow">Collector records · {lots.length} lots</div><h1 className="page-title">Your lots, clearly tracked.</h1><p className="page-intro">Every saved lot has a simple trail from collection to handover.</p></div><Link href="/new-lot" className="button button-gold" data-testid="button-new-lot-from-list"><Plus size={16} /> New lot</Link></div>{selected ? <div className="card card-pad" style={{ marginBottom: 18 }}><div className="card-header"><div><div className="eyebrow">{selected.id}</div><h2 className="section-title" style={{ fontSize: 23, marginTop: 5 }}>{selected.category}</h2></div><div style={{ display: 'flex', gap: 8 }}><button className="button button-outline button-small" onClick={() => setEditing(value => !value)} data-testid="button-edit-lot">{editing ? 'Cancel edit' : 'Edit saved details'}</button><button className="button button-quiet button-small" onClick={() => setSelected(null)} data-testid="button-close-lot-detail"><X size={15} /> Close</button></div></div><div className="grid grid-2"><div>{editing ? <div className="edit-lot-form"><div><label className="field-label">Approx. weight</label><input className="input" type="number" min="0" value={draft.weightKg} onChange={e => setDraft({ ...draft, weightKg: e.target.value })} data-testid="input-edit-lot-weight" /></div><div><label className="field-label">Condition</label><select className="select" value={draft.condition} onChange={e => setDraft({ ...draft, condition: e.target.value })} data-testid="select-edit-lot-condition"><option>Sorted, dry</option><option>Needs sorting</option><option>Intact</option><option>Mixed / unknown</option></select></div><div><label className="field-label">Short note</label><input className="input" value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} data-testid="input-edit-lot-description" /></div><button className="button button-primary" onClick={saveEdit} data-testid="button-save-lot-edit"><Check size={15} /> Save changes offline</button></div> : <><div className="lot-row"><div className="lot-thumb"><Recycle size={21} /></div><div><div className="lot-name">{selected.description}</div><div className="lot-desc">{selected.weightKg} kg · {selected.condition}</div></div><div className="lot-amount">{formatMoney(selected.estimatedValue)}<br /><StatusPill status={selected.status} /></div></div><div className="divider" /><div className="trace-line"><div className="trace-step"><strong>Lot created</strong><span>{selected.collectedAt} · {selected.collectionLocation}</span></div><div className="trace-step"><strong>Offer matching</strong><span>Shared with verified recyclers nearby</span></div><div className="trace-step"><strong>Handover</strong><span>{selected.status === 'Paid' ? 'Payment received' : 'Waiting for confirmed pickup'}</span></div></div></>}</div><div className="estimate-card"><div className="section-meta" style={{ color: '#b9cec2' }}>Quote view</div><div className="estimate-value">{formatMoney(selected.finalPrice || selected.quotedPrice || selected.estimatedValue)}</div><div className="estimate-range">Estimated / quoted value</div><div className="divider" style={{ background: '#436960' }} /><div className="small-copy" style={{ color: '#c3d6c9' }}>Matched recycler</div><div style={{ color: '#fff8e7', marginTop: 5, fontSize: 13, fontWeight: 800 }}>{selected.recyclerId || 'Finding a match'}</div></div></div></div> : null}<div className="grid" style={{ gap: 10 }}>{lots.map(lot => <button key={lot.id} className="card card-pad" style={{ textAlign: 'left', cursor: 'pointer', border: '1px solid #e4ddce' }} onClick={() => openLot(lot)} data-testid={`button-open-lot-${lot.id}`}><div className="lot-row" style={{ padding: 0, border: 0 }}><div className={`lot-thumb ${lot.category === 'Copper wire' ? 'amber' : lot.category === 'Screens' ? 'rust' : ''}`}>{lot.category === 'Screens' ? <MonitorSmartphone size={21} /> : lot.category === 'Copper wire' ? <Zap size={21} /> : <Recycle size={21} />}</div><div><div className="lot-name">{lot.category} <span className="mono" style={{ fontSize: 9, color: '#8c9b92', marginLeft: 6 }}>{lot.id}</span></div><div className="lot-desc">{lot.weightKg} kg · {lot.collectedAt} · {lot.collectionLocation}</div></div><div className="lot-amount">{formatMoney(lot.finalPrice || lot.quotedPrice || lot.estimatedValue)}<br /><StatusPill status={lot.status} /></div><ChevronRight size={16} color="#9aab9f" /></div></button>)}</div></main>;
}

function Earnings({ transactions }: { transactions: Transaction[] }) {
  const total = transactions.reduce((sum, t) => sum + t.finalPrice, 0);
  return <main className="page"><div className="page-heading"><div><div className="eyebrow">Money trail · local ledger</div><h1 className="page-title">Your earnings.</h1><p className="page-intro">No guessing. See which handovers are paid and how you received the money.</p></div><button className="button button-quiet" onClick={() => window.print()} data-testid="button-print-ledger"><FileText size={16} /> Print ledger</button></div><div className="grid grid-3" style={{ marginBottom: 18 }}><div className="card stat-card"><div className="stat-label">Total received</div><div className="stat-value">{formatMoney(total)}</div><div className="stat-note">Since 08 Jun 2024</div></div><div className="card stat-card"><div className="stat-label">Paid handovers</div><div className="stat-value">{transactions.filter(t => t.paymentStatus === 'Paid').length}</div><div className="stat-note">Money received</div></div><div className="card stat-card"><div className="stat-label">Pending</div><div className="stat-value">₹0</div><div className="stat-note">Nothing waiting</div></div></div><div className="card card-pad"><div className="card-header"><h2 className="section-title">Handover ledger</h2><span className="section-meta">{transactions.length} records</span></div><div className="table-wrap"><table className="price-table"><thead><tr><th>Reference</th><th>Recycler</th><th>Amount</th><th>Payment</th><th>Date</th></tr></thead><tbody>{transactions.map(t => <tr key={t.handoverReference} data-testid={`row-earning-${t.lotId}`}><td><strong className="mono">{t.handoverReference}</strong><br /><span className="small-copy">{t.lotId} · {t.gpsLabel}</span></td><td><strong>{t.recyclerId}</strong><br /><span className="small-copy">{t.transactionStatus}</span></td><td><strong className="mono">{formatMoney(t.finalPrice)}</strong><br /><span className="small-copy">quoted {formatMoney(t.quotedPrice)}</span></td><td><StatusPill status={t.paymentStatus} /><br /><span className="small-copy">{t.paymentStatus === 'Paid' ? 'Digital transfer' : 'Cash expected'}</span></td><td className="small-copy">{t.timestamp}</td></tr>)}</tbody></table></div></div><div className="notice" style={{ marginTop: 16 }}><CreditCard size={16} /><span>Keep this reference number if you need help: <strong className="mono">HB-18JUN-2398</strong>. Your ledger works even when the network is not available.</span></div></main>;
}

function Safety() {
  const [playing, setPlaying] = useState('');
  const play = (tip: SafetyTip) => { setPlaying(tip.title); if ('speechSynthesis' in window) window.speechSynthesis.speak(new SpeechSynthesisUtterance(`${tip.title}. ${tip.copy}`)); };
  return <main className="page"><div className="page-heading"><div><div className="eyebrow">Field guide · keep this handy</div><h1 className="page-title">Work safe. Go home safe.</h1><p className="page-intro">Four simple reminders for sorting e-waste. Tap the sound button to hear the guide.</p></div><div className="offline-pill"><ShieldCheck size={14} /> Works offline</div></div><div className="grid grid-2">{safetyTips.map(tip => <div className="card safety-card" key={tip.title}><div className="safety-picto"><IconFor name={tip.pictogram} /></div>{tip.audioAvailable && <button className="audio-button" onClick={() => play(tip)} aria-label={`Hear ${tip.title} guidance`} data-testid={`button-audio-${tip.pictogram}`}><Headphones size={15} /></button>}<div className="risk-label">{tip.risk}</div><h3>{tip.title}</h3><p>{tip.copy}</p>{playing === tip.title && <div className="small-copy" style={{ color: '#b15c40', marginTop: 9 }}>Playing guidance…</div>}</div>)}</div><div className="card card-pad" style={{ marginTop: 18, background: '#e9f0e3', borderColor: '#d6e3ce' }}><div className="card-header"><h2 className="section-title">Before you hand over</h2><span className="section-meta">quick check</span></div><div className="grid grid-2"><div className="notice" style={{ background: '#f7f8ee' }}><CheckCircle2 size={16} /><span>Battery bag is separate and labelled.</span></div><div className="notice" style={{ background: '#f7f8ee' }}><CheckCircle2 size={16} /><span>Lot weight and quote are written down.</span></div><div className="notice" style={{ background: '#f7f8ee' }}><CheckCircle2 size={16} /><span>Recycler authorization is verified.</span></div><div className="notice" style={{ background: '#f7f8ee' }}><CheckCircle2 size={16} /><span>You have your handover reference.</span></div></div></div></main>;
}

function RecyclerQueue({ lots, applyChange, recordHandover, showToast, sync }: { lots: MaterialLot[]; applyChange: (id: string, changes: Partial<MaterialLot>, type: SyncActionType, label?: string) => void; recordHandover: (lot: MaterialLot) => void; showToast: (text: string) => void; sync: SyncPanelProps }) {
  const [filter, setFilter] = useState('All lots'); const queue = lots.filter(l => l.status !== 'Paid'); const filtered = filter === 'All lots' ? queue : queue.filter(l => l.status === filter);
  const accept = (lot: MaterialLot) => { applyChange(lot.id, { status: 'Pickup ready', quotedPrice: lot.estimatedValue - 75 }, 'offer'); showToast(`Offer saved offline for ${lot.id}`); };
  const handover = (lot: MaterialLot) => { const finalPrice = lot.quotedPrice || lot.estimatedValue - 75; applyChange(lot.id, { status: 'Paid', finalPrice }, 'handover'); recordHandover({ ...lot, status: 'Paid', finalPrice }); showToast(`Handover queued for ${lot.id}`); };
  return <main className="page"><div className="page-heading"><div><div className="eyebrow">Recycler operations · Pune area</div><h1 className="page-title">Intake queue.</h1><p className="page-intro">Review nearby lots, confirm a rate and make a traceable handover.</p></div><div className="offline-pill"><span className="offline-dot" />Queue is {sync.networkAvailable ? 'ready to sync' : 'saved offline'}</div></div><div className="filter-row"><button className={`button button-small ${filter === 'All lots' ? 'button-primary' : 'button-quiet'}`} onClick={() => setFilter('All lots')} data-testid="button-filter-all-lots">All lots ({queue.length})</button><button className={`button button-small ${filter === 'Matching' ? 'button-primary' : 'button-quiet'}`} onClick={() => setFilter('Matching')} data-testid="button-filter-matching">Needs review</button><button className={`button button-small ${filter === 'Pickup ready' ? 'button-primary' : 'button-quiet'}`} onClick={() => setFilter('Pickup ready')} data-testid="button-filter-pickup">Pickup ready</button></div><div className="grid" style={{ gap: 12 }}>{filtered.map(lot => <div className="card card-pad queue-card" key={lot.id} data-testid={`card-queue-${lot.id}`}><div><div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}><div className="lot-thumb"><Recycle size={20} /></div><div><div className="lot-name">{lot.category} <span className="mono" style={{ color: '#82958a', fontSize: 10 }}>{lot.id}</span></div><div className="lot-desc">{lot.weightKg} kg · {lot.condition} · {lot.collectionLocation}</div></div><div style={{ marginLeft: 'auto' }}><StatusPill status={lot.status} /></div></div><div className="grid grid-3"><div><div className="section-meta">Collector estimate</div><div className="lot-name" style={{ marginTop: 6 }}>{formatMoney(lot.estimatedValue)}</div></div><div><div className="section-meta">Your offered rate</div><div className="lot-name" style={{ marginTop: 6 }}>{lot.quotedPrice ? formatMoney(lot.quotedPrice) : 'Not sent'}</div></div><div><div className="section-meta">Pickup window</div><div className="lot-name" style={{ marginTop: 6 }}>Today · 3–6 PM</div></div></div></div><div style={{ minWidth: 140 }}>{lot.status === 'Matching' ? <button className="button button-primary" style={{ width: '100%' }} onClick={() => accept(lot)} data-testid={`button-offer-${lot.id}`}><HandCoins size={15} /> Send offer</button> : <button className="button button-gold" style={{ width: '100%' }} onClick={() => handover(lot)} data-testid={`button-handover-${lot.id}`}><Check size={15} /> Confirm handover</button>}<button className="button button-outline button-small" style={{ width: '100%', marginTop: 8 }} onClick={() => showToast(`Calling collector for ${lot.id}`)} data-testid={`button-call-${lot.id}`}><Phone size={14} /> Call collector</button></div></div>)}{filtered.length === 0 && <div className="card empty-state"><PackageCheck size={30} /><h3>Queue is clear</h3><p>New matched lots will appear here when collectors share them.</p></div>}</div><div className="card card-pad" style={{ marginTop: 18 }}><div className="card-header"><h2 className="section-title">Your authorization</h2><span className="auth-ok"><BadgeCheck size={14} /> Verified</span></div><div className="grid grid-3"><div><div className="section-meta">Facility</div><div className="lot-name" style={{ marginTop: 7 }}>GreenLoop Recovery</div></div><div><div className="section-meta">Authorization ID</div><div className="lot-name mono" style={{ marginTop: 7 }}>MPCB / EPR-4421</div></div><div><div className="section-meta">Accepted materials</div><div className="lot-name" style={{ marginTop: 7 }}>PCB · wire · aluminium</div></div></div></div><SyncQueuePanel {...sync} /></main>;
}

function AppContent() {
  const [role, setRole] = useState<Role | null>(null);
  const [language, setLanguage] = useState<Language>('English');
  const [lots, setLots] = useState<MaterialLot[]>(() => readLocal(storageKeys.lots, initialLots));
  const [transactions, setTransactions] = useState<Transaction[]>(() => readLocal(storageKeys.transactions, initialTransactions));
  const [syncQueue, setSyncQueue] = useState<SyncAction[]>(() => readLocal(storageKeys.syncQueue, []));
  const [lastSyncedAt, setLastSyncedAt] = useState(() => readLocal(storageKeys.lastSyncedAt, '25 Jun 2024, 10:30'));
  const [browserOnline, setBrowserOnline] = useState(() => typeof navigator === 'undefined' ? true : navigator.onLine);
  const [offlineMode, setOfflineMode] = useState(false);
  const [toast, setToast] = useState('');
  const networkAvailable = browserOnline && !offlineMode;

  useEffect(() => {
    const onOnline = () => setBrowserOnline(true);
    const onOffline = () => setBrowserOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => { window.removeEventListener('online', onOnline); window.removeEventListener('offline', onOffline); };
  }, []);
  useEffect(() => { window.localStorage.setItem(storageKeys.lots, JSON.stringify(lots)); }, [lots]);
  useEffect(() => { window.localStorage.setItem(storageKeys.transactions, JSON.stringify(transactions)); }, [transactions]);
  useEffect(() => { window.localStorage.setItem(storageKeys.syncQueue, JSON.stringify(syncQueue)); }, [syncQueue]);
  useEffect(() => { window.localStorage.setItem(storageKeys.lastSyncedAt, JSON.stringify(lastSyncedAt)); }, [lastSyncedAt]);

  const showToast = (text: string) => { setToast(text); window.setTimeout(() => setToast(''), 2600); };
  const enqueue = (action: SyncAction) => setSyncQueue(prev => [...prev, action]);
  const applyChange = (id: string, changes: Partial<MaterialLot>, type: SyncActionType, label?: string) => {
    const current = lots.find(lot => lot.id === id);
    if (!current) return;
    const baseRevision = current.revision ?? 1;
    const revision = baseRevision + 1;
    const now = syncTime();
    setLots(prev => prev.map(lot => lot.id === id ? { ...lot, ...changes, revision, syncState: 'pending' } : lot));
    setSyncQueue(prev => {
      const next = prev.map(action => action.lotId === id && action.status === 'pending' && action.type === 'update' && type !== 'create' && action.sourceRole !== role
        ? { ...action, status: 'conflict' as const, conflictMessage: 'A shared update arrived before this edit. Choose which copy to keep.' }
        : action);
      return [...next, { id: `${id}-${type}-${Date.now()}`, type, lotId: id, label: label || actionLabel(type, id), queuedAt: now, baseRevision, sourceRole: role!, status: 'pending', changes }];
    });
  };
  const createLot = (lot: MaterialLot) => {
    const savedLot = { ...lot, revision: 1, syncState: 'pending' as const };
    const now = syncTime();
    setLots(prev => [savedLot, ...prev]);
    enqueue({ id: `${lot.id}-create-${Date.now()}`, type: 'create', lotId: lot.id, label: actionLabel('create', lot.id), queuedAt: now, baseRevision: 0, sourceRole: role!, status: 'pending', changes: savedLot });
  };
  const recordHandover = (lot: MaterialLot) => {
    setTransactions(prev => {
      const existing = prev.find(transaction => transaction.lotId === lot.id);
      if (existing) return prev.map(transaction => transaction.lotId === lot.id ? { ...transaction, finalPrice: lot.finalPrice, paymentStatus: 'Pending', transactionStatus: 'Pending sync' } : transaction);
      return [{ lotId: lot.id, collectorId: 'COL-1042', recyclerId: lot.recyclerId || 'GreenLoop Recovery', quotedPrice: lot.quotedPrice || lot.estimatedValue - 75, finalPrice: lot.finalPrice, paymentStatus: 'Pending', transactionStatus: 'Pending sync', handoverReference: `HB-OFFLINE-${lot.id.replace('LOT-', '')}`, timestamp: `Queued ${syncTime()}`, gpsLabel: lot.collectionLocation }, ...prev];
    });
  };
  const syncNow = () => {
    if (!networkAvailable) { showToast('Still offline. Changes remain safely on this phone.'); return; }
    const pending = syncQueue.filter(action => action.status === 'pending');
    if (!pending.length) { showToast('Everything is already synchronized.'); return; }
    const now = syncTime();
    const pendingLots = new Set(pending.map(action => action.lotId));
    setSyncQueue(prev => prev.map(action => action.status === 'pending' ? { ...action, status: 'synced' as const, syncedAt: now } : action));
    setLots(prev => prev.map(lot => pendingLots.has(lot.id) ? { ...lot, syncState: 'synced', lastSyncedAt: now } : lot));
    setTransactions(prev => prev.map(transaction => transaction.transactionStatus === 'Pending sync' ? { ...transaction, paymentStatus: 'Paid', transactionStatus: 'Completed', timestamp: `${transaction.timestamp.replace('Queued ', '')} · synced ${now}` } : transaction));
    setLastSyncedAt(now);
    showToast(`${pending.length} ${pending.length === 1 ? 'change' : 'changes'} synchronized for collector and recycler`);
  };
  const resolveConflict = (actionId: string, resolution: 'local' | 'shared') => {
    const action = syncQueue.find(item => item.id === actionId);
    if (!action || action.status !== 'conflict') return;
    const now = syncTime();
    if (resolution === 'local') {
      setLots(prev => prev.map(lot => lot.id === action.lotId ? { ...lot, ...action.changes, revision: (lot.revision ?? 1) + 1, syncState: 'pending' } : lot));
      setSyncQueue(prev => prev.map(item => item.id === actionId ? { ...item, status: 'pending' as const, baseRevision: (lots.find(lot => lot.id === action.lotId)?.revision ?? 1) + 1, queuedAt: now, sourceRole: role!, conflictMessage: undefined } : item));
      showToast(`Kept your local copy for ${action.lotId}; it is queued again`);
    } else {
      setSyncQueue(prev => prev.map(item => item.id === actionId ? { ...item, status: 'synced' as const, syncedAt: now, conflictMessage: undefined } : item));
      setLots(prev => prev.map(lot => lot.id === action.lotId ? { ...lot, syncState: 'synced', lastSyncedAt: now } : lot));
      setLastSyncedAt(now);
      showToast(`Kept the shared copy for ${action.lotId}`);
    }
  };
  const sync: SyncPanelProps = { queue: syncQueue, lastSyncedAt, networkAvailable, offlineMode, onToggleOffline: () => setOfflineMode(value => !value), onSync: syncNow, onResolveConflict: resolveConflict };
  if (!role) {
    return <LoginPage onSelectRole={setRole} />;
  }

  return (
    <Shell
      role={role}
      language={language}
      setLanguage={setLanguage}
      queue={syncQueue}
      networkAvailable={networkAvailable}
    >
      <Switch>
        <Route
          path="/"
          component={() => (
            <Home
              role={role}
              lots={lots}
              applyChange={applyChange}
              showToast={showToast}
              sync={sync}
            />
          )}
        />

        <Route path="/prices" component={Prices} />

        <Route
          path="/new-lot"
          component={() => (
            <NewLot
              onCreate={createLot}
              showToast={showToast}
            />
          )}
        />

        <Route
          path="/lots"
          component={() => (
            <Lots
              lots={lots}
              onEdit={(id, changes) => {
                applyChange(id, changes, 'update');
                showToast(`Changes saved locally for ${id}`);
              }}
            />
          )}
        />

        <Route
          path="/earnings"
          component={() => (
            <Earnings transactions={transactions} />
          )}
        />

        <Route path="/safety" component={Safety} />

        <Route
          path="/recycler"
          component={() => (
            <RecyclerQueue
              lots={lots}
              applyChange={applyChange}
              recordHandover={recordHandover}
              showToast={showToast}
              sync={sync}
            />
          )}
        />

        <Route component={NotFound} />
      </Switch>

      {toast && (
        <div
          className="toast"
          role="status"
          data-testid="status-toast"
        >
          <CheckCircle2
            size={15}
            style={{
              verticalAlign: 'middle',
              marginRight: 7,
              color: '#f2b84b'
            }}
          />
          {toast}
        </div>
      )}
    </Shell>
  );
}


function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><ErrorBoundary><AppContent /></ErrorBoundary></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>;
}

export default App;