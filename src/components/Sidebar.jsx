import { useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { uploadPdf } from '../api';
import { Upload, FileText, X, LogOut, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';

export default function Sidebar({ pdfs, setPdfs }) {
  const { user, logout } = useAuth();
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState(null); // { type: 'success' | 'error', text }

  const initials = user?.username
    ? user.username.slice(0, 2).toUpperCase()
    : 'U';

  const showToast = (type, text) => {
    setToast({ type, text });
    setTimeout(() => setToast(null), 3000);
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file || file.type !== 'application/pdf') return;

    setUploading(true);
    let uploadSuccess = false;

    try {
      await uploadPdf(file, user?.token);
      uploadSuccess = true;
    } catch {
      uploadSuccess = false;
    }

    setPdfs((prev) => [
      ...prev,
      {
        id: Date.now(),
        name: file.name,
        size: (file.size / 1024).toFixed(1) + ' KB',
        addedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ]);

    if (uploadSuccess) {
      showToast('success', `"${file.name}" uploaded successfully`);
    } else {
      showToast('error', 'Upload failed — file saved locally only');
    }

    setUploading(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  const removePdf = (id) => setPdfs((prev) => prev.filter((p) => p.id !== id));

  return (
    <aside className="sidebar">
      {/* Header */}
      <div className="sidebar-header">
        <h2>LocalChat AI</h2>
        <div className="user-info">
          <div className="user-avatar">{initials}</div>
          <div>
            <div className="user-name">{user?.username}</div>
            <div className="user-status">Online</div>
          </div>
        </div>
      </div>

      {/* Upload */}
      <div className="pdf-upload-section">
        <input
          ref={fileRef}
          type="file"
          accept="application/pdf"
          hidden
          onChange={handleFileChange}
        />
        <button
          className={`pdf-upload-btn${uploading ? ' uploading' : ''}`}
          onClick={() => fileRef.current?.click()}
        >
          {uploading ? (
            <Loader2 size={16} className="spin" />
          ) : (
            <Upload size={16} />
          )}
          {uploading ? 'Uploading…' : 'Upload PDF'}
        </button>

        {/* Toast notification */}
        {toast && (
          <div className={`upload-toast ${toast.type}`}>
            {toast.type === 'success' ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
            <span>{toast.text}</span>
          </div>
        )}
      </div>

      {/* PDF List */}
      <div className="pdf-list-section">
        <div className="section-title">Documents ({pdfs.length})</div>
        {pdfs.length === 0 ? (
          <div className="no-pdfs">
            No documents uploaded yet.<br />
            Upload a PDF to provide context to the AI.
          </div>
        ) : (
          pdfs.map((pdf) => (
            <div key={pdf.id} className="pdf-item">
              <div className="pdf-icon">
                <FileText size={16} />
              </div>
              <div className="pdf-name">
                <span>{pdf.name}</span>
                <small>{pdf.size} · {pdf.addedAt}</small>
              </div>
              <button className="pdf-remove" onClick={() => removePdf(pdf.id)}>
                <X size={14} />
              </button>
            </div>
          ))
        )}
      </div>

      {/* Logout */}
      <div className="sidebar-logout">
        <button className="btn-logout" onClick={logout}>
          <LogOut size={15} />
          Sign Out
        </button>
      </div>
    </aside>
  );
}
