import React, { useState, useEffect, useRef } from 'react';
import './index.css';
import { firebaseConfig, isFirebaseConfigured } from './firebase';

const FIREBASE_ON = isFirebaseConfigured();
const LS_KEY = 'razaOnlineData';

// ── SheetJS loader ──────────────────────────────────────────
function loadSheetJS() {
  if (window.XLSX) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js';
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

// ── Helpers ──────────────────────────────────────────────────
function formatDate(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatDateTime(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

function todayISO() { return new Date().toISOString().split('T')[0]; }
function nowISO()   { return new Date().toISOString(); }

function getInitials(name) {
  if (!name) return '';
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

// ── Default seed data ─────────────────────────────────────────
const DEFAULT_SERVICES = [
  { id: '1', name: 'Birth Certificate',   fee: 300,  active: true },
  { id: '2', name: 'Income Certificate',  fee: 200,  active: true },
  { id: '3', name: 'Age Certificate',     fee: 150,  active: true },
  { id: '4', name: 'Domicile Certificate',fee: 250,  active: true },
  { id: '5', name: 'Gazette Service',     fee: 500,  active: true },
  { id: '6', name: 'Passport Service',    fee: 1500, active: true },
  { id: '7', name: 'PAN Card',            fee: 300,  active: true },
  { id: '8', name: 'Voter ID',            fee: 150,  active: true },
];

const DEFAULT_ADMIN = { username: 'wasimadmin', password: 'Admin@123456', role: 'admin' };

const EMPTY_DB = { customers: [], services: DEFAULT_SERVICES, payments: [], users: [DEFAULT_ADMIN] };

// ── Main App ──────────────────────────────────────────────────
export default function App() {
  const [fbReady, setFbReady] = useState(!FIREBASE_ON); // true immediately when no Firebase
  const [appData, setAppData] = useState(EMPTY_DB);

  // ── Refs for Firebase save debounce ───────────────────────
  const saveTimer   = useRef(null);
  const pendingSave = useRef(null);
  const fbRef       = useRef(null); // Firebase db ref, set after dynamic import

  // ── Persist helper: localStorage ──────────────────────────
  function saveToLocalStorage(data) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(data)); } catch {}
  }
  function loadFromLocalStorage() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch { return null; }
  }

  // ── Persist helper: Firebase (debounced) ──────────────────
  function saveToFirebase(data) {
    if (!fbRef.current) return;
    pendingSave.current = data;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        const { ref, set } = await import('firebase/database');
        await set(ref(fbRef.current, 'razaData'), pendingSave.current);
      } catch (e) { console.error('Firebase save error:', e); }
    }, 400);
  }

  // ── Central updateData ────────────────────────────────────
  function updateData(updater) {
    setAppData(prev => {
      const next = updater(prev);
      saveToLocalStorage(next);
      if (FIREBASE_ON) saveToFirebase(next);
      return next;
    });
  }

  // ── On mount: load data ───────────────────────────────────
  useEffect(() => {
    function normalise(val) {
      if (!val) val = {};
      if (!val.users    || !val.users.length)    val.users    = [DEFAULT_ADMIN];
      if (!val.services || !val.services.length) val.services = DEFAULT_SERVICES;
      if (!val.customers) val.customers = [];
      if (!val.payments)  val.payments  = [];
      return val;
    }

    if (!FIREBASE_ON) {
      // ── localStorage mode ──────────────────────────────────
      const saved = loadFromLocalStorage();
      setAppData(saved ? normalise(saved) : EMPTY_DB);
      if (!saved) saveToLocalStorage(EMPTY_DB);
      setFbReady(true);
      return;
    }

    // ── Firebase mode (dynamic import so it never crashes when unconfigured) ──
    let unsub = () => {};
    let cancelled = false;
    const startupTimer = setTimeout(() => {
      if (cancelled) return;
      const saved = loadFromLocalStorage();
      setAppData(saved ? normalise(saved) : EMPTY_DB);
      setFbReady(true);
      console.error('Firebase did not respond during startup; showing the app with local data.');
    }, 8000);
    (async () => {
      try {
        const { initializeApp, getApps } = await import('firebase/app');
        const { getDatabase, ref, onValue, set } = await import('firebase/database');
        if (cancelled) return;
        const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
        const database = getDatabase(app);
        fbRef.current = database;
        const dbRef = ref(database, 'razaData');
        unsub = onValue(dbRef, snap => {
          clearTimeout(startupTimer);
          const val = snap.val();
          if (!val) { set(dbRef, EMPTY_DB); setAppData(EMPTY_DB); }
          else       { setAppData(normalise(val)); }
          setFbReady(true);
        }, err => {
          clearTimeout(startupTimer);
          console.error('Firebase listener error:', err);
          // Fall back to localStorage on Firebase error
          const saved = loadFromLocalStorage();
          setAppData(saved ? normalise(saved) : EMPTY_DB);
          setFbReady(true);
        });
      } catch (e) {
        clearTimeout(startupTimer);
        console.error('Firebase init error:', e);
        const saved = loadFromLocalStorage();
        setAppData(saved ? normalise(saved) : EMPTY_DB);
        setFbReady(true);
      }
    })();
    return () => {
      cancelled = true;
      clearTimeout(startupTimer);
      unsub();
    };
  }, []);

  // ── UI State ──────────────────────────────────────────────
  const [currentUser, setCurrentUser] = useState(null);
  const [activeView, setActiveView]   = useState('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false); // mobile overlay
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    localStorage.getItem('sidebar-collapsed') === 'true'
  );
  const [darkMode, setDarkMode] = useState(localStorage.getItem('theme-mode') === 'dark');
  const [toast, setToast]       = useState(null);
  const [now, setNow]           = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => { localStorage.setItem('sidebar-collapsed', sidebarCollapsed); }, [sidebarCollapsed]);
  useEffect(() => {
    document.body.classList.toggle('dark-mode', darkMode);
    localStorage.setItem('theme-mode', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  useEffect(() => { loadSheetJS(); }, []);

  // Auto-login from localStorage session after Firebase loads
  useEffect(() => {
    if (!fbReady || currentUser) return;
    const saved = localStorage.getItem('logged-in-user');
    if (saved) {
      const u = appData.users.find(x => x.username === saved);
      if (u) setCurrentUser(u);
    }
  }, [fbReady, appData.users]);

  // ── Toast ──────────────────────────────────────────────────
  function showToast(msg, type = 'info') {
    setToast(null);
    setTimeout(() => {
      setToast({ msg, type });
      setTimeout(() => setToast(null), 3500);
    }, 10);
  }

  // ── Confirm Modal ──────────────────────────────────────────
  const [confirmModal, setConfirmModal] = useState({
    open: false, icon: '⚠️', title: '', message: '', okText: 'Delete', okClass: 'btn-danger', onConfirm: null
  });
  function confirmAction(options, onConfirm) {
    setConfirmModal({ open: true, onConfirm, ...{ icon:'⚠️', okText:'Delete', okClass:'btn-danger', ...options }});
  }

  // ── Modals ─────────────────────────────────────────────────
  const [customerModal, setCustomerModal] = useState({ open: false, data: null });
  const [serviceModal,  setServiceModal]  = useState({ open: false, data: null });
  const [userModal,     setUserModal]     = useState({ open: false, data: null });

  // ── Auth ───────────────────────────────────────────────────
  const [loginCreds,        setLoginCreds]        = useState({ user: '', pass: '' });
  const [loginError,        setLoginError]        = useState(false);
  const [showPassword,      setShowPassword]      = useState(false);
  const [forgotMode,        setForgotMode]        = useState(false);
  const [recoveryUser,      setRecoveryUser]      = useState('');

  function handleLogin(e) {
    e.preventDefault();
    const hit = appData.users.find(u => u.username === loginCreds.user && u.password === loginCreds.pass);
    if (hit) {
      setCurrentUser(hit);
      localStorage.setItem('logged-in-user', hit.username);
      setLoginError(false);
      showToast(`Welcome back, ${hit.username}! 🎉`, 'success');
      setActiveView('dashboard');
    } else {
      setLoginError(true);
      setTimeout(() => setLoginError(false), 3000);
    }
  }

  function handleLogout() {
    setCurrentUser(null);
    localStorage.removeItem('logged-in-user');
    setLoginCreds({ user: '', pass: '' });
    setActiveView('dashboard');
  }

  function handleRecoverPassword(e) {
    e.preventDefault();
    const hit = appData.users.find(u => u.username === recoveryUser.trim());
    if (!hit) { showToast('❌ Username not found!', 'danger'); return; }
    if (hit.role !== 'admin') {
      showToast('⚠️ Staff users must ask the Administrator to reset passwords.', 'warning');
    } else {
      showToast('ℹ️ Admin default password is "Admin@123456"', 'info');
    }
    setForgotMode(false); setRecoveryUser('');
  }

  function navigate(view) {
    if (view === 'users-mg' && currentUser?.role !== 'admin') {
      showToast('Access Denied: Admins only.', 'danger'); return;
    }
    setActiveView(view);
    setSidebarOpen(false); // close mobile sidebar
  }

  const isAdmin = currentUser?.role === 'admin';

  // ── Stats ──────────────────────────────────────────────────
  let pendDocs = 0, readyDocs = 0, totReceived = 0, totUnpaid = 0;
  appData.customers.forEach(c => {
    (c.services || []).forEach(s => {
      const st = (s.status || '').toLowerCase();
      if (st === 'pending' || st === 'in progress') pendDocs++;
      if (st === 'ready'   || st === 'delivered')   readyDocs++;
      const paid = Number(s.paid) || 0, fee = Number(s.fee) || 0;
      totReceived += paid;
      const bal = fee - paid;
      if (bal > 0) totUnpaid += bal;
    });
  });

  // ── Service handlers ───────────────────────────────────────
  function openNewService()   {
    if (!isAdmin) return showToast('Only Admin can add services.', 'danger');
    setServiceModal({ open: true, data: { id:'', name:'', fee:'', active:true } });
  }
  function openEditService(s) {
    if (!isAdmin) return showToast('Only Admin can edit services.', 'danger');
    setServiceModal({ open: true, data: { ...s } });
  }
  function saveService(e) {
    e.preventDefault();
    const { data: srv } = serviceModal;
    const isNew = !srv.id;
    const id    = isNew ? Date.now().toString() : srv.id;
    const newSrv = { id, name: srv.name.trim(), fee: Number(srv.fee), active: srv.active };
    updateData(prev => ({
      ...prev,
      services: isNew
        ? [...prev.services, newSrv]
        : prev.services.map(s => s.id === id ? newSrv : s)
    }));
    showToast(isNew ? 'Service added!' : 'Service updated!', 'success');
    setServiceModal({ open: false, data: null });
  }
  function deleteService(id, name) {
    if (!isAdmin) return showToast('Only Admin can delete services.', 'danger');
    confirmAction({ icon:'🗑️', title:'Delete Service', message:`Delete service "${name}"?`, okText:'Yes, Delete', okClass:'btn-danger' }, () => {
      updateData(prev => ({ ...prev, services: prev.services.filter(s => s.id !== id) }));
      showToast('Service deleted.', 'warning');
    });
  }

  // ── User handlers ──────────────────────────────────────────
  function openNewUser()   { setUserModal({ open: true, data: { oldName:'', username:'', pass:'', role:'user' } }); }
  function openEditUser(u) { setUserModal({ open: true, data: { oldName: u.username, username: u.username, pass:'', role: u.role } }); }
  function saveUser(e) {
    e.preventDefault();
    const { data: uBox } = userModal;
    if (!uBox.username) return showToast('Username required.', 'warning');
    const isNew = !uBox.oldName;
    if (isNew) {
      if (appData.users.find(u => u.username === uBox.username)) return showToast('Username taken!', 'danger');
      if (!uBox.pass) return showToast('Password required.', 'warning');
      updateData(prev => ({ ...prev, users: [...prev.users, { username: uBox.username, password: uBox.pass, role: uBox.role }] }));
      showToast('User created!', 'success');
    } else {
      updateData(prev => {
        const arr = [...prev.users];
        const idx = arr.findIndex(x => x.username === uBox.oldName);
        arr[idx] = { ...arr[idx], username: uBox.username, role: uBox.role, ...(uBox.pass ? { password: uBox.pass } : {}) };
        return { ...prev, users: arr };
      });
      showToast('User updated!', 'success');
    }
    setUserModal({ open: false, data: null });
  }
  function deleteUser(username) {
    if (username === 'wasimadmin') return showToast('Cannot delete master admin.', 'danger');
    confirmAction({ icon:'🗑️', title:'Delete User', message:`Delete user "${username}"?`, okText:'Delete', okClass:'btn-danger' }, () => {
      updateData(prev => ({ ...prev, users: prev.users.filter(u => u.username !== username) }));
      showToast('User deleted.', 'warning');
    });
  }

  // ── Customer handlers ──────────────────────────────────────
  function openNewCustomer() {
    setCustomerModal({ open: true, data: { id:'', name:'', mobile:'', address:'',
      services: [{ id: Date.now(), serviceId:'', fee:'', paid:0, status:'Pending' }] } });
  }
  function openEditCustomer(c) {
    const srvs = c.services?.length
      ? c.services.map((s,i) => ({ ...s, id: i }))
      : [{ id: 0, serviceId:'', fee:'', paid:0, status:'Pending' }];
    setCustomerModal({ open: true, data: { ...c, services: srvs } });
  }
  function handleCustServiceChange(idx, field, val) {
    const cData = { ...customerModal.data };
    cData.services = [...cData.services];
    cData.services[idx] = { ...cData.services[idx], [field]: val };
    if (field === 'serviceId' && val) {
      const srvDef = appData.services.find(s => s.id === val);
      if (srvDef) cData.services[idx].fee = srvDef.fee;
    }
    setCustomerModal({ open: true, data: cData });
  }
  function saveCustomer(e) {
    e.preventDefault();
    const cData = customerModal.data;
    const isNew = !cData.id;
    const cid   = isNew ? Date.now() : cData.id;
    const now   = nowISO();

    const cleanServices = cData.services
      .filter(s => s.serviceId)
      .map(s => ({
        serviceId:   s.serviceId,
        serviceName: appData.services.find(x => x.id === s.serviceId)?.name || s.serviceId,
        fee:    Number(s.fee)  || 0,
        paid:   Number(s.paid) || 0,
        status: s.status || 'Pending',
        paidAt: Number(s.paid) > 0 ? (s.paidAt || now) : null,  // record payment datetime
      }));

    if (!cleanServices.length) return showToast('Please add at least one service.', 'warning');

    const newCust = {
      id:      cid,
      name:    cData.name.trim(),
      mobile:  cData.mobile.trim(),
      address: cData.address.trim(),
      date:    isNew ? todayISO() : (cData.date || todayISO()),
      createdAt: isNew ? now : (cData.createdAt || now),
      services: cleanServices,
    };

    updateData(prev => {
      let pCust = [...prev.customers];
      let pPay  = [...prev.payments];
      if (isNew) {
        pCust.push(newCust);
        cleanServices.forEach(s => {
          if (s.paid > 0) {
            pPay.push({ id: Date.now() + Math.random(), customerId: cid,
              date: todayISO(), datetime: now, type: 'Advance', amount: s.paid });
          }
        });
      } else {
        const idx = pCust.findIndex(x => x.id === cid);
        if (idx >= 0) pCust[idx] = newCust;
      }
      return { ...prev, customers: pCust, payments: pPay };
    });

    showToast(isNew ? `Customer "${newCust.name}" added!` : `Customer "${newCust.name}" updated!`, 'success');
    setCustomerModal({ open: false, data: null });
  }
  function deleteCustomer(id, name) {
    confirmAction({ icon:'🗑️', title:'Delete Customer', message:`Delete "${name}"? All records removed permanently.`, okText:'Yes, Delete', okClass:'btn-danger' }, () => {
      updateData(prev => ({ ...prev, customers: prev.customers.filter(c => c.id !== id) }));
      showToast('Customer deleted.', 'warning');
    });
  }

  // ── Excel Export / Import ──────────────────────────────────
  async function exportExcel() {
    try {
      await loadSheetJS();
      const wb = window.XLSX.utils.book_new();
      window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.json_to_sheet(appData.customers),  'Customers');
      window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.json_to_sheet(appData.services),   'Service Prices');
      window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.json_to_sheet(appData.payments),   'Payments');
      window.XLSX.writeFile(wb, `Raza_Backup_${todayISO()}.xlsx`);
      showToast('Data exported successfully!', 'success');
    } catch { showToast('Export failed.', 'danger'); }
  }

  const fileInputRef = useRef(null);
  function triggerImport() {
    if (!isAdmin) { showToast('Only Admins can restore backups.', 'danger'); return; }
    confirmAction({ icon:'📥', title:'Import & Restore Data', message:'This will overwrite all current records. Are you sure?', okText:'Yes, Import', okClass:'btn-warning' }, () => {
      fileInputRef.current?.click();
    });
  }
  async function handleFileChange(e) {
    const file = e.target.files[0]; if (!file) return;
    try {
      await loadSheetJS();
      const reader = new FileReader();
      reader.onload = evt => {
        const wb = window.XLSX.read(evt.target.result, { type: 'binary' });
        const customers = wb.Sheets['Customers']    ? window.XLSX.utils.sheet_to_json(wb.Sheets['Customers']).map(c => { 
          if (typeof c.services === 'string') try { c.services = JSON.parse(c.services); } catch{}; return c; 
        }) : appData.customers;
        const services  = wb.Sheets['Service Prices'] ? window.XLSX.utils.sheet_to_json(wb.Sheets['Service Prices']) : appData.services;
        const payments  = wb.Sheets['Payments']     ? window.XLSX.utils.sheet_to_json(wb.Sheets['Payments'])  : appData.payments;
        updateData(prev => ({ ...prev, customers, services, payments }));
        showToast('Data imported and restored!', 'success');
        e.target.value = null;
      };
      reader.readAsBinaryString(file);
    } catch { showToast('Import failed.', 'danger'); }
  }

  // ── Search ─────────────────────────────────────────────────
  const [searchCust, setSearchCust] = useState('');
  const query = searchCust.toLowerCase().trim();
  const filteredCust = (appData.customers || []).filter(c =>
    c.name?.toLowerCase().includes(query) ||
    (c.mobile && c.mobile.includes(query)) ||
    (c.id && c.id.toString().includes(query))
  ).slice().reverse();

  // ── Toast icon ─────────────────────────────────────────────
  const toastIcons = { success: '✅', warning: '⚠️', danger: '❌', info: 'ℹ️' };

  // ── Loading Screen ─────────────────────────────────────────
  if (!fbReady) {
    return (
      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100vh', gap:'1rem', background:'var(--bg)' }}>
        <div style={{ fontSize:'3rem' }}>🔄</div>
        <p style={{ color:'var(--text-muted)', fontWeight:600 }}>Connecting to database…</p>
      </div>
    );
  }



  // ── Login Screen ───────────────────────────────────────────
  if (!currentUser) {
    return (
      <div id="login-overlay" style={{ display: 'flex' }}>
        {toast && <div id="toast-container"><div className={`toast toast-${toast.type}`}><span className="toast-icon">{toastIcons[toast.type]}</span><span className="toast-msg">{toast.msg}</span></div></div>}
        <div className="login-card">
          <img src="/logo.png" alt="Logo" className="login-logo" />
          <h2>Raza Online Services</h2>
          <p className="login-sub">Secure access to your CSC Service Center</p>
          <form onSubmit={forgotMode ? handleRecoverPassword : handleLogin} autoComplete="off">
            {!forgotMode ? (
              <>
                <div className="form-group">
                  <label>Username</label>
                  <input type="text" className="form-control" required autoFocus placeholder="Enter username"
                    value={loginCreds.user} onChange={e => setLoginCreds({...loginCreds, user: e.target.value})} />
                </div>
                <div className="form-group">
                  <div style={{ display:'flex', justifyContent:'space-between' }}>
                    <label>Password</label>
                    <a href="#" style={{ fontSize:'0.82rem', color:'var(--primary)', textDecoration:'none' }}
                      onClick={e => { e.preventDefault(); setForgotMode(true); }}>Forgot Password?</a>
                  </div>
                  <div className="password-wrapper">
                    <input type={showPassword ? 'text' : 'password'} className="form-control" required
                      placeholder="Enter password" value={loginCreds.pass}
                      onChange={e => setLoginCreds({...loginCreds, pass: e.target.value})} style={{ paddingRight:'2.5rem' }} />
                    <button type="button" className="eye-btn" onClick={() => setShowPassword(!showPassword)}>{showPassword ? '🙈' : '👁️'}</button>
                  </div>
                </div>
                <p id="login-error" style={{ display: loginError ? 'block' : 'none' }}>⚠️ Invalid username or password.</p>
                <button type="submit" className="btn btn-primary w-100" style={{ marginTop:'0.5rem', padding:'0.75rem' }}>🔓 Secure Login</button>
              </>
            ) : (
              <>
                <p style={{ fontSize:'0.88rem', color:'var(--text-muted)', marginBottom:'1rem' }}>Enter your username to get recovery help.</p>
                <div className="form-group">
                  <label>Username</label>
                  <input type="text" className="form-control" required autoFocus placeholder="Enter username"
                    value={recoveryUser} onChange={e => setRecoveryUser(e.target.value)} />
                </div>
                <button type="submit" className="btn btn-primary w-100" style={{ marginTop:'0.5rem', padding:'0.75rem', marginBottom:'0.5rem' }}>Search Account</button>
                <button type="button" className="btn btn-ghost w-100" onClick={() => { setForgotMode(false); setRecoveryUser(''); }}>← Back to Login</button>
              </>
            )}
          </form>
        </div>
      </div>
    );
  }

  // ── Main App ───────────────────────────────────────────────
  return (
    <div className="app-container" style={{ opacity: 1 }}>
      {toast && <div id="toast-container"><div className={`toast toast-${toast.type}`}><span className="toast-icon">{toastIcons[toast.type]}</span><span className="toast-msg">{toast.msg}</span></div></div>}
      <input type="file" ref={fileInputRef} style={{ display:'none' }} accept=".xlsx,.xls" onChange={handleFileChange} />

      {/* Mobile sidebar overlay */}
      {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />}

      {/* ─── SIDEBAR ─── */}
      <aside className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''} ${sidebarOpen ? 'mobile-open' : ''}`} id="sidebar">
        <div className="logo">
          <img src="/logo.png" alt="Logo" className="logo-img" />
          <div className="logo-text"><h2>Raza Online</h2><p>CSC Service Center</p></div>
        </div>
        <nav className="nav-menu">
          {[
            { view:'dashboard', icon:'📊', label:'Dashboard' },
            { view:'customers', icon:'👥', label:'Customers' },
            { view:'prices',    icon:'⚙️', label:'Service Prices' },
            { view:'payments',  icon:'💳', label:'Payments' },
            ...(isAdmin ? [{ view:'users-mg', icon:'🔐', label:'Users Mgmt' }] : []),
            { view:'backup',    icon:'💾', label:'Excel Backup' },
          ].map(({ view, icon, label }) => (
            <a key={view} href="#" className={`nav-link ${activeView === view ? 'active' : ''}`}
              title={label} onClick={e => { e.preventDefault(); navigate(view); }}>
              <span className="nav-icon">{icon}</span>
              <span className="nav-label">{label}</span>
            </a>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="theme-toggle-row">
            <span>☀️</span>
            <label className="switch" title="Toggle Dark Mode">
              <input type="checkbox" checked={darkMode} onChange={e => setDarkMode(e.target.checked)} />
              <span className="slider round"></span>
            </label>
            <span>🌙</span>
            <span className="theme-label">Dark Mode</span>
          </div>
          <button className="btn-logout" onClick={handleLogout}><span>🚪</span><span className="logout-label">Logout</span></button>
          <div className="copyright-footer">© 2026 Raza Online Services<br/>created by Saddam Shaikh</div>
        </div>
      </aside>

      {/* ─── MAIN ─── */}
      <main className="main-content">
        <div className="top-action-bar">
          <div className="top-left">
            <button className="toggle-btn" onClick={() => { setSidebarCollapsed(!sidebarCollapsed); setSidebarOpen(!sidebarOpen); }}>☰</button>
            <span className="welcome-text">👋 {currentUser.username}{isAdmin ? ' (Admin)' : ''}</span>
          </div>
          <div className="top-right">
            <span className="top-date">{now.toLocaleDateString('en-IN', { weekday:'short', day:'2-digit', month:'short', year:'numeric' })} | {now.toLocaleTimeString('en-IN')}</span>
          </div>
        </div>

        {/* ─── DASHBOARD ─── */}
        {activeView === 'dashboard' && (
          <section className="view active">
            <div className="topbar"><div><h1>Dashboard</h1><div className="topbar-sub">Overview of all CSC activities</div></div></div>
            <div className="stats-grid">
              <div className="stat-card"><span className="stat-icon">👥</span><h3>Total Customers</h3><p className="stat-value stat-val-customers">{appData.customers.length}</p></div>
              <div className="stat-card"><span className="stat-icon">⏳</span><h3>Pending Documents</h3><p className="stat-value stat-val-pending">{pendDocs}</p></div>
              <div className="stat-card"><span className="stat-icon">✅</span><h3>Ready / Delivered</h3><p className="stat-value stat-val-ready">{readyDocs}</p></div>
              <div className="stat-card"><span className="stat-icon">💰</span><h3>Amount Received</h3><p className="stat-value stat-val-received">₹{totReceived.toLocaleString('en-IN')}</p></div>
              <div className="stat-card"><span className="stat-icon">🔴</span><h3>Unpaid Balance</h3><p className="stat-value stat-val-unpaid">₹{totUnpaid.toLocaleString('en-IN')}</p></div>
            </div>
            <div className="dash-bottom">
              <div className="card">
                <div className="card-header"><span className="card-title">Recent Customers</span><a href="#" className="btn btn-ghost btn-sm" onClick={e => { e.preventDefault(); navigate('customers'); }}>View All →</a></div>
                <div className="card-body" style={{ paddingTop:'0.5rem' }}>
                  <ul className="activity-list">
                    {appData.customers.length === 0
                      ? <li className="empty-state"><span className="empty-state-icon">👥</span><p>No customers yet</p></li>
                      : appData.customers.slice().reverse().slice(0,5).map(c => {
                          let bal = 0; (c.services||[]).forEach(s => { bal += (Number(s.fee)||0)-(Number(s.paid)||0); });
                          const srvCount = (c.services||[]).length;
                          return (
                            <li key={c.id} className="activity-item">
                              <span className="activity-dot" style={{ background: bal > 0 ? 'var(--warning)' : 'var(--success)' }}></span>
                              <div className="activity-info">
                                <div className="activity-name">{c.name}</div>
                                <div className="activity-meta">
                                  {srvCount} service{srvCount!==1?'s':''} · {formatDate(c.date)}
                                  {bal > 0 ? <> · <span className="text-warning">₹{bal} due</span></> : <> · <span className="text-success">Paid</span></>}
                                </div>
                              </div>
                            </li>
                          );
                        })
                    }
                  </ul>
                </div>
              </div>
              <div className="card">
                <div className="card-header"><span className="card-title">Recent Payments</span><a href="#" className="btn btn-ghost btn-sm" onClick={e => { e.preventDefault(); navigate('payments'); }}>View All →</a></div>
                <div className="card-body" style={{ paddingTop:'0.5rem' }}>
                  <ul className="activity-list">
                    {appData.payments.length === 0
                      ? <li className="empty-state"><span className="empty-state-icon">💳</span><p>No payments yet</p></li>
                      : appData.payments.slice().sort((a,b)=>b.id-a.id).slice(0,5).map(p => (
                          <li key={p.id} className="activity-item">
                            <span className="activity-dot" style={{ background:'var(--success)' }}></span>
                            <div className="activity-info">
                              <div className="activity-name">C-{p.customerId} · <span className="text-success fw-600">₹{Number(p.amount).toLocaleString('en-IN')}</span></div>
                              <div className="activity-meta">{p.type||'Payment'} · {formatDateTime(p.datetime || p.date)}</div>
                            </div>
                          </li>
                        ))
                    }
                  </ul>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ─── CUSTOMERS ─── */}
        {activeView === 'customers' && (
          <section className="view active">
            <div className="topbar">
              <div><h1>Customers</h1><div className="topbar-sub">Manage all service applications</div></div>
              <button className="btn btn-primary" onClick={openNewCustomer}>+ New Customer</button>
            </div>
            <div className="search-bar">
              <span className="search-icon">🔍</span>
              <input type="text" value={searchCust} onChange={e=>setSearchCust(e.target.value)} placeholder="Search by name, mobile, or ID…" className="form-control" />
            </div>
            <div className="table-container">
              <table className="data-table">
                <thead><tr><th>ID</th><th>Name</th><th>Mobile</th><th>Services / Balance</th><th>Registered</th><th>Actions</th></tr></thead>
                <tbody>
                  {filteredCust.length === 0
                    ? <tr className="empty-row"><td colSpan="6"><div className="empty-state"><span className="empty-state-icon">👥</span><p>{query ? 'No matching customers.' : 'No customers yet. Click "+ New Customer".'}</p></div></td></tr>
                    : filteredCust.map(c => {
                        let totFee=0, totPaid=0;
                        (c.services||[]).forEach(s => { totFee+=Number(s.fee)||0; totPaid+=Number(s.paid)||0; });
                        const bal=totFee-totPaid, cnt=(c.services||[]).length;
                        return (
                          <tr key={c.id}>
                            <td data-label="ID"><span className="badge badge-neutral">C-{c.id}</span></td>
                            <td data-label="Name">
                              <div className="customer-name-cell">
                                <span className="customer-avatar">{getInitials(c.name)}</span>
                                <div>
                                  <div className="fw-bold">{c.name}</div>
                                  {c.address && <div className="text-xs text-muted">{c.address}</div>}
                                </div>
                              </div>
                            </td>
                            <td data-label="Mobile">{c.mobile||'-'}</td>
                            <td data-label="Services">
                              <div className="text-sm fw-600">{cnt} Service{cnt!==1?'s':''}</div>
                              <div className="text-xs text-muted">Adv: ₹{totPaid.toLocaleString('en-IN')} · Bal: <span className={bal>0?'text-danger fw-bold':'text-success'}>₹{(bal>0?bal:0).toLocaleString('en-IN')}</span></div>
                            </td>
                            <td data-label="Registered" className="text-sm text-muted">{formatDate(c.date)}</td>
                            <td className="td-actions">
                              <div className="action-group">
                                <button className="btn btn-secondary btn-sm" onClick={() => openEditCustomer(c)}>✏️ Edit</button>
                                {isAdmin && <button className="btn btn-danger btn-sm" onClick={() => deleteCustomer(c.id, c.name)}>🗑️</button>}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                  }
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* ─── PRICES ─── */}
        {activeView === 'prices' && (
          <section className="view active">
            <div className="topbar">
              <div><h1>Service Prices</h1><div className="topbar-sub">View and manage service types and fees</div></div>
              {isAdmin && <button className="btn btn-primary" onClick={openNewService}>+ Add Service</button>}
            </div>
            {!isAdmin && (
              <div className="staff-notice">
                🔒 View only — only Administrators can add, edit, or delete services.
              </div>
            )}
            <div className="table-container">
              <table className="data-table">
                <thead><tr><th>#</th><th>Service Name</th><th>Default Fee (₹)</th><th>Status</th>{isAdmin && <th>Actions</th>}</tr></thead>
                <tbody>
                  {appData.services.length === 0
                    ? <tr className="empty-row"><td colSpan={isAdmin ? 5 : 4}><div className="empty-state"><span className="empty-state-icon">⚙️</span><p>No services configured yet.</p></div></td></tr>
                    : appData.services.map((s,i) => (
                        <tr key={s.id}>
                          <td data-label="#" className="text-muted text-sm">{i+1}</td>
                          <td data-label="Service" className="fw-600">{s.name}</td>
                          <td data-label="Fee" className="fw-bold text-primary">₹{Number(s.fee).toLocaleString('en-IN')}</td>
                          <td data-label="Status">{s.active ? <span className="badge badge-success">Active</span> : <span className="badge badge-danger">Disabled</span>}</td>
                          {isAdmin && (
                            <td className="td-actions">
                              <div className="action-group">
                                <button className="btn btn-secondary btn-sm" onClick={() => openEditService(s)}>✏️ Edit</button>
                                <button className="btn btn-danger btn-sm" onClick={() => deleteService(s.id, s.name)}>🗑️</button>
                              </div>
                            </td>
                          )}
                        </tr>
                    ))
                  }
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* ─── PAYMENTS ─── */}
        {activeView === 'payments' && (
          <section className="view active">
            <div className="topbar"><div><h1>Payment History</h1><div className="topbar-sub">All payment transactions</div></div></div>
            <div className="table-container">
              <table className="data-table">
                <thead><tr><th>Receipt #</th><th>Date & Time</th><th>Customer</th><th>Type</th><th>Amount (₹)</th></tr></thead>
                <tbody>
                  {appData.payments.length === 0
                    ? <tr className="empty-row"><td colSpan="5"><div className="empty-state"><span className="empty-state-icon">💳</span><p>No payment records yet.</p></div></td></tr>
                    : appData.payments.slice().sort((a,b)=>b.id-a.id).slice(0,100).map(p => (
                        <tr key={p.id}>
                          <td data-label="Receipt" className="text-muted text-sm">#{Math.floor(p.id)}</td>
                          <td data-label="Date & Time" className="text-sm">{formatDateTime(p.datetime || p.date)}</td>
                          <td data-label="Customer"><span className="badge badge-neutral">C-{p.customerId}</span></td>
                          <td data-label="Type"><span className="badge badge-info">{p.type||'Payment'}</span></td>
                          <td data-label="Amount" className="fw-bold text-success">₹{Number(p.amount).toLocaleString('en-IN')}</td>
                        </tr>
                    ))
                  }
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* ─── BACKUP ─── */}
        {activeView === 'backup' && (
          <section className="view active">
            <div className="topbar"><div><h1>Excel Backup</h1><div className="topbar-sub">Export and restore your data</div></div></div>
            <div className="backup-cards">
              <div className="card">
                <div className="backup-card-inner">
                  <span className="backup-icon">📤</span><h3>Export Data</h3>
                  <p>Export all customers, services, and payments to Excel.</p>
                  <button className="btn btn-success" onClick={exportExcel}>Export to Excel</button>
                </div>
              </div>
              <div className="card">
                <div className="backup-card-inner">
                  <span className="backup-icon">📥</span><h3>Import / Restore</h3>
                  <p>Restore your system from an existing Excel backup. Admin only.</p>
                  <button className="btn btn-warning" onClick={triggerImport}>Import from Excel</button>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ─── USERS ─── */}
        {activeView === 'users-mg' && (
          <section className="view active">
            <div className="topbar"><div><h1>System Users</h1><div className="topbar-sub">Manage admin and staff accounts</div></div><button className="btn btn-primary" onClick={openNewUser}>+ Create User</button></div>
            <div className="table-container">
              <table className="data-table">
                <thead><tr><th>Username</th><th>Role</th><th>Actions</th></tr></thead>
                <tbody>
                  {appData.users.length === 0
                    ? <tr className="empty-row"><td colSpan="3"><div className="empty-state"><span className="empty-state-icon">🔐</span><p>No users configured.</p></div></td></tr>
                    : appData.users.map(u => (
                        <tr key={u.username}>
                          <td data-label="Username">
                            <div style={{ display:'flex', alignItems:'center', gap:'0.625rem' }}>
                              <span className="customer-avatar" style={{ background: u.role==='admin' ? 'linear-gradient(135deg,#6366f1,#8b5cf6)' : 'linear-gradient(135deg,#10b981,#06b6d4)' }}>
                                {u.username.slice(0,2).toUpperCase()}
                              </span>
                              <span className="fw-600">{u.username}</span>
                            </div>
                          </td>
                          <td data-label="Role"><span className={`badge ${u.role==='admin'?'badge-primary':'badge-success'}`}>{u.role==='admin'?'🔑 Admin':'👤 Staff'}</span></td>
                          <td className="td-actions">
                            <div className="action-group">
                              <button className="btn btn-secondary btn-sm" onClick={() => openEditUser(u)}>✏️ Edit</button>
                              {u.username !== 'wasimadmin' ? <button className="btn btn-danger btn-sm" onClick={() => deleteUser(u.username)}>🗑️</button> : <span className="text-xs text-muted">Protected</span>}
                            </div>
                          </td>
                        </tr>
                    ))
                  }
                </tbody>
              </table>
            </div>
          </section>
        )}
      </main>

      {/* ─── CUSTOMER MODAL ─── */}
      {customerModal.open && (
        <div className="modal show" onClick={e => { if (e.target.classList.contains('modal')) setCustomerModal({open:false}); }}>
          <div className="modal-content large-modal" style={{ padding:0,display:'flex',flexDirection:'column',overflow:'hidden' }}>
            <div className="modal-header" style={{ padding:'1.25rem 1.5rem',borderBottom:'1px solid var(--border)',margin:0,flexShrink:0 }}>
              <h2 className="modal-title" style={{ margin:0 }}>{customerModal.data.id ? 'Edit Customer' : 'Add New Customer'}</h2>
              <button className="close-modal" type="button" onClick={() => setCustomerModal({open:false})}>✕</button>
            </div>
            <form onSubmit={saveCustomer} style={{ display:'flex',flexDirection:'column',minHeight:0,margin:0,flex:1 }}>
              <div style={{ padding:'1.25rem 1.5rem',overflowY:'auto',flex:1 }}>
                <div className="form-grid">
                  <div className="form-group">
                    <label>Full Name *</label>
                    <input type="text" className="form-control" placeholder="e.g. Mohammed Ali" required
                      value={customerModal.data.name} onChange={e=>setCustomerModal({open:true,data:{...customerModal.data,name:e.target.value}})} />
                  </div>
                  <div className="form-group">
                    <label>Mobile Number *</label>
                    <input type="text" className="form-control" placeholder="e.g. 9876543210" required
                      value={customerModal.data.mobile} onChange={e=>setCustomerModal({open:true,data:{...customerModal.data,mobile:e.target.value}})} />
                  </div>
                  <div className="form-group" style={{ gridColumn:'span 2' }}>
                    <label>Address</label>
                    <input type="text" className="form-control" placeholder="Village / Town / City"
                      value={customerModal.data.address} onChange={e=>setCustomerModal({open:true,data:{...customerModal.data,address:e.target.value}})} />
                  </div>
                </div>
                <div className="section-divider"></div>
                <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'1rem' }}>
                  <h3 style={{ fontWeight:700,color:'var(--text-heading)',fontSize:'1rem' }}>Services</h3>
                  <button type="button" className="btn btn-secondary btn-sm"
                    onClick={() => setCustomerModal({open:true,data:{...customerModal.data,services:[...customerModal.data.services,{id:Date.now(),serviceId:'',fee:'',paid:0,status:'Pending'}]}})}>+ Add Service</button>
                </div>
                {customerModal.data.services.map((s,idx) => (
                  <div className="service-row" key={s.id}>
                    <button type="button" className="remove-service-btn" title="Remove"
                      onClick={() => setCustomerModal({open:true,data:{...customerModal.data,services:customerModal.data.services.filter((_,i)=>i!==idx)}})}>✕</button>
                    <div className="form-grid" style={{ marginTop:'0.25rem' }}>
                      <div className="form-group" style={{ gridColumn:'span 2' }}>
                        <label>Service Type</label>
                        <select className="form-control" required value={s.serviceId} onChange={e=>handleCustServiceChange(idx,'serviceId',e.target.value)}>
                          <option value="">— Select Service —</option>
                          {appData.services.filter(x=>x.active).map(x=><option key={x.id} value={x.id}>{x.name} — ₹{x.fee}</option>)}
                        </select>
                      </div>
                      <div className="form-group">
                        <label>Total Fee (₹)</label>
                        <input type="number" min="0" className="form-control" required value={s.fee} onChange={e=>handleCustServiceChange(idx,'fee',e.target.value)} />
                      </div>
                      <div className="form-group">
                        <label>Amount Paid (₹)</label>
                        <input type="number" min="0" className="form-control" required value={s.paid} onChange={e=>handleCustServiceChange(idx,'paid',e.target.value)} />
                      </div>
                      <div className="form-group" style={{ gridColumn:'span 2' }}>
                        <label>Status</label>
                        <select className="form-control" value={s.status} onChange={e=>handleCustServiceChange(idx,'status',e.target.value)}>
                          <option value="Pending">⏳ Pending</option>
                          <option value="In Progress">🔧 In Progress</option>
                          <option value="Ready">✅ Ready</option>
                          <option value="Delivered">📦 Delivered</option>
                        </select>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="modal-footer" style={{ padding:'1rem 1.5rem',borderTop:'1px solid var(--border)',margin:0,background:'var(--surface)' }}>
                <button type="button" className="btn btn-ghost" onClick={() => setCustomerModal({open:false})}>Cancel</button>
                <button type="submit" className="btn btn-primary">💾 Save Customer</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── SERVICE MODAL ─── */}
      {serviceModal.open && (
        <div className="modal show" onClick={e => { if (e.target.classList.contains('modal')) setServiceModal({open:false}); }}>
          <div className="modal-content">
            <div className="modal-header">
              <h2 className="modal-title">{serviceModal.data.id ? 'Edit Service' : 'Add Service'}</h2>
              <button className="close-modal" type="button" onClick={() => setServiceModal({open:false})}>✕</button>
            </div>
            <form onSubmit={saveService}>
              <div className="form-group"><label>Service Name</label><input type="text" className="form-control" required placeholder="e.g. Birth Certificate" value={serviceModal.data.name} onChange={e=>setServiceModal({open:true,data:{...serviceModal.data,name:e.target.value}})} /></div>
              <div className="form-group"><label>Default Fee (₹)</label><input type="number" min="0" className="form-control" required placeholder="e.g. 300" value={serviceModal.data.fee} onChange={e=>setServiceModal({open:true,data:{...serviceModal.data,fee:e.target.value}})} /></div>
              <div className="form-group" style={{ display:'flex',alignItems:'center',gap:'0.625rem' }}>
                <input type="checkbox" id="srv-active-chk" style={{ width:'18px',height:'18px',accentColor:'var(--primary)',cursor:'pointer' }} checked={serviceModal.data.active} onChange={e=>setServiceModal({open:true,data:{...serviceModal.data,active:e.target.checked}})} />
                <label htmlFor="srv-active-chk" style={{ margin:0,cursor:'pointer',fontSize:'0.9rem',color:'var(--text-main)' }}>Active Service</label>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setServiceModal({open:false})}>Cancel</button>
                <button type="submit" className="btn btn-primary">💾 Save Service</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── USER MODAL ─── */}
      {userModal.open && (
        <div className="modal show" onClick={e => { if (e.target.classList.contains('modal')) setUserModal({open:false}); }}>
          <div className="modal-content">
            <div className="modal-header">
              <h2 className="modal-title">{userModal.data.oldName ? 'Edit User' : 'Create User'}</h2>
              <button className="close-modal" type="button" onClick={() => setUserModal({open:false})}>✕</button>
            </div>
            <form onSubmit={saveUser}>
              <div className="form-group"><label>Username</label><input type="text" className="form-control" required placeholder="e.g. staff01" value={userModal.data.username} onChange={e=>setUserModal({open:true,data:{...userModal.data,username:e.target.value}})} /></div>
              <div className="form-group">
                <label>Password</label>
                <div className="password-wrapper">
                  <input type={showPassword?'text':'password'} className="form-control" value={userModal.data.pass} onChange={e=>setUserModal({open:true,data:{...userModal.data,pass:e.target.value}})}
                    placeholder={userModal.data.oldName ? 'Leave blank to keep existing' : ''} style={{ paddingRight:'2.5rem' }} />
                  <button type="button" className="eye-btn" onClick={() => setShowPassword(!showPassword)}>{showPassword?'🙈':'👁️'}</button>
                </div>
              </div>
              <div className="form-group">
                <label>Role</label>
                <select className="form-control" value={userModal.data.role} onChange={e=>setUserModal({open:true,data:{...userModal.data,role:e.target.value}})}>
                  <option value="user">Staff User</option>
                  <option value="admin">Administrator</option>
                </select>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setUserModal({open:false})}>Cancel</button>
                <button type="submit" className="btn btn-primary">💾 Save User</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── CONFIRM MODAL ─── */}
      {confirmModal.open && (
        <div className="modal show">
          <div className="modal-content confirm-dialog">
            <span className="confirm-icon">{confirmModal.icon}</span>
            <h3 className="modal-title" style={{ marginBottom:'0.5rem' }}>{confirmModal.title}</h3>
            <p>{confirmModal.message}</p>
            <div style={{ display:'flex',gap:'0.75rem',justifyContent:'center' }}>
              <button className="btn btn-ghost" onClick={() => setConfirmModal({...confirmModal,open:false})}>Cancel</button>
              <button className={`btn ${confirmModal.okClass}`} onClick={() => { confirmModal.onConfirm(); setConfirmModal({...confirmModal,open:false}); }}>{confirmModal.okText}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
