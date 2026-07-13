"use client";

import { useState, useEffect } from 'react';
import { db } from '../../lib/firebase';
import { collection, doc, setDoc, deleteDoc, onSnapshot, query, where, orderBy, getDocs, Timestamp } from 'firebase/firestore';
import Link from 'next/link';

export default function Pengaturan() {
  // Authentication State
  const [isLogged, setIsLogged] = useState(() => {
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem('admin_logged') === 'true';
    }
    return false;
  });
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [loginError, setLoginError] = useState('');

  // Handle login submit
  const handleAdminLogin = (e) => {
    e.preventDefault();
    if (emailInput.trim() === 'antrian.kecgandrungmangu@mail.id' && passwordInput === 'login') {
      sessionStorage.setItem('admin_logged', 'true');
      setIsLogged(true);
      setLoginError('');
    } else {
      setLoginError('Email atau Password salah. Silakan coba lagi.');
    }
  };

  // Handle logout
  const handleLogout = () => {
    sessionStorage.removeItem('admin_logged');
    setIsLogged(false);
  };

  // Navigation & Tabs
  const [activeTab, setActiveTab] = useState('umum'); // 'umum', 'layanan', 'loket'
  const [loading, setLoading] = useState(true);
  const [alert, setAlert] = useState({ show: false, message: '', type: 'success' });

  // Settings State
  const [settings, setSettings] = useState({
    instansi_nama: '',
    instansi_alamat: '',
    running_text: '',
    display_video_url: '',
    bell_sound_volume: '0.8'
  });

  // Services State
  const [layananList, setLayananList] = useState([]);
  const [layananForm, setLayananForm] = useState({ id: '', kode: '', nama: '', estimasi_waktu: '' });
  const [isEditingLayanan, setIsEditingLayanan] = useState(false);

  // Counters State
  const [loketList, setLoketList] = useState([]);
  const [loketForm, setLoketForm] = useState({ id: '', nama: '' });
  const [isEditingLoket, setIsEditingLoket] = useState(false);

  // Daftar Pelayanan / History State
  const [filterMode, setFilterMode] = useState('hari'); // 'hari' or 'bulan'
  const [filterDate, setFilterDate] = useState(new Date().toISOString().split('T')[0]); // YYYY-MM-DD
  const [filterMonth, setFilterMonth] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
  const [filterLayanan, setFilterLayanan] = useState('semua');
  const [historyList, setHistoryList] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Operators State
  const [operatorList, setOperatorList] = useState([]);
  const [operatorForm, setOperatorForm] = useState({ id: '', nama: '', username: '', password: '' });
  const [isEditingOperator, setIsEditingOperator] = useState(false);

  // Trigger Alert
  const showAlert = (message, type = 'success') => {
    setAlert({ show: true, message, type });
    setTimeout(() => {
      setAlert({ show: false, message: '', type: 'success' });
    }, 4000);
  };

  // Fetch all settings, services, and counters on mount
  useEffect(() => {
    // 1. Fetch general settings (Real-time)
    const unsubSettings = onSnapshot(collection(db, 'settings'), (snap) => {
      const current = {
        instansi_nama: '',
        instansi_alamat: '',
        running_text: '',
        display_video_url: '',
        bell_sound_volume: '0.8'
      };
      snap.forEach(docSnap => {
        current[docSnap.id] = docSnap.data().value;
      });
      setSettings(current);
    });

    // 2. Fetch pelayanan / services (Real-time)
    const unsubLayanan = onSnapshot(collection(db, 'pelayanan'), (snap) => {
      const list = [];
      snap.forEach(docSnap => {
        list.push({ id: docSnap.id, ...docSnap.data() });
      });
      list.sort((a, b) => a.kode.localeCompare(b.kode));
      setLayananList(list);
    });

    // 3. Fetch loket / counters (Real-time)
    const unsubLoket = onSnapshot(collection(db, 'loket'), (snap) => {
      const list = [];
      snap.forEach(docSnap => {
        list.push({ id: docSnap.id, ...docSnap.data() });
      });
      // Sort naturally by name (e.g. Loket 1, Loket 2...)
      list.sort((a, b) => a.nama.localeCompare(b.nama, undefined, { numeric: true, sensitivity: 'base' }));
      setLoketList(list);
      setLoading(false);
    });

    // 4. Fetch operators (Real-time)
    const unsubOperators = onSnapshot(collection(db, 'operators'), (snap) => {
      const list = [];
      snap.forEach(docSnap => {
        list.push({ id: docSnap.id, ...docSnap.data() });
      });
      list.sort((a, b) => a.nama.localeCompare(b.nama));
      setOperatorList(list);
    });

    return () => {
      unsubSettings();
      unsubLayanan();
      unsubLoket();
      unsubOperators();
    };
  }, []);

  // Fetch History for Daftar Pelayanan
  useEffect(() => {
    if (activeTab !== 'daftar_pelayanan') return;

    const fetchHistory = async () => {
      setHistoryLoading(true);
      try {
        let start, end;
        if (filterMode === 'hari') {
          if (!filterDate) {
            setHistoryLoading(false);
            return;
          }
          const d = new Date(filterDate);
          if (isNaN(d.getTime())) {
            setHistoryLoading(false);
            return;
          }
          d.setHours(0, 0, 0, 0);
          start = d;
          
          const de = new Date(filterDate);
          de.setHours(23, 59, 59, 999);
          end = de;
        } else {
          if (!filterMonth || !filterMonth.includes('-')) {
            setHistoryLoading(false);
            return;
          }
          const parts = filterMonth.split('-');
          const year = parseInt(parts[0], 10);
          const month = parseInt(parts[1], 10) - 1; // 0-indexed
          if (isNaN(year) || isNaN(month)) {
            setHistoryLoading(false);
            return;
          }

          start = new Date(year, month, 1, 0, 0, 0, 0);
          end = new Date(year, month + 1, 0, 23, 59, 59, 999); // last day of month
        }

        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
          setHistoryLoading(false);
          return;
        }

        const startTimestamp = Timestamp.fromDate(start);
        const endTimestamp = Timestamp.fromDate(end);

        const q = query(
          collection(db, 'antrian'),
          where('created_at', '>=', startTimestamp),
          where('created_at', '<=', endTimestamp),
          orderBy('created_at', 'desc')
        );

        const snap = await getDocs(q);
        const list = [];
        snap.forEach(docSnap => {
          list.push({ id: docSnap.id, ...docSnap.data() });
        });
        setHistoryList(list);
      } catch (err) {
        console.error(err);
        showAlert('Gagal memuat histori antrian: ' + err.message, 'danger');
      }
      setHistoryLoading(false);
    };

    fetchHistory();
  }, [activeTab, filterMode, filterDate, filterMonth]);

  // Save General Settings
  const handleSaveSettings = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await Promise.all([
        setDoc(doc(db, 'settings', 'instansi_nama'), { value: settings.instansi_nama }),
        setDoc(doc(db, 'settings', 'instansi_alamat'), { value: settings.instansi_alamat }),
        setDoc(doc(db, 'settings', 'running_text'), { value: settings.running_text }),
        setDoc(doc(db, 'settings', 'display_video_url'), { value: settings.display_video_url }),
        setDoc(doc(db, 'settings', 'bell_sound_volume'), { value: String(settings.bell_sound_volume) }),
      ]);
      showAlert('Pengaturan umum berhasil disimpan.');
    } catch (err) {
      console.error(err);
      showAlert('Gagal menyimpan pengaturan umum: ' + err.message, 'danger');
    }
    setLoading(false);
  };

  // Save / Update Layanan
  const handleSaveLayanan = async (e) => {
    e.preventDefault();
    if (!layananForm.kode || !layananForm.nama || !layananForm.estimasi_waktu) {
      showAlert('Harap isi semua kolom layanan.', 'warning');
      return;
    }

    setLoading(true);
    const docId = isEditingLayanan ? layananForm.id : `pelayanan-${layananForm.kode.toUpperCase()}`;
    
    try {
      await setDoc(doc(db, 'pelayanan', docId), {
        kode: layananForm.kode.toUpperCase(),
        nama: layananForm.nama,
        estimasi_waktu: parseInt(layananForm.estimasi_waktu, 10)
      });

      showAlert(isEditingLayanan ? 'Layanan berhasil diupdate.' : 'Layanan baru berhasil ditambahkan.');
      setLayananForm({ id: '', kode: '', nama: '', estimasi_waktu: '' });
      setIsEditingLayanan(false);
    } catch (err) {
      console.error(err);
      showAlert('Gagal menyimpan layanan: ' + err.message, 'danger');
    }
    setLoading(false);
  };

  const handleEditLayanan = (layanan) => {
    setLayananForm({
      id: layanan.id,
      kode: layanan.kode,
      nama: layanan.nama,
      estimasi_waktu: String(layanan.estimasi_waktu)
    });
    setIsEditingLayanan(true);
  };

  const handleDeleteLayanan = async (id) => {
    if (!confirm('Apakah Anda yakin ingin menghapus layanan ini? Nomor antrian dengan layanan ini mungkin tidak dapat diproses.')) return;
    setLoading(true);
    try {
      await deleteDoc(doc(db, 'pelayanan', id));
      showAlert('Layanan berhasil dihapus.');
    } catch (err) {
      console.error(err);
      showAlert('Gagal menghapus layanan: ' + err.message, 'danger');
    }
    setLoading(false);
  };

  // Save / Add Loket
  const handleSaveLoket = async (e) => {
    e.preventDefault();
    if (!loketForm.nama) {
      showAlert('Harap isi nama loket.', 'warning');
      return;
    }

    setLoading(true);
    // Generate a simple ID based on loket name
    const sanitizedId = loketForm.nama.toLowerCase().replace(/\s+/g, '-');
    const docId = isEditingLoket ? loketForm.id : `loket-${sanitizedId}`;

    try {
      await setDoc(doc(db, 'loket', docId), {
        nama: loketForm.nama
      });

      showAlert(isEditingLoket ? 'Loket berhasil diupdate.' : 'Loket baru berhasil ditambahkan.');
      setLoketForm({ id: '', nama: '' });
      setIsEditingLoket(false);
    } catch (err) {
      console.error(err);
      showAlert('Gagal menyimpan loket: ' + err.message, 'danger');
    }
    setLoading(false);
  };

  const handleDeleteLoket = async (id) => {
    if (!confirm('Apakah Anda yakin ingin menghapus loket ini?')) return;
    setLoading(true);
    try {
      await deleteDoc(doc(db, 'loket', id));
      showAlert('Loket berhasil dihapus.');
    } catch (err) {
      console.error(err);
      showAlert('Gagal menghapus loket: ' + err.message, 'danger');
    }
    setLoading(false);
  };

  // Save / Update Operator
  const handleSaveOperator = async (e) => {
    e.preventDefault();
    if (!operatorForm.nama || !operatorForm.username || !operatorForm.password) {
      showAlert('Harap lengkapi semua data operator.', 'warning');
      return;
    }
    setLoading(true);
    try {
      if (isEditingOperator) {
        await setDoc(doc(db, 'operators', operatorForm.id), {
          nama: operatorForm.nama,
          username: operatorForm.username,
          password: operatorForm.password
        });
        showAlert('Operator berhasil diperbarui.');
      } else {
        const newDocRef = doc(collection(db, 'operators'));
        await setDoc(newDocRef, {
          nama: operatorForm.nama,
          username: operatorForm.username,
          password: operatorForm.password
        });
        showAlert('Operator baru berhasil ditambahkan.');
      }
      setOperatorForm({ id: '', nama: '', username: '', password: '' });
      setIsEditingOperator(false);
    } catch (err) {
      console.error(err);
      showAlert('Gagal menyimpan operator: ' + err.message, 'danger');
    }
    setLoading(false);
  };

  const handleEditOperator = (op) => {
    setOperatorForm(op);
    setIsEditingOperator(true);
  };

  const handleDeleteOperator = async (id) => {
    if (!confirm('Apakah Anda yakin ingin menghapus operator ini?')) return;
    setLoading(true);
    try {
      await deleteDoc(doc(db, 'operators', id));
      showAlert('Operator berhasil dihapus.');
    } catch (err) {
      console.error(err);
      showAlert('Gagal menghapus operator: ' + err.message, 'danger');
    }
    setLoading(false);
  };

  const formatPeriodeText = () => {
    if (filterMode === 'hari') {
      const d = new Date(filterDate);
      return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
    } else {
      const parts = filterMonth.split('-');
      const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, 1);
      return d.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
    }
  };

  const downloadExcel = () => {
    const dataToExport = historyList.filter(item => filterLayanan === 'semua' || item.pelayanan_id === filterLayanan);
    
    // CSV headers (UTF-8 BOM to prevent Excel encoding issues)
    let csvContent = "\uFEFF";
    csvContent += "No,Waktu Ambil,No. Antrian,Jenis Pelayanan,Nama Warga,Alamat,No Telepon\n";
    
    dataToExport.forEach((item, idx) => {
      const timeStr = item.created_at ? new Date(item.created_at.toMillis()).toLocaleString('id-ID') : '-';
      const nomorAntrian = item.nomor_lengkap;
      const pelayanan = item.pelayanan_nama;
      const nama = item.warga_nama || '-';
      const alamat = item.warga_alamat || '-';
      const hp = item.warga_hp || '-';
      
      const row = [
        idx + 1,
        `"${timeStr.replace(/"/g, '""')}"`,
        `"${nomorAntrian.replace(/"/g, '""')}"`,
        `"${pelayanan.replace(/"/g, '""')}"`,
        `"${nama.replace(/"/g, '""')}"`,
        `"${alamat.replace(/"/g, '""')}"`,
        `"${hp.replace(/"/g, '""')}"`
      ].join(",");
      csvContent += row + "\n";
    });
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    
    const dateLabel = filterMode === 'hari' ? filterDate : filterMonth;
    link.setAttribute("download", `laporan_antrian_${dateLabel}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!isLogged) {
    return (
      <div style={{ background: 'radial-gradient(circle at 50% 50%, #1a233a 0%, #0d111b 100%)', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
        <div className="card text-white p-5 shadow" style={{ maxWidth: '480px', width: '100%', background: 'rgba(255,255,255,0.05)', backdropFilter: 'blur(15px)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '20px' }}>
          <div className="text-center mb-4">
            <img src="/img/Logo.png" alt="Logo" style={{ height: '80px', objectFit: 'contain', marginBottom: '15px' }} />
            <h3 className="fw-bold text-white">Login Pengaturan</h3>
            <p className="text-info small">Sistem Antrian Kecamatan Gandrungmangu</p>
          </div>
          
          {loginError && (
            <div className="alert alert-danger border-0 text-white p-3 mb-3 text-center rounded-3 small" style={{ background: '#dc3545' }}>
              {loginError}
            </div>
          )}
          
          <form onSubmit={handleAdminLogin}>
            <div className="mb-3">
              <label className="form-label text-white-50 small fw-bold">Alamat Email / Username</label>
              <div className="input-group">
                <span className="input-group-text bg-dark border-secondary text-info"><i className="bi bi-envelope"></i></span>
                <input 
                  type="email" 
                  className="form-control bg-dark text-white border-secondary" 
                  placeholder="name@mail.id" 
                  required
                  value={emailInput}
                  onChange={e => setEmailInput(e.target.value)}
                />
              </div>
            </div>
            
            <div className="mb-4">
              <label className="form-label text-white-50 small fw-bold">Password</label>
              <div className="input-group">
                <span className="input-group-text bg-dark border-secondary text-info"><i className="bi bi-lock"></i></span>
                <input 
                  type="password" 
                  className="form-control bg-dark text-white border-secondary" 
                  placeholder="Password" 
                  required
                  value={passwordInput}
                  onChange={e => setPasswordInput(e.target.value)}
                />
              </div>
            </div>
            
            <button type="submit" className="btn btn-info w-100 py-3 fw-bold text-dark rounded-pill mb-3" style={{ transition: 'all 0.3s' }}>
              Masuk Pengaturan
            </button>
            
            <Link href="/" className="btn btn-outline-light w-100 py-2 rounded-pill text-white-50 small text-decoration-none text-center d-block">
              <i className="bi bi-arrow-left"></i> Kembali ke Portal
            </Link>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: 'radial-gradient(circle at 50% 50%, #1a233a 0%, #0d111b 100%)', minHeight: '100vh', padding: '40px 20px' }}>
      <div className="container" style={{ maxWidth: '1000px' }}>
        
        {/* Header */}
        <div className="d-flex justify-content-between align-items-center mb-5 border-bottom pb-4">
          <div className="d-flex align-items-center gap-3">
            <img src="/img/Logo.png" alt="Logo" style={{ height: '65px', objectFit: 'contain' }} />
            <div>
              <h1 className="fw-bold text-white m-0" style={{ fontSize: '2rem' }}>PENGATURAN SISTEM</h1>
              <p className="text-info m-0 small">Kecamatan Gandrungmangu - Real-time Database Configurator</p>
            </div>
          </div>
          <div className="d-flex gap-2">
            <Link href="/" className="btn btn-outline-info rounded-pill px-4">
              <i className="bi bi-arrow-left"></i> Kembali ke Portal
            </Link>
            <button onClick={handleLogout} className="btn btn-danger rounded-pill px-4">
              <i className="bi bi-box-arrow-right"></i> Keluar
            </button>
          </div>
        </div>

        {/* Status Alerts */}
        {alert.show && (
          <div className={`alert alert-${alert.type} border-0 text-white p-3 mb-4 text-center rounded-3 shadow`} style={{ background: alert.type === 'success' ? '#198754' : alert.type === 'danger' ? '#dc3545' : '#ffc107' }}>
            {alert.message}
          </div>
        )}

        {/* Tab Navigation */}
        <div className="d-flex gap-3 mb-4">
          <button 
            onClick={() => setActiveTab('umum')}
            className={`btn flex-grow-1 py-3 fw-bold rounded-3 transition ${activeTab === 'umum' ? 'btn-info text-dark' : 'btn-outline-light border-secondary text-white'}`}
            style={{ background: activeTab === 'umum' ? '' : 'rgba(255,255,255,0.03)' }}
          >
            <i className="bi bi-sliders me-2"></i> Pengaturan Umum
          </button>
          <button 
            onClick={() => setActiveTab('layanan')}
            className={`btn flex-grow-1 py-3 fw-bold rounded-3 transition ${activeTab === 'layanan' ? 'btn-info text-dark' : 'btn-outline-light border-secondary text-white'}`}
            style={{ background: activeTab === 'layanan' ? '' : 'rgba(255,255,255,0.03)' }}
          >
            <i className="bi bi-card-list me-2"></i> Kategori Layanan
          </button>
          <button 
            onClick={() => setActiveTab('loket')}
            className={`btn flex-grow-1 py-3 fw-bold rounded-3 transition ${activeTab === 'loket' ? 'btn-info text-dark' : 'btn-outline-light border-secondary text-white'}`}
            style={{ background: activeTab === 'loket' ? '' : 'rgba(255,255,255,0.03)' }}
          >
            <i className="bi bi-shop-window me-2"></i> Pengaturan Loket
          </button>
          <button 
            onClick={() => setActiveTab('daftar_pelayanan')}
            className={`btn flex-grow-1 py-3 fw-bold rounded-3 transition ${activeTab === 'daftar_pelayanan' ? 'btn-info text-dark' : 'btn-outline-light border-secondary text-white'}`}
            style={{ background: activeTab === 'daftar_pelayanan' ? '' : 'rgba(255,255,255,0.03)' }}
          >
            <i className="bi bi-journal-text me-2"></i> Daftar Pelayanan
          </button>
          <button 
            onClick={() => setActiveTab('operator_config')}
            className={`btn flex-grow-1 py-3 fw-bold rounded-3 transition ${activeTab === 'operator_config' ? 'btn-info text-dark' : 'btn-outline-light border-secondary text-white'}`}
            style={{ background: activeTab === 'operator_config' ? '' : 'rgba(255,255,255,0.03)' }}
          >
            <i className="bi bi-people me-2"></i> Manajemen Operator
          </button>
        </div>

        {/* Main Content Area */}
        <div className="card text-white p-4 mb-4" style={{ background: 'rgba(255,255,255,0.05)', backdropFilter: 'blur(15px)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '20px' }}>
          
          {loading && (
            <div className="text-center py-5">
              <div className="spinner-border text-info" role="status"></div>
              <p className="mt-3 text-info">Sinkronisasi data Firestore...</p>
            </div>
          )}

          {!loading && (
            <>
              {/* TAB 1: PENGATURAN UMUM */}
              {activeTab === 'umum' && (
                <form onSubmit={handleSaveSettings}>
                  <h4 className="fw-bold mb-4 text-info border-bottom pb-2">Informasi Instansi</h4>
                  <div className="row g-4">
                    <div className="col-md-6">
                      <label className="form-label fw-bold text-white-50">Nama Instansi</label>
                      <input 
                        type="text" 
                        className="form-control bg-dark text-white border-secondary py-2" 
                        required 
                        value={settings.instansi_nama || ''} 
                        onChange={e => setSettings({ ...settings, instansi_nama: e.target.value })}
                      />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label fw-bold text-white-50">Alamat Instansi</label>
                      <input 
                        type="text" 
                        className="form-control bg-dark text-white border-secondary py-2" 
                        required 
                        value={settings.instansi_alamat || ''} 
                        onChange={e => setSettings({ ...settings, instansi_alamat: e.target.value })}
                      />
                    </div>
                    
                    <h4 className="fw-bold mb-1 mt-5 text-info border-bottom pb-2">Pengaturan Display & Media</h4>
                    
                    <div className="col-12">
                      <label className="form-label fw-bold text-white-50">Teks Pengumuman Berjalan (Running Text)</label>
                      <textarea 
                        rows="3" 
                        className="form-control bg-dark text-white border-secondary py-2" 
                        required 
                        value={settings.running_text || ''} 
                        onChange={e => setSettings({ ...settings, running_text: e.target.value })}
                      ></textarea>
                    </div>

                    <div className="col-md-8">
                      <label className="form-label fw-bold text-white-50">Display YouTube Video URL</label>
                      <input 
                        type="url" 
                        className="form-control bg-dark text-white border-secondary py-2" 
                        placeholder="https://youtu.be/FkbZshiiS-k atau https://youtube.com/watch?v=..." 
                        value={settings.display_video_url || ''} 
                        onChange={e => setSettings({ ...settings, display_video_url: e.target.value })}
                      />
                      <small className="text-white-50 mt-1 d-block">Video ini akan diputar di halaman display utama secara loop.</small>
                    </div>

                    <div className="col-md-4">
                      <label className="form-label fw-bold text-white-50">Volume Suara Panggilan (Bell Chime)</label>
                      <div className="d-flex align-items-center gap-3">
                        <input 
                          type="range" 
                          className="form-range" 
                          min="0" 
                          max="1" 
                          step="0.1" 
                          value={settings.bell_sound_volume || '0.8'} 
                          onChange={e => setSettings({ ...settings, bell_sound_volume: e.target.value })}
                        />
                        <span className="badge bg-secondary p-2">{Math.round((parseFloat(settings.bell_sound_volume) || 0) * 100)}%</span>
                      </div>
                    </div>
                  </div>

                  <div className="text-end mt-5 pt-3 border-top border-secondary">
                    <button type="submit" className="btn btn-info btn-lg px-5 fw-bold text-dark rounded-pill">
                      Simpan Semua Perubahan
                    </button>
                  </div>
                </form>
              )}

              {/* TAB 2: KATEGORI LAYANAN */}
              {activeTab === 'layanan' && (
                <div>
                  <h4 className="fw-bold mb-4 text-info border-bottom pb-2">
                    {isEditingLayanan ? 'Edit Layanan' : 'Tambah Kategori Layanan Baru'}
                  </h4>
                  <form onSubmit={handleSaveLayanan} className="row g-3 mb-5 align-items-end p-3 rounded-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <div className="col-md-2">
                      <label className="form-label fw-bold text-white-50">Kode Layanan</label>
                      <input 
                        type="text" 
                        className="form-control bg-dark text-white border-secondary" 
                        placeholder="Contoh: A" 
                        maxLength="2" 
                        required 
                        disabled={isEditingLayanan}
                        value={layananForm.kode} 
                        onChange={e => setLayananForm({ ...layananForm, kode: e.target.value })}
                      />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label fw-bold text-white-50">Nama Layanan</label>
                      <input 
                        type="text" 
                        className="form-control bg-dark text-white border-secondary" 
                        placeholder="Contoh: Pelayanan Kependudukan" 
                        required 
                        value={layananForm.nama} 
                        onChange={e => setLayananForm({ ...layananForm, nama: e.target.value })}
                      />
                    </div>
                    <div className="col-md-2">
                      <label className="form-label fw-bold text-white-50">Estimasi (Menit)</label>
                      <input 
                        type="number" 
                        className="form-control bg-dark text-white border-secondary" 
                        placeholder="Contoh: 15" 
                        required 
                        value={layananForm.estimasi_waktu} 
                        onChange={e => setLayananForm({ ...layananForm, estimasi_waktu: e.target.value })}
                      />
                    </div>
                    <div className="col-md-2 d-flex gap-2">
                      <button type="submit" className="btn btn-info fw-bold w-100 py-2">
                        {isEditingLayanan ? 'Update' : 'Simpan'}
                      </button>
                      {isEditingLayanan && (
                        <button 
                          type="button" 
                          className="btn btn-outline-danger w-100 py-2" 
                          onClick={() => {
                            setLayananForm({ id: '', kode: '', nama: '', estimasi_waktu: '' });
                            setIsEditingLayanan(false);
                          }}
                        >
                          Batal
                        </button>
                      )}
                    </div>
                  </form>

                  <h4 className="fw-bold mb-3 text-white">Daftar Layanan Saat Ini</h4>
                  <div className="table-responsive">
                    <table className="table table-dark table-hover table-bordered align-middle m-0">
                      <thead>
                        <tr className="table-secondary text-dark">
                          <th style={{ width: '10%' }} className="text-center">Kode</th>
                          <th style={{ width: '50%' }}>Nama Layanan</th>
                          <th style={{ width: '20%' }} className="text-center">Estimasi Waktu</th>
                          <th style={{ width: '20%' }} className="text-center">Aksi</th>
                        </tr>
                      </thead>
                      <tbody>
                        {layananList.map((layanan) => (
                          <tr key={layanan.id}>
                            <td className="text-center fw-bold text-info fs-5">{layanan.kode}</td>
                            <td className="fw-semibold">{layanan.nama}</td>
                            <td className="text-center">{layanan.estimasi_waktu} Menit</td>
                            <td className="text-center">
                              <div className="d-flex justify-content-center gap-2">
                                <button className="btn btn-sm btn-outline-info" onClick={() => handleEditLayanan(layanan)}>
                                  <i className="bi bi-pencil-square"></i> Edit
                                </button>
                                <button className="btn btn-sm btn-outline-danger" onClick={() => handleDeleteLayanan(layanan.id)}>
                                  <i className="bi bi-trash"></i> Hapus
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                        {layananList.length === 0 && (
                          <tr>
                            <td colSpan="4" className="text-center py-4 text-white-50">Belum ada kategori layanan. Silakan tambahkan di atas.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* TAB 3: PENGATURAN LOKET */}
              {activeTab === 'loket' && (
                <div>
                  <h4 className="fw-bold mb-4 text-info border-bottom pb-2">
                    Tambah Loket Pelayanan Baru
                  </h4>
                  <form onSubmit={handleSaveLoket} className="row g-3 mb-5 align-items-end p-3 rounded-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <div className="col-md-9">
                      <label className="form-label fw-bold text-white-50">Nama Loket</label>
                      <input 
                        type="text" 
                        className="form-control bg-dark text-white border-secondary py-2" 
                        placeholder="Contoh: Loket 5, Loket Customer Service, dll." 
                        required 
                        value={loketForm.nama} 
                        onChange={e => setLoketForm({ ...loketForm, nama: e.target.value })}
                      />
                    </div>
                    <div className="col-md-3">
                      <button type="submit" className="btn btn-info fw-bold w-100 py-2">
                        Tambah Loket
                      </button>
                    </div>
                  </form>

                  <h4 className="fw-bold mb-3 text-white">Daftar Loket Terdaftar</h4>
                  <div className="table-responsive">
                    <table className="table table-dark table-hover table-bordered align-middle m-0">
                      <thead>
                        <tr className="table-secondary text-dark">
                          <th style={{ width: '80%' }}>Nama Loket</th>
                          <th style={{ width: '20%' }} className="text-center">Aksi</th>
                        </tr>
                      </thead>
                      <tbody>
                        {loketList.map((loket) => (
                          <tr key={loket.id}>
                            <td className="fw-bold text-info fs-5 ps-4">{loket.nama}</td>
                            <td className="text-center">
                              <button className="btn btn-sm btn-outline-danger" onClick={() => handleDeleteLoket(loket.id)}>
                                <i className="bi bi-trash"></i> Hapus
                              </button>
                            </td>
                          </tr>
                        ))}
                        {loketList.length === 0 && (
                          <tr>
                            <td colSpan="2" className="text-center py-4 text-white-50">Belum ada loket terdaftar. Silakan tambahkan di atas.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* TAB 4: DAFTAR PELAYANAN (HISTORI) */}
              {activeTab === 'daftar_pelayanan' && (
                <div>
                  <h4 className="fw-bold mb-4 text-info border-bottom pb-2">Histori Daftar Pelayanan</h4>
                  
                  {/* Filter Controls */}
                  <div className="row g-3 mb-4 p-3 rounded-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <div className="col-md-2">
                      <label className="form-label fw-bold text-white-50">Filter Waktu</label>
                      <select className="form-select bg-dark text-white border-secondary" value={filterMode} onChange={e => setFilterMode(e.target.value)}>
                        <option value="hari">Per Hari (Tanggal)</option>
                        <option value="bulan">Per Bulan</option>
                      </select>
                    </div>

                    {filterMode === 'hari' ? (
                      <div className="col-md-3">
                        <label className="form-label fw-bold text-white-50">Pilih Hari</label>
                        <input 
                          type="date" 
                          className="form-control bg-dark text-white border-secondary" 
                          value={filterDate} 
                          onChange={e => setFilterDate(e.target.value)} 
                        />
                      </div>
                    ) : (
                      <div className="col-md-3">
                        <label className="form-label fw-bold text-white-50">Pilih Bulan</label>
                        <input 
                          type="month" 
                          className="form-control bg-dark text-white border-secondary" 
                          value={filterMonth} 
                          onChange={e => setFilterMonth(e.target.value)} 
                        />
                      </div>
                    )}

                    <div className="col-md-3">
                      <label className="form-label fw-bold text-white-50">Jenis Pelayanan</label>
                      <select className="form-select bg-dark text-white border-secondary" value={filterLayanan} onChange={e => setFilterLayanan(e.target.value)}>
                        <option value="semua">-- Semua Pelayanan --</option>
                        {layananList.map(l => (
                          <option key={l.id} value={l.id}>{l.nama} ({l.kode})</option>
                        ))}
                      </select>
                    </div>

                    <div className="col-md-2 d-flex align-items-end">
                      <button 
                        type="button" 
                        className="btn btn-outline-info w-100 py-2 fw-semibold"
                        onClick={() => window.print()}
                      >
                        <i className="bi bi-printer"></i> Cetak Laporan
                      </button>
                    </div>

                    <div className="col-md-2 d-flex align-items-end">
                      <button 
                        type="button" 
                        className="btn btn-success w-100 py-2 fw-semibold text-dark"
                        onClick={downloadExcel}
                      >
                        <i className="bi bi-file-earmark-excel"></i> Unduh Excel
                      </button>
                    </div>
                  </div>

                  {/* History Data Table & Print Layout wrapper */}
                  {historyLoading ? (
                    <div className="text-center py-5">
                      <div className="spinner-border text-info" role="status"></div>
                      <p className="mt-2 text-info small">Memuat data histori...</p>
                    </div>
                  ) : (
                    <div id="report-print-wrapper">
                      {/* Print-only Header */}
                      <div className="d-none d-print-block text-dark text-center" style={{ marginBottom: '25px' }}>
                        <h2 className="fw-bold mb-1" style={{ fontSize: '18pt' }}>{settings.instansi_nama}</h2>
                        <p className="small mb-3" style={{ fontSize: '10pt', color: '#555' }}>{settings.instansi_alamat}</p>
                        <h4 className="fw-bold text-uppercase border-bottom border-2 border-dark pb-2" style={{ fontSize: '13pt', letterSpacing: '0.5px' }}>Laporan Daftar Pelayanan Antrian</h4>
                        <div className="d-flex justify-content-between mt-3 px-1" style={{ fontSize: '9pt', fontFamily: 'monospace' }}>
                          <span>Periode: <strong>{formatPeriodeText()}</strong></span>
                          <span>Layanan: <strong>{filterLayanan === 'semua' ? 'Semua Pelayanan' : layananList.find(l => l.id === filterLayanan)?.nama}</strong></span>
                        </div>
                      </div>

                      {/* Data Table */}
                      <div className="table-responsive">
                        <table className="table table-dark table-hover table-bordered align-middle m-0" id="report-table">
                          <thead>
                            <tr className="table-secondary text-dark">
                              <th style={{ width: '5%' }} className="text-center">No</th>
                              <th style={{ width: '12%' }} className="text-center">Waktu</th>
                              <th style={{ width: '13%' }} className="text-center">No. Antrian</th>
                              <th style={{ width: '18%' }}>Jenis Pelayanan</th>
                              <th style={{ width: '18%' }}>Nama</th>
                              <th style={{ width: '21%' }}>Alamat</th>
                              <th style={{ width: '13%' }}>No Telepon</th>
                            </tr>
                          </thead>
                          <tbody>
                            {historyList.filter(item => filterLayanan === 'semua' || item.pelayanan_id === filterLayanan).map((item, idx) => (
                              <tr key={item.id}>
                                <td className="text-center text-white-50">{idx + 1}</td>
                                <td className="text-center small">
                                  {item.created_at ? new Date(item.created_at.toMillis()).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' }) : '-'}
                                </td>
                                <td className="text-center fw-bold text-info">{item.nomor_lengkap}</td>
                                <td className="fw-semibold text-white">{item.pelayanan_nama}</td>
                                <td>{item.warga_nama || <em className="text-muted small">-</em>}</td>
                                <td>{item.warga_alamat || <em className="text-muted small">-</em>}</td>
                                <td>{item.warga_hp || <em className="text-muted small">-</em>}</td>
                              </tr>
                            ))}
                            {historyList.filter(item => filterLayanan === 'semua' || item.pelayanan_id === filterLayanan).length === 0 && (
                              <tr>
                                <td colSpan="7" className="text-center py-4 text-white-50">
                                  Tidak ada data antrian untuk filter terpilih.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Print custom stylesheet for report print */}
                  <style dangerouslySetInnerHTML={{__html: `
                    @media print {
                      @page {
                        size: A4 portrait;
                        margin: 15mm 20mm;
                      }
                      body {
                        background: #ffffff !important;
                        color: #000000 !important;
                      }
                      /* Hide everything except the report print wrapper */
                      body * {
                        visibility: hidden !important;
                      }
                      #report-print-wrapper, #report-print-wrapper * {
                        visibility: visible !important;
                      }
                      #report-print-wrapper {
                        position: absolute !important;
                        left: 0 !important;
                        top: 0 !important;
                        width: 100% !important;
                      }
                      #report-table {
                        width: 100% !important;
                        color: #000000 !important;
                        border-collapse: collapse !important;
                        margin-top: 10px !important;
                      }
                      #report-table th, #report-table td {
                        color: #000000 !important;
                        border: 1px solid #000000 !important;
                        background: #ffffff !important;
                        padding: 6px 8px !important;
                        font-size: 10pt !important;
                      }
                      #report-table th {
                        background-color: #f2f2f2 !important;
                        font-weight: bold !important;
                      }
                    }
                  `}} />
                </div>
              )}

              {/* TAB 5: MANAJEMEN OPERATOR */}
              {activeTab === 'operator_config' && (
                <div>
                  <h4 className="fw-bold mb-4 text-info border-bottom pb-2">
                    {isEditingOperator ? 'Edit Operator' : 'Tambah Operator Baru'}
                  </h4>
                  <form onSubmit={handleSaveOperator} className="row g-3 mb-5 align-items-end p-3 rounded-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <div className="col-md-4">
                      <label className="form-label fw-bold text-white-50">Nama Lengkap</label>
                      <input 
                        type="text" 
                        className="form-control bg-dark text-white border-secondary" 
                        placeholder="Contoh: Budi Santoso" 
                        required 
                        value={operatorForm.nama} 
                        onChange={e => setOperatorForm({ ...operatorForm, nama: e.target.value })}
                      />
                    </div>
                    <div className="col-md-3">
                      <label className="form-label fw-bold text-white-50">Username</label>
                      <input 
                        type="text" 
                        className="form-control bg-dark text-white border-secondary" 
                        placeholder="Contoh: budi" 
                        required 
                        value={operatorForm.username} 
                        onChange={e => setOperatorForm({ ...operatorForm, username: e.target.value })}
                      />
                    </div>
                    <div className="col-md-3">
                      <label className="form-label fw-bold text-white-50">Password</label>
                      <input 
                        type="password" 
                        className="form-control bg-dark text-white border-secondary" 
                        placeholder="Password login" 
                        required 
                        value={operatorForm.password} 
                        onChange={e => setOperatorForm({ ...operatorForm, password: e.target.value })}
                      />
                    </div>
                    <div className="col-md-2">
                      <button type="submit" className="btn btn-info fw-bold w-100 py-2 text-dark">
                        {isEditingOperator ? 'Perbarui' : 'Tambah'}
                      </button>
                    </div>
                  </form>

                  <h4 className="fw-bold mb-3 text-white">Daftar Operator Terdaftar</h4>
                  <div className="table-responsive">
                    <table className="table table-dark table-hover table-bordered align-middle m-0">
                      <thead>
                        <tr className="table-secondary text-dark">
                          <th style={{ width: '40%' }}>Nama Operator</th>
                          <th style={{ width: '30%' }}>Username</th>
                          <th style={{ width: '30%' }} className="text-center">Aksi</th>
                        </tr>
                      </thead>
                      <tbody>
                        {operatorList.map((op) => (
                          <tr key={op.id}>
                            <td className="fw-bold text-info fs-5 ps-4">{op.nama}</td>
                            <td><code>{op.username}</code></td>
                            <td className="text-center">
                              <button className="btn btn-sm btn-outline-info me-2" onClick={() => handleEditOperator(op)}>
                                <i className="bi bi-pencil"></i> Edit
                              </button>
                              <button className="btn btn-sm btn-outline-danger" onClick={() => handleDeleteOperator(op.id)}>
                                <i className="bi bi-trash"></i> Hapus
                              </button>
                            </td>
                          </tr>
                        ))}
                        {operatorList.length === 0 && (
                          <tr>
                            <td colSpan="3" className="text-center py-4 text-white-50">Belum ada operator terdaftar. Silakan tambahkan di atas.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}

        </div>
      </div>
    </div>
  );
}
