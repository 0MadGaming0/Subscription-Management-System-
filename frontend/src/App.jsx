
import { useState } from "react";
import {
  LayoutDashboard, Users, Package, CreditCard, Repeat,
  FileText, Receipt, Wallet, Tag, ChartNoAxesCombined,
  Settings, Bell, Search, ChevronDown, Plus, ArrowUpRight,
  ArrowDownRight, MoreHorizontal, CalendarDays, Menu,
  CircleHelp, Download
} from "lucide-react";

const navigation = [
  { title: "MAIN MENU", items: [
    { label: "Overview", icon: LayoutDashboard },
    { label: "Customers", icon: Users },
    { label: "Products", icon: Package },
    { label: "Plans", icon: CreditCard },
    { label: "Subscriptions", icon: Repeat },
  ]},
  { title: "BILLING", items: [
    { label: "Quotations", icon: FileText },
    { label: "Invoices", icon: Receipt },
    { label: "Payments", icon: Wallet },
    { label: "Discounts", icon: Tag },
  ]},
  { title: "MANAGEMENT", items: [
    { label: "Reports", icon: ChartNoAxesCombined },
    { label: "Settings", icon: Settings },
  ]}
];

const stats = [
  { label: "Total Revenue", value: "₹8,42,500", change: "+12.8%", positive: true, note: "vs last month", color: "purple", icon: Wallet },
  { label: "Active Subscriptions", value: "1,284", change: "+8.2%", positive: true, note: "vs last month", color: "blue", icon: Repeat },
  { label: "Total Customers", value: "2,456", change: "+5.4%", positive: true, note: "vs last month", color: "orange", icon: Users },
  { label: "Outstanding Invoices", value: "₹64,250", change: "-2.4%", positive: true, note: "vs last month", color: "green", icon: Receipt },
];

const subscriptions = [
  { name: "Arjun Nair", email: "arjun.nair@email.com", plan: "Premium Monthly", amount: "₹1,499", date: "28 Oct 2026", status: "Active", initials: "AN", color: "lavender" },
  { name: "Meera Thomas", email: "meera.t@email.com", plan: "Basic Yearly", amount: "₹4,999", date: "27 Oct 2026", status: "Active", initials: "MT", color: "peach" },
  { name: "Rahul Menon", email: "rahul.m@email.com", plan: "Pro Monthly", amount: "₹2,499", date: "26 Oct 2026", status: "Pending", initials: "RM", color: "mint" },
  { name: "Ananya Joseph", email: "ananya.j@email.com", plan: "Premium Yearly", amount: "₹12,999", date: "25 Oct 2026", status: "Active", initials: "AJ", color: "blue" },
  { name: "Vishnu Kumar", email: "vishnu.k@email.com", plan: "Basic Monthly", amount: "₹499", date: "24 Oct 2026", status: "Cancelled", initials: "VK", color: "pink" },
];

const chartBars = [
  { month: "May", height: 42, previous: 30 },
  { month: "Jun", height: 55, previous: 39 },
  { month: "Jul", height: 47, previous: 35 },
  { month: "Aug", height: 72, previous: 49 },
  { month: "Sep", height: 61, previous: 44 },
  { month: "Oct", height: 90, previous: 59 },
];

function Sidebar({ active, setActive, open, setOpen }) {
  return (
    <>
      {open && <div className="sidebar-overlay" onClick={() => setOpen(false)} />}
      <aside className={`sidebar ${open ? "sidebar-open" : ""}`}>
        <div className="brand">
          <div className="brand-mark">B</div>
          <div><strong>brightloop</strong><span>SOFTWARE</span></div>
        </div>
        <div className="workspace">
          <div className="workspace-icon">B</div>
          <div><strong>Brightloop Inc.</strong><span>Admin Workspace</span></div>
          <ChevronDown size={15} />
        </div>
        <nav className="side-nav">
          {navigation.map(group => (
            <div className="nav-group" key={group.title}>
              <p className="nav-heading">{group.title}</p>
              {group.items.map(item => {
                const Icon = item.icon;
                return (
                  <button key={item.label}
                    className={`nav-item ${active === item.label ? "active" : ""}`}
                    onClick={() => { setActive(item.label); setOpen(false); }}>
                    <Icon size={18} strokeWidth={1.8} />
                    <span>{item.label}</span>
                    {item.label === "Invoices" && <span className="nav-count">8</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="help-card">
            <div className="help-icon"><CircleHelp size={18}/></div>
            <strong>Need help?</strong>
            <p>Visit our help center for support.</p>
            <button onClick={() => setActive("Help Center")}>Get support <ArrowUpRight size={14}/></button>
          </div>
          <div className="sidebar-user">
            <div className="avatar avatar-purple">AS</div>
            <div className="user-details"><strong>Admin User</strong><span>admin@brightloop.com</span></div>
            <MoreHorizontal size={19}/>
          </div>
        </div>
      </aside>
    </>
  );
}

function StatCard({ item }) {
  const Icon = item.icon;
  return (
    <div className="stat-card">
      <div className="stat-top">
        <span>{item.label}</span>
        <div className={`stat-icon ${item.color}`}><Icon size={19}/></div>
      </div>
      <h2>{item.value}</h2>
      <div className="stat-bottom">
        <span className="trend positive"><ArrowUpRight size={14}/>{item.change}</span>
        <span className="muted">{item.note}</span>
      </div>
    </div>
  );
}

function RevenueChart() {
  return (
    <div className="panel revenue-panel">
      <div className="panel-heading">
        <div><h3>Revenue overview</h3><p>Track your revenue performance</p></div>
        <button className="select-button">Last 6 months <ChevronDown size={15}/></button>
      </div>
      <div className="revenue-total">
        <strong>₹8,42,500</strong>
        <span className="trend positive"><ArrowUpRight size={14}/> 12.8%</span>
        <span className="muted">compared to previous period</span>
      </div>
      <div className="chart-legend">
        <span><i className="legend-dot current"/> Current period</span>
        <span><i className="legend-dot previous"/> Previous period</span>
      </div>
      <div className="chart">
        <div className="chart-grid">
          {["₹10L", "₹7.5L", "₹5L", "₹2.5L", "₹0"].map(v => <span key={v}>{v}</span>)}
        </div>
        <div className="bar-area">
          {chartBars.map(bar => (
            <div className="bar-group" key={bar.month}>
              <div className="bars">
                <div className="bar previous-bar" style={{height: `${bar.previous}%`}}/>
                <div className="bar current-bar" style={{height: `${bar.height}%`}}/>
              </div>
              <span>{bar.month}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SubscriptionTable() {
  return (
    <div className="panel table-panel">
      <div className="panel-heading">
        <div><h3>Recent subscriptions</h3><p>Latest subscription activity</p></div>
        <button className="text-button">View all <ArrowUpRight size={15}/></button>
      </div>
      <div className="table-scroll">
        <table>
          <thead><tr><th>CUSTOMER</th><th>PLAN</th><th>AMOUNT</th><th>START DATE</th><th>STATUS</th><th></th></tr></thead>
          <tbody>
            {subscriptions.map(s => (
              <tr key={s.email}>
                <td><div className="customer-cell"><div className={`avatar ${s.color}`}>{s.initials}</div><div><strong>{s.name}</strong><span>{s.email}</span></div></div></td>
                <td>{s.plan}</td><td className="amount">{s.amount}</td><td>{s.date}</td>
                <td><span className={`status ${s.status.toLowerCase()}`}>{s.status}</span></td>
                <td><button className="icon-button"><MoreHorizontal size={18}/></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Overview() {
  return (
    <>
      <div className="welcome-row">
        <div><h1>Good morning, Admin <span>✦</span></h1><p>Here's what's happening with your business today.</p></div>
        <div className="welcome-actions">
          <button className="outline-button"><CalendarDays size={16}/> Oct 2026 <ChevronDown size={14}/></button>
          <button className="primary-button"><Plus size={17}/> Create subscription</button>
        </div>
      </div>
      <section className="stats-grid">{stats.map(item => <StatCard key={item.label} item={item}/>)}</section>
      <section className="dashboard-grid">
        <RevenueChart/>
        <div className="panel activity-panel">
          <div className="panel-heading"><div><h3>Subscription summary</h3><p>Current subscription status</p></div><button className="icon-button"><MoreHorizontal/></button></div>
          <div className="donut-wrap"><div className="donut"><div className="donut-center"><strong>1,284</strong><span>Total</span></div></div></div>
          <div className="summary-list">
            <div><span><i className="summary-dot active-dot"/> Active</span><strong>1,084 <small>84.4%</small></strong></div>
            <div><span><i className="summary-dot pending-dot"/> Pending</span><strong>128 <small>10%</small></strong></div>
            <div><span><i className="summary-dot cancelled-dot"/> Cancelled</span><strong>72 <small>5.6%</small></strong></div>
          </div>
        </div>
      </section>
      <SubscriptionTable/>
    </>
  );
}

export default function App() {
  const [active, setActive] = useState("Overview");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="app-shell">
      <Sidebar active={active} setActive={setActive} open={sidebarOpen} setOpen={setSidebarOpen}/>
      <main className="main-area">
        <header className="topbar">
          <button className="mobile-menu icon-button" onClick={() => setSidebarOpen(true)}><Menu/></button>
          <div className="breadcrumb">Workspace <span>/</span> <strong>{active}</strong></div>
          <div className="topbar-right">
            <label className="search-box"><Search size={17}/><input placeholder="Search anything..."/><kbd>⌘ K</kbd></label>
            <button className="icon-button notification"><Bell size={19}/><i/></button>
            <div className="top-profile"><div className="avatar avatar-purple">AS</div><ChevronDown size={15}/></div>
          </div>
        </header>
        <div className="page-content">
          {active === "Overview" ? <Overview/> : (
            <div className="placeholder-page">
              <div className="placeholder-icon"><LayoutDashboard size={25}/></div>
              <h1>{active}</h1>
              <p>This section is ready for us to build next.</p>
              <button className="primary-button" onClick={() => setActive("Overview")}>Back to overview</button>
            </div>
          )}
          <footer>© 2026 Brightloop Software. All rights reserved. <span>Made for better business management.</span></footer>
        </div>
      </main>
    </div>
  );
}
