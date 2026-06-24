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
  Zap
} from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8001';

export default function App() {
  const [token, setToken] = useState(localStorage.getItem('admin_token') || '');
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
  const [nameInput, setNameInput] = useState('');
  const [adminProfile, setAdminProfile] = useState(null);

  // Modal control states
  const [editingTenant, setEditingTenant] = useState(null);
  const [newPlan, setNewPlan] = useState('');
  const [viewingLogDetail, setViewingLogDetail] = useState(null);

  useEffect(() => {
    if (token) {
      // Basic token parsing to get name/email for display
      try {
        const payloadStr = token.split('.')[1];
        const payload = JSON.parse(atob(payloadStr));
        setAdminProfile({
          email: payload.email,
          name: payload.name || payload.email.split('@')[0],
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
  };

  const handleMockLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    if (!emailInput.endsWith('@axioraglobalsolutions.com')) {
      setError('Forbidden: Only @axioraglobalsolutions.com emails can access the Super Admin Console.');
      setLoading(false);
      return;
    }

    try {
      const res = await fetch(`${API_BASE_URL}/admin/auth/mock-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailInput, name: nameInput })
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
      else if (section === 'tenants') {
        const res = await fetch(`${API_BASE_URL}/admin/tenants`, { headers });
        if (!res.ok) throw new Error('Failed to load tenants');
        const data = await res.json();
        setTenants(data);
      } 
      else if (section === 'users') {
        const res = await fetch(`${API_BASE_URL}/admin/users`, { headers });
        if (!res.ok) throw new Error('Failed to load users');
        const data = await res.json();
        setUsers(data);
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
      fetchSectionData('users');
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
      fetchSectionData('users');
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
      fetchSectionData('tenants');
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
      fetchSectionData('tenants');
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
              <ShieldCheck size={26} color="white" />
            </div>
            <span className="logo-text">Axiora Pulse</span>
            <span className="logo-badge">Console</span>
          </div>
          <h2 className="login-title">Super Admin Login</h2>
          <p className="login-subtitle">Access restricted to authorized personnel</p>

          {error && <div className="login-error">{error}</div>}

          <form className="login-form" onSubmit={handleMockLogin}>
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
            <button type="submit" className="login-btn" disabled={loading}>
              {loading ? 'Authenticating...' : 'Sign in as Administrator'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Navigation Items matching the DB tables
  const navItems = [
    { id: 'dashboard', label: 'Overview', icon: <LayoutDashboard size={18} /> },
    { id: 'tenants', label: 'Tenants (Organizations)', icon: <Building size={18} /> },
    { id: 'users', label: 'Users (Profiles)', icon: <Users size={18} /> },
    { id: 'surveys', label: 'Surveys (Questions)', icon: <FileQuestion size={18} /> },
    { id: 'subscriptions', label: 'Billing & Payments', icon: <CreditCard size={18} /> },
    { id: 'demos', label: 'Leads & Demos', icon: <CalendarClock size={18} /> },
    { id: 'audit-logs', label: 'Audit Trail Logs', icon: <ShieldAlert size={18} /> },
  ];

  return (
    <div className="app-container">
      {/* ── Left Navigation Sidebar ── */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="login-logo-symbol" style={{width: 32, height: 32, borderRadius: 6}}>
            <ShieldCheck size={18} color="white" />
          </div>
          <span className="logo-text" style={{fontSize: 16}}>Axiora Admin</span>
          <span className="logo-badge" style={{fontSize: 8}}>Internal</span>
        </div>

        <nav className="sidebar-nav">
          {navItems.map(item => (
            <div 
              key={item.id} 
              className={`nav-item ${currentSection === item.id ? 'active' : ''}`}
              onClick={() => setCurrentSection(item.id)}
            >
              {item.icon}
              <span>{item.label}</span>
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
            <LogOut size={14} />
            <span>Sign out</span>
          </button>
        </div>
      </aside>

      {/* ── Main Content Area ── */}
      <main className="main-content">
        <header className="header">
          <div className="header-title">
            <h1 style={{textTransform: 'capitalize'}}>{currentSection.replace('-', ' ')} Control</h1>
          </div>
          <div className="header-actions">
            {success && <span style={{color: 'var(--accent-emerald)', fontSize: 13, fontWeight: 600}}>{success}</span>}
            <button className="btn-secondary" onClick={() => fetchSectionData(currentSection)} disabled={loading}>
              <RefreshCw size={14} className={loading ? 'spin' : ''} />
            </button>
          </div>
        </header>

        <div className="workspace-area">
          {error && <div className="login-error" style={{marginBottom: 20}}>{error}</div>}

          {/* ── Render Sections ── */}

          {/* 1. Dashboard/Overview */}
          {currentSection === 'dashboard' && analytics && (
            <div>
              <div className="card-grid">
                <div className="kpi-card">
                  <div className="kpi-info">
                    <span className="kpi-title">Total Tenants</span>
                    <span className="kpi-value">{analytics.kpis.total_tenants}</span>
                  </div>
                  <div className="kpi-icon-wrapper"><Building size={20} /></div>
                </div>
                <div className="kpi-card">
                  <div className="kpi-info">
                    <span className="kpi-title">Total Users</span>
                    <span className="kpi-value">{analytics.kpis.total_users}</span>
                  </div>
                  <div className="kpi-icon-wrapper"><Users size={20} /></div>
                </div>
                <div className="kpi-card">
                  <div className="kpi-info">
                    <span className="kpi-title">Total Surveys</span>
                    <span className="kpi-value">{analytics.kpis.total_surveys}</span>
                  </div>
                  <div className="kpi-icon-wrapper"><FileQuestion size={20} /></div>
                </div>
                <div className="kpi-card">
                  <div className="kpi-info">
                    <span className="kpi-title">Total Responses</span>
                    <span className="kpi-value">{analytics.kpis.total_responses}</span>
                  </div>
                  <div className="kpi-icon-wrapper"><Zap size={20} /></div>
                </div>
                <div className="kpi-card">
                  <div className="kpi-info">
                    <span className="kpi-title">Revenue (INR)</span>
                    <span className="kpi-value">₹{analytics.kpis.total_revenue.toFixed(2)}</span>
                  </div>
                  <div className="kpi-icon-wrapper"><CreditCard size={20} /></div>
                </div>
                <div className="kpi-card">
                  <div className="kpi-info">
                    <span className="kpi-title">Active Subs</span>
                    <span className="kpi-value">{analytics.kpis.total_subscriptions}</span>
                  </div>
                  <div className="kpi-icon-wrapper"><UserCheck size={20} /></div>
                </div>
              </div>

              <div className="split-grid">
                <div className="panel-card">
                  <h3 className="panel-title">Recent Payments</h3>
                  <div className="trend-list">
                    {analytics.recent_payments.map(p => (
                      <div className="trend-item" key={p.id}>
                        <div className="trend-info">
                          <span className="trend-name">{p.tenant_name}</span>
                          <span className="trend-desc">{new Date(p.created_at).toLocaleDateString()}</span>
                        </div>
                        <div style={{display: 'flex', alignItems: 'center', gap: 12}}>
                          <span className="trend-value">₹{p.amount.toFixed(2)}</span>
                          <span className={`badge ${p.status === 'paid' ? 'badge-emerald' : 'badge-amber'}`}>{p.status}</span>
                        </div>
                      </div>
                    ))}
                    {analytics.recent_payments.length === 0 && <p style={{color: 'var(--text-muted)'}}>No payments logged yet.</p>}
                  </div>
                </div>

                <div className="panel-card">
                  <h3 className="panel-title">Recent System Audits</h3>
                  <div className="trend-list">
                    {analytics.recent_logs.map(l => (
                      <div className="trend-item" key={l.id}>
                        <div className="trend-info">
                          <span className="trend-name">{l.action}</span>
                          <span className="trend-desc">{l.actor_email}</span>
                        </div>
                        <span className="trend-value" style={{fontSize: 12}}>{new Date(l.created_at).toLocaleTimeString()}</span>
                      </div>
                    ))}
                    {analytics.recent_logs.length === 0 && <p style={{color: 'var(--text-muted)'}}>No audit records found.</p>}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 2. Tenants Table */}
          {currentSection === 'tenants' && (
            <div className="table-container">
              <div className="table-header">
                <h3 className="table-title">Registered Organizations (Tenants)</h3>
                <input 
                  type="text" 
                  className="table-search" 
                  placeholder="Search by name or slug..." 
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
              </div>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Organization Info</th>
                    <th>Slug</th>
                    <th>Plan Level</th>
                    <th>Users</th>
                    <th>Surveys</th>
                    <th>Status</th>
                    <th>Registered At</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {tenants
                    .filter(t => t.name.toLowerCase().includes(searchTerm.toLowerCase()) || t.slug.toLowerCase().includes(searchTerm.toLowerCase()))
                    .map(t => (
                      <tr key={t.id}>
                        <td>
                          <div style={{fontWeight: 600, color: 'var(--text-primary)'}}>{t.name}</div>
                          <div style={{fontSize: 11, color: 'var(--text-muted)'}}>{t.id}</div>
                        </td>
                        <td><code>{t.slug}</code></td>
                        <td>
                          <span className={`badge ${t.plan === 'free' ? 'badge-gray' : t.plan === 'pro' ? 'badge-blue' : 'badge-indigo'}`}>
                            {t.plan}
                          </span>
                        </td>
                        <td>{t.user_count}</td>
                        <td>{t.survey_count}</td>
                        <td>
                          <button 
                            className={`badge ${t.is_active ? 'badge-emerald' : 'badge-rose'}`}
                            onClick={() => handleUpdateTenant(t.id, { is_active: !t.is_active })}
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
                            onClick={() => {
                              setEditingTenant(t);
                              setNewPlan(t.plan);
                            }}
                          >
                            Edit Plan
                          </button>
                          <button 
                            className="btn-action btn-action-delete"
                            onClick={() => handleDeleteTenant(t.id)}
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

          {/* 3. Users Table */}
          {currentSection === 'users' && (
            <div className="table-container">
              <div className="table-header">
                <h3 className="table-title">Platform Users (UserProfile)</h3>
                <input 
                  type="text" 
                  className="table-search" 
                  placeholder="Search email or name..." 
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
              </div>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>User Details</th>
                    <th>Role Designation</th>
                    <th>Workspace</th>
                    <th>Account Type</th>
                    <th>Active</th>
                    <th>Registered At</th>
                    <th>Delete</th>
                  </tr>
                </thead>
                <tbody>
                  {users
                    .filter(u => u.email.toLowerCase().includes(searchTerm.toLowerCase()) || (u.full_name && u.full_name.toLowerCase().includes(searchTerm.toLowerCase())))
                    .map(u => (
                      <tr key={u.id}>
                        <td>
                          <div style={{fontWeight: 600, color: 'var(--text-primary)'}}>{u.full_name || 'No Name'}</div>
                          <div style={{fontSize: 12, color: 'var(--text-muted)'}}>{u.email}</div>
                        </td>
                        <td>
                          <select 
                            value={u.role} 
                            onChange={e => handleUpdateUser(u.id, { role: e.target.value })}
                            className="form-input"
                            style={{padding: '4px 8px', fontSize: 12, backgroundColor: 'var(--bg-tertiary)'}}
                          >
                            <option value="super_admin">Super Admin</option>
                            <option value="admin">Admin</option>
                            <option value="manager">Manager</option>
                            <option value="creator">Creator</option>
                            <option value="viewer">Viewer</option>
                          </select>
                        </td>
                        <td>
                          <div style={{fontWeight: 500}}>{u.tenant_name}</div>
                          <div style={{fontSize: 11, color: 'var(--text-muted)'}}><code>{u.tenant_slug}</code></div>
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
            </div>
          )}

          {/* 4. Surveys Table */}
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
                    <th>Survey ID</th>
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
                        <td><code>{s.id.substring(0, 8)}...</code></td>
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

          {/* 5. Subscriptions & Payments */}
          {currentSection === 'subscriptions' && (
            <div style={{display: 'flex', flexDirection: 'column', gap: 32}}>
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
                      <th>Transaction ID</th>
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
                        <td><code>{p.id.substring(0, 8)}...</code></td>
                        <td style={{fontWeight: 600}}>{p.tenant_name}</td>
                        <td>{p.plan_name}</td>
                        <td>₹{p.amount.toFixed(2)}</td>
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

          {/* 6. Leand & Demos */}
          {currentSection === 'demos' && (
            <div style={{display: 'flex', flexDirection: 'column', gap: 32}}>
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
                        <td colSpan="7" style={{textAlign: 'center', color: 'var(--text-muted)', padding: 32}}>
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
                <table className="admin-table" style={{maxWidth: 600}}>
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
                        <td colSpan="2" style={{textAlign: 'center', color: 'var(--text-muted)', padding: 32}}>
                          Waitlist is empty.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 7. Audit Trail */}
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
                    <th>Target ID Reference</th>
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
                          <div style={{fontSize: 11, color: 'var(--text-muted)'}}>{l.actor_user_id}</div>
                        </td>
                        <td><span className="badge badge-indigo" style={{fontFamily: 'monospace'}}>{l.action}</span></td>
                        <td>{l.target_type || 'N/A'}</td>
                        <td><code>{l.target_id || 'N/A'}</code></td>
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
                  <p style={{fontSize: 14, color: 'var(--text-primary)', marginTop: 4}}>{new Date(viewingLogDetail.created_at).toLocaleString()}</p>
                </div>
                <div>
                  <span className="form-label">Event Name:</span>
                  <p style={{fontSize: 14, color: 'var(--text-primary)', marginTop: 4, fontFamily: 'monospace'}}>{viewingLogDetail.action}</p>
                </div>
                <div>
                  <span className="form-label">Modified State Detail Payload:</span>
                  <pre style={{
                    marginTop: 8,
                    padding: 12,
                    backgroundColor: 'var(--bg-primary)',
                    borderRadius: 6,
                    border: '1px solid var(--border-glass)',
                    fontSize: 12,
                    fontFamily: 'monospace',
                    overflowX: 'auto',
                    color: '#818cf8'
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
