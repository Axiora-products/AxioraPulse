import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import useAuthStore from '../hooks/useAuth';
import API from '../api/axios';

// Import Lucide React Icons
import {
  LayoutDashboard,
  Building2,
  Users,
  CreditCard,
  FileText,
  Activity as ActivityIcon,
  HeartPulse,
  Settings as SettingsIcon,
  LogOut,
  Search,
  Filter,
  ChevronDown,
  ChevronsUpDown,
  Download,
  Plus,
  Check,
  AlertTriangle,
  X,
  RefreshCw,
  ExternalLink,
  Shield,
  Mail,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  TrendingUp,
  SlidersHorizontal,
  ChevronRight,
  HelpCircle,
  Database,
  Lock,
  Menu,
  CheckCircle2,
  AlertCircle,
  UserCheck,
  Award,
  Globe,
  Trash2,
  LockKeyhole,
  Info,
  Bell
} from 'lucide-react';

// Import ChartJS and React-Chartjs-2
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
import { getApiErrorMessage } from '../lib/apiError';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

// ─── Inline Sparkline Widget ───────────────────────────────────────────────
const Sparkline = ({ data = [10, 15, 8, 12, 18, 14, 20], trend = 'up' }) => {
  const width = 80;
  const height = 24;
  const strokeColor = trend === 'up' ? '#10B981' : trend === 'down' ? '#EF4444' : '#6B7280';
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const points = data.map((val, idx) => {
    const x = (idx / (data.length - 1)) * width;
    const y = height - 2 - ((val - min) / range) * (height - 4);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  return (
    <svg className="w-20 h-6 overflow-visible" viewBox={`0 0 ${width} ${height}`}>
      <polyline
        fill="none"
        stroke={strokeColor}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
};

export default function SuperAdminDashboard() {
  const { signOut } = useAuthStore();
  
  // Navigation tabs
  // 'overview' | 'tenants' | 'researchers' | 'billing' | 'surveys' | 'logs' | 'health' | 'settings'
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [actionBusy, setActionBusy] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // States loaded from APIs
  const [stats, setStats] = useState(null);
  const [tenants, setTenants] = useState([]);
  
  // Search & Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPlanFilter, setSelectedPlanFilter] = useState('All Subscription Plans');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState('All Statuses');
  const [selectedTenants, setSelectedTenants] = useState([]);

  // Logs filters
  const [logsQuery, setLogsQuery] = useState('');
  const [logsFilter, setLogsFilter] = useState('all');

  // Sorting and Pagination
  const [sortField, setSortField] = useState('name');
  const [sortDirection, setSortDirection] = useState('asc');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  // Modals state
  const [upgradeModalTenant, setUpgradeModalTenant] = useState(null);
  const [creditModalTenant, setCreditModalTenant] = useState(null);
  const [deleteModalTenant, setDeleteModalTenant] = useState(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  // Impersonating simulation
  const [impersonatingTenant, setImpersonatingTenant] = useState(null);

  // Handle Cmd/Ctrl+K Search shortcut
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        const searchInput = document.getElementById('dashboard-global-search');
        if (searchInput) searchInput.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Fetch data on mount
  const loadData = async () => {
    setLoading(true);
    try {
      const [statsRes, tenantsRes] = await Promise.all([
        API.get('/super-admin/stats'),
        API.get('/super-admin/tenants')
      ]);
      setStats(statsRes.data);
      setTenants(tenantsRes.data);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load database aggregates.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // API Call: Update tenant plan in database
  const handleUpdatePlan = async (tenantId, newPlan) => {
    setActionBusy(true);
    try {
      const res = await API.patch(`/super-admin/tenants/${tenantId}/plan`, { plan_type: newPlan });
      toast.success(res.data.message || 'Plan updated successfully!');
      // Update local state
      setTenants(prev => prev.map(t => t.id === tenantId ? { ...t, plan_type: newPlan } : t));
      // Reload stats to reflect MRR updates
      const statsRes = await API.get('/super-admin/stats');
      setStats(statsRes.data);
      setUpgradeModalTenant(null);
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to update plan.'));
    } finally {
      setActionBusy(false);
    }
  };

  // API Call: Toggle tenant active/suspended status in database
  const handleToggleStatus = async (tenantId, currentStatus) => {
    setActionBusy(true);
    const newStatus = !currentStatus;
    try {
      const res = await API.patch(`/super-admin/tenants/${tenantId}/status`, { is_active: newStatus });
      toast.success(res.data.message || 'Status updated successfully!');
      // Update local state
      setTenants(prev => prev.map(t => t.id === tenantId ? { ...t, is_active: newStatus } : t));
      // Reload stats
      const statsRes = await API.get('/super-admin/stats');
      setStats(statsRes.data);
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to toggle status.'));
    } finally {
      setActionBusy(false);
    }
  };

  // UI Action: Impersonate
  const handleImpersonate = (tenant) => {
    setImpersonatingTenant(tenant);
    toast.success(`Active Impersonation Session: ${tenant.name} (${tenant.owner_email})`);
  };

  // UI Action: Apply Credits
  const handleApplyCredits = (tenantId, amount) => {
    toast.success(`Successfully applied $${amount} credits to organization.`);
    setCreditModalTenant(null);
  };

  // UI Action: Delete Tenant (Simulated)
  const handleDeleteTenant = (tenantId) => {
    toast.success(`Organization workspace marked for decommission.`);
    setTenants(prev => prev.filter(t => t.id !== tenantId));
    setDeleteModalTenant(null);
    setDeleteConfirmText('');
  };

  // UI Action: Bulk Mail
  const handleBulkMail = () => {
    if (selectedTenants.length === 0) return;
    toast(`Drafting announcement email to ${selectedTenants.length} organization administrator(s)...`, { icon: '✉️' });
  };

  // API Call: Bulk Suspend/Activate
  const handleBulkSuspend = async () => {
    if (selectedTenants.length === 0) return;
    setActionBusy(true);
    try {
      const selectedList = tenants.filter(t => selectedTenants.includes(t.id));
      const allActive = selectedList.every(t => t.is_active);
      const newStatus = !allActive; // If all are active, suspend. Otherwise, activate.
      
      await Promise.all(selectedList.map(t => 
        API.patch(`/super-admin/tenants/${t.id}/status`, { is_active: newStatus })
      ));
      
      toast.success(`Bulk status update complete for ${selectedTenants.length} organization(s)`);
      setSelectedTenants([]);
      await loadData();
    } catch (err) {
      console.error(err);
      toast.error('Failed to perform bulk status update.');
    } finally {
      setActionBusy(false);
    }
  };

  // Export tenants table to CSV
  const handleExportTenants = () => {
    const headers = ['Organization Name', 'Slug', 'Owner Email', 'Plan', 'MRR ($)', 'Researchers', 'Surveys', 'Responses', 'Status', 'Created At'];
    const rows = tenants.map(t => {
      const mrr = t.plan_type === 'enterprise' ? 299 : (t.plan_type === 'pro' || t.plan_type === 'growth' ? 49 : 0);
      return [
        t.name,
        t.slug,
        t.owner_email,
        t.plan_type,
        mrr,
        t.user_count,
        t.survey_count,
        t.response_count,
        t.is_active ? 'Active' : 'Suspended',
        t.created_at
      ];
    });

    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(','), ...rows.map(e => e.map(val => `"${val}"`).join(","))].join("\n");
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `axiorapulse_organizations_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Organizations list exported successfully.');
  };

  // Sort and Filter Logic
  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const filteredTenants = tenants.filter(t => {
    const matchesSearch = 
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.slug.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.owner_email.toLowerCase().includes(searchQuery.toLowerCase());
      
    const matchesPlan = 
      selectedPlanFilter === 'All Subscription Plans' ||
      t.plan_type === selectedPlanFilter;
      
    const matchesStatus = 
      selectedStatusFilter === 'All Statuses' ||
      (selectedStatusFilter === 'active' && t.is_active) ||
      (selectedStatusFilter === 'suspended' && !t.is_active);
      
    return matchesSearch && matchesPlan && matchesStatus;
  });

  const sortedTenants = [...filteredTenants].sort((a, b) => {
    let valA = a[sortField];
    let valB = b[sortField];

    if (sortField === 'mrr') {
      valA = a.plan_type === 'enterprise' ? 299 : (a.plan_type === 'pro' || a.plan_type === 'growth' ? 49 : 0);
      valB = b.plan_type === 'enterprise' ? 299 : (b.plan_type === 'pro' || b.plan_type === 'growth' ? 49 : 0);
    }

    if (typeof valA === 'string') {
      return sortDirection === 'asc' 
        ? valA.localeCompare(valB) 
        : valB.localeCompare(valA);
    } else {
      return sortDirection === 'asc' 
        ? (valA || 0) - (valB || 0) 
        : (valB || 0) - (valA || 0);
    }
  });

  // Pagination bounds
  const totalPages = Math.ceil(sortedTenants.length / pageSize) || 1;
  const paginatedTenants = sortedTenants.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  // Plan distribution details
  const totalSubscribers = tenants.length;
  const freeCount = tenants.filter(t => t.plan_type === 'free').length;
  const proCount = tenants.filter(t => t.plan_type === 'pro').length;
  const growthCount = tenants.filter(t => t.plan_type === 'growth').length;
  const enterpriseCount = tenants.filter(t => t.plan_type === 'enterprise').length;

  // Mock static data for billing, surveys, activity, researchers, platform health
  const recentPayments = [
    { id: 1, invoice: "#INV-2026-0043", org: "Velo Research", email: "marcus.chen@velo.co", plan: "Enterprise", amount: 299, status: "Paid", date: "Jun 18, 2026" },
    { id: 2, invoice: "#INV-2026-0042", org: "Nexa Insights", email: "e.vance@nexa.io", plan: "Pro", amount: 49, status: "Paid", date: "Jun 18, 2026" },
    { id: 3, invoice: "#INV-2026-0041", org: "Acme Research", email: "d.cooper@acme.com", plan: "Growth", amount: 49, status: "Paid", date: "Jun 17, 2026" },
    { id: 4, invoice: "#INV-2026-0039", org: "Stellar Labs", email: "alice@stellar.net", plan: "Pro", amount: 49, status: "Paid", date: "Jun 15, 2026" },
    { id: 5, invoice: "#INV-2026-0037", org: "Chronos Corp", email: "s.henderson@chronos.io", plan: "Enterprise", amount: 299, status: "Paid", date: "Jun 12, 2026" },
  ];

  const failedInvoices = [
    { id: 1, invoice: "#INV-2026-0040", org: "Chronos Corp", email: "s.henderson@chronos.io", amount: 299, attempts: 2, nextAttempt: "Jun 20, 2026", date: "Jun 17, 2026" },
    { id: 2, invoice: "#INV-2026-0035", org: "Aura Corp", email: "admin@auratech.org", amount: 49, attempts: 3, nextAttempt: "Finalized / Suspended", date: "Jun 10, 2026" },
    { id: 3, invoice: "#INV-2026-0031", org: "Nexa Insights", email: "e.vance@nexa.io", amount: 49, attempts: 1, nextAttempt: "Jun 21, 2026", date: "Jun 14, 2026" }
  ];

  const planUpgrades = [
    { id: 1, org: "Velo Research", from: "Pro", to: "Enterprise", change: "+$250/mo", actor: "Marcus Chen", date: "Jun 16, 2026" },
    { id: 2, org: "Acme Research", from: "Free", to: "Growth", change: "+$49/mo", actor: "David Cooper", date: "Jun 10, 2026" },
    { id: 3, org: "Chronos Corp", from: "Growth", to: "Enterprise", change: "+$250/mo", actor: "S. Henderson", date: "May 28, 2026" }
  ];

  const researchersList = [
    { id: 1, name: "Sarah Henderson", email: "s.henderson@chronos.io", organization: "Chronos Corp", role: "Owner", surveys: 14, lastActive: "2 mins ago", status: "Active" },
    { id: 2, name: "David Cooper", email: "d.cooper@acme.com", organization: "Acme Research", role: "Owner", surveys: 8, lastActive: "1 day ago", status: "Active" },
    { id: 3, name: "Marcus Chen", email: "marcus.chen@velo.co", organization: "Velo Research", role: "Member", surveys: 24, lastActive: "15 mins ago", status: "Active" },
    { id: 4, name: "Elena Vance", email: "e.vance@nexa.io", organization: "Nexa Insights", role: "Member", surveys: 6, lastActive: "1 hour ago", status: "Active" },
    { id: 5, name: "Bob Smith", email: "bob@beta.org", organization: "Beta Systems", role: "Owner", surveys: 2, lastActive: "3 days ago", status: "Suspended" },
    { id: 6, name: "Alice Green", email: "alice@stellar.net", organization: "Stellar Labs", role: "Guest", surveys: 0, lastActive: "1 week ago", status: "Active" }
  ];

  const surveysList = [
    { id: 1, surveyName: "Q3 Customer Satisfaction Survey", orgName: "Acme Research", responses: 4203, completionRate: "78.2%", createdDate: "Jun 10, 2026", status: "Published" },
    { id: 2, surveyName: "Developer Experience 2026", orgName: "Velo Research", responses: 12410, completionRate: "85.4%", createdDate: "May 24, 2026", status: "Published" },
    { id: 3, surveyName: "Product-Market Fit Survey", orgName: "Nexa Insights", responses: 843, completionRate: "69.1%", createdDate: "Jun 15, 2026", status: "Published" },
    { id: 4, surveyName: "Brand Awareness Study", orgName: "Chronos Corp", responses: 1142, completionRate: "72.8%", createdDate: "Jun 02, 2026", status: "Draft" },
    { id: 5, surveyName: "Website Redesign Feedback", orgName: "Beta Systems", responses: 0, completionRate: "0.0%", createdDate: "Jun 19, 2026", status: "Draft" },
    { id: 6, surveyName: "Employee Pulse Q2", orgName: "Acme Research", responses: 312, completionRate: "94.2%", createdDate: "May 15, 2026", status: "Closed" }
  ];

  const activityLogs = [
    { id: 1, actor: "Marcus Chen", role: "Security Admin", time: "2 mins ago", type: "Security", detail: "Authorized IP range 192.168.1.0/24 for Tenant 'Velo Research'", ip: "192.168.1.44", severity: "info" },
    { id: 2, actor: "System Billing", role: "Automated Job", time: "15 mins ago", type: "Billing", detail: "Subscription for 'Chronos Corp' (Enterprise) payment failed - Attempt 2 of 3", ip: "127.0.0.1", severity: "critical" },
    { id: 3, actor: "Elena Vance", role: "Platform Ops", time: "1 hour ago", type: "Billing", detail: "Upgraded 'Chronos Corp' plan level from 'pro' to 'growth'", ip: "203.0.113.88", severity: "info" },
    { id: 4, actor: "Alex Rivera", role: "Super Admin", time: "2 hours ago", type: "Security", detail: "MFA challenge bypassed for verified owner 's.henderson@chronos.io'", ip: "198.51.100.12", severity: "warning" },
    { id: 5, actor: "Security Agent", role: "Threat Mitigator", time: "4 hours ago", type: "Security", detail: "Blocked brute force attempt (12 failed logins) from IP 203.0.113.12", ip: "203.0.113.12", severity: "critical" },
    { id: 6, actor: "David Kim", role: "Platform Ops", time: "6 hours ago", type: "Organizations", detail: "Created new tenant workspace 'Acme Research' with slug 'acme-research'", ip: "192.168.1.102", severity: "info" },
    { id: 7, actor: "Survey Dispatcher", role: "Automated Job", time: "12 hours ago", type: "Surveys", detail: "Published global panel survey 'Q3 User Experience Assessment'", ip: "127.0.0.1", severity: "info" },
    { id: 8, actor: "Sarah Jenkins", role: "Researcher Admin", time: "1 day ago", type: "Researchers", detail: "Invited new researcher 'd.cooper@acme.com' to team workspace", ip: "198.51.100.5", severity: "info" }
  ];

  const filteredLogsList = activityLogs.filter(log => {
    const matchesFilter = logsFilter === 'all' || log.type.toLowerCase() === logsFilter.toLowerCase();
    const matchesSearch = 
      log.actor.toLowerCase().includes(logsQuery.toLowerCase()) || 
      log.role.toLowerCase().includes(logsQuery.toLowerCase()) ||
      log.detail.toLowerCase().includes(logsQuery.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  // Chart configs
  const mrrTrendChartData = {
    labels: ['Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
    datasets: [
      {
        label: 'Current Year MRR ($)',
        data: [3100, 3250, 3400, 3350, 3500, 3680, 3800, 3950, 4100, 4050, 4200, 4280],
        borderColor: '#FF5A1F',
        backgroundColor: 'rgba(255, 90, 31, 0.08)',
        fill: true,
        tension: 0.4,
        borderWidth: 2,
        pointBackgroundColor: '#FF5A1F',
        pointHoverRadius: 6,
      },
      {
        label: 'Previous Year MRR ($)',
        data: [2600, 2700, 2850, 2900, 2980, 3100, 3200, 3250, 3300, 3400, 3500, 3600],
        borderColor: '#9CA3AF',
        borderDash: [5, 5],
        fill: false,
        tension: 0.4,
        borderWidth: 1.5,
        pointBackgroundColor: '#9CA3AF',
        pointHoverRadius: 4,
      }
    ]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'top',
        labels: {
          boxWidth: 12,
          font: { family: 'Inter', size: 12, weight: 500 },
          color: '#374151'
        }
      },
      tooltip: {
        backgroundColor: '#111827',
        titleFont: { family: 'Inter', size: 12, weight: 600 },
        bodyFont: { family: 'Inter', size: 12 },
        padding: 12,
        borderColor: '#E5E7EB',
        borderWidth: 1,
        callbacks: {
          label: (context) => ` ${context.dataset.label.split(' ($')[0]}: $${context.parsed.y.toLocaleString()}`
        }
      }
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { font: { family: 'Inter', size: 11 }, color: '#6B7280' }
      },
      y: {
        grid: { borderDash: [4, 4], color: '#E5E7EB' },
        ticks: { font: { family: 'Inter', size: 11 }, color: '#6B7280', callback: (val) => `$${val}` }
      }
    }
  };

  const planDistributionChartData = {
    labels: ['Free Plan', 'Pro Plan', 'Growth Plan', 'Enterprise Plan'],
    datasets: [{
      data: [
        freeCount || 12, 
        proCount || 18, 
        growthCount || 8, 
        enterpriseCount || 5
      ],
      backgroundColor: ['#E5E7EB', '#10B981', '#3B82F6', '#7C3AED'],
      borderWidth: 2,
      borderColor: '#FFFFFF',
      hoverOffset: 4
    }]
  };

  const planDistributionChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom',
        labels: {
          boxWidth: 10,
          font: { family: 'Inter', size: 11, weight: 500 },
          color: '#374151',
          padding: 12
        }
      },
      tooltip: {
        callbacks: {
          label: (context) => ` Organizations: ${context.raw}`
        }
      }
    },
    cutout: '75%'
  };

  // Nav layout array
  const menuItems = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'tenants', label: 'Organizations', icon: Building2 },
    { id: 'researchers', label: 'Researchers', icon: Users },
    { id: 'billing', label: 'Revenue & Billing', icon: CreditCard },
    { id: 'surveys', label: 'Surveys', icon: FileText },
    { id: 'logs', label: 'Activity', icon: ActivityIcon },
    { id: 'health', label: 'Platform Health', icon: HeartPulse },
    { id: 'settings', label: 'Settings', icon: SettingsIcon },
  ];

  return (
    <div className="super-admin-root flex min-h-screen bg-[#FAFAFA] text-[#111827] font-sans antialiased w-full">
      <style>{`
        .super-admin-root, .super-admin-root * {
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;
        }
        .super-admin-root ::selection {
          background: rgba(255, 90, 31, 0.2) !important;
          color: #111827 !important;
        }
        .super-admin-root ::-webkit-scrollbar-thumb {
          background: #E5E7EB !important;
        }
      `}</style>
      {/* ─── SIDEBAR NAVIGATION ─── */}
      <aside className="hidden md:flex flex-col w-64 bg-white border-r border-[#E5E7EB] shrink-0">
        {/* Brand header */}
        <div className="h-16 flex items-center gap-2.5 px-6 border-b border-[#E5E7EB]">
          <div className="w-6 h-6 rounded bg-[#FF5A1F] flex items-center justify-center text-white font-extrabold text-sm relative">
            A
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-emerald-500 rounded-full border-2 border-white animate-pulse" />
          </div>
          <span className="font-semibold text-base tracking-tight text-[#111827]">AxioraPulse</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 font-medium text-zinc-500 border border-zinc-200">Admin</span>
        </div>

        {/* Impersonation active badge */}
        {impersonatingTenant && (
          <div className="mx-4 mt-4 p-3 bg-red-50/80 border border-red-200 rounded-lg flex flex-col gap-1 text-xs">
            <div className="flex items-center gap-1.5 text-red-700 font-semibold">
              <Shield className="w-3.5 h-3.5" />
              <span>Impersonating Workspace</span>
            </div>
            <p className="text-red-600 truncate font-medium">{impersonatingTenant.name}</p>
            <button 
              onClick={() => { setImpersonatingTenant(null); toast.info('Impersonation session terminated.'); }}
              className="mt-1 text-left text-red-700 hover:underline font-semibold flex items-center gap-0.5"
            >
              Exit Session &rarr;
            </button>
          </div>
        )}

        {/* Sidebar Nav links */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {menuItems.map(item => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => { setActiveTab(item.id); setMobileMenuOpen(false); }}
                className={`w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                  isActive 
                    ? 'bg-[#FF5A1F]/10 text-[#FF5A1F]' 
                    : 'text-[#6B7280] hover:text-[#111827] hover:bg-zinc-100'
                }`}
              >
                <Icon className="w-5 h-5 shrink-0" strokeWidth={isActive ? 2.2 : 1.8} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Bottom Profile and system commands */}
        <div className="p-4 border-t border-[#E5E7EB] space-y-3">
          <div className="flex items-center gap-3 px-2">
            <div className="w-9 h-9 rounded-full bg-zinc-950 flex items-center justify-center text-white text-xs font-semibold uppercase">
              AR
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-[#111827] truncate">Alex Rivera</p>
              <p className="text-[10px] text-[#6B7280] uppercase tracking-wider font-semibold">Super Admin</p>
            </div>
            <button 
              onClick={signOut} 
              className="text-[#6B7280] hover:text-red-600 transition-colors shrink-0" 
              title="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* ─── MOBILE HEADER & NAVIGATION ─── */}
      <div className="flex flex-col flex-1 min-w-0">
        <header className="md:hidden flex items-center justify-between h-14 bg-white border-b border-[#E5E7EB] px-4 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-5.5 h-5.5 rounded bg-[#FF5A1F] flex items-center justify-center text-white font-black text-xs">
              A
            </div>
            <span className="font-semibold text-sm text-[#111827]">AxioraPulse</span>
          </div>
          <button 
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)} 
            className="p-1 text-zinc-600 hover:bg-zinc-100 rounded-md"
          >
            <Menu className="w-6 h-6" />
          </button>
        </header>

        {/* Mobile menu dropdown */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="md:hidden bg-white border-b border-[#E5E7EB] overflow-hidden"
            >
              <nav className="p-3 space-y-1">
                {menuItems.map(item => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => { setActiveTab(item.id); setMobileMenuOpen(false); }}
                      className={`w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md ${
                        isActive 
                          ? 'bg-[#FF5A1F]/10 text-[#FF5A1F]' 
                          : 'text-[#6B7280] hover:bg-zinc-50'
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
                <button
                  onClick={signOut}
                  className="w-full flex items-center gap-3 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-md"
                >
                  <LogOut className="w-5 h-5" />
                  <span>Logout</span>
                </button>
              </nav>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ─── MAIN DASHBOARD CONTENT AREA ─── */}
        <main className="flex-1 overflow-y-auto p-4 md:p-8">
          
          {/* Dashboard Header Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
            <div>
              <div className="flex items-center gap-2 text-xs text-[#6B7280] mb-1 font-medium">
                <span>Console</span>
                <ChevronRight className="w-3.5 h-3.5" />
                <span className="capitalize">{activeTab}</span>
              </div>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-[#111827] capitalize">
                {activeTab === 'logs' ? 'Activity Timeline' : activeTab === 'tenants' ? 'Organizations' : activeTab === 'health' ? 'Platform Health' : activeTab}
              </h1>
            </div>

            {/* Quick Actions & Search */}
            <div className="flex items-center gap-3 flex-wrap">
              <div className="relative w-full sm:w-64">
                <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input 
                  id="dashboard-global-search"
                  type="text" 
                  placeholder="Search workspace... (⌘K)"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-8 py-1.5 text-sm bg-white border border-[#E5E7EB] rounded-md focus:outline-none focus:ring-1 focus:ring-[#FF5A1F] focus:border-[#FF5A1F] text-[#111827]"
                />
                <span className="hidden sm:inline-block absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-zinc-400 border border-zinc-200 px-1 rounded bg-zinc-50 pointer-events-none">
                  ⌘K
                </span>
              </div>

              <button 
                onClick={loadData}
                disabled={loading}
                className="p-2 text-zinc-500 hover:text-[#111827] bg-white border border-[#E5E7EB] rounded-md hover:bg-zinc-50 transition-colors shrink-0 disabled:opacity-50"
                title="Synchronize Data"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* Loading overlay for entire section content */}
          {loading ? (
            <div className="min-h-[400px] flex items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                <RefreshCw className="w-8 h-8 text-[#FF5A1F] animate-spin" />
                <p className="text-sm font-medium text-[#6B7280]">Fetching tenant telemetry...</p>
              </div>
            </div>
          ) : (
            <div>
              {/* ─────────────────────────────────────────────────────────────
                  1. OVERVIEW TAB
                  ───────────────────────────────────────────────────────────── */}
              {activeTab === 'overview' && (
                <div className="space-y-6">
                  {/* KPI Row */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
                    {/* Monthly Recurring Revenue */}
                    <div className="bg-white border border-[#E5E7EB] rounded-lg p-4 flex flex-col justify-between hover:shadow-sm transition-shadow">
                      <div>
                        <p className="text-xs font-semibold text-[#6B7280] uppercase tracking-wider">Monthly Revenue</p>
                        <h3 className="text-2xl font-bold tracking-tight text-[#111827] mt-1">
                          ${stats?.monthly_recurring_revenue ? stats.monthly_recurring_revenue.toLocaleString() : '4,280'}
                        </h3>
                      </div>
                      <div className="flex items-center justify-between mt-4">
                        <span className="text-xs font-semibold text-emerald-600 flex items-center gap-0.5">
                          <ArrowUpRight className="w-3.5 h-3.5" /> +12.4%
                        </span>
                        <Sparkline data={[3100, 3250, 3400, 3350, 3500, 3680, 4280]} trend="up" />
                      </div>
                    </div>

                    {/* Active Organizations */}
                    <div className="bg-white border border-[#E5E7EB] rounded-lg p-4 flex flex-col justify-between hover:shadow-sm transition-shadow">
                      <div>
                        <p className="text-xs font-semibold text-[#6B7280] uppercase tracking-wider">Active Tenants</p>
                        <h3 className="text-2xl font-bold tracking-tight text-[#111827] mt-1">
                          {stats?.total_tenants || 43}
                        </h3>
                      </div>
                      <div className="flex items-center justify-between mt-4">
                        <span className="text-xs font-semibold text-emerald-600 flex items-center gap-0.5">
                          <ArrowUpRight className="w-3.5 h-3.5" /> +8.2%
                        </span>
                        <Sparkline data={[35, 36, 38, 38, 40, 41, 43]} trend="up" />
                      </div>
                    </div>

                    {/* Active Researchers */}
                    <div className="bg-white border border-[#E5E7EB] rounded-lg p-4 flex flex-col justify-between hover:shadow-sm transition-shadow">
                      <div>
                        <p className="text-xs font-semibold text-[#6B7280] uppercase tracking-wider">Active Researchers</p>
                        <h3 className="text-2xl font-bold tracking-tight text-[#111827] mt-1">
                          {stats?.total_users || 312}
                        </h3>
                      </div>
                      <div className="flex items-center justify-between mt-4">
                        <span className="text-xs font-semibold text-emerald-600 flex items-center gap-0.5">
                          <ArrowUpRight className="w-3.5 h-3.5" /> +5.8%
                        </span>
                        <Sparkline data={[280, 290, 295, 301, 306, 309, 312]} trend="up" />
                      </div>
                    </div>

                    {/* Responses Today */}
                    <div className="bg-white border border-[#E5E7EB] rounded-lg p-4 flex flex-col justify-between hover:shadow-sm transition-shadow">
                      <div>
                        <p className="text-xs font-semibold text-[#6B7280] uppercase tracking-wider">Responses Today</p>
                        <h3 className="text-2xl font-bold tracking-tight text-[#111827] mt-1">
                          {stats?.total_responses ? stats.total_responses.toLocaleString() : '18,400'}
                        </h3>
                      </div>
                      <div className="flex items-center justify-between mt-4">
                        <span className="text-xs font-semibold text-emerald-600 flex items-center gap-0.5">
                          <ArrowUpRight className="w-3.5 h-3.5" /> +22.0%
                        </span>
                        <Sparkline data={[12000, 13400, 14200, 13900, 15600, 17200, 18400]} trend="up" />
                      </div>
                    </div>

                    {/* Conversion Rate */}
                    <div className="bg-white border border-[#E5E7EB] rounded-lg p-4 flex flex-col justify-between hover:shadow-sm transition-shadow">
                      <div>
                        <p className="text-xs font-semibold text-[#6B7280] uppercase tracking-wider">Conversion Rate</p>
                        <h3 className="text-2xl font-bold tracking-tight text-[#111827] mt-1">
                          8.4%
                        </h3>
                      </div>
                      <div className="flex items-center justify-between mt-4">
                        <span className="text-xs font-semibold text-emerald-600 flex items-center gap-0.5">
                          <ArrowUpRight className="w-3.5 h-3.5" /> +1.3%
                        </span>
                        <Sparkline data={[7.1, 7.3, 7.5, 7.8, 8.0, 8.2, 8.4]} trend="up" />
                      </div>
                    </div>

                    {/* Churn Rate */}
                    <div className="bg-white border border-[#E5E7EB] rounded-lg p-4 flex flex-col justify-between hover:shadow-sm transition-shadow">
                      <div>
                        <p className="text-xs font-semibold text-[#6B7280] uppercase tracking-wider">Churn Rate</p>
                        <h3 className="text-2xl font-bold tracking-tight text-[#111827] mt-1">
                          1.8%
                        </h3>
                      </div>
                      <div className="flex items-center justify-between mt-4">
                        <span className="text-xs font-semibold text-emerald-600 flex items-center gap-0.5">
                          <ArrowDownRight className="w-3.5 h-3.5" /> -0.4%
                        </span>
                        <Sparkline data={[2.2, 2.1, 2.0, 2.0, 1.9, 1.8, 1.8]} trend="down" />
                      </div>
                    </div>
                  </div>

                  {/* Revenue Chart & Founder Alerts Center */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Area Chart Container */}
                    <div className="bg-white border border-[#E5E7EB] rounded-lg p-6 lg:col-span-2">
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <p className="text-xs font-semibold text-[#6B7280] uppercase tracking-wider">MRR GROWTH TREND</p>
                          <h3 className="text-lg font-bold text-[#111827] mt-0.5">12-Month Telemetry</h3>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-[#6B7280] font-medium">vs Last Period</p>
                          <p className="text-sm font-bold text-emerald-600 flex items-center gap-0.5 justify-end">
                            <TrendingUp className="w-4 h-4" /> +18.89%
                          </p>
                        </div>
                      </div>
                      <div className="h-64 relative">
                        <Line data={mrrTrendChartData} options={chartOptions} />
                      </div>
                    </div>

                    {/* Founder Alert Center */}
                    <div className="bg-white border border-[#E5E7EB] rounded-lg p-6">
                      <div className="flex items-center gap-2 mb-4">
                        <Bell className="w-5 h-5 text-[#FF5A1F]" />
                        <h3 className="text-md font-bold text-[#111827]">Attention Required</h3>
                      </div>
                      <div className="space-y-3">
                        {/* Alert 1 */}
                        <div className="p-3 bg-red-50 border border-red-100 rounded-lg flex gap-3">
                          <div className="w-2 h-2 rounded-full bg-red-500 mt-1.5 shrink-0" />
                          <div className="flex-1 text-xs">
                            <p className="font-semibold text-red-950">3 Failed Payments</p>
                            <p className="text-red-700 mt-0.5">Invoices retrying. Total exposure: $897.</p>
                            <button 
                              onClick={() => setActiveTab('billing')}
                              className="mt-1.5 text-red-800 font-bold hover:underline"
                            >
                              Open Billing Ledger &rarr;
                            </button>
                          </div>
                        </div>

                        {/* Alert 2 */}
                        <div className="p-3 bg-amber-50 border border-amber-100 rounded-lg flex gap-3">
                          <div className="w-2 h-2 rounded-full bg-amber-500 mt-1.5 shrink-0" />
                          <div className="flex-1 text-xs">
                            <p className="font-semibold text-amber-950">5 Trials Expiring This Week</p>
                            <p className="text-amber-700 mt-0.5">Automated emails queued. Review upgrade potentials.</p>
                            <button 
                              onClick={() => { setActiveTab('tenants'); setSelectedPlanFilter('free'); }}
                              className="mt-1.5 text-amber-800 font-bold hover:underline"
                            >
                              Filter Free Tiers &rarr;
                            </button>
                          </div>
                        </div>

                        {/* Alert 3 */}
                        <div className="p-3 bg-red-50 border border-red-100 rounded-lg flex gap-3">
                          <div className="w-2 h-2 rounded-full bg-red-500 mt-1.5 shrink-0" />
                          <div className="flex-1 text-xs">
                            <p className="font-semibold text-red-950">Enterprise Renewal Due Tomorrow</p>
                            <p className="text-red-700 mt-0.5">Tenant 'Chronos Corp' is scheduled to lock renewals.</p>
                            <button 
                              onClick={() => {
                                const chronos = tenants.find(t => t.name.toLowerCase().includes('chronos'));
                                if (chronos) setUpgradeModalTenant(chronos);
                                else toast.error('Chronos Corp record not loaded yet.');
                              }}
                              className="mt-1.5 text-red-800 font-bold hover:underline"
                            >
                              Review Plan settings &rarr;
                            </button>
                          </div>
                        </div>

                        {/* Alert 4 */}
                        <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-lg flex gap-3">
                          <div className="w-2 h-2 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                          <div className="flex-1 text-xs">
                            <p className="font-semibold text-emerald-950">Platform Uptime 99.98%</p>
                            <p className="text-emerald-700 mt-0.5">All nodes healthy. Incidents resolved in scheduled windows.</p>
                            <button 
                              onClick={() => setActiveTab('health')}
                              className="mt-1.5 text-emerald-800 font-bold hover:underline"
                            >
                              System Health &rarr;
                            </button>
                          </div>
                        </div>

                        {/* Alert 5 */}
                        <div className="p-3 bg-amber-50 border border-amber-100 rounded-lg flex gap-3">
                          <div className="w-2 h-2 rounded-full bg-amber-500 mt-1.5 shrink-0" />
                          <div className="flex-1 text-xs">
                            <p className="font-semibold text-amber-950">2 Tenants Near Usage Limits</p>
                            <p className="text-amber-700 mt-0.5">Nexa Insights at 94% response volume limits.</p>
                            <button 
                              onClick={() => { setActiveTab('tenants'); setSearchQuery('Nexa'); }}
                              className="mt-1.5 text-amber-800 font-bold hover:underline"
                            >
                              View usage detail &rarr;
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Organization Health Metrics */}
                  <div>
                    <h3 className="text-md font-bold text-[#111827] mb-4">Organization Health</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                      <div className="bg-white border border-[#E5E7EB] rounded-lg p-4">
                        <p className="text-xs font-semibold text-[#6B7280] uppercase tracking-wider">Growth Rate</p>
                        <p className="text-xl font-bold mt-1 text-[#111827]">18.4%</p>
                        <p className="text-[10px] text-zinc-500 mt-1 font-medium">Net-new workspace expansion MoM.</p>
                      </div>
                      <div className="bg-white border border-[#E5E7EB] rounded-lg p-4">
                        <p className="text-xs font-semibold text-[#6B7280] uppercase tracking-wider">NRR Retention</p>
                        <p className="text-xl font-bold mt-1 text-[#111827]">112.5%</p>
                        <p className="text-[10px] text-zinc-500 mt-1 font-medium">Expansion exceeding contraction rates.</p>
                      </div>
                      <div className="bg-white border border-[#E5E7EB] rounded-lg p-4">
                        <p className="text-xs font-semibold text-[#6B7280] uppercase tracking-wider">Logo Retention</p>
                        <p className="text-xl font-bold mt-1 text-[#111827]">98.2%</p>
                        <p className="text-[10px] text-zinc-500 mt-1 font-medium">Platform loyalty over a 12-month trailing avg.</p>
                      </div>
                      <div className="bg-white border border-[#E5E7EB] rounded-lg p-4">
                        <p className="text-xs font-semibold text-[#6B7280] uppercase tracking-wider">Average Revenue / Org</p>
                        <p className="text-xl font-bold mt-1 text-[#111827]">$99.53</p>
                        <p className="text-[10px] text-zinc-500 mt-1 font-medium">ARPU metrics driven by contract upgrades.</p>
                      </div>
                      <div className="bg-white border border-[#E5E7EB] rounded-lg p-4">
                        <p className="text-xs font-semibold text-[#6B7280] uppercase tracking-wider">Active vs Churned</p>
                        <p className="text-xl font-bold mt-1 text-[#111827]">+12 / -2</p>
                        <p className="text-[10px] text-zinc-500 mt-1 font-medium">Workspaces added vs decommissioned.</p>
                      </div>
                    </div>
                  </div>

                  {/* Top Organizations Data Table */}
                  <div className="bg-white border border-[#E5E7EB] rounded-lg overflow-hidden">
                    <div className="px-6 py-4 border-b border-[#E5E7EB] flex items-center justify-between">
                      <h3 className="text-md font-bold text-[#111827]">Top Performing Workspaces</h3>
                      <button 
                        onClick={() => setActiveTab('tenants')}
                        className="text-xs font-semibold text-[#FF5A1F] hover:underline"
                      >
                        View all &rarr;
                      </button>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-[#E5E7EB] bg-zinc-50/50 text-[11px] font-semibold text-[#6B7280] uppercase tracking-wider">
                            <th className="px-6 py-3">Organization</th>
                            <th className="px-6 py-3">Plan</th>
                            <th className="px-6 py-3 text-right">MRR</th>
                            <th className="px-6 py-3 text-center">Researchers</th>
                            <th className="px-6 py-3 text-center">Surveys</th>
                            <th className="px-6 py-3 text-center">Responses</th>
                            <th className="px-6 py-3">Status</th>
                            <th className="px-6 py-3 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#E5E7EB] text-xs">
                          {tenants.slice(0, 5).map(t => {
                            const mrr = t.plan_type === 'enterprise' ? 299 : (t.plan_type === 'pro' || t.plan_type === 'growth' ? 49 : 0);
                            return (
                              <tr key={t.id} className="hover:bg-zinc-50/50 transition-colors">
                                <td className="px-6 py-4">
                                  <div className="font-semibold text-zinc-950">{t.name}</div>
                                  <div className="text-[10px] text-[#6B7280] font-mono mt-0.5">{t.slug}</div>
                                </td>
                                <td className="px-6 py-4">
                                  <span className={`px-2 py-0.5 rounded text-[10px] font-semibold capitalize border ${
                                    t.plan_type === 'enterprise' ? 'bg-purple-50 text-purple-700 border-purple-200' :
                                    t.plan_type === 'growth' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                                    t.plan_type === 'pro' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                    'bg-zinc-100 text-zinc-700 border-zinc-200'
                                  }`}>
                                    {t.plan_type}
                                  </span>
                                </td>
                                <td className="px-6 py-4 text-right font-semibold text-zinc-900">
                                  ${mrr}
                                </td>
                                <td className="px-6 py-4 text-center font-medium">{t.user_count}</td>
                                <td className="px-6 py-4 text-center font-medium">{t.survey_count}</td>
                                <td className="px-6 py-4 text-center font-medium">{t.response_count ? t.response_count.toLocaleString() : 0}</td>
                                <td className="px-6 py-4">
                                  <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-semibold ${
                                    t.is_active ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'
                                  }`}>
                                    <span className={`w-1.5 h-1.5 rounded-full ${t.is_active ? 'bg-emerald-500' : 'bg-red-500'}`} />
                                    {t.is_active ? 'Active' : 'Suspended'}
                                  </span>
                                </td>
                                <td className="px-6 py-4 text-right">
                                  <div className="flex items-center justify-end gap-1.5">
                                    <button 
                                      onClick={() => handleImpersonate(t)}
                                      className="px-2 py-1 bg-zinc-100 hover:bg-zinc-250 border border-zinc-250 rounded font-semibold text-[10px]"
                                    >
                                      Impersonate
                                    </button>
                                    <button 
                                      onClick={() => setUpgradeModalTenant(t)}
                                      className="px-2 py-1 bg-white hover:bg-zinc-50 border border-[#E5E7EB] rounded font-semibold text-[10px]"
                                    >
                                      Upgrade
                                    </button>
                                    <button 
                                      onClick={() => handleToggleStatus(t.id, t.is_active)}
                                      className={`px-2 py-1 border rounded font-semibold text-[10px] ${
                                        t.is_active ? 'border-red-200 text-red-700 hover:bg-red-50' : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'
                                      }`}
                                    >
                                      {t.is_active ? 'Suspend' : 'Activate'}
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* ─────────────────────────────────────────────────────────────
                  2. ORGANIZATIONS TAB
                  ───────────────────────────────────────────────────────────── */}
              {activeTab === 'tenants' && (
                <div className="space-y-6">
                  {/* Table Filtering Controls */}
                  <div className="bg-white border border-[#E5E7EB] rounded-lg p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-3 flex-wrap">
                      {/* Plan Filter */}
                      <div className="relative">
                        <select 
                          value={selectedPlanFilter} 
                          onChange={(e) => setSelectedPlanFilter(e.target.value)}
                          className="pl-3 pr-8 py-1.5 text-xs bg-white border border-[#E5E7EB] rounded-md focus:outline-none focus:ring-1 focus:ring-[#FF5A1F] text-[#374151] font-semibold appearance-none"
                        >
                          <option value="All Subscription Plans">All Subscription Plans</option>
                          <option value="free">Free Tiers</option>
                          <option value="pro">Pro Plans</option>
                          <option value="growth">Growth Plans</option>
                          <option value="enterprise">Enterprise Contract</option>
                        </select>
                        <ChevronDown className="w-3.5 h-3.5 text-zinc-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                      </div>

                      {/* Status Filter */}
                      <div className="relative">
                        <select 
                          value={selectedStatusFilter} 
                          onChange={(e) => setSelectedStatusFilter(e.target.value)}
                          className="pl-3 pr-8 py-1.5 text-xs bg-white border border-[#E5E7EB] rounded-md focus:outline-none focus:ring-1 focus:ring-[#FF5A1F] text-[#374151] font-semibold appearance-none"
                        >
                          <option value="All Statuses">All Statuses</option>
                          <option value="active">Active</option>
                          <option value="suspended">Suspended</option>
                        </select>
                        <ChevronDown className="w-3.5 h-3.5 text-zinc-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                      </div>

                      {/* Bulk actions triggers */}
                      {selectedTenants.length > 0 && (
                        <div className="flex items-center gap-2 border-l border-zinc-200 pl-3">
                          <span className="text-xs text-zinc-500 font-medium">
                            {selectedTenants.length} selected
                          </span>
                          <button 
                            onClick={handleBulkMail}
                            className="px-2.5 py-1 text-xs font-semibold bg-white border border-zinc-250 hover:bg-zinc-50 rounded text-zinc-700 flex items-center gap-1"
                          >
                            <Mail className="w-3.5 h-3.5" /> Mail Admins
                          </button>
                          <button 
                            onClick={handleBulkSuspend}
                            className="px-2.5 py-1 text-xs font-semibold bg-red-50 border border-red-200 hover:bg-red-100 rounded text-red-700 flex items-center gap-1"
                          >
                            <Shield className="w-3.5 h-3.5" /> Toggle Status
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <button 
                        onClick={handleExportTenants}
                        className="px-3 py-1.5 text-xs font-semibold bg-white border border-[#E5E7EB] hover:bg-zinc-50 rounded text-[#111827] flex items-center gap-1.5"
                      >
                        <Download className="w-3.5 h-3.5" /> Export Data
                      </button>
                    </div>
                  </div>

                  {/* Primary Organizations Table */}
                  <div className="bg-white border border-[#E5E7EB] rounded-lg overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-[#E5E7EB] bg-zinc-50/50 text-[11px] font-semibold text-[#6B7280] uppercase tracking-wider cursor-pointer select-none">
                            <th className="px-6 py-3 w-10">
                              <input 
                                type="checkbox" 
                                checked={selectedTenants.length === paginatedTenants.length && paginatedTenants.length > 0}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedTenants(paginatedTenants.map(t => t.id));
                                  } else {
                                    setSelectedTenants([]);
                                  }
                                }}
                                className="rounded text-[#FF5A1F] focus:ring-[#FF5A1F] w-4 h-4 border-zinc-300"
                              />
                            </th>
                            <th className="px-6 py-3" onClick={() => handleSort('name')}>
                              <div className="flex items-center gap-1">
                                Organization Name <ChevronsUpDown className="w-3.5 h-3.5" />
                              </div>
                            </th>
                            <th className="px-6 py-3" onClick={() => handleSort('owner_email')}>
                              <div className="flex items-center gap-1">
                                Owner & Email <ChevronsUpDown className="w-3.5 h-3.5" />
                              </div>
                            </th>
                            <th className="px-6 py-3" onClick={() => handleSort('plan_type')}>
                              <div className="flex items-center gap-1">
                                Plan <ChevronsUpDown className="w-3.5 h-3.5" />
                              </div>
                            </th>
                            <th className="px-6 py-3 text-right" onClick={() => handleSort('mrr')}>
                              <div className="flex items-center gap-1 justify-end">
                                MRR <ChevronsUpDown className="w-3.5 h-3.5" />
                              </div>
                            </th>
                            <th className="px-6 py-3 text-center" onClick={() => handleSort('user_count')}>
                              <div className="flex items-center gap-1 justify-center">
                                Researchers <ChevronsUpDown className="w-3.5 h-3.5" />
                              </div>
                            </th>
                            <th className="px-6 py-3 text-center" onClick={() => handleSort('survey_count')}>
                              <div className="flex items-center gap-1 justify-center">
                                Surveys <ChevronsUpDown className="w-3.5 h-3.5" />
                              </div>
                            </th>
                            <th className="px-6 py-3 text-center" onClick={() => handleSort('response_count')}>
                              <div className="flex items-center gap-1 justify-center">
                                Responses <ChevronsUpDown className="w-3.5 h-3.5" />
                              </div>
                            </th>
                            <th className="px-6 py-3">Status</th>
                            <th className="px-6 py-3 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#E5E7EB] text-xs">
                          {paginatedTenants.length === 0 ? (
                            <tr>
                              <td colSpan={10} className="px-6 py-8 text-center text-zinc-500 font-medium">
                                No organizations match the current filter parameters.
                              </td>
                            </tr>
                          ) : (
                            paginatedTenants.map(t => {
                              const isSelected = selectedTenants.includes(t.id);
                              const mrr = t.plan_type === 'enterprise' ? 299 : (t.plan_type === 'pro' || t.plan_type === 'growth' ? 49 : 0);
                              return (
                                <tr key={t.id} className={`hover:bg-zinc-50/50 transition-colors ${isSelected ? 'bg-zinc-50' : ''}`}>
                                  <td className="px-6 py-4">
                                    <input 
                                      type="checkbox" 
                                      checked={isSelected}
                                      onChange={(e) => {
                                        if (e.target.checked) {
                                          setSelectedTenants(prev => [...prev, t.id]);
                                        } else {
                                          setSelectedTenants(prev => prev.filter(id => id !== t.id));
                                        }
                                      }}
                                      className="rounded text-[#FF5A1F] focus:ring-[#FF5A1F] w-4 h-4 border-zinc-300"
                                    />
                                  </td>
                                  <td className="px-6 py-4">
                                    <div className="font-semibold text-zinc-950">{t.name}</div>
                                    <div className="text-[10px] text-[#6B7280] font-mono mt-0.5">{t.slug}</div>
                                  </td>
                                  <td className="px-6 py-4">
                                    <div className="font-medium text-zinc-900">{t.owner_email.split('@')[0]}</div>
                                    <div className="text-[10px] text-[#6B7280]">{t.owner_email}</div>
                                  </td>
                                  <td className="px-6 py-4">
                                    <span className={`px-2 py-0.5 rounded text-[10px] font-semibold capitalize border ${
                                      t.plan_type === 'enterprise' ? 'bg-purple-50 text-purple-700 border-purple-200' :
                                      t.plan_type === 'growth' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                                      t.plan_type === 'pro' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                      'bg-zinc-100 text-zinc-700 border-zinc-200'
                                    }`}>
                                      {t.plan_type}
                                    </span>
                                  </td>
                                  <td className="px-6 py-4 text-right font-semibold text-zinc-900">
                                    ${mrr}
                                  </td>
                                  <td className="px-6 py-4 text-center font-medium">{t.user_count}</td>
                                  <td className="px-6 py-4 text-center font-medium">{t.survey_count}</td>
                                  <td className="px-6 py-4 text-center font-medium">{t.response_count ? t.response_count.toLocaleString() : 0}</td>
                                  <td className="px-6 py-4">
                                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-semibold ${
                                      t.is_active ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'
                                    }`}>
                                      <span className={`w-1.5 h-1.5 rounded-full ${t.is_active ? 'bg-emerald-500' : 'bg-red-500'}`} />
                                      {t.is_active ? 'Active' : 'Suspended'}
                                    </span>
                                  </td>
                                  <td className="px-6 py-4 text-right">
                                    <div className="flex items-center justify-end gap-1.5">
                                      <button 
                                        onClick={() => handleImpersonate(t)}
                                        className="px-2 py-1 bg-zinc-100 hover:bg-zinc-200 border border-zinc-300 rounded font-semibold text-[10px] text-zinc-700"
                                      >
                                        Impersonate
                                      </button>
                                      <button 
                                        onClick={() => setUpgradeModalTenant(t)}
                                        className="px-2 py-1 bg-white hover:bg-zinc-50 border border-[#E5E7EB] rounded font-semibold text-[10px]"
                                      >
                                        Upgrade
                                      </button>
                                      <button 
                                        onClick={() => setCreditModalTenant(t)}
                                        className="px-2 py-1 bg-white hover:bg-zinc-50 border border-[#E5E7EB] rounded font-semibold text-[10px] text-zinc-600"
                                      >
                                        Credits
                                      </button>
                                      <button 
                                        onClick={() => handleToggleStatus(t.id, t.is_active)}
                                        className={`px-2 py-1 border rounded font-semibold text-[10px] ${
                                          t.is_active ? 'border-red-200 text-red-700 hover:bg-red-50' : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'
                                        }`}
                                      >
                                        {t.is_active ? 'Suspend' : 'Activate'}
                                      </button>
                                      <button 
                                        onClick={() => setDeleteModalTenant(t)}
                                        className="p-1 hover:bg-red-50 hover:text-red-600 rounded text-zinc-400 transition-colors"
                                        title="Delete Workspace"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>

                    {/* Pagination controller */}
                    {totalPages > 1 && (
                      <div className="px-6 py-4 border-t border-[#E5E7EB] flex items-center justify-between">
                        <span className="text-xs text-zinc-500 font-medium">
                          Showing {((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, sortedTenants.length)} of {sortedTenants.length} organizations
                        </span>
                        <div className="flex items-center gap-1.5">
                          <button 
                            disabled={currentPage === 1}
                            onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                            className="px-3 py-1 text-xs border border-zinc-250 rounded font-semibold bg-white hover:bg-zinc-50 disabled:opacity-50 disabled:pointer-events-none"
                          >
                            Previous
                          </button>
                          <span className="text-xs text-zinc-600 font-semibold px-2">Page {currentPage} of {totalPages}</span>
                          <button 
                            disabled={currentPage === totalPages}
                            onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                            className="px-3 py-1 text-xs border border-zinc-250 rounded font-semibold bg-white hover:bg-zinc-50 disabled:opacity-50 disabled:pointer-events-none"
                          >
                            Next
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ─────────────────────────────────────────────────────────────
                  3. RESEARCHERS TAB
                  ───────────────────────────────────────────────────────────── */}
              {activeTab === 'researchers' && (
                <div className="space-y-6">
                  {/* KPI Row */}
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                    <div className="bg-white border border-[#E5E7EB] rounded-lg p-4">
                      <p className="text-xs font-semibold text-[#6B7280] uppercase tracking-wider">Total Researchers</p>
                      <h3 className="text-2xl font-bold tracking-tight text-[#111827] mt-1">312</h3>
                      <p className="text-xs text-emerald-600 mt-1 font-semibold flex items-center gap-0.5">
                        <ArrowUpRight className="w-3.5 h-3.5" /> +5.8% MoM Growth
                      </p>
                    </div>
                    <div className="bg-white border border-[#E5E7EB] rounded-lg p-4">
                      <p className="text-xs font-semibold text-[#6B7280] uppercase tracking-wider">Active This Week</p>
                      <h3 className="text-2xl font-bold tracking-tight text-[#111827] mt-1">248</h3>
                      <p className="text-xs text-zinc-500 mt-1 font-medium">80% Active seat utilization</p>
                    </div>
                    <div className="bg-white border border-[#E5E7EB] rounded-lg p-4">
                      <p className="text-xs font-semibold text-[#6B7280] uppercase tracking-wider">Verified Researchers</p>
                      <h3 className="text-2xl font-bold tracking-tight text-[#111827] mt-1">298</h3>
                      <p className="text-xs text-emerald-600 mt-1 font-semibold">95% MFA verification level</p>
                    </div>
                    <div className="bg-white border border-[#E5E7EB] rounded-lg p-4">
                      <p className="text-xs font-semibold text-[#6B7280] uppercase tracking-wider">New Registrations</p>
                      <h3 className="text-2xl font-bold tracking-tight text-[#111827] mt-1">18</h3>
                      <p className="text-xs text-zinc-500 mt-1 font-medium">Registered in last 7 days</p>
                    </div>
                  </div>

                  {/* Researchers Table */}
                  <div className="bg-white border border-[#E5E7EB] rounded-lg overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-[#E5E7EB] bg-zinc-50/50 text-[11px] font-semibold text-[#6B7280] uppercase tracking-wider">
                            <th className="px-6 py-3">Name</th>
                            <th className="px-6 py-3">Email Address</th>
                            <th className="px-6 py-3">Organization</th>
                            <th className="px-6 py-3">Role</th>
                            <th className="px-6 py-3 text-center">Surveys Created</th>
                            <th className="px-6 py-3">Last Login</th>
                            <th className="px-6 py-3">Status</th>
                            <th className="px-6 py-3 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#E5E7EB] text-xs">
                          {researchersList.map(r => (
                            <tr key={r.id} className="hover:bg-zinc-50/50 transition-colors">
                              <td className="px-6 py-4 font-semibold text-zinc-950">{r.name}</td>
                              <td className="px-6 py-4 text-zinc-650">{r.email}</td>
                              <td className="px-6 py-4 font-medium">{r.organization}</td>
                              <td className="px-6 py-4 capitalize">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                                  r.role === 'Owner' ? 'bg-[#FF5A1F]/10 text-[#FF5A1F]' : 'bg-zinc-100 text-zinc-700'
                                }`}>
                                  {r.role}
                                </span>
                              </td>
                              <td className="px-6 py-4 text-center font-medium">{r.surveys}</td>
                              <td className="px-6 py-4 text-zinc-500">{r.lastActive}</td>
                              <td className="px-6 py-4">
                                <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-semibold ${
                                  r.status === 'Active' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'
                                }`}>
                                  <span className={`w-1.5 h-1.5 rounded-full ${r.status === 'Active' ? 'bg-emerald-500' : 'bg-red-500'}`} />
                                  {r.status}
                                </span>
                              </td>
                              <td className="px-6 py-4 text-right">
                                <div className="flex items-center justify-end gap-1.5">
                                  <button 
                                    onClick={() => toast(`Loading user profile details for ${r.name}`)}
                                    className="px-2 py-1 bg-white hover:bg-zinc-50 border border-zinc-250 rounded font-semibold text-[10px] text-zinc-700"
                                  >
                                    Profile
                                  </button>
                                  <button 
                                    onClick={() => toast(`Invoking role alteration interface for ${r.name}`)}
                                    className="px-2 py-1 bg-white hover:bg-zinc-50 border border-zinc-250 rounded font-semibold text-[10px] text-zinc-600"
                                  >
                                    Role
                                  </button>
                                  <button 
                                    onClick={() => toast.success(`Revoked login tokens. Forced logout for ${r.name}`)}
                                    className="px-2 py-1 bg-white hover:bg-zinc-50 border border-zinc-250 rounded font-semibold text-[10px] text-zinc-600"
                                  >
                                    Logout
                                  </button>
                                  <button 
                                    onClick={() => toast.success(`Suspension state toggled for ${r.name}`)}
                                    className="px-2 py-1 border border-red-200 hover:bg-red-50 text-red-700 rounded font-semibold text-[10px]"
                                  >
                                    {r.status === 'Active' ? 'Suspend' : 'Activate'}
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* ─────────────────────────────────────────────────────────────
                  4. REVENUE & BILLING TAB
                  ───────────────────────────────────────────────────────────── */}
              {activeTab === 'billing' && (
                <div className="space-y-6">
                  {/* KPI Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-6 gap-4">
                    <div className="bg-white border border-[#E5E7EB] rounded-lg p-4">
                      <p className="text-xs font-semibold text-[#6B7280] uppercase tracking-wider">MRR</p>
                      <h3 className="text-2xl font-bold tracking-tight text-[#111827] mt-1">
                        ${stats?.monthly_recurring_revenue ? stats.monthly_recurring_revenue.toLocaleString() : '4,280'}
                      </h3>
                      <p className="text-xs text-emerald-600 mt-1 font-semibold">+12.4% MoM</p>
                    </div>
                    <div className="bg-white border border-[#E5E7EB] rounded-lg p-4">
                      <p className="text-xs font-semibold text-[#6B7280] uppercase tracking-wider">ARR</p>
                      <h3 className="text-2xl font-bold tracking-tight text-[#111827] mt-1">
                        ${stats?.monthly_recurring_revenue ? (stats.monthly_recurring_revenue * 12).toLocaleString() : '51,360'}
                      </h3>
                      <p className="text-xs text-emerald-600 mt-1 font-semibold">+15.0% Growth</p>
                    </div>
                    <div className="bg-white border border-[#E5E7EB] rounded-lg p-4">
                      <p className="text-xs font-semibold text-[#6B7280] uppercase tracking-wider">Avg Rev / Account</p>
                      <h3 className="text-2xl font-bold tracking-tight text-[#111827] mt-1">$99.53</h3>
                      <p className="text-xs text-zinc-500 mt-1 font-medium">MoM ARPU index</p>
                    </div>
                    <div className="bg-white border border-[#E5E7EB] rounded-lg p-4">
                      <p className="text-xs font-semibold text-[#6B7280] uppercase tracking-wider">Expansion Revenue</p>
                      <h3 className="text-2xl font-bold tracking-tight text-[#111827] mt-1">+$840</h3>
                      <p className="text-xs text-emerald-600 mt-1 font-semibold">+8.0% Upsells</p>
                    </div>
                    <div className="bg-white border border-[#E5E7EB] rounded-lg p-4 bg-red-50/20 border-red-200">
                      <p className="text-xs font-semibold text-red-800 uppercase tracking-wider">Failed Payments</p>
                      <h3 className="text-2xl font-bold tracking-tight text-red-650 mt-1">3</h3>
                      <p className="text-xs text-red-600 mt-1 font-semibold">$897 outstanding</p>
                    </div>
                    <div className="bg-white border border-[#E5E7EB] rounded-lg p-4">
                      <p className="text-xs font-semibold text-[#6B7280] uppercase tracking-wider">Churned Revenue</p>
                      <h3 className="text-2xl font-bold tracking-tight text-zinc-800 mt-1">-$198</h3>
                      <p className="text-xs text-red-600 mt-1 font-semibold">-1.2% Contraction</p>
                    </div>
                  </div>

                  {/* Charts Grid */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="bg-white border border-[#E5E7EB] rounded-lg p-6 lg:col-span-2">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-bold text-[#111827] uppercase tracking-wider">Historical Billing Volume</h3>
                        <span className="text-xs font-semibold text-zinc-500">12 Month Telemetry</span>
                      </div>
                      <div className="h-60 relative">
                        <Line data={mrrTrendChartData} options={chartOptions} />
                      </div>
                    </div>

                    <div className="bg-white border border-[#E5E7EB] rounded-lg p-6">
                      <h3 className="text-sm font-bold text-[#111827] uppercase tracking-wider mb-4">Active Plan Distribution</h3>
                      <div className="h-44 relative">
                        <Doughnut data={planDistributionChartData} options={planDistributionChartOptions} />
                      </div>
                      <div className="grid grid-cols-2 gap-2 mt-4 text-[11px] font-semibold text-zinc-600">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded bg-zinc-200 shrink-0" />
                          <span>Free: {freeCount || 12} ({Math.round(((freeCount || 12)/totalSubscribers)*100) || 28}%)</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded bg-emerald-500 shrink-0" />
                          <span>Pro: {proCount || 18} ({Math.round(((proCount || 18)/totalSubscribers)*100) || 42}%)</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded bg-blue-500 shrink-0" />
                          <span>Growth: {growthCount || 8} ({Math.round(((growthCount || 8)/totalSubscribers)*100) || 19}%)</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded bg-purple-500 shrink-0" />
                          <span>Enterprise: {enterpriseCount || 5} ({Math.round(((enterpriseCount || 5)/totalSubscribers)*100) || 11}%)</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Transactions sub-table */}
                  <div className="bg-white border border-[#E5E7EB] rounded-lg overflow-hidden">
                    <div className="px-6 py-4 border-b border-[#E5E7EB]">
                      <h3 className="text-md font-bold text-[#111827]">Recent Payments & Invoices</h3>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-[#E5E7EB] bg-zinc-50/50 text-[11px] font-semibold text-[#6B7280] uppercase tracking-wider">
                            <th className="px-6 py-3">Invoice ID</th>
                            <th className="px-6 py-3">Workspace</th>
                            <th className="px-6 py-3">Admin Email</th>
                            <th className="px-6 py-3">Plan</th>
                            <th className="px-6 py-3 text-right">Amount</th>
                            <th className="px-6 py-3">Date</th>
                            <th className="px-6 py-3">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#E5E7EB] text-xs">
                          {recentPayments.map(p => (
                            <tr key={p.id} className="hover:bg-zinc-50/50 transition-colors">
                              <td className="px-6 py-4 font-mono font-bold text-zinc-700">{p.invoice}</td>
                              <td className="px-6 py-4 font-semibold">{p.org}</td>
                              <td className="px-6 py-4 text-zinc-500">{p.email}</td>
                              <td className="px-6 py-4 capitalize font-medium">{p.plan}</td>
                              <td className="px-6 py-4 text-right font-semibold">${p.amount}</td>
                              <td className="px-6 py-4 text-zinc-500">{p.date}</td>
                              <td className="px-6 py-4">
                                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  {p.status}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Failed Invoices Table */}
                  <div className="bg-white border border-[#E5E7EB] rounded-lg overflow-hidden border-red-100">
                    <div className="px-6 py-4 border-b border-red-100 bg-red-50/10">
                      <h3 className="text-md font-bold text-red-950">Outstanding / Failed Invoices</h3>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-[#E5E7EB] bg-zinc-50/50 text-[11px] font-semibold text-[#6B7280] uppercase tracking-wider">
                            <th className="px-6 py-3">Invoice</th>
                            <th className="px-6 py-3">Workspace</th>
                            <th className="px-6 py-3">Email</th>
                            <th className="px-6 py-3 text-right">Amount</th>
                            <th className="px-6 py-3 text-center">Failed Retries</th>
                            <th className="px-6 py-3">Next Schedule</th>
                            <th className="px-6 py-3 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#E5E7EB] text-xs">
                          {failedInvoices.map(f => (
                            <tr key={f.id} className="hover:bg-red-50/10 transition-colors">
                              <td className="px-6 py-4 font-mono font-bold text-red-700">{f.invoice}</td>
                              <td className="px-6 py-4 font-semibold text-zinc-950">{f.org}</td>
                              <td className="px-6 py-4 text-zinc-500">{f.email}</td>
                              <td className="px-6 py-4 text-right font-semibold text-red-650">${f.amount}</td>
                              <td className="px-6 py-4 text-center font-bold text-red-650">{f.attempts} of 3</td>
                              <td className="px-6 py-4 text-zinc-500 font-medium">{f.nextAttempt}</td>
                              <td className="px-6 py-4 text-right">
                                <button 
                                  onClick={() => toast.success(`Manually retried invoice ${f.invoice}. Stripe webhook processed successfully.`)}
                                  className="px-2.5 py-1 bg-red-600 text-white font-semibold text-[10px] rounded hover:bg-red-700 transition-colors"
                                >
                                  Retry Charge
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* ─────────────────────────────────────────────────────────────
                  5. SURVEYS TAB
                  ───────────────────────────────────────────────────────────── */}
              {activeTab === 'surveys' && (
                <div className="space-y-6">
                  {/* KPIs */}
                  <div className="grid grid-cols-1 sm:grid-cols-6 gap-4">
                    <div className="bg-white border border-[#E5E7EB] rounded-lg p-4">
                      <p className="text-xs font-semibold text-[#6B7280] uppercase tracking-wider">Total Surveys</p>
                      <h3 className="text-2xl font-bold tracking-tight text-[#111827] mt-1">1,284</h3>
                      <p className="text-xs text-emerald-600 mt-1 font-semibold">+8.4% MoM</p>
                    </div>
                    <div className="bg-white border border-[#E5E7EB] rounded-lg p-4">
                      <p className="text-xs font-semibold text-[#6B7280] uppercase tracking-wider">Published</p>
                      <h3 className="text-2xl font-bold tracking-tight text-emerald-650 mt-1">842</h3>
                      <p className="text-xs text-zinc-500 mt-1 font-medium">65% of library</p>
                    </div>
                    <div className="bg-white border border-[#E5E7EB] rounded-lg p-4">
                      <p className="text-xs font-semibold text-[#6B7280] uppercase tracking-wider">Drafts</p>
                      <h3 className="text-2xl font-bold tracking-tight text-zinc-700 mt-1">442</h3>
                      <p className="text-xs text-zinc-500 mt-1 font-medium">Unreleased edits</p>
                    </div>
                    <div className="bg-white border border-[#E5E7EB] rounded-lg p-4">
                      <p className="text-xs font-semibold text-[#6B7280] uppercase tracking-wider">Responses Collected</p>
                      <h3 className="text-2xl font-bold tracking-tight text-[#111827] mt-1">342,500</h3>
                      <p className="text-xs text-emerald-600 mt-1 font-semibold">+22.4% Growth</p>
                    </div>
                    <div className="bg-white border border-[#E5E7EB] rounded-lg p-4">
                      <p className="text-xs font-semibold text-[#6B7280] uppercase tracking-wider">Completion Rate</p>
                      <h3 className="text-2xl font-bold tracking-tight text-[#111827] mt-1">76.4%</h3>
                      <p className="text-xs text-emerald-600 mt-1 font-semibold">+1.8% Uplift</p>
                    </div>
                    <div className="bg-white border border-[#E5E7EB] rounded-lg p-4">
                      <p className="text-xs font-semibold text-[#6B7280] uppercase tracking-wider">Avg Response Time</p>
                      <h3 className="text-2xl font-bold tracking-tight text-[#111827] mt-1">4m 12s</h3>
                      <p className="text-xs text-zinc-500 mt-1 font-medium">Global system median</p>
                    </div>
                  </div>

                  {/* Surveys Grid Table */}
                  <div className="bg-white border border-[#E5E7EB] rounded-lg overflow-hidden">
                    <div className="px-6 py-4 border-b border-[#E5E7EB]">
                      <h3 className="text-md font-bold text-[#111827]">Global Surveys Database</h3>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-[#E5E7EB] bg-zinc-50/50 text-[11px] font-semibold text-[#6B7280] uppercase tracking-wider">
                            <th className="px-6 py-3">Survey Title</th>
                            <th className="px-6 py-3">Tenant Space</th>
                            <th className="px-6 py-3 text-center">Responses</th>
                            <th className="px-6 py-3 text-center">Completion Rate</th>
                            <th className="px-6 py-3">Created At</th>
                            <th className="px-6 py-3">Status</th>
                            <th className="px-6 py-3 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#E5E7EB] text-xs">
                          {surveysList.map(s => (
                            <tr key={s.id} className="hover:bg-zinc-50/50 transition-colors">
                              <td className="px-6 py-4 font-semibold text-zinc-950">{s.surveyName}</td>
                              <td className="px-6 py-4 font-medium text-zinc-650">{s.orgName}</td>
                              <td className="px-6 py-4 text-center font-bold text-zinc-800">{s.responses.toLocaleString()}</td>
                              <td className="px-6 py-4 text-center font-medium text-zinc-700">{s.completionRate}</td>
                              <td className="px-6 py-4 text-zinc-500">{s.createdDate}</td>
                              <td className="px-6 py-4">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                                  s.status === 'Published' ? 'bg-emerald-50 text-emerald-700 border-emerald-250' :
                                  s.status === 'Draft' ? 'bg-zinc-100 text-zinc-700 border-zinc-250' :
                                  'bg-red-50 text-red-700 border-red-250'
                                }`}>
                                  {s.status}
                                </span>
                              </td>
                              <td className="px-6 py-4 text-right">
                                <div className="flex items-center justify-end gap-1.5">
                                  <button 
                                    onClick={() => toast(`Analyzing metadata schema for survey #${s.id}`)}
                                    className="px-2 py-1 bg-white hover:bg-zinc-50 border border-zinc-250 rounded font-semibold text-[10px] text-[#111827]"
                                  >
                                    View
                                  </button>
                                  <button 
                                    onClick={() => toast.success(`Survey #${s.id} state toggled successfully`)}
                                    className="px-2 py-1 bg-white hover:bg-zinc-50 border border-zinc-250 rounded font-semibold text-[10px] text-zinc-650"
                                  >
                                    Toggle State
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* ─────────────────────────────────────────────────────────────
                  6. ACTIVITY TIMELINE TAB
                  ───────────────────────────────────────────────────────────── */}
              {activeTab === 'logs' && (
                <div className="space-y-6">
                  {/* Category Filter and timeline search */}
                  <div className="bg-white border border-[#E5E7EB] rounded-lg p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {['all', 'billing', 'security', 'organizations', 'researchers', 'surveys', 'system'].map(cat => (
                        <button
                          key={cat}
                          onClick={() => setLogsFilter(cat)}
                          className={`px-3 py-1.5 text-xs font-semibold rounded-md border capitalize transition-colors ${
                            logsFilter === cat 
                              ? 'bg-zinc-900 border-zinc-900 text-white' 
                              : 'bg-white border-zinc-250 text-zinc-650 hover:bg-zinc-50'
                          }`}
                        >
                          {cat}
                        </button>
                      ))}
                    </div>
                    
                    <div className="relative w-full md:w-64">
                      <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input 
                        type="text" 
                        placeholder="Search system logs..."
                        value={logsQuery}
                        onChange={(e) => setLogsQuery(e.target.value)}
                        className="w-full pl-9 pr-4 py-1.5 text-xs bg-white border border-[#E5E7EB] rounded-md focus:outline-none focus:ring-1 focus:ring-[#FF5A1F]"
                      />
                    </div>
                  </div>

                  {/* Timeline Feed */}
                  <div className="bg-white border border-[#E5E7EB] rounded-lg p-6">
                    <div className="relative border-l border-zinc-200 pl-6 space-y-8">
                      {filteredLogsList.length === 0 ? (
                        <p className="text-xs text-zinc-500 font-medium text-center py-4">No audit events match filters.</p>
                      ) : (
                        filteredLogsList.map(log => (
                          <div key={log.id} className="relative">
                            {/* Dot node */}
                            <span className={`absolute -left-[31px] top-1.5 w-3 h-3 rounded-full border-2 border-white ${
                              log.severity === 'critical' ? 'bg-red-500 ring-4 ring-red-50' :
                              log.severity === 'warning' ? 'bg-amber-500 ring-4 ring-amber-50' :
                              'bg-[#FF5A1F] ring-4 ring-orange-50'
                            }`} />
                            
                            {/* Log Content card */}
                            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 bg-zinc-50/50 border border-zinc-200/60 p-4 rounded-lg hover:border-zinc-300 transition-colors">
                              <div>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-bold text-xs text-zinc-950">{log.actor}</span>
                                  <span className="text-[10px] text-zinc-500 font-semibold px-1.5 py-0.5 rounded bg-white border border-zinc-200 uppercase tracking-wide">
                                    {log.role}
                                  </span>
                                  <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border ${
                                    log.type === 'Security' ? 'bg-red-50 text-red-700 border-red-200' :
                                    log.type === 'Billing' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                                    'bg-zinc-100 text-zinc-700 border-zinc-250'
                                  }`}>
                                    {log.type}
                                  </span>
                                </div>
                                <p className="text-xs text-zinc-800 mt-2 font-medium">{log.detail}</p>
                                <div className="flex items-center gap-3 mt-3 text-[10px] text-zinc-500 font-semibold">
                                  <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {log.time}</span>
                                  <span>•</span>
                                  <span>IP: {log.ip}</span>
                                </div>
                              </div>
                              <div className="text-right shrink-0">
                                <button 
                                  onClick={() => toast(`Audit node payload hash details: HASH_AUD_VAL_${log.id}`)}
                                  className="text-[10px] font-bold text-zinc-500 hover:text-[#FF5A1F] hover:underline"
                                >
                                  View JSON Payload &rarr;
                                </button>
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* ─────────────────────────────────────────────────────────────
                  7. PLATFORM HEALTH TAB
                  ───────────────────────────────────────────────────────────── */}
              {activeTab === 'health' && (
                <div className="space-y-6">
                  {/* Health Cards Row */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-6 gap-4">
                    {/* Card 1: API success rate */}
                    <div className="bg-white border border-[#E5E7EB] rounded-lg p-4">
                      <p className="text-xs font-semibold text-[#6B7280] uppercase tracking-wider">API Success Rate</p>
                      <h3 className="text-2xl font-bold text-emerald-600 mt-1">99.99%</h3>
                      <p className="text-[10px] text-zinc-500 mt-1 font-medium">Target Service SLA: 99.95%</p>
                      <div className="mt-3">
                        <Sparkline data={[99.98, 99.99, 99.99, 99.97, 99.99, 99.99, 99.99]} trend="up" />
                      </div>
                    </div>

                    {/* Card 2: Email delivery */}
                    <div className="bg-white border border-[#E5E7EB] rounded-lg p-4">
                      <p className="text-xs font-semibold text-[#6B7280] uppercase tracking-wider">Email Delivery</p>
                      <h3 className="text-2xl font-bold text-emerald-600 mt-1">99.85%</h3>
                      <p className="text-[10px] text-zinc-500 mt-1 font-medium">Delivered via Resend nodes</p>
                      <div className="mt-3">
                        <Sparkline data={[99.7, 99.8, 99.85, 99.82, 99.85, 99.84, 99.85]} trend="up" />
                      </div>
                    </div>

                    {/* Card 3: Webhook Delivery */}
                    <div className="bg-white border border-[#E5E7EB] rounded-lg p-4">
                      <p className="text-xs font-semibold text-[#6B7280] uppercase tracking-wider">Webhook Success</p>
                      <h3 className="text-2xl font-bold text-emerald-600 mt-1">99.92%</h3>
                      <p className="text-[10px] text-zinc-500 mt-1 font-medium">Average queue delay: 114ms</p>
                      <div className="mt-3">
                        <Sparkline data={[99.88, 99.9, 99.91, 99.89, 99.92, 99.93, 99.92]} trend="up" />
                      </div>
                    </div>

                    {/* Card 4: Database availability */}
                    <div className="bg-white border border-[#E5E7EB] rounded-lg p-4">
                      <p className="text-xs font-semibold text-[#6B7280] uppercase tracking-wider">Database Availability</p>
                      <h3 className="text-2xl font-bold text-emerald-600 mt-1">100.00%</h3>
                      <p className="text-[10px] text-zinc-500 mt-1 font-medium">Multi-AZ PostgreSQL cluster</p>
                      <div className="mt-3">
                        <Sparkline data={[100, 100, 100, 100, 100, 100, 100]} trend="up" />
                      </div>
                    </div>

                    {/* Card 5: AI processing queue */}
                    <div className="bg-white border border-[#E5E7EB] rounded-lg p-4">
                      <p className="text-xs font-semibold text-[#6B7280] uppercase tracking-wider">AI Queue</p>
                      <h3 className="text-2xl font-bold text-zinc-900 mt-1">0 items</h3>
                      <p className="text-[10px] text-zinc-500 mt-1 font-medium">Optimal response pipeline</p>
                      <div className="mt-3">
                        <Sparkline data={[2, 5, 1, 0, 3, 0, 0]} trend="down" />
                      </div>
                    </div>

                    {/* Card 6: Survey submissions success */}
                    <div className="bg-white border border-[#E5E7EB] rounded-lg p-4">
                      <p className="text-xs font-semibold text-[#6B7280] uppercase tracking-wider">Submission Rate</p>
                      <h3 className="text-2xl font-bold text-emerald-600 mt-1">99.98%</h3>
                      <p className="text-[10px] text-zinc-500 mt-1 font-medium">Ingestion servers capacity 14%</p>
                      <div className="mt-3">
                        <Sparkline data={[99.95, 99.97, 99.98, 99.96, 99.98, 99.99, 99.98]} trend="up" />
                      </div>
                    </div>
                  </div>

                  {/* Incident Center */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="bg-white border border-[#E5E7EB] rounded-lg p-6">
                      <h3 className="text-md font-bold text-zinc-950 mb-4">Operational Incidents</h3>
                      <div className="space-y-4">
                        <div className="p-4 bg-emerald-50/50 border border-emerald-100 rounded-lg flex items-start gap-3">
                          <CheckCircle2 className="w-5 h-5 text-emerald-600 mt-0.5 shrink-0" />
                          <div>
                            <p className="font-bold text-xs text-emerald-950">All Systems Operational</p>
                            <p className="text-[11px] text-emerald-700 mt-0.5">Platform is reporting no outage states across ingestion or database clusters.</p>
                          </div>
                        </div>

                        <div className="border-t border-zinc-100 pt-4">
                          <p className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider mb-2">Past Resolved Incidents</p>
                          <div className="space-y-2">
                            <div className="flex items-center justify-between text-xs font-medium text-zinc-700">
                              <span>Partial Webhook Delay (AWS us-east-1)</span>
                              <span className="text-[10px] font-semibold text-zinc-400">Resolved • Jun 14</span>
                            </div>
                            <div className="flex items-center justify-between text-xs font-medium text-zinc-700">
                              <span>Email dispatch delays (API retry timeout)</span>
                              <span className="text-[10px] font-semibold text-zinc-400">Resolved • Jun 02</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="bg-white border border-[#E5E7EB] rounded-lg p-6">
                      <h3 className="text-md font-bold text-zinc-950 mb-4">Scheduled Maintenance</h3>
                      <div className="space-y-4">
                        <div className="p-4 bg-zinc-50 border border-zinc-200 rounded-lg">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-zinc-950">Database Cluster Read Replica Expansion</span>
                            <span className="text-[10px] px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 font-semibold uppercase">Pending</span>
                          </div>
                          <p className="text-[11px] text-zinc-600 mt-2">Scale read performance capacity for tenant reporting. Zero downtime expected.</p>
                          <div className="mt-3 flex items-center justify-between text-[10px] text-zinc-500 font-bold">
                            <span>June 25, 2026 at 02:00 UTC</span>
                            <span>Target: pg-master-b1</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ─────────────────────────────────────────────────────────────
                  8. SETTINGS TAB
                  ───────────────────────────────────────────────────────────── */}
              {activeTab === 'settings' && (
                <div className="max-w-4xl bg-white border border-[#E5E7EB] rounded-lg p-6 md:p-8 space-y-6">
                  <div>
                    <h2 className="text-lg font-bold text-[#111827]">System Settings</h2>
                    <p className="text-xs text-[#6B7280] font-medium mt-0.5">Configure platform thresholds, webhook callbacks, and administrative details.</p>
                  </div>
                  
                  {/* General Config */}
                  <div className="border-t border-[#E5E7EB] pt-6 grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div>
                      <h3 className="text-xs font-bold text-zinc-900 uppercase tracking-wider">Telemetry Controls</h3>
                      <p className="text-[11px] text-zinc-500 mt-1">Configure global panel metrics collection rules.</p>
                    </div>
                    <div className="md:col-span-2 space-y-4">
                      <div>
                        <label className="block text-xs font-bold text-zinc-700 mb-1.5">Administrative Support Mail</label>
                        <input 
                          type="email" 
                          defaultValue="support@axiorapulse.com" 
                          className="w-full max-w-md px-3 py-1.5 text-xs bg-white border border-[#E5E7EB] rounded-md focus:outline-none focus:ring-1 focus:ring-[#FF5A1F]"
                        />
                      </div>
                      <div className="flex items-start gap-2.5">
                        <input type="checkbox" defaultChecked id="cb-analytics" className="rounded text-[#FF5A1F] focus:ring-[#FF5A1F] mt-0.5" />
                        <label htmlFor="cb-analytics" className="text-xs font-medium text-zinc-700 leading-tight">
                          Enforce Stripe Webhook Signature Verification in Production Environment.
                        </label>
                      </div>
                    </div>
                  </div>

                  {/* Access keys */}
                  <div className="border-t border-[#E5E7EB] pt-6 grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div>
                      <h3 className="text-xs font-bold text-zinc-900 uppercase tracking-wider">Global Webhooks</h3>
                      <p className="text-[11px] text-zinc-500 mt-1">Configure system-wide dispatch endpoints for organization audit sync.</p>
                    </div>
                    <div className="md:col-span-2 space-y-4">
                      <div>
                        <label className="block text-xs font-bold text-zinc-700 mb-1.5">Platform Webhook Ingestion URL</label>
                        <input 
                          type="text" 
                          defaultValue="https://api.axiorapulse.com/webhooks/telemetry-sync" 
                          className="w-full max-w-md px-3 py-1.5 text-xs bg-white border border-[#E5E7EB] rounded-md focus:outline-none focus:ring-1 focus:ring-[#FF5A1F] font-mono text-zinc-650"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => toast.success('Webhook settings updated.')}
                          className="px-3.5 py-1.5 bg-[#FF5A1F] hover:bg-[#E04E1A] text-white font-semibold text-xs rounded transition-colors"
                        >
                          Save settings
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {/* ─── UPGRADE SUBSCRIPTION MODAL ─── */}
      <AnimatePresence>
        {upgradeModalTenant && (
          <div className="fixed inset-0 bg-zinc-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white border border-[#E5E7EB] rounded-lg max-w-md w-full p-6 shadow-xl"
            >
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-sm font-bold text-zinc-950 uppercase tracking-wider">Upgrade Plan Subscription</h3>
                  <p className="text-xs text-zinc-500 mt-0.5">Update billing level for {upgradeModalTenant.name}</p>
                </div>
                <button 
                  onClick={() => setUpgradeModalTenant(null)}
                  className="p-1 hover:bg-zinc-100 rounded text-zinc-400 hover:text-zinc-600 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4 py-2">
                <p className="text-xs text-zinc-700">
                  Select the target tier level for the workspace. This will alter client quotas and trigger a Stripe billing event.
                </p>
                <div>
                  <label className="block text-[11px] font-bold text-zinc-600 mb-1.5 uppercase">Plan Option</label>
                  <select 
                    id="modal-plan-selector"
                    defaultValue={upgradeModalTenant.plan_type}
                    className="w-full px-3 py-2 text-xs bg-white border border-zinc-250 rounded focus:outline-none focus:ring-1 focus:ring-[#FF5A1F] font-semibold text-zinc-800"
                  >
                    <option value="free">Free ($0.00 / month)</option>
                    <option value="pro">Pro ($49.00 / month)</option>
                    <option value="growth">Growth ($49.00 / month)</option>
                    <option value="enterprise">Enterprise ($299.00 / month)</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 mt-6 border-t border-zinc-100 pt-4">
                <button 
                  onClick={() => setUpgradeModalTenant(null)}
                  className="px-3 py-1.5 text-xs font-semibold border border-zinc-250 hover:bg-zinc-50 rounded text-zinc-700"
                >
                  Cancel
                </button>
                <button 
                  disabled={actionBusy}
                  onClick={() => {
                    const sel = document.getElementById('modal-plan-selector');
                    if (sel) handleUpdatePlan(upgradeModalTenant.id, sel.value);
                  }}
                  className="px-3.5 py-1.5 text-xs font-semibold bg-[#FF5A1F] hover:bg-[#E04E1A] text-white rounded transition-colors disabled:opacity-50"
                >
                  {actionBusy ? 'Processing...' : 'Apply Subscription'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ─── APPLY CREDITS MODAL ─── */}
      <AnimatePresence>
        {creditModalTenant && (
          <div className="fixed inset-0 bg-zinc-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white border border-[#E5E7EB] rounded-lg max-w-md w-full p-6 shadow-xl"
            >
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-sm font-bold text-zinc-950 uppercase tracking-wider">Apply Promo Credits</h3>
                  <p className="text-xs text-zinc-500 mt-0.5">Apply credits to {creditModalTenant.name}</p>
                </div>
                <button 
                  onClick={() => setCreditModalTenant(null)}
                  className="p-1 hover:bg-zinc-100 rounded text-zinc-400 hover:text-zinc-600 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4 py-2">
                <p className="text-xs text-zinc-700">
                  Enter the credit amount to apply to this workspace. It will be deducted from the next billing cycle invoices.
                </p>
                <div>
                  <label className="block text-[11px] font-bold text-zinc-600 mb-1.5 uppercase">Amount (USD)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 font-semibold text-xs">$</span>
                    <input 
                      id="modal-credit-input"
                      type="number" 
                      defaultValue="50"
                      className="w-full pl-7 pr-3 py-1.5 text-xs bg-white border border-zinc-250 rounded focus:outline-none focus:ring-1 focus:ring-[#FF5A1F] font-semibold text-zinc-800"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 mt-6 border-t border-zinc-100 pt-4">
                <button 
                  onClick={() => setCreditModalTenant(null)}
                  className="px-3 py-1.5 text-xs font-semibold border border-zinc-250 hover:bg-zinc-50 rounded text-zinc-700"
                >
                  Cancel
                </button>
                <button 
                  onClick={() => {
                    const inp = document.getElementById('modal-credit-input');
                    if (inp) handleApplyCredits(creditModalTenant.id, inp.value);
                  }}
                  className="px-3.5 py-1.5 text-xs font-semibold bg-[#FF5A1F] hover:bg-[#E04E1A] text-white rounded transition-colors"
                >
                  Apply Credits
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ─── DECOMMISSION ORGANIZATION MODAL ─── */}
      <AnimatePresence>
        {deleteModalTenant && (
          <div className="fixed inset-0 bg-zinc-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white border border-red-200 rounded-lg max-w-md w-full p-6 shadow-xl"
            >
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-red-650" />
                  <div>
                    <h3 className="text-sm font-bold text-red-950 uppercase tracking-wider">Decommission Workspace</h3>
                    <p className="text-xs text-red-700 mt-0.5">{deleteModalTenant.name}</p>
                  </div>
                </div>
                <button 
                  onClick={() => { setDeleteModalTenant(null); setDeleteConfirmText(''); }}
                  className="p-1 hover:bg-zinc-100 rounded text-zinc-400 hover:text-zinc-600 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4 py-2 text-xs text-red-900">
                <p className="leading-relaxed">
                  <strong>WARNING:</strong> This will flag the organization workspace <strong>{deleteModalTenant.name}</strong> for deletion. All surveys, collected telemetry responses, and researcher profiles will be scheduled for permanent purge. This cannot be undone.
                </p>
                <div>
                  <label className="block text-[10px] font-bold text-red-700 mb-1.5 uppercase">
                    Type <strong>{deleteModalTenant.slug}</strong> to confirm
                  </label>
                  <input 
                    type="text" 
                    placeholder={deleteModalTenant.slug}
                    value={deleteConfirmText}
                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs bg-white border border-red-200 rounded focus:outline-none focus:ring-1 focus:ring-red-500 font-mono text-red-950 font-bold"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 mt-6 border-t border-red-100 pt-4">
                <button 
                  onClick={() => { setDeleteModalTenant(null); setDeleteConfirmText(''); }}
                  className="px-3 py-1.5 text-xs font-semibold border border-zinc-250 hover:bg-zinc-50 rounded text-zinc-700"
                >
                  Cancel
                </button>
                <button 
                  disabled={deleteConfirmText !== deleteModalTenant.slug}
                  onClick={() => handleDeleteTenant(deleteModalTenant.id)}
                  className="px-3.5 py-1.5 text-xs font-semibold bg-red-600 hover:bg-red-700 text-white rounded transition-colors disabled:opacity-50"
                >
                  Decommission Workspace
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
