import { useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { uploadPdf, uploadExcel } from '../api';
import { Upload, FileText, FileSpreadsheet, X, LogOut, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';

export default function Sidebar({ pdfs, setPdfs, excels, setExcels }) {
  const { user, logout } = useAuth();
  const pdfFileRef = useRef(null);
  const excelFileRef = useRef(null);
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [uploadingExcel, setUploadingExcel] = useState(false);
  const [toast, setToast] = useState(null); // { type: 'success' | 'error', text }

  const initials = user?.username
    ? user.username.slice(0, 2).toUpperCase()
    : 'U';

  const showToast = (type, text) => {
    setToast({ type, text });
    setTimeout(() => setToast(null), 3000);
  };

  const handlePdfChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file || file.type !== 'application/pdf') return;

    setUploadingPdf(true);
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

    setUploadingPdf(false);
    if (pdfFileRef.current) pdfFileRef.current.value = '';
  };

  const handleExcelChange = async (e) => {
    const file = e.target.files?.[0];
    const isExcel = file?.name.endsWith('.xlsx') || file?.name.endsWith('.xls');
    if (!file || !isExcel) return;

    setUploadingExcel(true);
    let uploadSuccess = false;

    try {
      await uploadExcel(file, user?.token);
      uploadSuccess = true;
    } catch {
      uploadSuccess = false;
    }

    setExcels((prev) => [
      ...prev,
      {
        id: Date.now(),
        name: file.name,
        size: (file.size / 1024).toFixed(1) + ' KB',
        addedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ]);

    if (uploadSuccess) {
      showToast('success', `Excel file uploaded!`);
    } else {
      showToast('error', 'Excel upload failed');
    }

    setUploadingExcel(false);
    if (excelFileRef.current) excelFileRef.current.value = '';
  };

  const removePdf = (id) => setPdfs((prev) => prev.filter((p) => p.id !== id));
  const removeExcel = (id) => setExcels((prev) => prev.filter((e) => e.id !== id));

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
          ref={pdfFileRef}
          type="file"
          accept="application/pdf"
          hidden
          onChange={handlePdfChange}
        />
        <button
          className={`pdf-upload-btn${uploadingPdf ? ' uploading' : ''}`}
          onClick={() => pdfFileRef.current?.click()}
        >
          {uploadingPdf ? (
            <Loader2 size={16} className="spin" />
          ) : (
            <Upload size={16} />
          )}
          {uploadingPdf ? 'Uploading PDF…' : 'Upload PDF'}
        </button>

        <input
          ref={excelFileRef}
          type="file"
          accept=".xlsx, .xls"
          hidden
          onChange={handleExcelChange}
        />
        <button
          className={`pdf-upload-btn excel-upload-btn${uploadingExcel ? ' uploading' : ''}`}
          style={{ marginTop: '8px' }}
          onClick={() => excelFileRef.current?.click()}
        >
          {uploadingExcel ? (
            <Loader2 size={16} className="spin" />
          ) : (
            <Upload size={16} />
          )}
          {uploadingExcel ? 'Uploading Excel…' : 'Upload Excel'}
        </button>

        {/* Toast notification */}
        {toast && (
          <div className={`upload-toast ${toast.type}`}>
            {toast.type === 'success' ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
            <span>{toast.text}</span>
          </div>
        )}
      </div>

      {/* Scrollable Container for Lists */}
      <div className="sidebar-lists">
        {/* PDF List */}
        <div className="pdf-list-section">
          <div className="section-title">Documents ({pdfs.length})</div>
          {pdfs.length === 0 ? (
            <div className="no-pdfs">
              No documents yet.
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

        {/* Excel List */}
        <div className="pdf-list-section excel-list-section">
          <div className="section-title">Excel Files ({excels.length})</div>
          {excels.length === 0 ? (
            <div className="no-pdfs">
              No spreadsheets yet.
            </div>
          ) : (
            excels.map((excel) => (
              <div key={excel.id} className="pdf-item excel-item">
                <div className="pdf-icon excel-icon">
                  <FileSpreadsheet size={16} />
                </div>
                <div className="pdf-name">
                  <span>{excel.name}</span>
                  <small>{excel.size} · {excel.addedAt}</small>
                </div>
                <button className="pdf-remove" onClick={() => removeExcel(excel.id)}>
                  <X size={14} />
                </button>
              </div>
            ))
          )}
        </div>
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
