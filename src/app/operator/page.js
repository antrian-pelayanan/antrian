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
      <div style={{ background: 'radial-gradient(circle at 50% 50%, #1a233a 0%, #0d111b 100%)', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
        <div className="card text-white p-5 shadow" style={{ maxWidth: '520px', width: '100%', background: 'rgba(255,255,255,0.05)', backdropFilter: 'blur(15px)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '20px' }}>
          <div className="text-center mb-4">
            <img src="/img/Logo.png" alt="Logo" style={{ height: '80px', objectFit: 'contain', marginBottom: '15px' }} />
            <h3 className="fw-bold text-white">Konsol Operator</h3>
            <p className="text-info small">Sistem Antrian Kecamatan Gandrungmangu</p>
          </div>

          {loginError && (
            <div className="alert alert-danger border-0 text-white p-3 mb-3 text-center rounded-3 small" style={{ background: '#dc3545' }}>
              {loginError}
            </div>
          )}

          <form onSubmit={handleLogin}>
            <div className="mb-3">
              <label className="form-label text-white-50 small fw-bold">Username Operator</label>
              <div className="input-group">
                <span className="input-group-text bg-dark border-secondary text-info"><i className="bi bi-person"></i></span>
                <input 
                  type="text" 
                  className="form-control bg-dark text-white border-secondary" 
                  placeholder="Username" 
                  required
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                />
              </div>
            </div>

            <div className="mb-3">
              <label className="form-label text-white-50 small fw-bold">Password</label>
              <div className="input-group">
                <span className="input-group-text bg-dark border-secondary text-info"><i className="bi bi-lock"></i></span>
                <input 
                  type="password" 
                  className="form-control bg-dark text-white border-secondary" 
                  placeholder="Password" 
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                />
              </div>
            </div>

            <div className="row g-2 mb-4">
              <div className="col-md-6">
                <label className="form-label text-white-50 small fw-bold">Pilih Loket</label>
                <select 
                  className="form-select bg-dark text-white border-secondary" 
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
                <label className="form-label text-white-50 small fw-bold">Pilih Layanan</label>
                <select 
                  className="form-select bg-dark text-white border-secondary" 
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

            <button type="submit" className="btn btn-info w-100 py-3 fw-bold text-dark rounded-pill mb-3" style={{ transition: 'all 0.3s' }}>
              Masuk Konsol Operator
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
    <div className="container-fluid py-4" style={{ backgroundColor: '#f8f9fa', minHeight: '100vh' }}>
      <div className="d-flex justify-content-between align-items-center mb-4 bg-white p-3 rounded shadow-sm">
        <div>
          <h4 className="fw-bold m-0 text-dark">Konsol Operator: {selectedLoket}</h4>
          <small className="text-secondary">Petugas: <strong>{operatorNama || 'Operator'}</strong></small>
        </div>
        <button className="btn btn-danger btn-sm px-3 rounded-pill fw-bold" onClick={handleLogout}>
          <i className="bi bi-box-arrow-right"></i> Keluar
        </button>
      </div>

      <div className="row g-4">
        {/* Main Calling Panel */}
        <div className="col-lg-8">
          <div className="card p-4 text-center mb-4 shadow-sm border-0">
            <div className="d-flex justify-content-between align-items-center border-bottom pb-3 mb-4">
              <div className="text-start">
                <h5 className="fw-bold m-0 text-primary">
                  {isMultiService 
                    ? 'Kependudukan (B) & Perekaman E-KTP (C)' 
                    : pelayananList.find(p => p.id === selectedLayanan)?.nama}
                </h5>
                <small className="text-muted">Melayani: <strong>{selectedLoket}</strong></small>
              </div>
              <span className="badge bg-success py-2 px-3 fs-6">Aktif Tersinkronisasi</span>
            </div>

            <div className="py-4">
              <span className="text-muted small text-uppercase fw-bold">Nomor Antrian Sekarang</span>
              <h1 className="display-1 fw-bold text-primary my-2" style={{ fontSize: '8rem' }}>
                {currentQueue ? currentQueue.nomor_lengkap : '---'}
              </h1>
              <p className="text-muted">
                {currentQueue ? `Diulang: ${currentQueue.panggil_ulang}x` : 'Tidak ada antrian aktif.'}
              </p>
              {currentQueue && currentQueue.warga_nama && (
                <div className="mt-4 p-3 bg-light rounded-3 border text-start d-inline-block" style={{ minWidth: '320px' }}>
                  <div className="fw-bold text-dark border-bottom pb-1 mb-2"><i className="bi bi-person-fill"></i> Data Warga</div>
                  <div className="text-secondary small">Nama: <strong className="text-dark">{currentQueue.warga_nama}</strong></div>
                  <div className="text-secondary small">Alamat: <span className="text-dark">{currentQueue.warga_alamat}</span></div>
                  <div className="text-secondary small">No. HP: <span className="text-dark">{currentQueue.warga_hp}</span></div>
                </div>
              )}
            </div>

            <div className="row g-3 mt-2">
              {isMultiService ? (
                <>
                  <div className="col-sm-6">
                    <button onClick={panggilBerikutnyaB} className="btn btn-primary btn-lg w-100 py-3 fw-bold">
                      <i className="bi bi-chevron-double-right"></i> Panggil Antrian B
                    </button>
                  </div>
                  <div className="col-sm-6">
                    <button onClick={panggilBerikutnyaC} className="btn btn-success btn-lg w-100 py-3 fw-bold text-white">
                      <i className="bi bi-chevron-double-right"></i> Panggil Antrian C
                    </button>
                  </div>
                </>
              ) : (
                <div className="col-sm-6">
                  <button onClick={panggilBerikutnya} className="btn btn-primary btn-lg w-100 py-3 fw-bold">
                    <i className="bi bi-chevron-double-right"></i> Panggil Berikutnya
                  </button>
                </div>
              )}
              
              {currentQueue && (
                <>
                  <div className="col-sm-6">
                    <button onClick={panggilUlang} className="btn btn-warning btn-lg w-100 py-3 fw-bold text-white">
                      <i className="bi bi-volume-up-fill"></i> Panggil Ulang
                    </button>
                  </div>
                  <div className="col-sm-6">
                    <button onClick={lewatkan} className="btn btn-outline-danger btn-lg w-100 py-3 fw-bold">
                      <i className="bi bi-x-circle"></i> Lewatkan
                    </button>
                  </div>
                  <div className="col-sm-6">
                    <button onClick={selesaikan} className="btn btn-success btn-lg w-100 py-3 fw-bold">
                      <i className="bi bi-check-circle-fill"></i> Selesai
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Waiting Queue List */}
          <div className="card p-4 shadow-sm border-0">
            {isMultiService ? (
              <div className="row g-4">
                {/* Column for Antrian B */}
                <div className="col-md-6 border-end">
                  <h5 className="fw-bold mb-3 d-flex align-items-center gap-2 text-primary">
                    <i className="bi bi-people-fill"></i> Antrian B ({stats.waitingB})
                  </h5>
                  <div className="table-responsive">
                    <table className="table table-hover align-middle">
                      <thead className="table-light">
                        <tr>
                          <th>Nomor</th>
                          <th>Nama Warga</th>
                          <th>Aksi</th>
                        </tr>
                      </thead>
                      <tbody>
                        {waitingQueuesB.map(q => (
                          <tr key={q.id}>
                            <td><span className="badge bg-primary p-2 fs-6">{q.nomor_lengkap}</span></td>
                            <td>
                              <strong className="text-dark d-block">{q.warga_nama}</strong>
                              <span className="text-muted small">{q.warga_alamat}</span>
                            </td>
                            <td>
                              <button onClick={() => layaniSekarang(q)} className="btn btn-sm btn-outline-primary fw-semibold">Panggil</button>
                            </td>
                          </tr>
                        ))}
                        {waitingQueuesB.length === 0 && (
                          <tr>
                            <td colSpan="3" className="text-center text-muted py-4">Kosong</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Column for Antrian C */}
                <div className="col-md-6">
                  <h5 className="fw-bold mb-3 d-flex align-items-center gap-2 text-success">
                    <i className="bi bi-people-fill"></i> Antrian C ({stats.waitingC})
                  </h5>
                  <div className="table-responsive">
                    <table className="table table-hover align-middle">
                      <thead className="table-light">
                        <tr>
                          <th>Nomor</th>
                          <th>Nama Warga</th>
                          <th>Aksi</th>
                        </tr>
                      </thead>
                      <tbody>
                        {waitingQueuesC.map(q => (
                          <tr key={q.id}>
                            <td><span className="badge bg-success p-2 fs-6">{q.nomor_lengkap}</span></td>
                            <td>
                              <strong className="text-dark d-block">{q.warga_nama}</strong>
                              <span className="text-muted small">{q.warga_alamat}</span>
                            </td>
                            <td>
                              <button onClick={() => layaniSekarang(q)} className="btn btn-sm btn-outline-success fw-semibold">Panggil</button>
                            </td>
                          </tr>
                        ))}
                        {waitingQueuesC.length === 0 && (
                          <tr>
                            <td colSpan="3" className="text-center text-muted py-4">Kosong</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : (
              <>
                <h5 className="fw-bold mb-3 d-flex align-items-center gap-2">
                  <i className="bi bi-people-fill text-muted"></i> Daftar Tunggu ({stats.waiting})
                </h5>
                <div className="table-responsive">
                  <table className="table table-hover align-middle">
                    <thead className="table-light">
                      <tr>
                        <th>Nomor</th>
                        <th>Detail Warga</th>
                        <th>Status</th>
                        <th>Aksi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {waitingQueues.map(q => (
                        <tr key={q.id}>
                          <td><span className="badge bg-secondary p-2 fs-6">{q.nomor_lengkap}</span></td>
                          <td>
                            {q.warga_nama ? (
                              <div>
                                <strong className="text-dark d-block">{q.warga_nama}</strong>
                                <span className="text-muted small">{q.warga_alamat} | {q.warga_hp}</span>
                              </div>
                            ) : (
                              <span className="text-muted small">-</span>
                            )}
                          </td>
                          <td><span className="badge bg-info text-white">Menunggu</span></td>
                          <td>
                            <button onClick={() => layaniSekarang(q)} className="btn btn-sm btn-outline-primary fw-semibold">Panggil</button>
                          </td>
                        </tr>
                      ))}
                      {waitingQueues.length === 0 && (
                        <tr>
                          <td colSpan="4" className="text-center text-muted py-4">Tidak ada antrian yang menunggu.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Stats Sidebar */}
        <div className="col-lg-4">
          <div className="card p-4 mb-4 shadow-sm border-0">
            <h5 className="fw-bold mb-4">Statistik {selectedLoket}</h5>
            
            {isMultiService ? (
              <>
                <div className="d-flex align-items-center justify-content-between mb-3 border-bottom pb-2">
                  <span className="text-muted"><i className="bi bi-person-clock me-2"></i> Menunggu B</span>
                  <span className="fs-4 fw-bold text-primary">{stats.waitingB}</span>
                </div>
                <div className="d-flex align-items-center justify-content-between mb-3 border-bottom pb-2">
                  <span className="text-muted"><i className="bi bi-person-clock me-2"></i> Menunggu C</span>
                  <span className="fs-4 fw-bold text-success">{stats.waitingC}</span>
                </div>
              </>
            ) : (
              <div className="d-flex align-items-center justify-content-between mb-3 border-bottom pb-2">
                <span className="text-muted"><i className="bi bi-person-clock me-2"></i> Menunggu</span>
                <span className="fs-4 fw-bold text-danger">{stats.waiting}</span>
              </div>
            )}
            
            <div className="d-flex align-items-center justify-content-between mb-3 border-bottom pb-2">
              <span className="text-muted"><i className="bi bi-check-all me-2"></i> Selesai</span>
              <span className="fs-4 fw-bold text-success">{stats.served}</span>
            </div>
          </div>

          <div className="card p-4 mb-4 shadow-sm border-0">
            <h5 className="fw-bold mb-3">Antrian Selesai Terakhir</h5>
            {lastCompleted ? (
              <div className="p-3 bg-light rounded text-center border">
                <span className="badge bg-success p-2 fs-6 mb-2">{lastCompleted.nomor_lengkap}</span>
              </div>
            ) : (
              <div className="text-center text-muted py-3">Belum ada antrian.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
