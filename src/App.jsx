import React, { useState, useEffect, useRef } from 'react';
import './index.css';

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

function formatDate(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function todayISO() { return new Date().toISOString().split('T')[0]; }

function getInitials(name) {
  if (!name) return '';
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

const DEFAULT_DATA = {
  customers: [],
  services: [
    { id: '1', name: 'Birth Certificate', fee: 300, active: true },
    { id: '2', name: 'Income Certificate', fee: 200, active: true },
    { id: '3', name: 'Age Certificate', fee: 150, active: true },
    { id: '4', name: 'Domicile Certificate', fee: 250, active: true },
    { id: '5', name: 'Gazette Service', fee: 500, active: true },
    { id: '6', name: 'Passport Service', fee: 1500, active: true },
    { id: '7', name: 'PAN Card', fee: 300, active: true },
    { id: '8', name: 'Voter ID', fee: 150, active: true }
  ],
  payments: [],
  users: []
};

export default function App() {
  const [appData, setAppData] = useState(() => {
    const d = localStorage.getItem('appData');
    const parsed = d ? JSON.parse(d) : { ...DEFAULT_DATA };
    if (!parsed.users || parsed.users.length === 0) {
      parsed.users = [{ username: 'wasimadmin', password: 'Admin@123456', role: 'admin' }];
    } else if (parsed.users.length === 1 && parsed.users[0].username === 'admin' && parsed.users[0].password === 'password') {
      parsed.users[0].username = 'wasimadmin';
      parsed.users[0].password = 'Admin@123456';
    }
    if (!parsed.services || parsed.services.length === 0) {
      parsed.services = [...DEFAULT_DATA.services];
    }
    return parsed;
  });

  const [currentUser, setCurrentUser] = useState(() => {
    const saved = localStorage.getItem('logged-in-user');
    return saved ? appData.users.find(u => u.username === saved) || null : null;
  });

  const [activeView, setActiveView] = useState('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(localStorage.getItem('sidebar-collapsed') === 'true');
  const [darkMode, setDarkMode] = useState(localStorage.getItem('theme-mode') === 'dark');
  const [toast, setToast] = useState(null);

  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const [customerModal, setCustomerModal] = useState({ open: false, data: null });
  const [serviceModal, setServiceModal] = useState({ open: false, data: null });
  const [userModal, setUserModal] = useState({ open: false, data: null });
  const [confirmModal, setConfirmModal] = useState({ open: false, icon: '⚠️', title: '', message: '', okText: 'Delete', okClass: 'btn-danger', onConfirm: null });

  useEffect(() => { localStorage.setItem('appData', JSON.stringify(appData)); }, [appData]);
  useEffect(() => { localStorage.setItem('sidebar-collapsed', sidebarCollapsed); }, [sidebarCollapsed]);
  useEffect(() => {
    const body = document.body;
    if (darkMode) {
      body.classList.add('dark-mode');
      localStorage.setItem('theme-mode', 'dark');
    } else {
      body.classList.remove('dark-mode');
      localStorage.setItem('theme-mode', 'light');
    }
  }, [darkMode]);
  
  useEffect(() => { loadSheetJS(); }, []);

  const showToast = (msg, type = 'info') => {
    setToast(null);
    setTimeout(() => {
      setToast({ msg, type });
      setTimeout(() => setToast(null), 3500);
    }, 10);
  };

  const confirmAction = (options, onConfirm) => {
    setConfirmModal({
      open: true,
      icon: options.icon || '⚠️',
      title: options.title || 'Are you sure?',
      message: options.message || 'This action cannot be undone.',
      okText: options.okText || 'Delete',
      okClass: options.okClass || 'btn-danger',
      onConfirm
    });
  };

  // --- Auth ---
  const [loginCreds, setLoginCreds] = useState({ user: '', pass: '' });
  const [loginError, setLoginError] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [forgotPasswordMode, setForgotPasswordMode] = useState(false);
  const [recoveryUser, setRecoveryUser] = useState('');

  const handleRecoverPassword = (e) => {
    e.preventDefault();
    const hit = appData.users.find(u => u.username === recoveryUser.trim());
    if (!hit) {
      showToast('❌ Username not found!', 'danger');
      return;
    }
    if (hit.role !== 'admin') {
      showToast('⚠️ Staff users must ask the Administrator to reset passwords.', 'warning');
    } else {
      showToast(`ℹ️ Admin Recovery: Ensure default is "Admin@123456" or check recovery docs.`, 'info');
    }
    setForgotPasswordMode(false);
    setRecoveryUser('');
  };

  const handleLogin = (e) => {
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
  };

  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem('logged-in-user');
    setLoginCreds({ user: '', pass: '' });
    setActiveView('dashboard');
  };

  const navigate = (view) => {
    if (view === 'users-mg' && currentUser?.role !== 'admin') {
      showToast('Access Denied: Admins only.', 'danger');
      return;
    }
    setActiveView(view);
  };

  // Stats
  let pendDocs = 0, readyDocs = 0, totReceived = 0, totUnpaid = 0;
  appData.customers.forEach(c => {
    (c.services || []).forEach(s => {
      const status = (s.status || '').toLowerCase();
      if (status === 'pending' || status === 'in progress') pendDocs++;
      if (status === 'ready' || status === 'delivered') readyDocs++;
      const paid = Number(s.paid) || 0;
      const fee = Number(s.fee) || 0;
      totReceived += paid;
      const bal = fee - paid;
      if (bal > 0) totUnpaid += bal;
    });
  });

  // --- Handlers: Service ---
  const openNewService = () => setServiceModal({ open: true, data: { id: '', name: '', fee: '', active: true } });
  const openEditService = (srv) => setServiceModal({ open: true, data: { ...srv } });
  const saveService = (e) => {
    e.preventDefault();
    const srv = serviceModal.data;
    const isNew = !srv.id;
    const srvId = isNew ? Date.now().toString() : srv.id;
    const newSrv = { id: srvId, name: srv.name.trim(), fee: Number(srv.fee), active: srv.active };
    if (isNew) {
      setAppData(prev => ({ ...prev, services: [...prev.services, newSrv] }));
      showToast('Service added successfully!', 'success');
    } else {
      setAppData(prev => ({ ...prev, services: prev.services.map(s => s.id === srvId ? newSrv : s) }));
      showToast('Service updated successfully!', 'success');
    }
    setServiceModal({ open: false, data: null });
  };

  // --- Handlers: User ---
  const openNewUser = () => setUserModal({ open: true, data: { oldName: '', username: '', pass: '', role: 'user' } });
  const openEditUser = (u) => setUserModal({ open: true, data: { oldName: u.username, username: u.username, pass: '', role: u.role } });
  const saveUser = (e) => {
    e.preventDefault();
    const uBox = userModal.data;
    if (!uBox.username) return showToast('Username required.', 'warning');
    const isNew = !uBox.oldName;
    if (isNew) {
      if (appData.users.find(u => u.username === uBox.username)) return showToast('Username taken!', 'danger');
      if (!uBox.pass) return showToast('Password required.', 'warning');
      setAppData(prev => ({ ...prev, users: [...prev.users, { username: uBox.username, password: uBox.pass, role: uBox.role }] }));
      showToast('User created!', 'success');
    } else {
      setAppData(prev => {
        const arr = [...prev.users];
        const idx = arr.findIndex(x => x.username === uBox.oldName);
        arr[idx].username = uBox.username;
        arr[idx].role = uBox.role;
        if (uBox.pass) arr[idx].password = uBox.pass;
        return { ...prev, users: arr };
      });
      showToast('User updated!', 'success');
    }
    setUserModal({ open: false, data: null });
  };
  
  const deleteUser = (username) => {
    if (username === 'wasimadmin') return showToast('Cannot delete the master admin account.', 'danger');
    confirmAction({ icon: '🗑️', title: 'Delete User', message: `Delete user "${username}"? This cannot be undone.`, okText: 'Delete User', okClass: 'btn-danger' }, () => {
      setAppData(p => ({ ...p, users: p.users.filter(x => x.username !== username) }));
      showToast('User deleted.', 'warning');
    });
  };

  // --- Handlers: Customer ---
  const openNewCustomer = () => {
    setCustomerModal({
      open: true,
      data: {
        id: '', name: '', mobile: '', address: '',
        services: [{ id: Date.now(), serviceId: '', fee: '', paid: 0, status: 'Pending' }]
      }
    });
  };
  const openEditCustomer = (c) => {
    const srvs = c.services && c.services.length > 0
      ? c.services.map((s,i) => ({ ...s, id: i }))
      : [{ id: 0, serviceId: '', fee: '', paid: 0, status: 'Pending' }];
    setCustomerModal({ open: true, data: { ...c, services: srvs } });
  };
  
  const handleCustServiceChange = (idx, field, val) => {
    const cData = { ...customerModal.data };
    cData.services[idx][field] = val;
    if (field === 'serviceId' && val) {
      const srvDef = appData.services.find(s => s.id === val);
      if (srvDef) cData.services[idx].fee = srvDef.fee;
    }
    setCustomerModal({ open: true, data: cData });
  };
  
  const saveCustomer = (e) => {
    e.preventDefault();
    const cData = customerModal.data;
    const isNew = !cData.id;
    const cid = isNew ? Date.now() : cData.id;
    
    const cleanServices = [];
    cData.services.forEach(s => {
      if (s.serviceId) {
        const srvDef = appData.services.find(x => x.id === s.serviceId);
        cleanServices.push({
          serviceId: s.serviceId,
          serviceName: srvDef?.name || s.serviceId,
          fee: Number(s.fee) || 0,
          paid: Number(s.paid) || 0,
          status: s.status || 'Pending'
        });
      }
    });

    if (cleanServices.length === 0) return showToast('Please add at least one service.', 'warning');

    const newCust = {
      id: cid,
      name: cData.name.trim(),
      mobile: cData.mobile.trim(),
      address: cData.address.trim(),
      date: isNew ? todayISO() : (cData.date || todayISO()),
      services: cleanServices
    };

    setAppData(prev => {
      let pCust = [...prev.customers], pPay = [...prev.payments];
      if (isNew) {
        pCust.push(newCust);
        cleanServices.forEach(s => {
          if (s.paid > 0) pPay.push({ id: Date.now()+Math.random(), customerId: cid, date: todayISO(), type: 'Advance', amount: s.paid });
        });
        showToast(`Customer "${newCust.name}" added!`, 'success');
      } else {
        const idx = pCust.findIndex(x => x.id === cid);
        pCust[idx] = newCust;
        showToast(`Customer "${newCust.name}" updated!`, 'success');
      }
      return { ...prev, customers: pCust, payments: pPay };
    });
    
    setCustomerModal({ open: false, data: null });
  };

  const deleteCustomer = (id, name) => {
    confirmAction({ icon: '🗑️', title: 'Delete Customer', message: `Delete "${name}"? All their service records will be removed permanently.`, okText: 'Yes, Delete', okClass: 'btn-danger' }, () => {
      setAppData(p => ({ ...p, customers: p.customers.filter(c => c.id !== id) }));
      showToast('Customer deleted.', 'warning');
    });
  };

  // --- Handlers: Excel ---
  const exportExcel = async () => {
    try {
      await loadSheetJS();
      const wb = window.XLSX.utils.book_new();
      
      const wsCustomers = window.XLSX.utils.json_to_sheet(appData.customers);
      window.XLSX.utils.book_append_sheet(wb, wsCustomers, 'Customers');
      
      const wsServices = window.XLSX.utils.json_to_sheet(appData.services);
      window.XLSX.utils.book_append_sheet(wb, wsServices, 'Service Prices');

      const wsPayments = window.XLSX.utils.json_to_sheet(appData.payments);
      window.XLSX.utils.book_append_sheet(wb, wsPayments, 'Payments');

      window.XLSX.writeFile(wb, `Raza_Online_Services_Backup_${todayISO()}.xlsx`);
      showToast('Data exported to Excel successfully!', 'success');
    } catch(err) {
      console.error(err);
      showToast('Export failed.', 'danger');
    }
  };

  const fileInputRef = useRef(null);
  const triggerImport = () => {
    if (currentUser?.role !== 'admin') {
      showToast('Only Administrators can restore backups.', 'danger');
      return;
    }
    confirmAction({ icon: '📥', title: 'Import & Restore Data', message: 'Importing a backup will overwrite all current customer, service, and payment records. Are you sure?', okText: 'Yes, Import', okClass: 'btn-warning' }, () => {
      if (fileInputRef.current) fileInputRef.current.click();
    });
  };

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      await loadSheetJS();
      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const data = evt.target.result;
          const wb = window.XLSX.read(data, { type: 'binary' });
          let newCustomers = appData.customers;
          let newServices = appData.services;
          let newPayments = appData.payments;

          if (wb.Sheets['Customers']) newCustomers = window.XLSX.utils.sheet_to_json(wb.Sheets['Customers']);
          if (wb.Sheets['Service Prices']) newServices = window.XLSX.utils.sheet_to_json(wb.Sheets['Service Prices']);
          if (wb.Sheets['Payments']) newPayments = window.XLSX.utils.sheet_to_json(wb.Sheets['Payments']);

          // To handle complex nested structures like "services" array inside each customer that window.XLSX.utils.json_to_sheet stringifies and might not parse back automatically:
          // We will attempt to parse them if stringified.
          const cleanCustomers = newCustomers.map(c => {
             if (typeof c.services === 'string') {
               try { c.services = JSON.parse(c.services); } catch(e){}
             }
             return c;
          });

          setAppData(prev => ({ ...prev, customers: cleanCustomers, services: newServices, payments: newPayments }));
          showToast('Data imported and restored successfully!', 'success');
          e.target.value = null; // reset input
        } catch(err) {
          console.error(err);
          showToast('Import failed or was cancelled.', 'danger');
        }
      };
      reader.readAsBinaryString(file);
    } catch (err) {
      console.error(err);
      showToast('Import failed.', 'danger');
    }
  };

  // Sub-components state
  const [searchCust, setSearchCust] = useState('');
  const query = searchCust.toLowerCase().trim();
  const filteredCust = appData.customers.filter(c => 
    c.name.toLowerCase().includes(query) || 
    (c.mobile && c.mobile.includes(query)) ||
    (c.id && c.id.toString().includes(query))
  ).reverse();

  if (!currentUser) {
    return (
      <div id="login-overlay" style={{ display: 'flex' }}>
        {toast && <div id="toast-container"><div className={`toast toast-${toast.type}`}><span className="toast-icon">{toast.type==='success'?'✅':toast.type==='danger'?'❌':toast.type==='warning'?'⚠️':'ℹ️'}</span><span className="toast-msg">{toast.msg}</span></div></div>}
        <div className="login-card">
          <img src="/logo.png" alt="Raza Online Services" className="login-logo" />
          <h2>Raza Online Services</h2>
          <p className="login-sub">Secure access to your CSC Service Center</p>
          <form id="login-form" onSubmit={forgotPasswordMode ? handleRecoverPassword : handleLogin} autoComplete="off">
            {!forgotPasswordMode ? (
              <>
                <div className="form-group">
                  <label>Username</label>
                  <input type="text" className="form-control" required autoFocus placeholder="Enter username" value={loginCreds.user} onChange={e => setLoginCreds({...loginCreds, user: e.target.value})} />
                </div>
                <div className="form-group">
                  <div style={{display:'flex',justifyContent:'space-between'}}>
                    <label>Password</label>
                    <a href="#" style={{fontSize:'0.85rem',color:'var(--primary)',textDecoration:'none'}} onClick={(e)=>{e.preventDefault();setForgotPasswordMode(true);}}>Forgot Password?</a>
                  </div>
                  <div className="password-wrapper">
                    <input type={showPassword ? 'text' : 'password'} className="form-control" required placeholder="Enter password" value={loginCreds.pass} onChange={e => setLoginCreds({...loginCreds, pass: e.target.value})} style={{paddingRight: '2.5rem'}} />
                    <button type="button" className="eye-btn" title="Show/Hide Password" onClick={() => setShowPassword(!showPassword)}>{showPassword ? '🙈' : '👁️'}</button>
                  </div>
                </div>
                <p id="login-error" style={{ display: loginError ? 'block' : 'none' }}>⚠️ Invalid username or password. Please try again.</p>
                <button type="submit" className="btn btn-primary w-100" style={{marginTop:'0.5rem', padding:'0.75rem'}}>🔓 Secure Login</button>
              </>
            ) : (
              <>
                <p style={{fontSize:'0.9rem',color:'var(--text-muted)',marginBottom:'1rem'}}>Enter your username to check recovery options.</p>
                <div className="form-group">
                  <label>Username</label>
                  <input type="text" className="form-control" required autoFocus placeholder="Enter username" value={recoveryUser} onChange={e => setRecoveryUser(e.target.value)} />
                </div>
                <button type="submit" className="btn btn-primary w-100" style={{marginTop:'0.5rem', padding:'0.75rem', marginBottom:'0.5rem'}}>Search Account</button>
                <button type="button" className="btn btn-ghost w-100" onClick={() => { setForgotPasswordMode(false); setRecoveryUser(''); }}>Back to Login</button>
              </>
            )}
          </form>
        </div>
      </div>
    );
  }

  const icons = { success: '✅', warning: '⚠️', danger: '❌', info: 'ℹ️' };

  return (
    <div className="app-container" style={{ opacity: 1, transition: 'opacity 0.35s' }}>
      {toast && <div id="toast-container"><div className={`toast toast-${toast.type} ${toast ? '' : 'toast-out'}`}><span className="toast-icon">{icons[toast.type]}</span><span className="toast-msg">{toast.msg}</span></div></div>}
      <input type="file" ref={fileInputRef} style={{ display: 'none' }} accept=".xlsx, .xls" onChange={handleFileChange} />

      <aside className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''}`} id="sidebar">
        <div className="logo"><img src="/logo.png" alt="Raza Online Services" className="logo-img" /><div className="logo-text"><h2>Raza Online</h2><p>CSC Service Center</p></div></div>
        <nav className="nav-menu">
          <a href="#" className={`nav-link ${activeView === 'dashboard' ? 'active' : ''}`} onClick={(e) => { e.preventDefault(); navigate('dashboard'); }} title="Dashboard"><span className="nav-icon">📊</span><span className="nav-label">Dashboard</span></a>
          <a href="#" className={`nav-link ${activeView === 'customers' ? 'active' : ''}`} onClick={(e) => { e.preventDefault(); navigate('customers'); }} title="Customers"><span className="nav-icon">👥</span><span className="nav-label">Customers</span></a>
          <a href="#" className={`nav-link ${activeView === 'prices' ? 'active' : ''}`} onClick={(e) => { e.preventDefault(); navigate('prices'); }} title="Service Prices"><span className="nav-icon">⚙️</span><span className="nav-label">Service Prices</span></a>
          <a href="#" className={`nav-link ${activeView === 'payments' ? 'active' : ''}`} onClick={(e) => { e.preventDefault(); navigate('payments'); }} title="Payments"><span className="nav-icon">💳</span><span className="nav-label">Payments</span></a>
          {currentUser.role === 'admin' && (<a href="#" className={`nav-link ${activeView === 'users-mg' ? 'active' : ''}`} onClick={(e) => { e.preventDefault(); navigate('users-mg'); }} title="Users Management"><span className="nav-icon">🔐</span><span className="nav-label">Users Mgmt</span></a>)}
          <a href="#" className={`nav-link ${activeView === 'backup' ? 'active' : ''}`} onClick={(e) => { e.preventDefault(); navigate('backup'); }} title="Excel Backup"><span className="nav-icon">💾</span><span className="nav-label">Excel Backup</span></a>
        </nav>
        <div className="sidebar-bottom">
          <div className="theme-toggle-row">
            <span style={{fontSize:'1rem'}}>☀️</span>
            <label className="switch" title="Toggle Dark Mode"><input type="checkbox" checked={darkMode} onChange={e => setDarkMode(e.target.checked)} /><span className="slider round"></span></label>
            <span style={{fontSize:'1rem'}}>🌙</span>
            <span className="theme-label">Dark Mode</span>
          </div>
          <button className="btn-logout" title="Logout" onClick={handleLogout}><span>🚪</span><span className="logout-label">Logout</span></button>
          <div className="copyright-footer">© 2026 Raza Online Services<br/>Powered by Saddam Shaikh</div>
        </div>
      </aside>

      <main className="main-content">
        <div className="top-action-bar">
          <div className="top-left">
            <button className="toggle-btn" title="Toggle Sidebar" onClick={() => setSidebarCollapsed(!sidebarCollapsed)}>☰</button>
            <span className="welcome-text">👋 Welcome, {currentUser.username}{currentUser.role === 'admin' ? ' (Admin)' : ''}</span>
          </div>
          <div className="top-right">
            <span className="top-date" style={{fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: 'var(--primary)'}}>
              {now.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })} | {now.toLocaleTimeString('en-IN')}
            </span>
          </div>
        </div>

        {/* Dashboard */}
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
                <div className="card-header"><span className="card-title">Recent Customers</span><a href="#" className="btn btn-ghost btn-sm" onClick={(e) => { e.preventDefault(); navigate('customers'); }}>View All →</a></div>
                <div className="card-body" style={{paddingTop:'0.5rem'}}>
                  <ul className="activity-list">
                    {appData.customers.length === 0 ? <li className="empty-state"><span className="empty-state-icon">👥</span><p>No customers yet</p></li> :
                     appData.customers.slice().reverse().slice(0,5).map(c => {
                      let bal = 0; (c.services || []).forEach(s => { bal += (Number(s.fee)||0) - (Number(s.paid)||0); });
                      const srvCount = (c.services||[]).length;
                      return (
                        <li key={c.id} className="activity-item">
                          <span className="activity-dot" style={{background: bal > 0 ? 'var(--warning)' : 'var(--success)'}}></span>
                          <div className="activity-info">
                            <div className="activity-name">{c.name}</div>
                            <div className="activity-meta">
                              {srvCount} service{srvCount !== 1 ? 's' : ''} · {formatDate(c.date)} 
                              {bal > 0 ? <> · <span className="text-warning">₹{bal} due</span></> : <> · <span className="text-success">Paid</span></>}
                            </div>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              </div>
              <div className="card">
                <div className="card-header"><span className="card-title">Recent Payments</span><a href="#" className="btn btn-ghost btn-sm" onClick={(e) => { e.preventDefault(); navigate('payments'); }}>View All →</a></div>
                <div className="card-body" style={{paddingTop:'0.5rem'}}>
                  <ul className="activity-list">
                    {appData.payments.length === 0 ? <li className="empty-state"><span className="empty-state-icon">💳</span><p>No payments yet</p></li> :
                     appData.payments.slice().sort((a,b)=>b.id-a.id).slice(0,5).map(p => (
                      <li key={p.id} className="activity-item">
                        <span className="activity-dot" style={{background:'var(--success)'}}></span>
                        <div className="activity-info">
                          <div className="activity-name">C-{p.customerId} · <span className="text-success fw-600">₹{Number(p.amount).toLocaleString('en-IN')}</span></div>
                          <div className="activity-meta">{p.type || 'Payment'} · {formatDate(p.date)}</div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Customers */}
        {activeView === 'customers' && (
          <section className="view active">
            <div className="topbar">
              <div><h1>Customers</h1><div className="topbar-sub">Manage all service applications</div></div>
              <button className="btn btn-primary" onClick={openNewCustomer}>+ New Customer</button>
            </div>
            <div className="search-bar"><span className="search-icon">🔍</span><input type="text" value={searchCust} onChange={e=>setSearchCust(e.target.value)} placeholder="Search by name, mobile, or ID..." className="form-control" /></div>
            <div className="table-container">
              <table className="data-table">
                <thead><tr><th>Customer ID</th><th>Name</th><th>Mobile</th><th>Services / Balance</th><th>Registered</th><th>Actions</th></tr></thead>
                <tbody>
                  {filteredCust.length === 0 ? <tr className="empty-row"><td colSpan="6"><div className="empty-state"><span className="empty-state-icon">👥</span><p>{query ? 'No matching customers found.' : 'No customers yet. Click "+ New Customer" to add one.'}</p></div></td></tr> : 
                    filteredCust.map(c => {
                    let totFee = 0, totPaid = 0;
                    (c.services || []).forEach(s => { totFee += Number(s.fee)||0; totPaid += Number(s.paid)||0; });
                    const bal = totFee - totPaid;
                    const srvCount = (c.services || []).length;
                    return (
                      <tr key={c.id}>
                        <td><span className="badge badge-neutral">C-{c.id}</span></td>
                        <td>
                          <div className="customer-name-cell">
                            <span className="customer-avatar">{getInitials(c.name)}</span>
                            <div>
                              <div className="fw-bold">{c.name}</div>
                              {c.address && <div className="text-xs text-muted">{c.address}</div>}
                            </div>
                          </div>
                        </td>
                        <td>{c.mobile || '-'}</td>
                        <td>
                          <div className="text-sm fw-600">{srvCount} Service{srvCount !== 1 ? 's' : ''}</div>
                          <div className="text-xs text-muted">Adv: ₹{totPaid.toLocaleString('en-IN')} · Bal: <span className={bal > 0 ? 'text-danger fw-bold' : 'text-success'}>₹{(bal > 0 ? bal : 0).toLocaleString('en-IN')}</span></div>
                        </td>
                        <td className="text-sm text-muted">{formatDate(c.date)}</td>
                        <td>
                          <div className="action-group">
                            <button className="btn btn-secondary btn-sm" onClick={() => openEditCustomer(c)}>✏️ Edit</button>
                            <button className="btn btn-danger btn-sm" onClick={() => deleteCustomer(c.id, c.name)}>🗑️</button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Prices */}
        {activeView === 'prices' && (
          <section className="view active">
            <div className="topbar"><div><h1>Service Prices</h1><div className="topbar-sub">Configure service types and fees</div></div><button className="btn btn-primary" onClick={openNewService}>+ Add Service</button></div>
            <div className="table-container">
              <table className="data-table">
                <thead><tr><th>#</th><th>Service Name</th><th>Default Fee (₹)</th><th>Status</th><th>Actions</th></tr></thead>
                <tbody>
                  {appData.services.length === 0 ? <tr className="empty-row"><td colSpan="5"><div className="empty-state"><span className="empty-state-icon">⚙️</span><p>No services configured yet.</p></div></td></tr> : appData.services.map((s, idx) => (
                    <tr key={s.id}>
                      <td className="text-muted text-sm">{idx + 1}</td>
                      <td className="fw-600">{s.name}</td>
                      <td className="fw-bold text-primary">₹{Number(s.fee).toLocaleString('en-IN')}</td>
                      <td>{s.active ? <span className="badge badge-success">Active</span> : <span className="badge badge-danger">Disabled</span>}</td>
                      <td><button className="btn btn-secondary btn-sm" onClick={() => openEditService(s)}>✏️ Edit</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Payments */}
        {activeView === 'payments' && (
          <section className="view active">
            <div className="topbar"><div><h1>Payment History</h1><div className="topbar-sub">Last 50 payment transactions</div></div></div>
            <div className="table-container">
              <table className="data-table">
                <thead><tr><th>Receipt #</th><th>Date</th><th>Customer</th><th>Type</th><th>Amount (₹)</th></tr></thead>
                <tbody>
                  {appData.payments.length === 0 ? <tr className="empty-row"><td colSpan="5"><div className="empty-state"><span className="empty-state-icon">💳</span><p>No payment records yet.</p></div></td></tr> :
                   appData.payments.slice().sort((a,b)=>b.id-a.id).slice(0,50).map(p => (
                    <tr key={p.id}>
                      <td className="text-muted text-sm">#{Math.floor(p.id)}</td>
                      <td className="text-sm">{formatDate(p.date)}</td>
                      <td><span className="badge badge-neutral">C-{p.customerId}</span></td>
                      <td><span className="badge badge-info">{p.type || 'Payment'}</span></td>
                      <td className="fw-bold text-success">₹{Number(p.amount).toLocaleString('en-IN')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Backup */}
        {activeView === 'backup' && (
          <section className="view active">
            <div className="topbar"><div><h1>Excel Backup</h1><div className="topbar-sub">Export and restore your data</div></div></div>
            <div className="backup-cards">
              <div className="card">
                <div className="backup-card-inner">
                  <span className="backup-icon">📤</span><h3>Export Data</h3>
                  <p>Export all customers, services, and payments to an Excel spreadsheet for offline storage.</p>
                  <button className="btn btn-success" onClick={exportExcel}>Export to Excel</button>
                </div>
              </div>
              <div className="card">
                <div className="backup-card-inner">
                  <span className="backup-icon">📥</span><h3>Import / Restore</h3>
                  <p>Restore your system from an existing Excel backup file. Admin access required.</p>
                  <button className="btn btn-warning" onClick={triggerImport}>Import from Excel</button>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Users */}
        {activeView === 'users-mg' && (
          <section className="view active">
            <div className="topbar"><div><h1>System Users</h1><div className="topbar-sub">Manage admin and staff accounts</div></div><button className="btn btn-primary" onClick={openNewUser}>+ Create User</button></div>
            <div className="table-container">
              <table className="data-table">
                <thead><tr><th>Username</th><th>Role</th><th>Actions</th></tr></thead>
                <tbody>
                  {appData.users.length === 0 ? <tr className="empty-row"><td colSpan="3"><div className="empty-state"><span className="empty-state-icon">🔐</span><p>No users configured.</p></div></td></tr> : appData.users.map(u => (
                    <tr key={u.username}>
                      <td>
                        <div style={{display:'flex',alignItems:'center',gap:'0.625rem'}}>
                          <span className="customer-avatar" style={{background: u.role === 'admin' ? 'linear-gradient(135deg,#6366f1,#8b5cf6)' : 'linear-gradient(135deg,#10b981,#06b6d4)'}}>
                            {u.username.slice(0,2).toUpperCase()}
                          </span>
                          <span className="fw-600">{u.username}</span>
                        </div>
                      </td>
                      <td><span className={`badge ${u.role==='admin'?'badge-primary':'badge-success'}`}>{u.role==='admin'?'🔑 Admin':'👤 Staff'}</span></td>
                      <td>
                        <div className="action-group">
                          <button className="btn btn-secondary btn-sm" onClick={() => openEditUser(u)}>✏️ Edit</button>
                          {u.username !== 'wasimadmin' ? <button className="btn btn-danger btn-sm" onClick={() => deleteUser(u.username)}>🗑️</button> : <span className="text-xs text-muted">Protected</span>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

      </main>

      {/* MODALS */}
      {customerModal.open && (
        <div className="modal show" onClick={(e) => { if (e.target.classList.contains('modal')) setCustomerModal({open: false}) }}>
          <div className="modal-content large-modal" style={{padding:0, display:'flex', flexDirection:'column', overflow:'hidden'}}>
            <div className="modal-header" style={{padding:'1.5rem 2rem', borderBottom:'1px solid var(--border)', margin:0, flexShrink:0}}>
              <h2 className="modal-title" style={{margin:0}}>{customerModal.data.id ? 'Edit Customer' : 'Add New Customer'}</h2>
              <button className="close-modal" type="button" onClick={() => setCustomerModal({open: false})}>✕</button>
            </div>
            <form onSubmit={saveCustomer} style={{display:'flex', flexDirection:'column', minHeight:0, margin:0, flex:1}}>
              <div style={{padding:'1.5rem 2rem', overflowY:'auto', flex:1}}>
                <div className="form-grid">
                  <div className="form-group">
                    <label>Full Name *</label>
                    <input type="text" className="form-control" placeholder="e.g. Mohammed Ali" required value={customerModal.data.name} onChange={e=>setCustomerModal({open:true, data:{...customerModal.data, name: e.target.value}})} />
                  </div>
                  <div className="form-group">
                    <label>Mobile Number *</label>
                    <input type="text" className="form-control" placeholder="e.g. 9876543210" required value={customerModal.data.mobile} onChange={e=>setCustomerModal({open:true, data:{...customerModal.data, mobile: e.target.value}})} />
                  </div>
                  <div className="form-group" style={{gridColumn:'span 2'}}>
                    <label>Address</label>
                    <input type="text" className="form-control" placeholder="Village / Town / City" value={customerModal.data.address} onChange={e=>setCustomerModal({open:true, data:{...customerModal.data, address: e.target.value}})} />
                  </div>
                </div>
                
                <div className="section-divider"></div>
                <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'1rem'}}>
                  <h3 style={{fontWeight:700,color:'var(--text-heading)',fontSize:'1rem'}}>Services</h3>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setCustomerModal({open: true, data: {...customerModal.data, services: [...customerModal.data.services, {id: Date.now(), serviceId: '', fee: '', paid: 0, status: 'Pending'}]}})}>+ Add Service</button>
                </div>

                <div id="customer-services-list">
                  {customerModal.data.services.map((s, idx) => (
                    <div className="service-row" key={s.id}>
                      <button type="button" className="remove-service-btn" title="Remove" onClick={() => setCustomerModal({open: true, data: {...customerModal.data, services: customerModal.data.services.filter((_,i)=>i!==idx)}})}>✕</button>
                      <div className="form-grid" style={{marginTop:'0.25rem'}}>
                        <div className="form-group" style={{gridColumn:'span 2'}}>
                          <label>Service Type</label>
                          <select className="form-control srv-select" required value={s.serviceId} onChange={e=>handleCustServiceChange(idx, 'serviceId', e.target.value)}>
                            <option value="">— Select Service —</option>
                            {appData.services.filter(x=>x.active).map(x => <option key={x.id} value={x.id}>{x.name} — ₹{x.fee}</option>)}
                          </select>
                        </div>
                        <div className="form-group">
                          <label>Total Fee (₹)</label>
                          <input type="number" min="0" className="form-control srv-fee" required value={s.fee} onChange={e=>handleCustServiceChange(idx, 'fee', e.target.value)} />
                        </div>
                        <div className="form-group">
                          <label>Amount Paid (₹)</label>
                          <input type="number" min="0" className="form-control srv-paid" required value={s.paid} onChange={e=>handleCustServiceChange(idx, 'paid', e.target.value)} />
                        </div>
                        <div className="form-group" style={{gridColumn:'span 2'}}>
                          <label>Status</label>
                          <select className="form-control" value={s.status} onChange={e=>handleCustServiceChange(idx, 'status', e.target.value)}>
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
              </div>
              <div className="modal-footer" style={{padding:'1rem 2rem', borderTop:'1px solid var(--border)', margin:0, background:'var(--surface)'}}>
                <button type="button" className="btn btn-ghost close-modal-btn" onClick={() => setCustomerModal({open: false})}>Cancel</button>
                <button type="submit" className="btn btn-primary">💾 Save Customer</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {serviceModal.open && (
        <div className="modal show" onClick={(e) => { if (e.target.classList.contains('modal')) setServiceModal({open: false}) }}>
          <div className="modal-content">
            <div className="modal-header">
              <h2 className="modal-title">{serviceModal.data.id ? 'Edit Service' : 'Add Service'}</h2>
              <button className="close-modal" type="button" onClick={() => setServiceModal({open: false})}>✕</button>
            </div>
            <form onSubmit={saveService}>
              <div className="form-group"><label>Service Name</label><input type="text" className="form-control" placeholder="e.g. Birth Certificate" required value={serviceModal.data.name} onChange={e=>setServiceModal({open:true, data:{...serviceModal.data, name: e.target.value}})} /></div>
              <div className="form-group"><label>Default Fee (₹)</label><input type="number" min="0" placeholder="e.g. 300" className="form-control" required value={serviceModal.data.fee} onChange={e=>setServiceModal({open:true, data:{...serviceModal.data, fee: e.target.value}})} /></div>
              <div className="form-group" style={{display:'flex', alignItems:'center', gap:'0.625rem'}}>
                <input type="checkbox" id="srv-active" style={{width:'18px',height:'18px',accentColor:'var(--primary)',cursor:'pointer'}} checked={serviceModal.data.active} onChange={e=>setServiceModal({open:true, data:{...serviceModal.data, active: e.target.checked}})} />
                <label htmlFor="srv-active" style={{margin:0,cursor:'pointer',fontSize:'0.9rem',color:'var(--text-main)'}}>Active Service</label>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost close-modal-btn" onClick={() => setServiceModal({open: false})}>Cancel</button>
                <button type="submit" className="btn btn-primary">💾 Save Service</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {userModal.open && (
        <div className="modal show" onClick={(e) => { if (e.target.classList.contains('modal')) setUserModal({open: false}) }}>
          <div className="modal-content">
            <div className="modal-header">
              <h2 className="modal-title">{userModal.data.oldName ? 'Edit User' : 'Create User'}</h2>
              <button className="close-modal" type="button" onClick={() => setUserModal({open: false})}>✕</button>
            </div>
            <form onSubmit={saveUser}>
              <div className="form-group"><label>Username</label><input type="text" className="form-control" placeholder="e.g. staff01" required value={userModal.data.username} onChange={e=>setUserModal({open:true, data:{...userModal.data, username: e.target.value}})} /></div>
              <div className="form-group">
                <label>Password</label>
                <div className="password-wrapper">
                  <input type={showPassword ? 'text' : 'password'} className="form-control" value={userModal.data.pass} onChange={e=>setUserModal({open:true, data:{...userModal.data, pass: e.target.value}})} placeholder={userModal.data.oldName ? "Leave blank to keep existing" : ""} style={{paddingRight:'2.5rem'}} />
                  <button type="button" className="eye-btn" title="Show/Hide" onClick={() => setShowPassword(!showPassword)}>{showPassword ? '🙈' : '👁️'}</button>
                </div>
              </div>
              <div className="form-group">
                <label>Role</label>
                <select className="form-control" value={userModal.data.role} onChange={e=>setUserModal({open:true, data:{...userModal.data, role: e.target.value}})}>
                  <option value="user">Staff User</option>
                  <option value="admin">Administrator</option>
                </select>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost close-modal-btn" onClick={() => setUserModal({open: false})}>Cancel</button>
                <button type="submit" className="btn btn-primary">💾 Save User</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {confirmModal.open && (
        <div className="modal show">
          <div className="modal-content confirm-dialog">
            <span className="confirm-icon">{confirmModal.icon}</span>
            <h3 className="modal-title" style={{marginBottom:'0.5rem'}}>{confirmModal.title}</h3>
            <p>{confirmModal.message}</p>
            <div style={{display:'flex', gap:'0.75rem', justifyContent:'center'}}>
              <button className="btn btn-ghost" onClick={() => setConfirmModal({...confirmModal, open: false})}>Cancel</button>
              <button className={`btn ${confirmModal.okClass}`} onClick={() => { confirmModal.onConfirm(); setConfirmModal({...confirmModal, open: false}); }}>{confirmModal.okText}</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
