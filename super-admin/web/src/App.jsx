import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, 
  Building, 
  Users, 
  FileQuestion, 
  CreditCard, 
  CalendarClock, 
  ShieldAlert, 
  LogOut, 
  RefreshCw, 
  Search, 
  Trash2, 
  Check, 
  X,
  ExternalLink,
  ShieldCheck,
  UserCheck,
  Zap,
  Sun,
  Moon,
  ShoppingCart,
  Bell,
  Mail,
  ChevronDown,
  ChevronRight,
  TrendingUp,
  MoreVertical,
  Globe,
  Calendar,
  Sparkles,
  Lock,
  ArrowRight
} from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8001';

export default function App() {
  const [token, setToken] = useState(localStorage.getItem('admin_token') || '');
  const [theme, setTheme] = useState(localStorage.getItem('admin_theme') || 'light');
  const [currentSection, setCurrentSection] = useState('dashboard');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  // App data states
  const [analytics, setAnalytics] = useState(null);
  const [tenants, setTenants] = useState([]);
  const [users, setUsers] = useState([]);
  const [surveys, setSurveys] = useState([]);
  const [subscriptions, setSubscriptions] = useState([]);
  const [payments, setPayments] = useState([]);
  const [demos, setDemos] = useState([]);
  const [waitlist, setWaitlist] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);

  // Search filter states
  const [searchTerm, setSearchTerm] = useState('');

  // Authentication states
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [nameInput, setNameInput] = useState(''); // Used as display name fallback in mock mode
  const [adminProfile, setAdminProfile] = useState(null);

  // Dynamic Auth configuration fetched from backend
  const [authConfig, setAuthConfig] = useState({
    cognito_client_id: '',
    cognito_region: 'ap-south-1',
    mock_cognito: false
  });

  // Modal control states
  const [editingTenant, setEditingTenant] = useState(null);
  const [newPlan, setNewPlan] = useState('');
  const [viewingLogDetail, setViewingLogDetail] = useState(null);
  const [expandedTenants, setExpandedTenants] = useState({});

  const toggleTenantExpanded = (tenantId) => {
    setExpandedTenants(prev => ({
      ...prev,
      [tenantId]: !prev[tenantId]
    }));
  };

  // Fetch Cognito auth config on mount
  useEffect(() => {
    fetch(`${API_BASE_URL}/admin/auth/config`)
      .then(res => {
        if (!res.ok) throw new Error('Failed to retrieve server auth config');
        return res.json();
      })
      .then(data => setAuthConfig(data))
      .catch(err => {
        console.error("Auth configuration fetch failed:", err);
        // Fallback defaults
        setAuthConfig({
          cognito_client_id: '',
          cognito_region: 'ap-south-1',
          mock_cognito: false
        });
      });
  }, []);

  useEffect(() => {
    if (theme === 'dark') {
      document.body.classList.add('dark-theme');
    } else {
      document.body.classList.remove('dark-theme');
    }
    localStorage.setItem('admin_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  useEffect(() => {
    if (token) {
      // Basic token decoding to get user metadata for display
      try {
        const payloadStr = token.split('.')[1];
        const payload = JSON.parse(atob(payloadStr));
        setAdminProfile({
          email: payload.email,
          name: payload.name || payload.email.split('@')[0].toUpperCase(),
          role: 'Super Admin'
        });
        fetchSectionData(currentSection);
      } catch (e) {
        handleLogout();
      }
    }
  }, [token]);

  useEffect(() => {
    if (token) {
      fetchSectionData(currentSection);
      setSearchTerm('');
    }
  }, [currentSection]);

  const handleLogout = () => {
    localStorage.removeItem('admin_token');
    setToken('');
    setAdminProfile(null);
    setError('');
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    const emailClean = emailInput.trim().lower();
    if (!emailClean.endsWith('@axioraglobalsolutions.com')) {
      setError('Forbidden: Only @axioraglobalsolutions.com emails can access the Super Admin Console.');
      setLoading(false);
      return;
    }

    if (authConfig.mock_cognito) {
      // Mock Login Flow
      try {
        const res = await fetch(`${API_BASE_URL}/admin/auth/mock-login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: emailClean, name: nameInput })
        });

        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.detail || 'Login failed');
        }

        const data = await res.json();
        localStorage.setItem('admin_token', data.id_token);
        setToken(data.id_token);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    } else {
      // Real Cognito login via direct AWS Cognito API
      try {
        if (!passwordInput) {
          throw new Error('Password is required for Cognito authentication.');
        }

        const res = await fetch(`https://cognito-idp.${authConfig.cognito_region}.amazonaws.com/`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-amz-json-1.1',
            'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth'
          },
          body: JSON.stringify({
            AuthFlow: 'USER_PASSWORD_AUTH',
            ClientId: authConfig.cognito_client_id,
            AuthParameters: {
              USERNAME: emailClean,
              PASSWORD: passwordInput
            }
          })
        });

        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.message || errData.__type || 'Authentication failed');
        }

        const data = await res.json();
        const idToken = data.AuthenticationResult.IdToken;
        localStorage.setItem('admin_token', idToken);
        setToken(idToken);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
  };

  const fetchSectionData = async (section) => {
    if (!token) return;
    setLoading(true);
    setError('');
    
    const headers = { 'Authorization': `Bearer ${token}` };
    
    try {
      if (section === 'dashboard') {
        const res = await fetch(`${API_BASE_URL}/admin/analytics`, { headers });
        if (!res.ok) throw new Error('Failed to load dashboard data');
        const data = await res.json();
        setAnalytics(data);
      } 
      else if (section === 'organizations' || section === 'personal-accounts') {
        const tenantsRes = await fetch(`${API_BASE_URL}/admin/tenants`, { headers });
        const usersRes = await fetch(`${API_BASE_URL}/admin/users`, { headers });
        if (!tenantsRes.ok || !usersRes.ok) throw new Error('Failed to load workspaces and profiles');
        const tenantsData = await tenantsRes.json();
        const usersData = await usersRes.json();
        setTenants(tenantsData);
        setUsers(usersData);
      } 
      else if (section === 'surveys') {
        const res = await fetch(`${API_BASE_URL}/admin/surveys`, { headers });
        if (!res.ok) throw new Error('Failed to load surveys');
        const data = await res.json();
        setSurveys(data);
      } 
      else if (section === 'subscriptions') {
        const resSub = await fetch(`${API_BASE_URL}/admin/subscriptions`, { headers });
        const resPay = await fetch(`${API_BASE_URL}/admin/payments`, { headers });
        if (!resSub.ok || !resPay.ok) throw new Error('Failed to load billing records');
        const dataSub = await resSub.json();
        const dataPay = await resPay.json();
        setSubscriptions(dataSub);
        setPayments(dataPay);
      } 
      else if (section === 'demos') {
        const resDemo = await fetch(`${API_BASE_URL}/admin/demos`, { headers });
        const resWait = await fetch(`${API_BASE_URL}/admin/waitlist`, { headers });
        if (!resDemo.ok || !resWait.ok) throw new Error('Failed to load leads data');
        const dataDemo = await resDemo.json();
        const dataWait = await resWait.json();
        setDemos(dataDemo);
        setWaitlist(dataWait);
      } 
      else if (section === 'audit-logs') {
        const res = await fetch(`${API_BASE_URL}/admin/audit-logs`, { headers });
        if (!res.ok) throw new Error('Failed to load audit logs');
        const data = await res.json();
        setAuditLogs(data);
      }
    } catch (err) {
      setError(err.message);
      if (err.message.includes('validate credentials') || err.message.includes('401')) {
        handleLogout();
      }
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateUser = async (userId, updates) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/users/${userId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(updates)
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || 'Failed to update user');
      }
      setSuccess('User updated successfully');
      setTimeout(() => setSuccess(''), 3000);
      fetchSectionData(currentSection);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = async (userId) => {
    if (!confirm('Are you sure you want to permanently delete this user?')) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/users/${userId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to delete user');
      setSuccess('User deleted successfully');
      setTimeout(() => setSuccess(''), 3000);
      fetchSectionData(currentSection);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateTenant = async (tenantId, updates) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/tenants/${tenantId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(updates)
      });
      if (!res.ok) throw new Error('Failed to update tenant');
      setSuccess('Tenant updated successfully');
      setEditingTenant(null);
      setTimeout(() => setSuccess(''), 3000);
      fetchSectionData(currentSection);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTenant = async (tenantId) => {
    if (!confirm('Warning: Deleting this tenant will cascade delete all its surveys, responses, and members. Are you sure you want to proceed?')) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/tenants/${tenantId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to delete tenant');
      setSuccess('Tenant organization deleted successfully');
      setTimeout(() => setSuccess(''), 3000);
      fetchSectionData(currentSection);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteSurvey = async (surveyId) => {
    if (!confirm('Are you sure you want to delete this survey and all of its feedback/responses?')) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/surveys/${surveyId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to delete survey');
      setSuccess('Survey deleted successfully');
      setTimeout(() => setSuccess(''), 3000);
      fetchSectionData('surveys');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteDemo = async (demoId) => {
    if (!confirm('Are you sure you want to cancel this demo schedule?')) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/demos/${demoId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to delete demo');
      setSuccess('Demo booking cancelled');
      setTimeout(() => setSuccess(''), 3000);
      fetchSectionData('demos');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteWaitlist = async (entryId) => {
    if (!confirm('Are you sure you want to remove this email from the waitlist?')) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/waitlist/${entryId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to remove waitlist entry');
      setSuccess('Waitlist entry deleted');
      setTimeout(() => setSuccess(''), 3000);
      fetchSectionData('demos');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="login-container">
        <div className="login-card">
          <div className="login-logo">
            <div className="login-logo-symbol">
              <ShieldCheck size={20} />
            </div>
            <span className="logo-text">AxioraPulse<span className="logo-dot">.</span></span>
          </div>
          <h2 className="login-title">Super Admin Login</h2>
          <p className="login-subtitle">
            {authConfig.mock_cognito 
              ? 'Local Sandbox Environment (Bypass password)' 
              : 'Real QA Environment (AWS Cognito Authentication)'}
          </p>

          {error && <div className="login-error">{error}</div>}

          <form className="login-form" onSubmit={handleLogin}>
            <div className="form-group">
              <label className="form-label">Admin Email</label>
              <input 
                type="email" 
                required 
                className="form-input" 
                placeholder="name@axioraglobalsolutions.com"
                value={emailInput}
                onChange={e => setEmailInput(e.target.value)}
              />
            </div>
            
            {authConfig.mock_cognito ? (
              <div className="form-group">
                <label className="form-label">Display Name (Optional)</label>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="Admin User"
                  value={nameInput}
                  onChange={e => setNameInput(e.target.value)}
                />
              </div>
            ) : (
              <div className="form-group">
                <label className="form-label">Password</label>
                <input 
                  type="password" 
                  required 
                  className="form-input" 
                  placeholder="••••••••"
                  value={passwordInput}
                  onChange={e => setPasswordInput(e.target.value)}
                />
              </div>
            )}

            <button type="submit" className="login-btn" disabled={loading}>
              {loading ? 'Authenticating...' : 'Sign in as Administrator'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Sidebar sections matching screenshot layout
  const dashboardItems = [
    { id: 'dashboard', label: 'Analytics', icon: <LayoutDashboard size={16} /> }
  ];

  const appItems = [
    { id: 'organizations', label: 'Organizations & Teams', icon: <Building size={16} /> },
    { id: 'personal-accounts', label: 'Personal Users', icon: <Users size={16} /> },
    { id: 'subscriptions', label: 'Billing & Transactions', icon: <CreditCard size={16} /> },
    { id: 'demos', label: 'Demos & Waitlist', icon: <CalendarClock size={16} /> },
    { id: 'audit-logs', label: 'Audit Trail Logs', icon: <ShieldAlert size={16} /> },
  ];

  // Max value calculators for drawing charts
  const maxRevenueVal = analytics?.daily_revenue?.length
    ? Math.max(...analytics.daily_revenue.map(d => Math.max(d.earnings, d.expense)), 100)
    : 100;

  const maxMonthlyVal = analytics?.monthly_earnings?.length
    ? Math.max(...analytics.monthly_earnings.map(m => m.earnings), 1000)
    : 1000;

  let currentMonthEarnings = 6820;
  let monthlyChangeText = "-9% than last month";
  let changeColor = "var(--accent-rose)";
  let monthlyPath = "M 0 60 Q 30 40, 60 50 T 120 30 T 180 40 T 200 35";
  let monthlyAreaPath = "M 0 60 Q 30 40, 60 50 T 120 30 T 180 40 T 200 35 L 200 80 L 0 80 Z";

  if (analytics?.monthly_earnings?.length > 0) {
    const current = analytics.monthly_earnings[analytics.monthly_earnings.length - 1].earnings;
    currentMonthEarnings = current;
    
    if (analytics.monthly_earnings.length >= 2) {
      const prev = analytics.monthly_earnings[analytics.monthly_earnings.length - 2].earnings;
      if (prev > 0) {
        const change = ((current - prev) / prev) * 100;
        const sign = change >= 0 ? '+' : '';
        monthlyChangeText = `${sign}${change.toFixed(0)}% than last month`;
        changeColor = change >= 0 ? "var(--accent-emerald)" : "var(--accent-rose)";
      } else {
        monthlyChangeText = "+100% than last month";
        changeColor = "var(--accent-emerald)";
      }
    } else {
      monthlyChangeText = "+100% than last month";
      changeColor = "var(--accent-emerald)";
    }

    const points = analytics.monthly_earnings.map((m, idx) => {
      const x = (idx / (analytics.monthly_earnings.length - 1)) * 200;
      const y = 75 - (m.earnings / maxMonthlyVal) * 55;
      return { x, y };
    });
    
    let pathD = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
    for (let i = 1; i < points.length; i++) {
      pathD += ` L ${points[i].x.toFixed(1)} ${points[i].y.toFixed(1)}`;
    }
    monthlyPath = pathD;
    monthlyAreaPath = `${pathD} L 200 80 L 0 80 Z`;
  }

  return (
    <div className="app-container">
      {/* ── Left Navigation Sidebar ── */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="login-logo-symbol" style={{width: 24, height: 24, borderRadius: 5}}>
            <ShieldCheck size={14} />
          </div>
          <span className="logo-text" style={{fontSize: 16}}>AxioraPulse<span className="logo-dot">.</span></span>
        </div>

        <div className="sidebar-section-title">Dashboard</div>
        <nav className="sidebar-nav">
          {dashboardItems.map(item => (
            <div 
              key={item.id} 
              className={`nav-item ${currentSection === item.id ? 'active' : ''} ${item.disabled ? 'disabled-nav' : ''}`}
              onClick={() => !item.disabled && setCurrentSection(item.id)}
              style={item.disabled ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
            >
              <div className="nav-item-left">
                {item.icon}
                <span>{item.label}</span>
              </div>
            </div>
          ))}
        </nav>

        <div className="sidebar-section-title">Apps</div>
        <nav className="sidebar-nav">
          {appItems.map(item => (
            <div 
              key={item.id} 
              className={`nav-item ${currentSection === item.id ? 'active' : ''}`}
              onClick={() => setCurrentSection(item.id)}
            >
              <div className="nav-item-left">
                {item.icon}
                <span>{item.label}</span>
              </div>
            </div>
          ))}
        </nav>


        <div className="sidebar-footer">
          {adminProfile && (
            <div className="user-info">
              <div className="user-avatar">
                {adminProfile.name.charAt(0).toUpperCase()}
              </div>
              <div className="user-details">
                <span className="user-name">{adminProfile.name}</span>
                <span className="user-role">{adminProfile.email}</span>
              </div>
            </div>
          )}
          <button className="btn-logout" onClick={handleLogout}>
            <LogOut size={12} />
            <span>Sign out</span>
          </button>
        </div>
      </aside>

      {/* ── Main Content Area ── */}
      <main className="main-content">
        <header className="header">
          <div className="header-search-container">
            <Search size={14} color="var(--text-muted)" />
            <input 
              type="text" 
              className="header-search-input" 
              placeholder="Search components or actions..." 
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
          
          <div className="header-actions">
            {success && <span style={{color: 'var(--accent-emerald)', fontSize: 12, fontWeight: 600}}>{success}</span>}
            
            <button className="header-icon-btn" onClick={toggleTheme} title={theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}>
              {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
            </button>
            
            <button className="header-icon-btn" onClick={() => fetchSectionData(currentSection)} disabled={loading}>
              <RefreshCw size={14} className={loading ? 'spin' : ''} />
            </button>

            <div style={{width: 1, height: 20, backgroundColor: 'var(--border-color)'}} />
            
            <div className="header-avatar">
              <div style={{width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: 10, backgroundColor: '#f1f5f9'}}>SA</div>
            </div>
          </div>
        </header>

        <div className="workspace-area">
          {error && <div className="login-error" style={{marginBottom: 20}}>{error}</div>}

          {/* ── 1. DASHBOARD OVERVIEW ── */}
          {currentSection === 'dashboard' && analytics && (
            <div>
              {/* Top Row: Banner and Small KPI Cards */}
              <div className="kpi-grid">
                {/* 1a. Banner Card (Analytics Dashboard) */}
                <div className="banner-card">
                  <div className="banner-left">
                    <span className="banner-title">Analytics Dashboard</span>
                    <span className="banner-subtitle">Check all system-wide telemetry</span>
                    <div className="banner-stats">
                      <div className="banner-stat-item">
                        <span className="banner-stat-label">Total Revenue</span>
                        <span className="banner-stat-value">₹{analytics.kpis.total_revenue.toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                      </div>
                      <div className="banner-stat-item">
                        <span className="banner-stat-label">Total Tenants</span>
                        <span className="banner-stat-value">{analytics.kpis.total_tenants}</span>
                      </div>
                    </div>
                  </div>
                  {/* Decorative modern vector art matching screenshot style */}
                  <div className="banner-illustration-container">
                    <svg viewBox="0 0 100 80" width="120" height="100">
                      <rect x="15" y="45" width="70" height="35" rx="4" fill="#f1f5f9" stroke="#e2e8f0" strokeWidth="1" />
                      <circle cx="50" cy="28" r="14" fill="#e2e8f0" />
                      <path d="M 38 42 L 62 42 L 56 22 L 44 22 Z" fill="#475569" />
                      <rect x="35" y="48" width="30" height="4" rx="1" fill="#0f172a" />
                      <circle cx="42" cy="26" r="2" fill="#fff" />
                      <circle cx="58" cy="26" r="2" fill="#fff" />
                      <path d="M 46 34 Q 50 36 54 34" stroke="#fff" strokeWidth="1" fill="none" />
                      <rect x="25" y="58" width="50" height="2" fill="#cbd5e1" />
                    </svg>
                  </div>
                </div>

                {/* 1b. Weekly Sales Card */}
                <div className="stat-card">
                  <div className="stat-card-header">
                    <span className="stat-card-title">Weekly Sales</span>
                    <div className="stat-card-icon">
                      <Calendar size={14} />
                    </div>
                  </div>
                  <div className="stat-card-body">
                    <div className="stat-card-value-container">
                      <span className="stat-card-value">₹{analytics.kpis.weekly_sales.toLocaleString('en-IN', {maximumFractionDigits: 0})}</span>
                      <span className={analytics.kpis.weekly_sales_change >= 0 ? "pill-growth" : "pill-negative"}>
                        {analytics.kpis.weekly_sales_change >= 0 ? '+' : ''}{analytics.kpis.weekly_sales_change}%
                      </span>
                    </div>
                    <span className="stat-card-link">See Report <ArrowRight size={10} /></span>
                  </div>
                </div>

                {/* 1c. Purchase Orders Card */}
                <div className="stat-card">
                  <div className="stat-card-header">
                    <span className="stat-card-title">Purchase Orders</span>
                    <div className="stat-card-icon">
                      <CreditCard size={14} />
                    </div>
                  </div>
                  <div className="stat-card-body">
                    <div className="stat-card-value-container">
                      <span className="stat-card-value">{analytics.kpis.weekly_orders}</span>
                      <span className={analytics.kpis.weekly_orders_change >= 0 ? "pill-growth" : "pill-negative"}>
                        {analytics.kpis.weekly_orders_change >= 0 ? '+' : ''}{analytics.kpis.weekly_orders_change}%
                      </span>
                    </div>
                    <span className="stat-card-link">See Report <ArrowRight size={10} /></span>
                  </div>
                </div>
              </div>

              {/* Middle Row: Revenue Updates (Bar Chart) & Monthly Earnings (Area Line) */}
              <div className="panel-grid">
                {/* 2a. Revenue Updates Double Bar Chart */}
                <div className="panel-card">
                  <div className="panel-card-header">
                    <span className="panel-title">Revenue Updates</span>
                    <select className="select-styled">
                      <option>Year 2026</option>
                    </select>
                  </div>
                  
                  {/* CSS/SVG Bar Chart */}
                  <div className="chart-container-revenue">
                    {analytics.daily_revenue.map((d, index) => {
                      const hEarnings = (d.earnings / maxRevenueVal) * 140;
                      const hExpense = (d.expense / maxRevenueVal) * 140;
                      return (
                        <div className="chart-bar-group" key={index}>
                          <div className="chart-bars">
                            <div 
                              className="chart-bar-earnings" 
                              style={{ height: `${Math.max(hEarnings, 10)}px` }} 
                              title={`Earnings: ₹${d.earnings}`}
                            />
                            <div 
                              className="chart-bar-expense" 
                              style={{ height: `${Math.max(hExpense, 5)}px` }} 
                              title={`Expense: ₹${d.expense}`}
                            />
                          </div>
                          <span className="chart-label">{d.label}</span>
                        </div>
                      );
                    })}
                  </div>

                  <div className="chart-legend">
                    <div className="legend-item">
                      <span className="legend-color-black" />
                      <span>Earnings this month</span>
                    </div>
                    <div className="legend-item">
                      <span className="legend-color-gray" />
                      <span>Expense this month</span>
                    </div>
                  </div>
                </div>

                {/* 2b. Monthly Earnings Card */}
                <div className="panel-card">
                  <div className="panel-card-header">
                    <span className="panel-title">Monthly earnings</span>
                    <div className="stat-card-icon" style={{width: 24, height: 24}}>
                      <TrendingUp size={12} />
                    </div>
                  </div>
                  <div style={{display: 'flex', flexDirection: 'column', gap: 4}}>
                    <span style={{fontSize: 22, fontWeight: 800}}>₹{currentMonthEarnings.toLocaleString('en-IN')}</span>
                    <span style={{fontSize: 10, color: changeColor, fontWeight: 700}}>{monthlyChangeText}</span>
                  </div>
                  
                  {/* Monthly line area chart inline SVG */}
                  <div className="line-chart-visual">
                    <svg width="100%" height="80" viewBox="0 0 200 80" preserveAspectRatio="none">
                      <defs>
                        <linearGradient id="gradient-line" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#0f172a" stopOpacity="0.15" />
                          <stop offset="100%" stopColor="#0f172a" stopOpacity="0.0" />
                        </linearGradient>
                      </defs>
                      {/* Gradient Fill */}
                      <path 
                        d={monthlyAreaPath} 
                        fill="url(#gradient-line)" 
                      />
                      {/* Smooth Curve */}
                      <path 
                        d={monthlyPath} 
                        fill="none" 
                        stroke="#0f172a" 
                        strokeWidth="2" 
                      />
                    </svg>
                  </div>
                </div>
              </div>


            </div>
          )}

          {/* ── 2. ORGANIZATIONS & TEAMS TABLE ── */}
          {currentSection === 'organizations' && (
            <div className="table-container">
              <div className="table-header">
                <h3 className="table-title">Registered Organizations & Teams</h3>
                <input 
                  type="text" 
                  className="table-search" 
                  placeholder="Search organizations..." 
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
              </div>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th style={{ width: '40px' }}></th>
                    <th>Organization Info</th>
                    <th>Slug</th>
                    <th>Plan Level</th>
                    <th>Team Members</th>
                    <th>Surveys</th>
                    <th>Status</th>
                    <th>Registered At</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {tenants
                    .filter(t => (!t.account_type || t.account_type === 'organization') && (t.name.toLowerCase().includes(searchTerm.toLowerCase()) || t.slug.toLowerCase().includes(searchTerm.toLowerCase())))
                    .map(t => {
                      const isExpanded = !!expandedTenants[t.id];
                      const orgUsers = users.filter(u => u.tenant_id === t.id);
                      return (
                        <React.Fragment key={t.id}>
                          <tr style={{ cursor: 'pointer' }} onClick={() => toggleTenantExpanded(t.id)}>
                            <td style={{ textAlign: 'center' }}>
                              {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                            </td>
                            <td>
                              <div style={{fontWeight: 600, color: 'var(--text-primary)'}}>{t.name}</div>
                            </td>
                            <td><code>{t.slug}</code></td>
                            <td>
                              <span className={`badge ${t.plan === 'free' ? 'badge-gray' : t.plan === 'pro' ? 'badge-blue' : 'badge-indigo'}`}>
                                {t.plan}
                              </span>
                            </td>
                            <td>
                              <span style={{ fontWeight: 600 }}>{orgUsers.length}</span> members
                            </td>
                            <td>{t.survey_count}</td>
                            <td>
                              <button 
                                className={`badge ${t.is_active ? 'badge-emerald' : 'badge-rose'}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleUpdateTenant(t.id, { is_active: !t.is_active });
                                }}
                                style={{cursor: 'pointer', border: 'none', outline: 'none'}}
                              >
                                {t.is_active ? 'Active' : 'Suspended'}
                              </button>
                            </td>
                            <td>{new Date(t.created_at).toLocaleDateString()}</td>
                            <td>
                              <button 
                                className="btn-primary" 
                                style={{padding: '4px 8px', fontSize: 11, marginRight: 8}}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingTenant(t);
                                  setNewPlan(t.plan);
                                }}
                              >
                                Edit Plan
                              </button>
                              <button 
                                className="btn-action btn-action-delete"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteTenant(t.id);
                                }}
                              >
                                <Trash2 size={13} />
                              </button>
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr className="nested-row">
                              <td colSpan="9" style={{ padding: '16px 24px' }}>
                                <div style={{ fontWeight: 700, marginBottom: 12, color: 'var(--text-primary)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <Users size={14} color="var(--accent-indigo)" />
                                  <span>Team Members of {t.name} ({orgUsers.length})</span>
                                </div>
                                {orgUsers.length === 0 ? (
                                  <p style={{ color: 'var(--text-muted)', fontSize: 12, margin: '8px 0' }}>No registered team members in this organization.</p>
                                ) : (
                                  <table className="admin-table nested-table">
                                    <thead>
                                      <tr>
                                        <th>Name & Email</th>
                                        <th>Role Designation</th>
                                        <th>Account Type</th>
                                        <th>Active</th>
                                        <th>Registered At</th>
                                        <th>Remove</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {orgUsers.map(u => (
                                        <tr key={u.id}>
                                          <td>
                                            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{u.full_name || 'No Name'}</div>
                                            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{u.email}</div>
                                          </td>
                                          <td>
                                            <select 
                                              value={u.role} 
                                              onChange={e => handleUpdateUser(u.id, { role: e.target.value })}
                                              className="form-input"
                                              style={{padding: '4px 8px', fontSize: 12, backgroundColor: 'var(--bg-primary)'}}
                                            >
                                              <option value="super_admin">Super Admin</option>
                                              <option value="admin">Admin</option>
                                              <option value="manager">Manager</option>
                                              <option value="creator">Creator</option>
                                              <option value="viewer">Viewer</option>
                                            </select>
                                          </td>
                                          <td>
                                            <label style={{display: 'flex', alignItems: 'center', gap: 6, fontSize: 12}}>
                                              <input 
                                                type="checkbox" 
                                                checked={u.is_internal} 
                                                onChange={e => handleUpdateUser(u.id, { is_internal: e.target.checked })}
                                              />
                                              <span>Internal Staff</span>
                                            </label>
                                          </td>
                                          <td>
                                            <input 
                                              type="checkbox" 
                                              checked={u.is_active} 
                                              onChange={e => handleUpdateUser(u.id, { is_active: e.target.checked })}
                                            />
                                          </td>
                                          <td>{new Date(u.created_at).toLocaleDateString()}</td>
                                          <td>
                                            <button 
                                              className="btn-action btn-action-delete"
                                              onClick={() => handleDeleteUser(u.id)}
                                            >
                                              <Trash2 size={13} />
                                            </button>
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                )}
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                </tbody>
              </table>
            </div>
          )}

          {/* ── 3. PERSONAL ACCOUNTS TABLE ── */}
          {currentSection === 'personal-accounts' && (
            <div className="table-container">
              <div className="table-header">
                <h3 className="table-title">Registered Personal Accounts</h3>
                <input 
                  type="text" 
                  className="table-search" 
                  placeholder="Search personal accounts..." 
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
              </div>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>User Details</th>
                    <th>Personal Workspace Slug</th>
                    <th>Plan Level</th>
                    <th>Surveys</th>
                    <th>Active</th>
                    <th>Registered At</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {tenants
                    .filter(t => t.account_type === 'personal')
                    .filter(t => {
                      const personalUser = users.find(u => u.tenant_id === t.id);
                      const searchLower = searchTerm.toLowerCase();
                      const matchTenant = t.name.toLowerCase().includes(searchLower) || t.slug.toLowerCase().includes(searchLower);
                      const matchUser = personalUser && (
                        personalUser.email.toLowerCase().includes(searchLower) || 
                        (personalUser.full_name && personalUser.full_name.toLowerCase().includes(searchLower))
                      );
                      return matchTenant || matchUser;
                    })
                    .map(t => {
                      const personalUser = users.find(u => u.tenant_id === t.id);
                      if (!personalUser) return null;
                      return (
                        <tr key={personalUser.id}>
                          <td>
                            <div style={{fontWeight: 600, color: 'var(--text-primary)'}}>{personalUser.full_name || 'No Name'}</div>
                            <div style={{fontSize: 12, color: 'var(--text-muted)'}}>{personalUser.email}</div>
                          </td>
                          <td><code>{t.slug}</code></td>
                          <td>
                            <span className={`badge ${t.plan === 'free' ? 'badge-gray' : t.plan === 'pro' ? 'badge-blue' : 'badge-indigo'}`}>
                              {t.plan}
                            </span>
                          </td>
                          <td>{t.survey_count}</td>
                          <td>
                            <input 
                              type="checkbox" 
                              checked={personalUser.is_active} 
                              onChange={e => handleUpdateUser(personalUser.id, { is_active: e.target.checked })}
                            />
                          </td>
                          <td>{new Date(personalUser.created_at).toLocaleDateString()}</td>
                          <td>
                            <button 
                              className="btn-primary" 
                              style={{padding: '4px 8px', fontSize: 11, marginRight: 8}}
                              onClick={() => {
                                setEditingTenant(t);
                                setNewPlan(t.plan);
                              }}
                            >
                              Edit Plan
                            </button>
                            <button 
                              className="btn-action btn-action-delete"
                              onClick={() => handleDeleteUser(personalUser.id)}
                            >
                              <Trash2 size={13} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          )}

          {/* ── 4. SURVEYS TABLE ── */}
          {currentSection === 'surveys' && (
            <div className="table-container">
              <div className="table-header">
                <h3 className="table-title">Created Surveys (Survey)</h3>
                <input 
                  type="text" 
                  className="table-search" 
                  placeholder="Search surveys..." 
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
              </div>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Survey Title</th>
                    <th>Owning Organization</th>
                    <th>Publish Status</th>
                    <th>Total Responses</th>
                    <th>Created At</th>
                    <th>Remove</th>
                  </tr>
                </thead>
                <tbody>
                  {surveys
                    .filter(s => s.title.toLowerCase().includes(searchTerm.toLowerCase()) || s.tenant_name.toLowerCase().includes(searchTerm.toLowerCase()))
                    .map(s => (
                      <tr key={s.id}>
                        <td style={{fontWeight: 600, color: 'var(--text-primary)'}}>{s.title}</td>
                        <td>{s.tenant_name}</td>
                        <td>
                          <span className={`badge ${s.status === 'active' ? 'badge-emerald' : 'badge-gray'}`}>
                            {s.status}
                          </span>
                        </td>
                        <td><span style={{fontWeight: 700}}>{s.response_count}</span> responses</td>
                        <td>{new Date(s.created_at).toLocaleDateString()}</td>
                        <td>
                          <button 
                            className="btn-action btn-action-delete"
                            onClick={() => handleDeleteSurvey(s.id)}
                          >
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ── 5. BILLING & TRANSACTIONS ── */}
          {currentSection === 'subscriptions' && (
            <div style={{display: 'flex', flexDirection: 'column', gap: 24}}>
              <div className="table-container">
                <div className="table-header">
                  <h3 className="table-title">Active Subscriptions</h3>
                </div>
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Tenant Workspace</th>
                      <th>Plan Level</th>
                      <th>Status</th>
                      <th>Razorpay Subs ID</th>
                      <th>Period End Date</th>
                      <th>Created At</th>
                    </tr>
                  </thead>
                  <tbody>
                    {subscriptions.map(s => (
                      <tr key={s.id}>
                        <td style={{fontWeight: 600, color: 'var(--text-primary)'}}>{s.tenant_name}</td>
                        <td>
                          <span className="badge badge-indigo">{s.plan_name}</span>
                        </td>
                        <td>
                          <span className={`badge ${s.status === 'active' ? 'badge-emerald' : 'badge-rose'}`}>
                            {s.status}
                          </span>
                        </td>
                        <td><code>{s.razorpay_subscription_id || 'N/A'}</code></td>
                        <td>{s.current_period_end ? new Date(s.current_period_end).toLocaleDateString() : 'Lifetime'}</td>
                        <td>{new Date(s.created_at).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="table-container">
                <div className="table-header">
                  <h3 className="table-title">Transactions Log</h3>
                </div>
                <table className="admin-table">
                  <thead>
                    <tr>
                    <th>Workspace</th>
                    <th>Product</th>
                    <th>Amount Paid</th>
                    <th>Payment Mode</th>
                    <th>Provider Reference</th>
                    <th>Paid At</th>
                    <th>Status</th>
                  </tr>
                  </thead>
                  <tbody>
                    {payments.map(p => (
                      <tr key={p.id}>
                        <td style={{fontWeight: 600}}>{p.tenant_name}</td>
                        <td>{p.plan_name}</td>
                        <td>₹{p.amount.toLocaleString('en-IN', {minimumFractionDigits: 2})}</td>
                        <td><span style={{textTransform: 'uppercase', fontSize: 11}}>{p.method || 'N/A'}</span></td>
                        <td><code>{p.razorpay_payment_id || 'N/A'}</code></td>
                        <td>{p.paid_at ? new Date(p.paid_at).toLocaleString() : 'N/A'}</td>
                        <td>
                          <span className={`badge ${p.status === 'paid' ? 'badge-emerald' : p.status === 'failed' ? 'badge-rose' : 'badge-amber'}`}>
                            {p.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── 6. LEADS & BOOKINGS ── */}
          {currentSection === 'demos' && (
            <div style={{display: 'flex', flexDirection: 'column', gap: 24}}>
              <div className="table-container">
                <div className="table-header">
                  <h3 className="table-title">Scheduled Demo Bookings</h3>
                </div>
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Client Name</th>
                      <th>Email Contact</th>
                      <th>Proposed Date</th>
                      <th>Time Slot</th>
                      <th>Virtual Meeting Link</th>
                      <th>Booking Status</th>
                      <th>Cancel Booking</th>
                    </tr>
                  </thead>
                  <tbody>
                    {demos.map(d => (
                      <tr key={d.id}>
                        <td style={{fontWeight: 600, color: 'var(--text-primary)'}}>{d.name}</td>
                        <td>{d.email}</td>
                        <td>{d.demo_date}</td>
                        <td>{d.time_slot}</td>
                        <td>
                          {d.meeting_link ? (
                            <a href={d.meeting_link} target="_blank" rel="noopener noreferrer" style={{color: 'var(--accent-blue)', display: 'inline-flex', alignItems: 'center', gap: 4}}>
                              <span>Join Meet</span>
                              <ExternalLink size={12} />
                            </a>
                          ) : 'No Link'}
                        </td>
                        <td>
                          <span className={`badge ${d.status === 'scheduled' ? 'badge-blue' : 'badge-emerald'}`}>
                            {d.status}
                          </span>
                        </td>
                        <td>
                          <button 
                            className="btn-action btn-action-delete"
                            onClick={() => handleDeleteDemo(d.id)}
                          >
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {demos.length === 0 && (
                      <tr>
                        <td colSpan="7" style={{textAlign: 'center', color: 'var(--text-muted)', padding: 24}}>
                          No demo calls booked.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="table-container">
                <div className="table-header">
                  <h3 className="table-title">Waitlist Subscriptions</h3>
                </div>
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Waitlist Entry Email</th>
                      <th>Removal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {waitlist.map(w => (
                      <tr key={w.id}>
                        <td style={{fontWeight: 600, color: 'var(--text-primary)'}}>{w.email}</td>
                        <td>
                          <button 
                            className="btn-action btn-action-delete"
                            onClick={() => handleDeleteWaitlist(w.id)}
                          >
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {waitlist.length === 0 && (
                      <tr>
                        <td colSpan="2" style={{textAlign: 'center', color: 'var(--text-muted)', padding: 24}}>
                          Waitlist is empty.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── 7. SECURITY AUDIT TRAIL ── */}
          {currentSection === 'audit-logs' && (
            <div className="table-container">
              <div className="table-header">
                <h3 className="table-title">System-wide Security Audit Trail</h3>
                <input 
                  type="text" 
                  className="table-search" 
                  placeholder="Search by action or actor..." 
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
              </div>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>Authorized Actor</th>
                    <th>Action</th>
                    <th>Modified Target</th>
                    <th>IP Address</th>
                    <th>Audit Details</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLogs
                    .filter(l => l.action.toLowerCase().includes(searchTerm.toLowerCase()) || l.actor_email.toLowerCase().includes(searchTerm.toLowerCase()))
                    .map(l => (
                      <tr key={l.id}>
                        <td>{new Date(l.created_at).toLocaleString()}</td>
                        <td>
                          <div style={{fontWeight: 600, color: 'var(--text-primary)'}}>{l.actor_email}</div>
                        </td>
                        <td><span className="badge badge-indigo" style={{fontFamily: 'monospace'}}>{l.action}</span></td>
                        <td>{l.target_type || 'N/A'}</td>
                        <td><code>{l.ip_address || 'Localhost'}</code></td>
                        <td>
                          <button 
                            className="btn-primary" 
                            style={{padding: '4px 8px', fontSize: 11}}
                            onClick={() => setViewingLogDetail(l)}
                          >
                            Inspect
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* ── Modals & Dialogs ── */}

      {/* Tenant Plan Edit Modal */}
      {editingTenant && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h3 className="modal-title">Edit Subscription Plan Level</h3>
              <button className="btn-close" onClick={() => setEditingTenant(null)}><X size={16} /></button>
            </div>
            <div className="modal-body">
              <p style={{marginBottom: 16, color: 'var(--text-secondary)'}}>
                Modify billing tier for <strong>{editingTenant.name}</strong> organization.
              </p>
              <div className="form-group">
                <label className="form-label">Subscription Tier</label>
                <select 
                  className="form-input" 
                  value={newPlan} 
                  onChange={e => setNewPlan(e.target.value)}
                >
                  <option value="free">Free Tier</option>
                  <option value="pro">Pro Plan</option>
                  <option value="enterprise">Enterprise Plan</option>
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setEditingTenant(null)}>Cancel</button>
              <button 
                className="btn-primary"
                onClick={() => handleUpdateTenant(editingTenant.id, { plan: newPlan })}
              >
                Save Billing Tier
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Audit Log Detail Viewer */}
      {viewingLogDetail && (
        <div className="modal-overlay">
          <div className="modal" style={{width: 600}}>
            <div className="modal-header">
              <h3 className="modal-title">Audit Record Inspection</h3>
              <button className="btn-close" onClick={() => setViewingLogDetail(null)}><X size={16} /></button>
            </div>
            <div className="modal-body">
              <div style={{display: 'flex', flexDirection: 'column', gap: 12}}>
                <div>
                  <span className="form-label">Event Timestamp:</span>
                  <p style={{fontSize: 13, color: 'var(--text-primary)', marginTop: 4}}>{new Date(viewingLogDetail.created_at).toLocaleString()}</p>
                </div>
                <div>
                  <span className="form-label">Event Name:</span>
                  <p style={{fontSize: 13, color: 'var(--text-primary)', marginTop: 4, fontFamily: 'monospace'}}>{viewingLogDetail.action}</p>
                </div>
                <div>
                  <span className="form-label">Modified State Detail Payload:</span>
                  <pre style={{
                    marginTop: 8,
                    padding: 12,
                    backgroundColor: 'var(--bg-primary)',
                    borderRadius: 6,
                    border: '1px solid var(--border-color)',
                    fontSize: 11,
                    fontFamily: 'monospace',
                    overflowX: 'auto',
                    color: 'var(--accent-indigo)'
                  }}>
                    {JSON.stringify(viewingLogDetail.detail, null, 2)}
                  </pre>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-primary" onClick={() => setViewingLogDetail(null)}>Close Inspection</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
