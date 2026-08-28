"use client";

import { useState, useEffect } from 'react';
import { db } from '../../lib/firebase';
import { collection, getDocs, query, where, addDoc, Timestamp, updateDoc, doc } from 'firebase/firestore';
import Link from 'next/link';

export default function AntrianOnline() {
  const [activeTab, setActiveTab] = useState('login'); // 'login' is default for unauthenticated citizens
  const [loading, setLoading] = useState(true);
  const [instansiNama, setInstansiNama] = useState('Kecamatan Gandrungmangu');
  const [instansiAlamat, setInstansiAlamat] = useState('Jl. Pertiwi Nomor 1');
  const [pelayanan, setPelayanan] = useState([]);
  
  // Warga User State (Session in localStorage)
  const [currentUser, setCurrentUser] = useState(null);

  // Form States
  const [loginForm, setLoginForm] = useState({ nikOrEmail: '', password: '', passphrase: '' });
  const [loginError, setLoginError] = useState('');
  
  const [regForm, setRegForm] = useState({
    noKK: '',
    nik: '',
    nama: '',
    email: '',
    hp: '',
    alamat: '',
    password: '',
    confirmPassword: '',
    passphrase: ''
  });
  const [regError, setRegError] = useState('');
  const [regSuccess, setRegSuccess] = useState('');

  const [resetForm, setResetForm] = useState({ identity: '', newPassword: '', confirmPassword: '' });
  const [resetStep, setResetStep] = useState(1); // 1: identify, 2: set password
  const [resetError, setResetError] = useState('');
  const [resetSuccess, setResetSuccess] = useState('');
  const [foundUserDocId, setFoundUserDocId] = useState(null);

  // Queue Form State
  const [selectedLayanan, setSelectedLayanan] = useState(null);
  const [berkasKK, setBerkasKK] = useState(null); // base64 string
  const [berkasKTP, setBerkasKTP] = useState(null); // base64 string
  const [berkasKKName, setBerkasKKName] = useState('');
  const [berkasKTPName, setBerkasKTPName] = useState('');
  const [catatanWarga, setCatatanWarga] = useState('');
  const [submittingQueue, setSubmittingQueue] = useState(false);
  const [createdTicket, setCreatedTicket] = useState(null);

  // User Active Queue List
  const [myQueues, setMyQueues] = useState([]);

  // Check Session & Fetch Settings
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('warga_user');
      if (saved) {
        try {
          setCurrentUser(JSON.parse(saved));
        } catch (e) {
          console.error(e);
        }
      }
    }

    const fetchData = async () => {
      try {
        const settingsRef = collection(db, 'settings');
        const settingsSnap = await getDocs(settingsRef);
        settingsSnap.forEach((doc) => {
          if (doc.id === 'instansi_nama') setInstansiNama(doc.data().value);
          if (doc.id === 'instansi_alamat') setInstansiAlamat(doc.data().value);
        });

        const pRef = collection(db, 'pelayanan');
        const pSnap = await getDocs(pRef);
        const data = [];
        pSnap.forEach(doc => {
          data.push({ id: doc.id, ...doc.data() });
        });
        data.sort((a, b) => a.kode.localeCompare(b.kode));
        setPelayanan(data);
      } catch (err) {
        console.error(err);
      }
      setLoading(false);
    };

    fetchData();
  }, []);

  // Fetch My Queues when user is logged in
  useEffect(() => {
    if (!currentUser) return;
    const fetchMyQueues = async () => {
      try {
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        const startOfDay = Timestamp.fromDate(now);

        const q = query(
          collection(db, 'antrian'),
          where('created_at', '>=', startOfDay)
        );
        const snap = await getDocs(q);
        const list = [];
        snap.forEach(d => {
          const item = { id: d.id, ...d.data() };
          if (item.warga_nik === currentUser.nik || item.warga_email === currentUser.email) {
            list.push(item);
          }
        });
        list.sort((a, b) => b.created_at.toMillis() - a.created_at.toMillis());
        setMyQueues(list);
      } catch (e) {
        console.error(e);
      }
    };
    fetchMyQueues();
  }, [currentUser, createdTicket]);

  // Helper file to base64
  const handleFileChange = (e, type) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 3 * 1024 * 1024) {
      alert('Ukuran file maksimal 3 MB.');
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      if (type === 'kk') {
        setBerkasKK(reader.result);
        setBerkasKKName(file.name);
      } else if (type === 'ktp') {
        setBerkasKTP(reader.result);
        setBerkasKTPName(file.name);
      }
    };
    reader.readAsDataURL(file);
  };

  // Handle Login
  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setLoginError('');
    if (!loginForm.nikOrEmail || !loginForm.password || !loginForm.passphrase) {
      setLoginError('Harap lengkapi NIK/Email, Password, dan Passphrase Keamanan Anda.');
      return;
    }

    try {
      const qUser = query(collection(db, 'warga_accounts'));
      const snap = await getDocs(qUser);
      let matched = null;
      let passphraseFailed = false;

      snap.forEach(d => {
        const u = { id: d.id, ...d.data() };
        if (
          (u.nik === loginForm.nikOrEmail.trim() || u.email?.toLowerCase() === loginForm.nikOrEmail.trim().toLowerCase() || u.hp === loginForm.nikOrEmail.trim()) &&
          u.password === loginForm.password
        ) {
          if (u.passphrase && u.passphrase.trim().toLowerCase() !== loginForm.passphrase.trim().toLowerCase()) {
            passphraseFailed = true;
          } else {
            matched = u;
          }
        }
      });

      if (matched) {
        setCurrentUser(matched);
        localStorage.setItem('warga_user', JSON.stringify(matched));
        setActiveTab('menu');
        setLoginForm({ nikOrEmail: '', password: '', passphrase: '' });
      } else if (passphraseFailed) {
        setLoginError('Passphrase Keamanan tidak sesuai / salah. Periksa kembali frasa rahasia Anda.');
      } else {
        setLoginError('NIK/Email, Password, atau Passphrase Keamanan tidak ditemukan / salah.');
      }
    } catch (err) {
      console.error(err);
      setLoginError('Terjadi kesalahan koneksi sistem: ' + err.message);
    }
  };

  // Handle Logout
  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem('warga_user');
    setActiveTab('login');
  };

  // Handle Register
  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    setRegError('');
    setRegSuccess('');

    if (!regForm.noKK || !regForm.nik || !regForm.nama || !regForm.email || !regForm.hp || !regForm.password || !regForm.passphrase) {
      setRegError('Harap lengkapi semua kolom pendaftaran termasuk Passphrase Keamanan.');
      return;
    }

    if (regForm.password !== regForm.confirmPassword) {
      setRegError('Konfirmasi password tidak cocok.');
      return;
    }

    try {
      // Check existing NIK/Email
      const snap = await getDocs(collection(db, 'warga_accounts'));
      let exists = false;
      snap.forEach(d => {
        const data = d.data();
        if (data.nik === regForm.nik.trim() || data.email?.toLowerCase() === regForm.email.trim().toLowerCase()) {
          exists = true;
        }
      });

      if (exists) {
        setRegError('NIK atau Email ini sudah terdaftar sebelumnya.');
        return;
      }

      const newAccount = {
        no_kk: regForm.noKK.trim(),
        nik: regForm.nik.trim(),
        nama: regForm.nama.trim(),
        email: regForm.email.trim().toLowerCase(),
        hp: regForm.hp.trim(),
        alamat: regForm.alamat.trim(),
        password: regForm.password,
        passphrase: regForm.passphrase.trim(),
        created_at: Timestamp.now()
      };

      const docRef = await addDoc(collection(db, 'warga_accounts'), newAccount);
      const userObj = { id: docRef.id, ...newAccount };
      
      setCurrentUser(userObj);
      localStorage.setItem('warga_user', JSON.stringify(userObj));
      setRegSuccess('Pendaftaran berhasil! Akun Anda siap digunakan.');
      setTimeout(() => {
        setActiveTab('menu');
      }, 1500);
    } catch (err) {
      console.error(err);
      setRegError('Gagal mendaftar: ' + err.message);
    }
  };

  // Handle Reset Password Step 1
  const handleIdentifyReset = async (e) => {
    e.preventDefault();
    setResetError('');
    setResetSuccess('');
    if (!resetForm.identity) {
      setResetError('Harap masukkan NIK, Email, atau Nomor HP Anda.');
      return;
    }

    try {
      const snap = await getDocs(collection(db, 'warga_accounts'));
      let foundDocId = null;
      let foundAccount = null;

      snap.forEach(d => {
        const data = d.data();
        const ident = resetForm.identity.trim().toLowerCase();
        if (
          data.nik === ident ||
          data.email?.toLowerCase() === ident ||
          data.hp === ident
        ) {
          foundDocId = d.id;
          foundAccount = data;
        }
      });

      if (foundDocId) {
        setFoundUserDocId(foundDocId);
        setResetStep(2);
        setResetSuccess(`Akun ditemukan atas nama: ${foundAccount.nama}. Kode verifikasi diproses ke Email (${foundAccount.email}) & WhatsApp (${foundAccount.hp}). Silakan buat password baru Anda.`);
      } else {
        setResetError('Data pemohon tidak ditemukan di sistem.');
      }
    } catch (err) {
      console.error(err);
      setResetError('Gagal memproses pemulihan: ' + err.message);
    }
  };

  // Handle Save New Password
  const handleSaveNewPassword = async (e) => {
    e.preventDefault();
    setResetError('');
    if (!resetForm.newPassword || !resetForm.confirmPassword) {
      setResetError('Harap lengkapi password baru.');
      return;
    }
    if (resetForm.newPassword !== resetForm.confirmPassword) {
      setResetError('Konfirmasi password tidak sesuai.');
      return;
    }

    try {
      await updateDoc(doc(db, 'warga_accounts', foundUserDocId), {
        password: resetForm.newPassword
      });

      setResetSuccess('Kata kunci berhasil diperbarui! Notifikasi konfirmasi password baru telah dikirimkan ke Email dan Nomor HP Anda.');
      setTimeout(() => {
        setResetStep(1);
        setResetForm({ identity: '', newPassword: '', confirmPassword: '' });
        setActiveTab('login');
      }, 2500);
    } catch (err) {
      console.error(err);
      setResetError('Gagal memperbarui kata kunci: ' + err.message);
    }
  };

  // Submit Online Queue Request
  const handleAmbilAntrianOnline = async (e) => {
    e.preventDefault();
    if (!selectedLayanan) {
      alert('Harap pilih kategori layanan.');
      return;
    }
    if (!berkasKK || !berkasKTP) {
      alert('Harap unggah Berkas Kartu Keluarga (KK) dan KTP Pemohon.');
      return;
    }

    setSubmittingQueue(true);
    try {
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      const startOfDay = Timestamp.fromDate(now);

      const q = query(
        collection(db, 'antrian'),
        where('created_at', '>=', startOfDay)
      );

      const antrianSnap = await getDocs(q);
      let nextNumber = 1;

      const todayLayananQueues = antrianSnap.docs
        .map(doc => doc.data())
        .filter(item => item.pelayanan_id === selectedLayanan.id);

      if (todayLayananQueues.length > 0) {
        const numbers = todayLayananQueues.map(item => item.nomor || 0);
        nextNumber = Math.max(...numbers) + 1;
      }

      const nomorLengkap = `${selectedLayanan.kode}-${nextNumber}`;
      const isKodeC = selectedLayanan.kode?.toUpperCase() === 'C' || selectedLayanan.nama?.toLowerCase().includes('perekaman');
      const isKodeA = selectedLayanan.kode?.toUpperCase() === 'A' || selectedLayanan.loket_nama?.toLowerCase().includes('loket a') || selectedLayanan.loket_nama?.toLowerCase().includes('loket 1');

      const sisaAntrian = todayLayananQueues.filter(item => item.status === 'menunggu').length + 1;

      const ticketData = {
        nomor: nextNumber,
        nomor_lengkap: `${nomorLengkap} (ONLINE)`,
        pelayanan_id: selectedLayanan.id,
        pelayanan_nama: selectedLayanan.nama,
        status: 'menunggu',
        tipe: 'online',
        loket: (isKodeC || isKodeA) ? null : (selectedLayanan.loket_nama || null),
        panggil_at: null,
        panggil_ulang: 0,
        selesai_at: null,
        created_at: Timestamp.now(),
        warga_nama: currentUser.nama,
        warga_nik: currentUser.nik,
        warga_kk: currentUser.no_kk,
        warga_email: currentUser.email,
        warga_hp: currentUser.hp,
        warga_alamat: currentUser.alamat,
        berkas_kk: berkasKK,
        berkas_kk_nama: berkasKKName,
        berkas_ktp: berkasKTP,
        berkas_ktp_nama: berkasKTPName,
        catatan: catatanWarga,
        sisa_antrian: sisaAntrian,
        waktu_str: new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })
      };

      const docRef = await addDoc(collection(db, 'antrian'), ticketData);
      setCreatedTicket({ id: docRef.id, ...ticketData });
      
      // Reset form
      setBerkasKK(null);
      setBerkasKTP(null);
      setBerkasKKName('');
      setBerkasKTPName('');
      setCatatanWarga('');
      setActiveTab('tiket');
    } catch (err) {
      console.error(err);
      alert('Gagal mengambil antrian online: ' + err.message);
    }
    setSubmittingQueue(false);
  };

  return (
    <div style={{
      backgroundImage: `linear-gradient(rgba(15, 23, 42, 0.80), rgba(15, 23, 42, 0.92)), url('/img/bg-kecamatan.jpeg')`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat',
      backgroundAttachment: 'fixed',
      minHeight: '100vh',
      padding: '20px 15px',
      color: '#ffffff',
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    }}>
      <div className="container" style={{ maxWidth: '650px' }}>
        
        {/* Header Branding */}
        <div className="text-center mb-4 p-4 rounded-4 shadow-lg position-relative overflow-hidden" style={{
          background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.12), rgba(251, 191, 36, 0.08), rgba(0, 91, 112, 0.18))',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          border: '2px solid rgba(251, 191, 36, 0.4)',
          boxShadow: '0 20px 40px rgba(0,0,0,0.5)'
        }}>
          {/* Top Logo Container */}
          <div className="d-flex align-items-center justify-content-center gap-3 mb-3 flex-wrap">
            <img src="/img/Logo.png" alt="Logo Cilacap" style={{ height: '65px', objectFit: 'contain', filter: 'drop-shadow(0 4px 10px rgba(0,0,0,0.5))' }} />
            <div style={{ width: '2px', height: '45px', background: 'rgba(255,255,255,0.25)' }}></div>
            <img src="/img/cilacap-bercahaya.png" alt="Logo Cilacap Bercahaya" style={{ height: '55px', objectFit: 'contain', filter: 'drop-shadow(0 4px 10px rgba(0,0,0,0.5))' }} />
            <div style={{ width: '2px', height: '45px', background: 'rgba(255,255,255,0.25)' }}></div>
            <img src="/img/logo-semringah.png" alt="Logo Gandrung Mangu Semringah" style={{ height: '70px', objectFit: 'contain', filter: 'drop-shadow(0 4px 12px rgba(251,191,36,0.3))' }} />
          </div>

          {/* Slogan Banner */}
          <div className="mb-3">
            <span className="badge px-3 py-2 rounded-pill fw-bold shadow-sm" style={{ 
              background: 'linear-gradient(135deg, #fbbf24, #f59e0b)', 
              color: '#0f172a', 
              fontSize: '0.85rem', 
              letterSpacing: '0.5px',
              border: '1px solid #fef08a',
              boxShadow: '0 4px 12px rgba(245, 158, 11, 0.4)'
            }}>
              <i className="bi bi-stars me-1"></i> "SEMAngat memberIkan pelayanan NGgawe bungAH"
            </span>
          </div>

          <h2 className="fw-black mb-1" style={{ fontSize: '1.85rem', color: '#ffffff', textShadow: '0 2px 8px rgba(0,0,0,0.9), 0 0 15px rgba(251,191,36,0.3)', letterSpacing: '-0.5px' }}>
            ANTRIAN MOBILE WARGA
          </h2>
          <h5 className="fw-bold mb-1" style={{ color: '#fbbf24', textShadow: '0 1px 4px rgba(0,0,0,0.9)' }}>
            {instansiNama}
          </h5>
          <p className="small text-white-50 m-0">{instansiAlamat}</p>
        </div>

        {/* User Session Bar (Shown only when logged in) */}
        {currentUser && (
          <div className="d-flex align-items-center justify-content-between p-3 rounded-4 mb-4 shadow-lg" style={{ background: 'rgba(16, 185, 129, 0.18)', border: '1.5px solid rgba(52, 211, 153, 0.5)', backdropFilter: 'blur(10px)' }}>
            <div className="d-flex align-items-center gap-3">
              <div className="rounded-circle d-flex align-items-center justify-content-center" style={{ width: '42px', height: '42px', background: 'rgba(52, 211, 153, 0.25)', border: '1px solid #34d399' }}>
                <i className="bi bi-person-check-fill fs-4 text-emerald-400" style={{ color: '#34d399' }}></i>
              </div>
              <div>
                <strong className="d-block text-white" style={{ fontSize: '1rem' }}>{currentUser.nama}</strong>
                <small className="text-white-50">NIK: {currentUser.nik} | KK: {currentUser.no_kk}</small>
              </div>
            </div>
            <button onClick={handleLogout} className="btn btn-outline-danger btn-sm rounded-pill px-3 fw-bold bg-dark bg-opacity-60">
              <i className="bi bi-box-arrow-right me-1"></i> Keluar
            </button>
          </div>
        )}

        {/* TAB NAVIGATION */}
        {currentUser ? (
          <div className="d-flex gap-2 mb-4">
            <button 
              onClick={() => setActiveTab('menu')}
              className={`btn flex-grow-1 py-2.5 fw-bold rounded-pill text-nowrap small transition ${activeTab === 'menu' ? 'shadow-lg' : 'btn-outline-light border-secondary text-white'}`}
              style={activeTab === 'menu' ? { background: 'linear-gradient(135deg, #fbbf24, #f59e0b)', color: '#0f172a', border: 'none', boxShadow: '0 6px 20px rgba(245,158,11,0.4)' } : {}}
            >
              <i className="bi bi-grid-fill me-1"></i> Menu Layanan
            </button>
            <button 
              onClick={() => setActiveTab('tiket')}
              className={`btn flex-grow-1 py-2.5 fw-bold rounded-pill text-nowrap small transition ${activeTab === 'tiket' ? 'shadow-lg' : 'btn-outline-light border-secondary text-white'}`}
              style={activeTab === 'tiket' ? { background: 'linear-gradient(135deg, #fbbf24, #f59e0b)', color: '#0f172a', border: 'none', boxShadow: '0 6px 20px rgba(245,158,11,0.4)' } : {}}
            >
              <i className="bi bi-ticket-perforated-fill me-1"></i> Tiket Saya ({myQueues.length})
            </button>
          </div>
        ) : (
          <div className="d-flex gap-2 mb-4">
            <button 
              onClick={() => setActiveTab('login')}
              className={`btn flex-grow-1 py-2.5 fw-bold rounded-pill text-nowrap small transition ${activeTab === 'login' ? 'shadow-lg' : 'btn-outline-light border-secondary text-white'}`}
              style={activeTab === 'login' ? { background: 'linear-gradient(135deg, #fbbf24, #f59e0b)', color: '#0f172a', border: 'none', boxShadow: '0 6px 20px rgba(245,158,11,0.4)' } : {}}
            >
              <i className="bi bi-box-arrow-in-right me-1"></i> Masuk Akun
            </button>
            <button 
              onClick={() => setActiveTab('register')}
              className={`btn flex-grow-1 py-2.5 fw-bold rounded-pill text-nowrap small transition ${activeTab === 'register' ? 'shadow-lg' : 'btn-outline-light border-secondary text-white'}`}
              style={activeTab === 'register' ? { background: 'linear-gradient(135deg, #fbbf24, #f59e0b)', color: '#0f172a', border: 'none', boxShadow: '0 6px 20px rgba(245,158,11,0.4)' } : {}}
            >
              <i className="bi bi-person-plus-fill me-1"></i> Daftar Akun Baru
            </button>
          </div>
        )}

        {/* CONTENT DISPLAY */}
        {loading ? (
          <div className="text-center py-5">
            <div className="spinner-border text-warning" role="status"></div>
            <p className="mt-3 text-warning fw-bold">Memuat antrian mobile Semringah...</p>
          </div>
        ) : (
          <>
            {/* VIEW 1: MENU LAYANAN (HANYA DITAMPILKAN SETELAH LOGIN) */}
            {activeTab === 'menu' && currentUser && (
              <div>
                <h4 className="fw-bold mb-3 d-flex align-items-center justify-content-between">
                  <span className="d-flex align-items-center gap-2"><i className="bi bi-hand-index-thumb text-warning"></i> Pilih Kategori Layanan</span>
                  <span className="badge rounded-pill small fw-normal fs-6" style={{ background: 'rgba(251, 191, 36, 0.2)', color: '#fbbf24', border: '1px solid #fbbf24' }}>{pelayanan.length} Kategori</span>
                </h4>

                <div className="row g-3">
                  {pelayanan.map(p => (
                    <div className="col-12" key={p.id}>
                      <div 
                        onClick={() => {
                          if (!currentUser) {
                            alert('Harap Masuk atau Daftar Akun terlebih dahulu sebelum mengambil antrian online.');
                            setActiveTab('login');
                            return;
                          }
                          setSelectedLayanan(p);
                          setActiveTab('antrian');
                        }}
                        className="p-3.5 rounded-4 shadow-lg cursor-pointer transition position-relative overflow-hidden"
                        style={{
                          background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.08), rgba(251, 191, 36, 0.05))',
                          backdropFilter: 'blur(10px)',
                          WebkitBackdropFilter: 'blur(10px)',
                          border: '1.5px solid rgba(251, 191, 36, 0.35)',
                          cursor: 'pointer'
                        }}
                      >
                        <div className="d-flex align-items-center justify-content-between">
                          <div className="d-flex align-items-center gap-3">
                            <span style={{ 
                              fontSize: '2.8rem', 
                              fontWeight: 900, 
                              color: '#fbbf24', 
                              lineHeight: 1, 
                              textShadow: '0 2px 0 #d97706, 0 4px 12px rgba(0,0,0,0.8)' 
                            }}>
                              {p.kode}
                            </span>
                            <div>
                              <h5 className="fw-bold m-0 text-white" style={{ fontSize: '1.25rem', textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>{p.nama}</h5>
                              <small className="text-white-50"><i className="bi bi-clock me-1 text-warning"></i> Estimasi pelayanan: {p.estimasi_waktu} Menit</small>
                            </div>
                          </div>
                          <span className="btn btn-sm rounded-pill px-3.5 py-1.5 fw-bold shadow-sm" style={{ background: '#fbbf24', color: '#0f172a', border: 'none' }}>
                            Ambil <i className="bi bi-chevron-right ms-1"></i>
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* VIEW 2: LOGIN WARGA */}
            {activeTab === 'login' && (
              <div className="card text-white p-4 shadow-lg" style={{ background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(30, 41, 59, 0.95))', backdropFilter: 'blur(14px)', border: '2px solid rgba(251, 191, 36, 0.4)', borderRadius: '24px' }}>
                <h3 className="fw-bold mb-1 text-warning text-center">MASUK AKUN WARGA</h3>
                <p className="text-center text-white-50 small mb-3">Gunakan NIK, Email, atau Nomor HP Anda</p>

                {/* Info pendaftaran bagi warga yang belum terdaftar */}
                <div className="p-3 mb-4 rounded-3 text-start shadow-sm" style={{ background: 'rgba(251, 191, 36, 0.15)', border: '1px solid rgba(251, 191, 36, 0.4)' }}>
                  <div className="d-flex align-items-center gap-2 mb-1 text-warning fw-bold small">
                    <i className="bi bi-info-circle-fill fs-6"></i>
                    <span>INFORMASI BAGI WARGA BARU</span>
                  </div>
                  <p className="small text-white-50 m-0" style={{ lineHeight: '1.45', fontSize: '0.85rem' }}>
                    Bagi warga yang <strong>belum memiliki akun</strong> antrian online, harap melakukan <strong>Pendaftaran Akun Terlebih Dahulu</strong> dengan menekan tombol <strong className="text-warning">"Daftar Baru"</strong> di bawah sebelum melakukan login.
                  </p>
                </div>

                {loginError && (
                  <div className="alert alert-danger bg-danger border-0 text-white p-3 mb-3 rounded-3 text-center small fw-semibold">
                    {loginError}
                  </div>
                )}

                <form onSubmit={handleLoginSubmit}>
                  <div className="mb-3">
                    <label className="form-label small fw-bold text-white-50">NIK / Email / Nomor HP</label>
                    <input 
                      type="text" 
                      className="form-control bg-dark text-white border-secondary py-2" 
                      placeholder="Masukkan NIK atau Email terdaftar" 
                      required 
                      value={loginForm.nikOrEmail}
                      onChange={e => setLoginForm({ ...loginForm, nikOrEmail: e.target.value })}
                    />
                  </div>

                  <div className="mb-3">
                    <div className="d-flex justify-content-between align-items-center mb-1">
                      <label className="form-label small fw-bold text-white-50 m-0">Kata Kunci (Password)</label>
                      <button 
                        type="button" 
                        className="btn btn-link text-warning text-decoration-none p-0 small fw-bold"
                        onClick={() => {
                          setResetStep(1);
                          setResetError('');
                          setResetSuccess('');
                          setActiveTab('reset');
                        }}
                      >
                        Lupa Password?
                      </button>
                    </div>
                    <input 
                      type="password" 
                      className="form-control bg-dark text-white border-secondary py-2" 
                      placeholder="Masukkan kata kunci Anda" 
                      required 
                      value={loginForm.password}
                      onChange={e => setLoginForm({ ...loginForm, password: e.target.value })}
                    />
                  </div>

                  {/* Passphrase Keamanan */}
                  <div className="mb-4">
                    <label className="form-label small fw-bold text-white-50 d-flex justify-content-between align-items-center">
                      <span>Passphrase Keamanan <span className="text-warning">*</span></span>
                      <span className="badge bg-warning text-dark font-monospace" style={{ fontSize: '0.7rem' }}>FITUR KEAMANAN</span>
                    </label>
                    <input 
                      type="password" 
                      className="form-control bg-dark text-white border-warning py-2" 
                      placeholder="Masukkan Passphrase Keamanan Anda" 
                      required 
                      value={loginForm.passphrase}
                      onChange={e => setLoginForm({ ...loginForm, passphrase: e.target.value })}
                    />
                    <small className="text-white-50 mt-1 d-block" style={{ fontSize: '0.75rem' }}>
                      Frasa keamanan tambahan yang Anda buat saat pendaftaran akun.
                    </small>
                  </div>

                  <button type="submit" className="btn w-100 py-3 fw-bold rounded-pill my-2 shadow-lg" style={{ background: 'linear-gradient(135deg, #fbbf24, #f59e0b)', color: '#0f172a', border: 'none' }}>
                    <i className="bi bi-shield-lock-fill me-1"></i> Masuk Sekarang
                  </button>

                  <div className="text-center border-top border-white border-opacity-10 pt-3 mt-3">
                    <span className="small text-white-50">Belum mendaftar akun warga? </span>
                    <button 
                      type="button" 
                      onClick={() => setActiveTab('register')}
                      className="btn btn-link text-warning text-decoration-none p-0 small fw-bold ms-1"
                    >
                      Daftar Baru Di Sini
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* VIEW 3: REGISTER WARGA */}
            {activeTab === 'register' && (
              <div className="card text-white p-4 shadow-lg" style={{ background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(30, 41, 59, 0.95))', backdropFilter: 'blur(14px)', border: '2px solid rgba(251, 191, 36, 0.4)', borderRadius: '24px' }}>
                <h3 className="fw-bold mb-1 text-warning text-center">PENDAFTARAN AKUN WARGA</h3>
                <p className="text-center text-white-50 small mb-3">Lengkapi data diri Anda untuk membuat akun antrian online baru</p>

                {/* Info pendaftaran */}
                <div className="p-3 mb-4 rounded-3 text-start shadow-sm" style={{ background: 'rgba(251, 191, 36, 0.15)', border: '1px solid rgba(251, 191, 36, 0.4)' }}>
                  <div className="d-flex align-items-center gap-2 mb-1 text-warning fw-bold small">
                    <i className="bi bi-person-plus-fill fs-6"></i>
                    <span>PETUNJUK PENDAFTARAN</span>
                  </div>
                  <p className="small text-white-50 m-0" style={{ lineHeight: '1.45', fontSize: '0.85rem' }}>
                    Silakan isi NIK, No. KK, Data Diri, serta <strong>Passphrase Keamanan</strong> di bawah ini untuk mengamankan akun Anda. Setelah pendaftaran selesai, Anda dapat langsung memilih layanan antrian.
                  </p>
                </div>

                {regError && (
                  <div className="alert alert-danger bg-danger border-0 text-white p-3 mb-3 rounded-3 text-center small fw-semibold">
                    {regError}
                  </div>
                )}
                {regSuccess && (
                  <div className="alert alert-success bg-success border-0 text-white p-3 mb-3 rounded-3 text-center small fw-semibold">
                    {regSuccess}
                  </div>
                )}

                <form onSubmit={handleRegisterSubmit}>
                  <div className="row g-3">
                    <div className="col-md-6">
                      <label className="form-label small fw-bold text-white-50">Nomor Kartu Keluarga (KK)</label>
                      <input 
                        type="text" 
                        className="form-control bg-dark text-white border-secondary" 
                        placeholder="16 Digit Nomor KK" 
                        maxLength="16" 
                        required 
                        value={regForm.noKK}
                        onChange={e => setRegForm({ ...regForm, noKK: e.target.value })}
                      />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label small fw-bold text-white-50">NIK / Nomor KTP</label>
                      <input 
                        type="text" 
                        className="form-control bg-dark text-white border-secondary" 
                        placeholder="16 Digit NIK" 
                        maxLength="16" 
                        required 
                        value={regForm.nik}
                        onChange={e => setRegForm({ ...regForm, nik: e.target.value })}
                      />
                    </div>

                    <div className="col-12">
                      <label className="form-label small fw-bold text-white-50">Nama Lengkap Pemohon</label>
                      <input 
                        type="text" 
                        className="form-control bg-dark text-white border-secondary" 
                        placeholder="Sesuai KTP" 
                        required 
                        value={regForm.nama}
                        onChange={e => setRegForm({ ...regForm, nama: e.target.value })}
                      />
                    </div>

                    <div className="col-md-6">
                      <label className="form-label small fw-bold text-white-50">Alamat Email</label>
                      <input 
                        type="email" 
                        className="form-control bg-dark text-white border-secondary" 
                        placeholder="contoh@mail.com" 
                        required 
                        value={regForm.email}
                        onChange={e => setRegForm({ ...regForm, email: e.target.value })}
                      />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label small fw-bold text-white-50">Nomor HP / WhatsApp</label>
                      <input 
                        type="tel" 
                        className="form-control bg-dark text-white border-secondary" 
                        placeholder="0812xxxxxxxx" 
                        required 
                        value={regForm.hp}
                        onChange={e => setRegForm({ ...regForm, hp: e.target.value })}
                      />
                    </div>

                    <div className="col-12">
                      <label className="form-label small fw-bold text-white-50">Alamat Rumah Lengkap</label>
                      <input 
                        type="text" 
                        className="form-control bg-dark text-white border-secondary" 
                        placeholder="RT/RW, Desa, Kecamatan" 
                        required 
                        value={regForm.alamat}
                        onChange={e => setRegForm({ ...regForm, alamat: e.target.value })}
                      />
                    </div>

                    <div className="col-md-6">
                      <label className="form-label small fw-bold text-white-50">Kata Kunci (Password)</label>
                      <input 
                        type="password" 
                        className="form-control bg-dark text-white border-secondary" 
                        placeholder="Buat password" 
                        required 
                        value={regForm.password}
                        onChange={e => setRegForm({ ...regForm, password: e.target.value })}
                      />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label small fw-bold text-white-50">Konfirmasi Kata Kunci</label>
                      <input 
                        type="password" 
                        className="form-control bg-dark text-white border-secondary" 
                        placeholder="Ulangi password" 
                        required 
                        value={regForm.confirmPassword}
                        onChange={e => setRegForm({ ...regForm, confirmPassword: e.target.value })}
                      />
                    </div>

                    {/* Passphrase Keamanan */}
                    <div className="col-12">
                      <label className="form-label small fw-bold text-white-50 d-flex justify-content-between align-items-center">
                        <span>Passphrase Keamanan (Frasa Rahasia) <span className="text-warning">*</span></span>
                        <span className="badge bg-warning text-dark font-monospace" style={{ fontSize: '0.7rem' }}>KEAMANAN GANDA</span>
                      </label>
                      <input 
                        type="password" 
                        className="form-control bg-dark text-white border-warning py-2" 
                        placeholder="Buat Passphrase Keamanan (Contoh: GandrungMangu2026)" 
                        required 
                        value={regForm.passphrase}
                        onChange={e => setRegForm({ ...regForm, passphrase: e.target.value })}
                      />
                      <small className="text-white-50 mt-1 d-block" style={{ fontSize: '0.75rem' }}>
                        Passphrase adalah kata/frasa rahasia kedua untuk mengamankan otentikasi login Anda.
                      </small>
                    </div>
                  </div>

                  <button type="submit" className="btn w-100 py-3 fw-bold rounded-pill mt-4 shadow-lg" style={{ background: 'linear-gradient(135deg, #fbbf24, #f59e0b)', color: '#0f172a', border: 'none' }}>
                    <i className="bi bi-check-circle-fill me-1"></i> Daftar Akun Baru Sekarang
                  </button>

                  <div className="text-center border-top border-white border-opacity-10 pt-3 mt-3">
                    <span className="small text-white-50">Sudah memiliki akun terdaftar? </span>
                    <button 
                      type="button" 
                      onClick={() => setActiveTab('login')}
                      className="btn btn-link text-warning text-decoration-none p-0 small fw-bold ms-1"
                    >
                      Masuk Di Sini
                    </button>
                  </div>
                </form>
              </div>
            )}



            {/* VIEW 4: RESET PASSWORD / LUPA PASSWORD */}
            {activeTab === 'reset' && (
              <div className="card text-white p-4 shadow-lg" style={{ background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(30, 41, 59, 0.95))', backdropFilter: 'blur(14px)', border: '2px solid rgba(251, 191, 36, 0.4)', borderRadius: '24px' }}>
                <h3 className="fw-bold mb-1 text-warning text-center">PEMULIHAN KATA KUNCI</h3>
                <p className="text-center text-white-50 small mb-4">Reset password akan diverifikasi & dikirimkan ke Email dan Nomor HP terdaftar</p>

                {resetError && (
                  <div className="alert alert-danger bg-danger border-0 text-white p-3 mb-3 rounded-3 text-center small fw-semibold">
                    {resetError}
                  </div>
                )}
                {resetSuccess && (
                  <div className="alert alert-success bg-success border-0 text-white p-3 mb-3 rounded-3 text-center small fw-semibold">
                    {resetSuccess}
                  </div>
                )}

                {resetStep === 1 ? (
                  <form onSubmit={handleIdentifyReset}>
                    <div className="mb-4">
                      <label className="form-label small fw-bold text-white-50">Masukkan NIK / Email / Nomor HP Terdaftar</label>
                      <input 
                        type="text" 
                        className="form-control bg-dark text-white border-secondary py-2" 
                        placeholder="Contoh: NIK 3301xxxx atau Email" 
                        required 
                        value={resetForm.identity}
                        onChange={e => setResetForm({ ...resetForm, identity: e.target.value })}
                      />
                    </div>
                    <button type="submit" className="btn w-100 py-3 fw-bold rounded-pill text-dark shadow-lg" style={{ background: 'linear-gradient(135deg, #fbbf24, #f59e0b)', color: '#0f172a', border: 'none' }}>
                      Verifikasi Data Pemohon
                    </button>
                    <div className="text-center mt-3">
                      <button type="button" onClick={() => setActiveTab('login')} className="btn btn-link text-white-50 text-decoration-none small">
                        <i className="bi bi-arrow-left me-1"></i> Kembali ke Login
                      </button>
                    </div>
                  </form>
                ) : (
                  <form onSubmit={handleSaveNewPassword}>
                    <div className="mb-3">
                      <label className="form-label small fw-bold text-white-50">Kata Kunci Baru</label>
                      <input 
                        type="password" 
                        className="form-control bg-dark text-white border-secondary py-2" 
                        placeholder="Masukkan password baru" 
                        required 
                        value={resetForm.newPassword}
                        onChange={e => setResetForm({ ...resetForm, newPassword: e.target.value })}
                      />
                    </div>
                    <div className="mb-4">
                      <label className="form-label small fw-bold text-white-50">Konfirmasi Kata Kunci Baru</label>
                      <input 
                        type="password" 
                        className="form-control bg-dark text-white border-secondary py-2" 
                        placeholder="Ulangi password baru" 
                        required 
                        value={resetForm.confirmPassword}
                        onChange={e => setResetForm({ ...resetForm, confirmPassword: e.target.value })}
                      />
                    </div>
                    <button type="submit" className="btn btn-success w-100 py-3 fw-bold rounded-pill text-white shadow-lg">
                      Simpan Password Baru & Kirim Notifikasi HP/Email
                    </button>
                  </form>
                )}
              </div>
            )}

            {/* VIEW 5: FORM AMBIL ANTRIAN ONLINE & UPLOAD BERKAS */}
            {activeTab === 'antrian' && selectedLayanan && (
              <div className="card text-white p-4 shadow-lg" style={{ background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(30, 41, 59, 0.95))', backdropFilter: 'blur(14px)', border: '2px solid rgba(251, 191, 36, 0.4)', borderRadius: '24px' }}>
                <div className="d-flex align-items-center justify-content-between border-bottom border-white border-opacity-25 pb-3 mb-3">
                  <div>
                    <span className="badge px-3 py-1 rounded-pill small fw-bold" style={{ background: '#fbbf24', color: '#0f172a' }}>Kategori {selectedLayanan.kode}</span>
                    <h4 className="fw-bold m-0 mt-1 text-white">{selectedLayanan.nama}</h4>
                  </div>
                  <button onClick={() => setActiveTab('menu')} className="btn btn-outline-light btn-sm rounded-pill">
                    Ganti Layanan
                  </button>
                </div>

                <form onSubmit={handleAmbilAntrianOnline}>
                  {/* Summary User Info */}
                  <div className="p-3 rounded-3 mb-3" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(251, 191, 36, 0.2)' }}>
                    <h6 className="fw-bold text-warning mb-2"><i className="bi bi-person-vcard me-1"></i> Data Pemohon Online</h6>
                    <div className="row g-2 small">
                      <div className="col-6">Nama: <strong>{currentUser.nama}</strong></div>
                      <div className="col-6">NIK: <strong>{currentUser.nik}</strong></div>
                      <div className="col-6">No. KK: <strong>{currentUser.no_kk}</strong></div>
                      <div className="col-6">HP: <strong>{currentUser.hp}</strong></div>
                    </div>
                  </div>

                  {/* Upload Berkas KK */}
                  <div className="mb-3">
                    <label className="form-label small fw-bold text-white d-flex align-items-center justify-content-between">
                      <span><i className="bi bi-file-earmark-arrow-up text-warning me-1"></i> Upload Berkas Kartu Keluarga (KK) <span className="text-danger">*</span></span>
                      {berkasKKName && <span className="badge bg-success text-white">Terunggah</span>}
                    </label>
                    <input 
                      type="file" 
                      accept="image/*,.pdf" 
                      className="form-control bg-dark text-white border-secondary py-2" 
                      required 
                      onChange={e => handleFileChange(e, 'kk')}
                    />
                    <small className="text-white-50">Upload foto/pdf KK yang jelas (Maks. 3MB).</small>
                  </div>

                  {/* Upload Berkas KTP */}
                  <div className="mb-4">
                    <label className="form-label small fw-bold text-white d-flex align-items-center justify-content-between">
                      <span><i className="bi bi-person-badge text-warning me-1"></i> Upload Berkas KTP Pemohon <span className="text-danger">*</span></span>
                      {berkasKTPName && <span className="badge bg-success text-white">Terunggah</span>}
                    </label>
                    <input 
                      type="file" 
                      accept="image/*,.pdf" 
                      className="form-control bg-dark text-white border-secondary py-2" 
                      required 
                      onChange={e => handleFileChange(e, 'ktp')}
                    />
                    <small className="text-white-50">Upload foto/pdf KTP asli yang terbaca jelas (Maks. 3MB).</small>
                  </div>

                  {/* Optional Catatan */}
                  <div className="mb-4">
                    <label className="form-label small fw-bold text-white-50">Catatan Tambahan (Opsional)</label>
                    <textarea 
                      rows="2" 
                      className="form-control bg-dark text-white border-secondary" 
                      placeholder="Contoh: Rencana kedatangan jam 09.00 WIB" 
                      value={catatanWarga}
                      onChange={e => setCatatanWarga(e.target.value)}
                    ></textarea>
                  </div>

                  <button 
                    type="submit" 
                    disabled={submittingQueue} 
                    className="btn w-100 py-3 fw-bold rounded-pill shadow-lg fs-5"
                    style={{ background: 'linear-gradient(135deg, #fbbf24, #f59e0b)', color: '#0f172a', border: 'none' }}
                  >
                    {submittingQueue ? (
                      <>
                        <span className="spinner-border spinner-border-sm me-2" role="status"></span>
                        Memproses Antrian Online...
                      </>
                    ) : (
                      <>
                        <i className="bi bi-send-check-fill me-1"></i> Ambil & Simpan Antrian Online
                      </>
                    )}
                  </button>
                </form>
              </div>
            )}

            {/* VIEW 6: TIKET DIGITAL MOBILE WARGA */}
            {activeTab === 'tiket' && (
              <div>
                <h4 className="fw-bold mb-3 d-flex align-items-center justify-content-between">
                  <span className="d-flex align-items-center gap-2"><i className="bi bi-ticket-perforated text-warning"></i> Tiket Antrian Saya</span>
                  <button onClick={() => setActiveTab('menu')} className="btn btn-sm rounded-pill fw-bold" style={{ background: '#fbbf24', color: '#0f172a', border: 'none' }}>
                    + Ambil Lagi
                  </button>
                </h4>

                {myQueues.length === 0 ? (
                  <div className="card p-4 text-center text-white-50 border-secondary bg-dark bg-opacity-50 rounded-4">
                    <i className="bi bi-ticket-perforated fs-1 text-warning mb-2"></i>
                    <p className="m-0">Anda belum memiliki antrian online aktif hari ini.</p>
                  </div>
                ) : (
                  <div className="row g-3">
                    {myQueues.map(q => (
                      <div className="col-12" key={q.id}>
                        <div className="p-4 rounded-4 shadow-lg text-center position-relative overflow-hidden" style={{
                          background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.96), rgba(30, 41, 59, 0.96))',
                          border: '2px solid #fbbf24',
                          boxShadow: '0 20px 40px rgba(0,0,0,0.6)'
                        }}>
                          {/* Top Decorative Banner */}
                          <div className="py-1 px-3 rounded-bottom-4 mb-3 d-flex justify-content-between align-items-center" style={{ background: 'rgba(251, 191, 36, 0.15)', borderBottom: '1px solid rgba(251, 191, 36, 0.3)' }}>
                            <div className="d-flex align-items-center gap-2">
                              <img src="/img/logo-semringah.png" alt="Semringah" style={{ height: '24px', objectFit: 'contain' }} />
                              <span className="badge font-monospace fw-bold" style={{ background: '#fbbf24', color: '#0f172a' }}>ANTRIAN MOBILE</span>
                            </div>
                            <span className={`badge ${q.status === 'dipanggil' ? 'bg-danger text-white blink' : q.status === 'selesai' ? 'bg-success text-white' : 'bg-warning text-dark'} fw-bold`}>
                              STATUS: {q.status.toUpperCase()}
                            </span>
                          </div>

                          <h5 className="text-white-50 small mb-1">{instansiNama}</h5>
                          <div className="fw-black text-warning my-2" style={{ fontSize: '3.8rem', lineHeight: 1, letterSpacing: '-1px', textShadow: '0 2px 0 #d97706, 0 4px 12px rgba(0,0,0,0.9)' }}>
                            {q.nomor_lengkap}
                          </div>

                          <h5 className="fw-bold text-white mb-2">{q.pelayanan_nama}</h5>
                          
                          {q.loket && (
                            <div className="p-2 rounded-3 border fw-bold mb-3" style={{ background: 'rgba(6, 182, 212, 0.15)', borderColor: '#06b6d4', color: '#38bdf8' }}>
                              MENUJU: {q.loket}
                            </div>
                          )}

                          <div className="p-2 rounded-3 bg-dark border border-secondary mb-3 small">
                            <div className="text-white-50">Estimasi Sisa Panggilan Sebelum Anda:</div>
                            <div className="fs-5 fw-bold text-warning">{q.sisa_antrian || 1} Antrian</div>
                          </div>

                          <div className="d-flex align-items-center justify-content-center gap-2 text-white-50 small border-top border-secondary pt-3">
                            <i className="bi bi-clock-history text-warning"></i>
                            <span>Waktu Daftar: {q.waktu_str || new Date(q.created_at?.toMillis()).toLocaleString('id-ID')}</span>
                          </div>

                          <div className="mt-3">
                            <button 
                              onClick={() => alert(`Tiket Antrian Digital Anda [${q.nomor_lengkap}] aktif. Tunjukkan layar HP ini saat tiba di loket pelayanan.`)}
                              className="btn w-100 rounded-pill btn-sm fw-bold shadow-sm"
                              style={{ background: 'linear-gradient(135deg, #fbbf24, #f59e0b)', color: '#0f172a', border: 'none' }}
                            >
                              <i className="bi bi-qr-code-scan me-1"></i> Tunjukkan Tiket Digital Ini
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}

      </div>
    </div>
  );
}
