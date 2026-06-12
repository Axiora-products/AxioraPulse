import React, { useEffect, useState } from 'react';
import { useLocation, useOutletContext } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import API from '../api/axios';
import { useLoading } from '../context/LoadingContext';
import ConfirmModal from '../components/ConfirmModal';
import {
  FileText,
  FileSpreadsheet,
  FileVideo,
  Folder,
  FileCode2,
  Archive,
  FileJson,
  Mic,
  ImageIcon,
  Files as FilesIcon,
  Music2,
  Images,
  Search,
  Download,
  Trash2,
} from 'lucide-react';

const FILE_TYPES = [
  {
    id: 'all',
    label: 'All Files',
    icon: FilesIcon,
    color: '#FF5A00',
    bg: 'rgba(255,90,0,0.10)',
  },
  {
    id: 'file',
    label: 'Documents',
    icon: FileText,
    color: '#2563EB',
    bg: 'rgba(37,99,235,0.10)',
  },
  {
    id: 'audio',
    label: 'Audio',
    icon: Music2,
    color: '#C026D3',
    bg: 'rgba(192,38,211,0.10)',
  },
  {
    id: 'image',
    label: 'Images',
    icon: Images,
    color: '#CA8A04',
    bg: 'rgba(202,138,4,0.10)',
  },
];

/* Shared field styles */
const inp = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '14px 18px 14px 46px',
  background: 'var(--warm-white)',
  border: '1.5px solid rgba(22,15,8,0.1)',
  borderRadius: 16,
  fontFamily: 'Syne, sans-serif',
  fontSize: 14,
  fontWeight: 600,
  color: 'var(--espresso)',
  outline: 'none',
  transition: 'border-color 0.2s, box-shadow 0.2s',
  boxShadow: '0 4px 14px rgba(22,15,8,0.02)',
};

const getFileIcon = (type, name = '') => {
  const t = (type || '').toLowerCase();
  const n = (name || '').toLowerCase();

  const commonProps = {
    size: 20,
    strokeWidth: 2,
  };

  if (t.includes('pdf')) {
    return <FileText {...commonProps} color="#FF5A00" />;
  }

  if (
    t.includes('word') ||
    n.endsWith('.doc') ||
    n.endsWith('.docx')
  ) {
    return <FileText {...commonProps} color="#2563EB" />;
  }

  if (
    t.includes('sheet') ||
    n.endsWith('.xls') ||
    n.endsWith('.xlsx')
  ) {
    return <FileSpreadsheet {...commonProps} color="#16A34A" />;
  }

  if (
    t.includes('audio') ||
    n.endsWith('.mp3') ||
    n.endsWith('.wav')
  ) {
    return <Mic {...commonProps} color="#C026D3" />;
  }

  if (
    t.includes('video') ||
    n.endsWith('.mp4')
  ) {
    return <FileVideo {...commonProps} color="#DC2626" />;
  }

  if (
    t.includes('image') ||
    ['.png', '.jpg', '.jpeg', '.webp'].some(ext => n.endsWith(ext))
  ) {
    return <ImageIcon {...commonProps} color="#CA8A04" />;
  }

  if (
    n.endsWith('.zip') ||
    n.endsWith('.rar')
  ) {
    return <Archive {...commonProps} color="#7C3AED" />;
  }

  if (
    n.endsWith('.json')
  ) {
    return <FileJson {...commonProps} color="#0F766E" />;
  }

  if (
    n.endsWith('.js') ||
    n.endsWith('.jsx') ||
    n.endsWith('.ts') ||
    n.endsWith('.tsx')
  ) {
    return <FileCode2 {...commonProps} color="#EA580C" />;
  }

  return <Folder {...commonProps} color="#6B7280" />;
};

export default function Files() {
  const { stopLoading } = useLoading();
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);

  const location = useLocation();
  const { refreshFiles } = useOutletContext() || {};

  useEffect(() => {
    loadFiles();
  }, [location.key]);

  async function loadFiles() {
    setLoading(true);
    try {
      const { data } = await API.get('/uploads/files');
      setFiles(data || []);
    } catch (e) {
      console.error('Failed to fetch files', e);
    } finally {
      setLoading(false);
      stopLoading();
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await API.delete(`/uploads/${deleteTarget.id}`);
      toast.success('File deleted successfully');
      setFiles(prev => prev.filter(f => f.id !== deleteTarget.id));
      if (refreshFiles) refreshFiles();
    } catch (e) {
      console.error('Failed to delete file', e);
      toast.error(e.response?.data?.detail || 'Failed to delete file');
    } finally {
      setDeleteTarget(null);
    }
  }

  const filteredFiles = files.filter(f => {
    // Apply Category Filter
    if (filter !== 'all') {
      if (filter === 'image') {
        if (!f.content_type?.startsWith('image/')) return false;
      } else {
        if (f.upload_type !== filter) return false;
      }
    }
    // Apply Search
    if (search.trim()) {
      return f.filename.toLowerCase().includes(search.toLowerCase());
    }
    return true;
  });

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      {/* Confirm Modal */}
      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete file permanently?"
        body={deleteTarget ? `Are you sure you want to delete "${deleteTarget.filename}"? This action cannot be undone and will permanently remove the file.` : ''}
        confirmLabel="Delete"
        danger
        onConfirm={handleDelete}
      />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 40 }}>
        <div>
          <div style={{ fontFamily: 'Syne, sans-serif', fontSize: 10, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--coral)', marginBottom: 10 }}>Workspace</div>
          <h1 style={{ fontFamily: 'Playfair Display, serif', fontWeight: 900, fontSize: 'clamp(32px,4vw,48px)', letterSpacing: '-2px', color: 'var(--espresso)', margin: 0 }}>Files</h1>
          <p style={{ fontFamily: 'Fraunces, serif', fontWeight: 300, fontSize: 15, color: 'rgba(22,15,8,0.4)', marginTop: 6 }}>
            {files.length} file{files.length !== 1 ? 's' : ''} uploaded in total
          </p>
        </div>
      </div>

      {/* Controls: Search and Filters */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center', marginBottom: 32 }}>
        {/* Search */}
        <div style={{ position: 'relative', flex: '1 1 300px', maxWidth: 450 }}>
          <Search size={18} color="rgba(22,15,8,0.35)" style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)' }} />
          <input
            type="text"
            placeholder="Search by filename..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={inp}
            onFocus={e => {
              e.target.style.borderColor = 'var(--coral)';
              e.target.style.boxShadow = '0 0 0 4px rgba(255, 69, 0, 0.08)';
            }}
            onBlur={e => {
              e.target.style.borderColor = 'rgba(22,15,8,0.1)';
              e.target.style.boxShadow = '0 4px 14px rgba(22,15,8,0.02)';
            }}
          />
        </div>

        {/* Filter Chips */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {FILE_TYPES.map((t) => {
            const Icon = t.icon;
            const active = filter === t.id;
            return (
              <motion.button
                key={t.id}
                whileHover={{ y: -1 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => setFilter(t.id)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '10px 20px',
                  borderRadius: 999,
                  border: active ? '1.5px solid var(--espresso)' : '1.5px solid rgba(22,15,8,0.08)',
                  background: active ? 'var(--espresso)' : 'var(--warm-white)',
                  color: active ? 'var(--cream)' : 'var(--espresso)',
                  fontFamily: 'Syne, sans-serif',
                  fontWeight: 700,
                  fontSize: 11,
                  letterSpacing: '0.05em',
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                  transition: 'border-color 0.2s, background 0.2s, color 0.2s',
                  boxShadow: '0 4px 14px rgba(22,15,8,0.02)',
                }}
              >
                <Icon size={14} style={{ color: active ? 'var(--cream)' : t.color }} />
                {t.label}
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* Files Grid */}
      <div style={{ position: 'relative', minHeight: 200 }}>
        {loading ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 20 }}>
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div
                key={i}
                style={{
                  height: 120,
                  background: 'var(--warm-white)',
                  border: '1.5px solid rgba(22,15,8,0.07)',
                  borderRadius: 24,
                  animation: 'pulse 1.8s infinite ease-in-out',
                }}
              />
            ))}
          </div>
        ) : filteredFiles.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 40px', background: 'var(--warm-white)', borderRadius: 24, border: '1px solid rgba(22,15,8,0.07)' }}>
            <div style={{ fontSize: 54, marginBottom: 16 }}>📭</div>
            <h3 style={{ fontFamily: 'Playfair Display, serif', fontWeight: 700, fontSize: 24, color: 'var(--espresso)', margin: '0 0 8px' }}>
              No files found
            </h3>
            <p style={{ fontFamily: 'Fraunces, serif', fontWeight: 300, fontSize: 15, color: 'rgba(22,15,8,0.45)', margin: 0 }}>
              {search || filter !== 'all' ? 'Try adjusting your search query or filters' : 'No uploaded files exist in this workspace yet.'}
            </p>
          </div>
        ) : (
          <AnimatePresence mode="popLayout">
            <motion.div
              layout
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                gap: 20,
              }}
            >
              {filteredFiles.map((f, i) => (
                <motion.div
                  key={f.id}
                  layout
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  transition={{ delay: i * 0.02 }}
                  whileHover={{ y: -4, boxShadow: '0 12px 36px rgba(22,15,8,0.08)' }}
                  style={{
                    background: 'var(--warm-white)',
                    border: '1.5px solid rgba(22,15,8,0.07)',
                    borderRadius: 24,
                    padding: 20,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    minHeight: 130,
                    transition: 'box-shadow 0.25s ease',
                  }}
                >
                  <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                    <div
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 14,
                        background: 'rgba(255,255,255,0.85)',
                        border: '1px solid rgba(22,15,8,0.06)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      {getFileIcon(f.content_type, f.filename)}
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontFamily: 'Syne, sans-serif',
                          fontSize: 14,
                          fontWeight: 700,
                          color: 'var(--espresso)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          marginBottom: 4,
                        }}
                        title={f.filename}
                      >
                        {f.filename}
                      </div>

                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          fontFamily: 'Syne, sans-serif',
                          fontSize: 10,
                          fontWeight: 700,
                          letterSpacing: '0.04em',
                          textTransform: 'uppercase',
                          color: 'rgba(22,15,8,0.35)',
                        }}
                      >
                        <span style={{ color: 'var(--coral)' }}>
                          {f.upload_type}
                        </span>
                        <span>•</span>
                        <span>
                          {f.file_size ? (f.file_size / 1024).toFixed(0) + ' KB' : '—'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, paddingTop: 12, borderTop: '1px solid rgba(22,15,8,0.05)' }}>
                    <span style={{ fontFamily: 'Fraunces, serif', fontSize: 11, color: 'rgba(22,15,8,0.3)', fontWeight: 300 }}>
                      {f.created_at ? new Date(f.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                    </span>

                    <div style={{ display: 'flex', gap: 6 }}>
                      <a
                        href={f.file_url}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: 32,
                          height: 32,
                          borderRadius: 10,
                          background: 'rgba(22,15,8,0.04)',
                          border: '1px solid rgba(22,15,8,0.05)',
                          color: 'var(--espresso)',
                          textDecoration: 'none',
                          transition: 'all 0.2s ease',
                        }}
                        title="Open file"
                        onMouseEnter={e => {
                          e.currentTarget.style.background = 'rgba(255,69,0,0.1)';
                          e.currentTarget.style.borderColor = 'rgba(255,69,0,0.2)';
                          e.currentTarget.style.color = 'var(--coral)';
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.background = 'rgba(22,15,8,0.04)';
                          e.currentTarget.style.borderColor = 'rgba(22,15,8,0.05)';
                          e.currentTarget.style.color = 'var(--espresso)';
                        }}
                      >
                        <Download size={14} />
                      </a>

                      <button
                        onClick={() => setDeleteTarget(f)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: 32,
                          height: 32,
                          borderRadius: 10,
                          background: 'rgba(22,15,8,0.04)',
                          border: '1px solid rgba(22,15,8,0.05)',
                          color: 'var(--espresso)',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease',
                        }}
                        title="Delete file"
                        onMouseEnter={e => {
                          e.currentTarget.style.background = 'rgba(214,59,31,0.1)';
                          e.currentTarget.style.borderColor = 'rgba(214,59,31,0.2)';
                          e.currentTarget.style.color = 'var(--terracotta)';
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.background = 'rgba(22,15,8,0.04)';
                          e.currentTarget.style.borderColor = 'rgba(22,15,8,0.05)';
                          e.currentTarget.style.color = 'var(--espresso)';
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          </AnimatePresence>
        )}
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 0.35; }
        }
      `}</style>
    </div>
  );
}
