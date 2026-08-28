"use client";

import { useState, useEffect } from 'react';
import { db } from '../../lib/firebase';
import { collection, query, where, orderBy, onSnapshot, doc, updateDoc, Timestamp, getDocs } from 'firebase/firestore';
import Link from 'next/link';

export default function Operator() {
  const [pelayananList, setPelayananList] = useState([]);
  const [loketList, setLoketList] = useState(['Loket 1', 'Loket 2', 'Loket 3', 'Loket 4']);
  
  const [selectedLayanan, setSelectedLayanan] = useState(() => {
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem('op_layanan') || '';
    }
    return '';
  });
  const [selectedLoket, setSelectedLoket] = useState(() => {
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem('op_loket') || '';
    }
    return '';
  });
  const [isLogged, setIsLogged] = useState(() => {
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem('op_logged') === 'true';
    }
    return false;
  });

  // Authentication & Form States
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [operatorNama, setOperatorNama] = useState(() => {
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem('op_nama') || '';
    }
    return '';
  });
  const [loginError, setLoginError] = useState('');

  const [waitingQueues, setWaitingQueues] = useState([]);
  const [waitingQueuesB, setWaitingQueuesB] = useState([]);
  const [waitingQueuesC, setWaitingQueuesC] = useState([]);
  const [currentQueue, setCurrentQueue] = useState(null);
  const [stats, setStats] = useState({ waiting: 0, waitingB: 0, waitingC: 0, served: 0 });
  const [lastCompleted, setLastCompleted] = useState(null);
  const [selectedBerkasModal, setSelectedBerkasModal] = useState(null);

  useEffect(() => {
    // Fetch layanan
    const pRef = collection(db, 'pelayanan');
    getDocs(pRef).then(snap => {
      const data = [];
      snap.forEach(d => data.push({ id: d.id, ...d.data() }));
      setPelayananList(data);
    });

    // Fetch loket (Real-time)
    const unsubLoket = onSnapshot(collection(db, 'loket'), (snap) => {
      if (!snap.empty) {
        const list = [];
        snap.forEach(d => {
          if (d.data().nama) {
            list.push(d.data().nama);
          }
        });
        list.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
        setLoketList(list);
      }
    });

    return () => unsubLoket();
  }, []);

  const isMultiService = ['Loket 2', 'Loket 3', 'Loket 4'].includes(selectedLoket);

  useEffect(() => {
    if (!isLogged) return;

    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const startOfDay = Timestamp.fromDate(now);

    const q = query(
      collection(db, 'antrian'),
      where('created_at', '>=', startOfDay),
      orderBy('created_at', 'asc')
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      let waiting = [];
      let waitingB = [];
      let waitingC = [];
      let current = null;
      let served = 0;
      let totalWait = 0;
      let totalWaitB = 0;
      let totalWaitC = 0;
      let lastComp = null;

      snap.forEach(docSnap => {
        const data = { id: docSnap.id, ...docSnap.data() };
        
        if (data.status === 'menunggu') {
          if (isMultiService) {
            if (data.pelayanan_id === 'pelayanan-B') {
              waitingB.push(data);
              totalWaitB++;
            } else if (data.pelayanan_id === 'pelayanan-C') {
              waitingC.push(data);
              totalWaitC++;
            }
          } else {
            if (data.pelayanan_id === selectedLayanan) {
              waiting.push(data);
              totalWait++;
            }
          }
        }
        if (data.status === 'dipanggil' && data.loket === selectedLoket) {
          current = data;
        }
        if (data.status === 'selesai' && data.loket === selectedLoket) {
          served++;
          lastComp = data;
        }
      });

      setWaitingQueues(waiting);
      setWaitingQueuesB(waitingB);
      setWaitingQueuesC(waitingC);
      setCurrentQueue(current);
      setStats({ waiting: totalWait, waitingB: totalWaitB, waitingC: totalWaitC, served });
      setLastCompleted(lastComp);
    });

    return () => unsubscribe();
  }, [isLogged, selectedLayanan, selectedLoket, isMultiService]);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!selectedLayanan || !selectedLoket || !username.trim() || !password) {
      setLoginError('Harap lengkapi semua field.');
      return;
    }

    setLoginError('');
    try {
      const q = query(
        collection(db, 'operators'),
        where('username', '==', username.trim()),
        where('password', '==', password)
      );
      const snap = await getDocs(q);
      if (snap.empty) {
        setLoginError('Username atau Password operator salah.');
        return;
      }

      const opDoc = snap.docs[0].data();
      setOperatorNama(opDoc.nama);

      // Save session
      sessionStorage.setItem('op_logged', 'true');
      sessionStorage.setItem('op_layanan', selectedLayanan);
      sessionStorage.setItem('op_loket', selectedLoket);
      sessionStorage.setItem('op_nama', opDoc.nama);
      setIsLogged(true);
    } catch (err) {
      console.error(err);
      setLoginError('Terjadi kesalahan sistem saat verifikasi login.');
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem('op_logged');
    sessionStorage.removeItem('op_layanan');
    sessionStorage.removeItem('op_loket');
    sessionStorage.removeItem('op_nama');

    setUsername('');
    setPassword('');
    setIsLogged(false);
  };

  const layaniSekarang = async (queueToCall) => {
    if (currentQueue) {
      // Selesaikan yang lama
      await updateDoc(doc(db, 'antrian', currentQueue.id), {
        status: 'selesai',
        selesai_at: Timestamp.now()
      });
    }

    // Panggil yang baru
    await updateDoc(doc(db, 'antrian', queueToCall.id), {
      status: 'dipanggil',
      loket: selectedLoket,
      panggil_at: Timestamp.now(),
      panggil_ulang: 0
    });
  };

  const panggilBerikutnya = async () => {
    if (waitingQueues.length > 0) {
      await layaniSekarang(waitingQueues[0]);
    } else {
      alert('Tidak ada antrian yang menunggu.');
    }
  };

  const panggilBerikutnyaB = async () => {
    if (waitingQueuesB.length > 0) {
      await layaniSekarang(waitingQueuesB[0]);
    } else {
      alert('Tidak ada antrian B yang menunggu.');
    }
  };

  const panggilBerikutnyaC = async () => {
    if (waitingQueuesC.length > 0) {
      await layaniSekarang(waitingQueuesC[0]);
    } else {
      alert('Tidak ada antrian C yang menunggu.');
    }
  };

  const panggilUlang = async () => {
    if (currentQueue) {
      await updateDoc(doc(db, 'antrian', currentQueue.id), {
        panggil_ulang: currentQueue.panggil_ulang + 1,
        panggil_at: Timestamp.now()
      });
    }
  };

  const lewatkan = async () => {
    if (currentQueue) {
      await updateDoc(doc(db, 'antrian', currentQueue.id), {
        status: 'lewat'
      });
    }
  };

  const selesaikan = async () => {
    if (currentQueue) {
      await updateDoc(doc(db, 'antrian', currentQueue.id), {
        status: 'selesai',
        selesai_at: Timestamp.now()
      });
    }
  };

  const filteredPelayanan = pelayananList.filter(p => {
    if (!selectedLoket) return true;
    if (selectedLoket === 'Loket 1') {
      return p.kode === 'A';
    }
    if (['Loket 2', 'Loket 3', 'Loket 4'].includes(selectedLoket)) {
      return p.kode === 'B' || p.kode === 'C';
    }
    return true;
  });

  if (!isLogged) {
    return (
      <div style={{
        backgroundImage: `linear-gradient(rgba(15, 23, 42, 0.35), rgba(15, 23, 42, 0.45)), url('/img/bg-kecamatan.jpeg')`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        backgroundAttachment: 'fixed',
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px'
      }}>
        <div className="card text-white p-5 shadow-lg" style={{
          maxWidth: '520px',
          width: '100%',
          background: 'rgba(255, 255, 255, 0.10)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          borderRadius: '24px',
          border: '2px solid rgba(255, 255, 255, 0.45)',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.4)'
        }}>
          <div className="text-center mb-4">
            <div className="d-flex align-items-center justify-content-center gap-3 mb-3">
              <img src="/img/Logo.png" alt="Logo Cilacap" style={{ height: '75px', objectFit: 'contain', filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.6))' }} />
              <img src="/img/cilacap-bercahaya.png" alt="Logo Cilacap Bercahaya" style={{ height: '65px', objectFit: 'contain', filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.6))' }} />
            </div>
            <h3 className="fw-bold text-white mb-1" style={{ textShadow: '0 2px 4px rgba(0,0,0,0.9)' }}>Konsol Operator</h3>
            <p className="text-info small fw-bold" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.9)' }}>Sistem Antrian Kecamatan Gandrungmangu</p>
          </div>

          {loginError && (
            <div className="alert alert-danger border-0 text-white p-3 mb-3 text-center rounded-3 small fw-semibold" style={{ background: '#ef4444', textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>
              {loginError}
            </div>
          )}

          <form onSubmit={handleLogin}>
            <div className="mb-3">
              <label className="form-label text-white small fw-bold" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.9)' }}>Username Operator</label>
              <div className="input-group">
                <span className="input-group-text bg-white bg-opacity-25 border-white border-opacity-50 text-white"><i className="bi bi-person"></i></span>
                <input 
                  type="text" 
                  className="form-control bg-white bg-opacity-75 text-dark fw-bold border-white" 
                  placeholder="Username" 
                  required
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                />
              </div>
            </div>

            <div className="mb-3">
              <label className="form-label text-white small fw-bold" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.9)' }}>Password</label>
              <div className="input-group">
                <span className="input-group-text bg-white bg-opacity-25 border-white border-opacity-50 text-white"><i className="bi bi-lock"></i></span>
                <input 
                  type="password" 
                  className="form-control bg-white bg-opacity-75 text-dark fw-bold border-white" 
                  placeholder="Password" 
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                />
              </div>
            </div>

            <div className="row g-2 mb-4">
              <div className="col-md-6">
                <label className="form-label text-white small fw-bold" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.9)' }}>Pilih Loket</label>
                <select 
                  className="form-select bg-white bg-opacity-75 text-dark fw-bold border-white" 
                  required 
                  value={selectedLoket} 
                  onChange={e => {
                    const val = e.target.value;
                    setSelectedLoket(val);
                    if (!val) {
                      setSelectedLayanan('');
                      return;
                    }
                    const match = pelayananList.find(p => p.loket_nama && p.loket_nama.includes(val));
                    if (match) {
                      setSelectedLayanan(match.id);
                    }
                  }}
                >
                  <option value="">-- Pilih --</option>
                  {loketList.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
              <div className="col-md-6">
                <label className="form-label text-white small fw-bold" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.9)' }}>Pilih Layanan</label>
                <select 
                  className="form-select bg-white bg-opacity-75 text-dark fw-bold border-white" 
                  required 
                  value={selectedLayanan} 
                  onChange={e => {
                    const val = e.target.value;
                    setSelectedLayanan(val);
                    if (!val) {
                      setSelectedLoket('');
                      return;
                    }
                    const match = pelayananList.find(p => p.id === val);
                    if (match && match.loket_nama) {
                      if (match.loket_nama.includes(', ')) {
                        const firstLoket = match.loket_nama.split(', ')[0];
                        setSelectedLoket(firstLoket);
                      } else {
                        setSelectedLoket(match.loket_nama);
                      }
                    }
                  }}
                >
                  <option value="">-- Pilih --</option>
                  {filteredPelayanan.map(p => (
                    <option key={p.id} value={p.id}>{p.nama} ({p.kode}){p.loket_nama ? ` - ${p.loket_nama}` : ''}</option>
                  ))}
                </select>
              </div>
            </div>

            <button type="submit" className="btn btn-primary w-100 py-3 fw-bold rounded-pill mb-3 shadow-lg" style={{ background: 'linear-gradient(135deg, #0284c7, #2563eb)', border: '1px solid rgba(255,255,255,0.4)', textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>
              Masuk Konsol Operator
            </button>

            <Link href="/" className="btn btn-outline-light w-100 py-2 rounded-pill text-white small text-decoration-none text-center d-block fw-bold shadow-sm">
              <i className="bi bi-arrow-left"></i> Kembali ke Portal
            </Link>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      backgroundImage: `linear-gradient(rgba(15, 23, 42, 0.35), rgba(15, 23, 42, 0.45)), url('/img/bg-kecamatan.jpeg')`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat',
      backgroundAttachment: 'fixed',
      minHeight: '100vh',
      maxHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      padding: '15px 25px',
      boxSizing: 'border-box',
      overflow: 'hidden'
    }}>
      {/* Header Bar (Compact) */}
      <div className="d-flex justify-content-between align-items-center mb-3 px-4 py-2 rounded-4 shadow-lg" style={{
        background: 'rgba(255, 255, 255, 0.08)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        border: '2px solid rgba(255, 255, 255, 0.45)',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3), inset 0 0 15px rgba(255, 255, 255, 0.15)'
      }}>
        <div className="d-flex align-items-center gap-3">
          <img src="/img/Logo.png" alt="Logo Cilacap" style={{ height: '45px', objectFit: 'contain', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.6))' }} />
          <img src="/img/cilacap-bercahaya.png" alt="Logo Cilacap Bercahaya" style={{ height: '40px', objectFit: 'contain', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.6))' }} />
          <div>
            <h4 className="fw-bold m-0 text-white" style={{ fontSize: '1.4rem', textShadow: '0 2px 4px rgba(0,0,0,0.9)' }}>
              Konsol Operator: <span className="text-info">{selectedLoket}</span>
            </h4>
            <small className="text-white fw-bold" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.9)' }}>
              Petugas: <strong className="text-warning">{operatorNama || 'Operator'}</strong>
            </small>
          </div>
        </div>

        <div className="d-flex align-items-center gap-3">
          <img src="/img/logo-semringah.png" alt="Semringah" style={{ height: '50px', objectFit: 'contain', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.6))' }} />
          <button className="btn btn-danger btn-sm px-3 rounded-pill fw-bold shadow" onClick={handleLogout}>
            <i className="bi bi-box-arrow-right me-1"></i> Keluar
          </button>
        </div>
      </div>

      {/* Main Single-Viewport Layout */}
      <div className="row g-3 flex-grow-1 overflow-hidden" style={{ minHeight: 0 }}>
        
        {/* Left Column (Calling Control Center) */}
        <div className="col-lg-6 d-flex flex-column h-100">
          <div className="w-100 h-100 rounded-4 p-4 d-flex flex-column justify-content-between text-center shadow-lg" style={{
            background: 'rgba(255, 255, 255, 0.08)',
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
            border: '2px solid rgba(255, 255, 255, 0.45)',
            boxShadow: '0 12px 40px rgba(0, 0, 0, 0.35), inset 0 0 20px rgba(255, 255, 255, 0.12)'
          }}>
            {/* Header Service Info */}
            <div className="d-flex justify-content-between align-items-center border-bottom border-white border-opacity-25 pb-2">
              <div className="text-start">
                <h5 className="fw-bold m-0 text-white" style={{ textShadow: '0 2px 4px rgba(0,0,0,0.9)', fontSize: '1.25rem' }}>
                  {isMultiService 
                    ? 'Kependudukan (B) & E-KTP (C)' 
                    : pelayananList.find(p => p.id === selectedLayanan)?.nama}
                </h5>
                <small className="text-info fw-bold" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.9)' }}>Melayani: {selectedLoket}</small>
              </div>
              <span className="badge bg-success text-white border border-white border-opacity-25 py-2 px-3 fs-6 shadow fw-bold">
                Tersinkronisasi
              </span>
            </div>

            {/* 3D Embossed Called Number Display */}
            <div className="my-auto py-2">
              <span className="small text-uppercase fw-bold text-white tracking-wider" style={{ textShadow: '0 2px 4px rgba(0,0,0,0.9)', fontSize: '1.1rem' }}>
                Nomor Antrian Dipanggil
              </span>
              
              <h1 className="fw-extrabold my-2" style={{
                fontSize: '7.5rem',
                lineHeight: 0.88,
                fontWeight: 900,
                color: '#ff3333',
                textShadow: '0 3px 0 #dc2626, 0 6px 0 #b91c1c, 0 9px 0 #991b1b, 0 12px 25px rgba(0, 0, 0, 0.9)'
              }}>
                {currentQueue ? currentQueue.nomor_lengkap : '---'}
              </h1>

              <p className="text-white fw-bold mb-2 small" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.9)' }}>
                {currentQueue ? `Diulang: ${currentQueue.panggil_ulang}x` : 'Tidak ada antrian aktif saat ini.'}
              </p>

              {currentQueue && currentQueue.warga_nama && (
                <div className="p-2 rounded-3 text-start d-inline-block shadow" style={{ background: 'rgba(255, 255, 255, 0.12)', border: '1px solid rgba(255, 255, 255, 0.3)', backdropFilter: 'blur(8px)', minWidth: '280px' }}>
                  <div className="fw-bold border-bottom border-white border-opacity-25 pb-1 mb-1 text-info small d-flex justify-content-between align-items-center">
                    <span><i className="bi bi-person-fill me-1"></i> Data Warga</span>
                    {currentQueue.tipe === 'online' && <span className="badge bg-info text-dark font-monospace">ONLINE MOBILE</span>}
                  </div>
                  <div className="text-white small">Nama: <strong className="text-white">{currentQueue.warga_nama}</strong></div>
                  <div className="text-white small">Alamat: <span>{currentQueue.warga_alamat}</span> | HP: <span>{currentQueue.warga_hp}</span></div>
                  {(currentQueue.berkas_kk || currentQueue.berkas_ktp) && (
                    <button 
                      onClick={() => setSelectedBerkasModal(currentQueue)}
                      className="btn btn-sm btn-info w-100 fw-bold mt-2 py-1"
                    >
                      <i className="bi bi-file-earmark-medical me-1"></i> Lihat Berkas KK / KTP Warga
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Action Buttons Grid (Fits right on screen) */}
            <div className="row g-2">
              {isMultiService ? (
                <>
                  <div className="col-6">
                    <button onClick={panggilBerikutnyaB} className="btn btn-lg w-100 py-3 fw-bold text-white shadow" style={{ background: 'linear-gradient(135deg, #0284c7, #2563eb)', border: '1px solid rgba(255,255,255,0.4)', fontSize: '1.1rem', textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>
                      <i className="bi bi-chevron-double-right me-1"></i> Panggil Next (B)
                    </button>
                  </div>
                  <div className="col-6">
                    <button onClick={panggilBerikutnyaC} className="btn btn-lg w-100 py-3 fw-bold text-white shadow" style={{ background: 'linear-gradient(135deg, #10b981, #059669)', border: '1px solid rgba(255,255,255,0.4)', fontSize: '1.1rem', textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>
                      <i className="bi bi-chevron-double-right me-1"></i> Panggil Next (C)
                    </button>
                  </div>
                </>
              ) : (
                <div className="col-12">
                  <button onClick={panggilBerikutnya} className="btn btn-lg w-100 py-3 fw-bold text-white shadow" style={{ background: 'linear-gradient(135deg, #0284c7, #2563eb)', border: '1px solid rgba(255,255,255,0.4)', fontSize: '1.2rem', textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>
                    <i className="bi bi-chevron-double-right me-1"></i> Panggil Berikutnya
                  </button>
                </div>
              )}

              {currentQueue && (
                <>
                  <div className="col-4">
                    <button onClick={panggilUlang} className="btn btn-warning btn-lg w-100 py-2 fw-bold text-dark shadow" style={{ border: '1px solid rgba(255,255,255,0.4)' }}>
                      <i className="bi bi-volume-up-fill me-1"></i> Ulang
                    </button>
                  </div>
                  <div className="col-4">
                    <button onClick={lewatkan} className="btn btn-outline-light btn-lg w-100 py-2 fw-bold shadow">
                      <i className="bi bi-x-circle me-1"></i> Lewat
                    </button>
                  </div>
                  <div className="col-4">
                    <button onClick={selesaikan} className="btn btn-success btn-lg w-100 py-2 fw-bold text-white shadow" style={{ border: '1px solid rgba(255,255,255,0.4)' }}>
                      <i className="bi bi-check-circle-fill me-1"></i> Selesai
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Right Column (Queue List & Stats) */}
        <div className="col-lg-6 d-flex flex-column h-100">
          <div className="w-100 h-100 rounded-4 p-3 d-flex flex-column justify-content-start shadow-lg" style={{
            background: 'rgba(255, 255, 255, 0.08)',
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
            border: '2px solid rgba(255, 255, 255, 0.45)',
            boxShadow: '0 12px 40px rgba(0, 0, 0, 0.35), inset 0 0 20px rgba(255, 255, 255, 0.12)'
          }}>
            {/* Horizontal Stats Row */}
            <div className="d-flex align-items-center justify-content-between gap-2 mb-3 pb-2 border-bottom border-white border-opacity-25">
              {isMultiService ? (
                <>
                  <div className="px-3 py-2 rounded-3 text-center flex-fill" style={{ background: 'rgba(255, 255, 255, 0.12)', border: '1px solid rgba(255, 255, 255, 0.3)' }}>
                    <span className="text-white small fw-bold d-block" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.8)' }}>Menunggu B</span>
                    <span className="fs-3 fw-black text-info" style={{ textShadow: '0 2px 0 #0284c7, 0 4px 8px rgba(0,0,0,0.8)' }}>{stats.waitingB}</span>
                  </div>
                  <div className="px-3 py-2 rounded-3 text-center flex-fill" style={{ background: 'rgba(255, 255, 255, 0.12)', border: '1px solid rgba(255, 255, 255, 0.3)' }}>
                    <span className="text-white small fw-bold d-block" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.8)' }}>Menunggu C</span>
                    <span className="fs-3 fw-black text-success" style={{ textShadow: '0 2px 0 #047857, 0 4px 8px rgba(0,0,0,0.8)' }}>{stats.waitingC}</span>
                  </div>
                </>
              ) : (
                <div className="px-3 py-2 rounded-3 text-center flex-fill" style={{ background: 'rgba(255, 255, 255, 0.12)', border: '1px solid rgba(255, 255, 255, 0.3)' }}>
                  <span className="text-white small fw-bold d-block" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.8)' }}>Menunggu</span>
                  <span className="fs-3 fw-black text-danger" style={{ textShadow: '0 2px 0 #b91c1c, 0 4px 8px rgba(0,0,0,0.8)' }}>{stats.waiting}</span>
                </div>
              )}

              <div className="px-3 py-2 rounded-3 text-center flex-fill" style={{ background: 'rgba(255, 255, 255, 0.12)', border: '1px solid rgba(255, 255, 255, 0.3)' }}>
                <span className="text-white small fw-bold d-block" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.8)' }}>Selesai</span>
                <span className="fs-3 fw-black text-success" style={{ textShadow: '0 2px 0 #047857, 0 4px 8px rgba(0,0,0,0.8)' }}>{stats.served}</span>
              </div>
            </div>

            {/* Waiting Queue List Scrollable Container */}
            <div className="flex-grow-1 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 210px)' }}>
              {isMultiService ? (
                <div className="row g-2">
                  {/* Column for Antrian B */}
                  <div className="col-md-6 border-end border-white border-opacity-25 pe-2">
                    <h6 className="fw-bold mb-2 text-info d-flex align-items-center gap-1" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.8)' }}>
                      <i className="bi bi-people-fill"></i> Antrian B ({stats.waitingB})
                    </h6>
                    <div className="table-responsive">
                      <table className="table table-dark table-hover align-middle mb-0" style={{ background: 'transparent' }}>
                        <thead>
                          <tr>
                            <th>Nomor</th>
                            <th>Nama</th>
                            <th>Aksi</th>
                          </tr>
                        </thead>
                        <tbody>
                          {waitingQueuesB.map(q => (
                            <tr key={q.id}>
                              <td>
                                <span className="badge bg-primary fs-6 fw-bold shadow me-1">{q.nomor_lengkap}</span>
                                {q.tipe === 'online' && <span className="badge bg-info text-dark small">ONLINE</span>}
                              </td>
                              <td>
                                <strong className="text-white d-block small">{q.warga_nama || '-'}</strong>
                                <span className="text-light opacity-75 small">{q.warga_alamat}</span>
                              </td>
                              <td>
                                <div className="d-flex gap-1">
                                  <button onClick={() => layaniSekarang(q)} className="btn btn-sm btn-outline-info fw-bold py-0 px-2">Panggil</button>
                                  {(q.berkas_kk || q.berkas_ktp) && (
                                    <button onClick={() => setSelectedBerkasModal(q)} className="btn btn-sm btn-info text-dark fw-bold py-0 px-2" title="Lihat Berkas">
                                      <i className="bi bi-file-earmark-image"></i>
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                          {waitingQueuesB.length === 0 && (
                            <tr>
                              <td colSpan="3" className="text-center text-light opacity-75 py-3 small">Kosong</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Column for Antrian C */}
                  <div className="col-md-6 ps-2">
                    <h6 className="fw-bold mb-2 text-success d-flex align-items-center gap-1" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.8)' }}>
                      <i className="bi bi-people-fill"></i> Antrian C ({stats.waitingC})
                    </h6>
                    <div className="table-responsive">
                      <table className="table table-dark table-hover align-middle mb-0" style={{ background: 'transparent' }}>
                        <thead>
                          <tr>
                            <th>Nomor</th>
                            <th>Nama</th>
                            <th>Aksi</th>
                          </tr>
                        </thead>
                        <tbody>
                          {waitingQueuesC.map(q => (
                            <tr key={q.id}>
                              <td>
                                <span className="badge bg-success fs-6 fw-bold shadow me-1">{q.nomor_lengkap}</span>
                                {q.tipe === 'online' && <span className="badge bg-info text-dark small">ONLINE</span>}
                              </td>
                              <td>
                                <strong className="text-white d-block small">{q.warga_nama || '-'}</strong>
                                <span className="text-light opacity-75 small">{q.warga_alamat}</span>
                              </td>
                              <td>
                                <div className="d-flex gap-1">
                                  <button onClick={() => layaniSekarang(q)} className="btn btn-sm btn-outline-success fw-bold py-0 px-2">Panggil</button>
                                  {(q.berkas_kk || q.berkas_ktp) && (
                                    <button onClick={() => setSelectedBerkasModal(q)} className="btn btn-sm btn-info text-dark fw-bold py-0 px-2" title="Lihat Berkas">
                                      <i className="bi bi-file-earmark-image"></i>
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                          {waitingQueuesC.length === 0 && (
                            <tr>
                              <td colSpan="3" className="text-center text-light opacity-75 py-3 small">Kosong</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="table-responsive">
                  <table className="table table-dark table-hover align-middle mb-0" style={{ background: 'transparent' }}>
                    <thead>
                      <tr>
                        <th>Nomor</th>
                        <th>Warga</th>
                        <th>Status</th>
                        <th>Aksi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {waitingQueues.map(q => (
                        <tr key={q.id}>
                          <td>
                            <span className="badge bg-primary fs-6 fw-bold shadow me-1">{q.nomor_lengkap}</span>
                            {q.tipe === 'online' && <span className="badge bg-info text-dark small">ONLINE</span>}
                          </td>
                          <td>
                            {q.warga_nama ? (
                              <div>
                                <strong className="text-white d-block small">{q.warga_nama}</strong>
                                <span className="text-light opacity-75 small">{q.warga_alamat}</span>
                              </div>
                            ) : (
                              <span className="text-light opacity-75 small">-</span>
                            )}
                          </td>
                          <td><span className="badge bg-info text-white">Menunggu</span></td>
                          <td>
                            <div className="d-flex gap-1">
                              <button onClick={() => layaniSekarang(q)} className="btn btn-sm btn-outline-primary fw-bold py-0 px-2">Panggil</button>
                              {(q.berkas_kk || q.berkas_ktp) && (
                                <button onClick={() => setSelectedBerkasModal(q)} className="btn btn-sm btn-info text-dark fw-bold py-0 px-2" title="Lihat Berkas">
                                  <i className="bi bi-file-earmark-image"></i>
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                      {waitingQueues.length === 0 && (
                        <tr>
                          <td colSpan="4" className="text-center text-light opacity-75 py-4 small">Tidak ada antrian yang menunggu.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>

      </div>

      {/* Modal View Berkas KK / KTP */}
      {selectedBerkasModal && (
        <div className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center px-3" style={{ background: 'rgba(15, 23, 42, 0.75)', backdropFilter: 'blur(6px)', zIndex: 2000 }}>
          <div className="card text-dark p-4 border-0 w-100 shadow-lg" style={{ maxWidth: '800px', maxHeight: '90vh', overflowY: 'auto', background: '#ffffff', borderRadius: '20px' }}>
            <div className="d-flex justify-content-between align-items-center border-bottom pb-3 mb-3">
              <div>
                <span className="badge bg-info text-dark mb-1">Pemeriksaan Berkas Antrian Online</span>
                <h4 className="fw-bold m-0 text-primary">{selectedBerkasModal.nomor_lengkap} - {selectedBerkasModal.warga_nama}</h4>
                <small className="text-muted">NIK: {selectedBerkasModal.warga_nik || '-'} | KK: {selectedBerkasModal.warga_kk || '-'} | HP: {selectedBerkasModal.warga_hp || '-'}</small>
              </div>
              <button onClick={() => setSelectedBerkasModal(null)} className="btn-close"></button>
            </div>

            <div className="row g-4">
              {/* Berkas KK */}
              <div className="col-md-6 border-end">
                <h6 className="fw-bold text-dark mb-2"><i className="bi bi-file-earmark-pdf text-danger me-1"></i> Berkas Kartu Keluarga (KK)</h6>
                {selectedBerkasModal.berkas_kk ? (
                  <div>
                    {selectedBerkasModal.berkas_kk.startsWith('data:image') ? (
                      <img src={selectedBerkasModal.berkas_kk} alt="Berkas KK" className="img-fluid rounded border shadow-sm w-100" style={{ maxHeight: '350px', objectFit: 'contain', background: '#f8fafc' }} />
                    ) : (
                      <a href={selectedBerkasModal.berkas_kk} target="_blank" rel="noreferrer" className="btn btn-outline-primary btn-sm w-100 py-3">
                        <i className="bi bi-download me-1"></i> Buka / Unduh Document KK ({selectedBerkasModal.berkas_kk_nama || 'File'})
                      </a>
                    )}
                  </div>
                ) : (
                  <p className="text-muted small">Tidak ada lampiran berkas KK.</p>
                )}
              </div>

              {/* Berkas KTP */}
              <div className="col-md-6">
                <h6 className="fw-bold text-dark mb-2"><i className="bi bi-person-badge text-primary me-1"></i> Berkas KTP Pemohon</h6>
                {selectedBerkasModal.berkas_ktp ? (
                  <div>
                    {selectedBerkasModal.berkas_ktp.startsWith('data:image') ? (
                      <img src={selectedBerkasModal.berkas_ktp} alt="Berkas KTP" className="img-fluid rounded border shadow-sm w-100" style={{ maxHeight: '350px', objectFit: 'contain', background: '#f8fafc' }} />
                    ) : (
                      <a href={selectedBerkasModal.berkas_ktp} target="_blank" rel="noreferrer" className="btn btn-outline-primary btn-sm w-100 py-3">
                        <i className="bi bi-download me-1"></i> Buka / Unduh Document KTP ({selectedBerkasModal.berkas_ktp_nama || 'File'})
                      </a>
                    )}
                  </div>
                ) : (
                  <p className="text-muted small">Tidak ada lampiran berkas KTP.</p>
                )}
              </div>
            </div>

            {selectedBerkasModal.catatan && (
              <div className="alert alert-secondary mt-3 mb-0 small">
                <strong>Catatan Pemohon:</strong> {selectedBerkasModal.catatan}
              </div>
            )}

            <div className="text-end mt-4 pt-3 border-top">
              <button onClick={() => setSelectedBerkasModal(null)} className="btn btn-secondary px-4 fw-bold rounded-pill">
                Tutup Pemeriksaan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
