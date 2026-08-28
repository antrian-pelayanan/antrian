"use client";

import { useState, useEffect } from 'react';
import { db } from '../../lib/firebase';
import { collection, getDocs, query, where, orderBy, limit, addDoc, Timestamp, doc, getDoc } from 'firebase/firestore';
import Link from 'next/link';

export default function Kiosk() {
  const [pelayanan, setPelayanan] = useState([]);
  const [instansiNama, setInstansiNama] = useState('Kecamatan Gandrungmangu');
  const [instansiAlamat, setInstansiAlamat] = useState('Jl. Pertiwi Nomor 1');
  const [loading, setLoading] = useState(true);
  const [successMessage, setSuccessMessage] = useState('');
  const [ticketToPrint, setTicketToPrint] = useState(null);
  const [selectedLayananForForm, setSelectedLayananForForm] = useState(null);
  const [wargaForm, setWargaForm] = useState({ nama: '', alamat: '', hp: '' });
  const [isKioskLogged, setIsKioskLogged] = useState(() => {
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem('kiosk_logged') === 'true';
    }
    return false;
  });
  const [kioskUsername, setKioskUsername] = useState('');
  const [kioskPassword, setKioskPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  useEffect(() => {
    if (ticketToPrint) {
      const timer = setTimeout(() => {
        window.print();
        setTicketToPrint(null);
      }, 350);
      return () => clearTimeout(timer);
    }
  }, [ticketToPrint]);

  useEffect(() => {
    const fetchData = async () => {
      // Ambil pengaturan
      const settingsRef = collection(db, 'settings');
      const settingsSnap = await getDocs(settingsRef);
      settingsSnap.forEach((doc) => {
        if (doc.id === 'instansi_nama') setInstansiNama(doc.data().value);
        if (doc.id === 'instansi_alamat') setInstansiAlamat(doc.data().value);
      });

      // Ambil layanan
      const pRef = collection(db, 'pelayanan');
      const pSnap = await getDocs(pRef);
      const data = [];
      pSnap.forEach(doc => {
        data.push({ id: doc.id, ...doc.data() });
      });
      data.sort((a, b) => a.kode.localeCompare(b.kode));
      setPelayanan(data);
      setLoading(false);
    };

    fetchData();
  }, []);

  // Keyboard shortcut listener
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Don't trigger shortcuts if form is open, or if typing in input/textarea/select
      if (selectedLayananForForm) return;
      if (
        e.target.tagName === 'INPUT' || 
        e.target.tagName === 'TEXTAREA' || 
        e.target.tagName === 'SELECT'
      ) {
        return;
      }

      const key = e.key.toLowerCase();
      const p = pelayanan.find(item => item.kode.toLowerCase() === key);
      if (p) {
        setSelectedLayananForForm(p);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pelayanan, selectedLayananForForm]);

  const handleAmbilAntrian = async (layanan, dataWarga) => {
    setLoading(true);
    try {
      // Buat batasan waktu hari ini (mulai tengah malam)
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      const startOfDay = Timestamp.fromDate(now);

      const q = query(
        collection(db, 'antrian'),
        where('created_at', '>=', startOfDay)
      );

      const antrianSnap = await getDocs(q);
      let nextNumber = 1;

      // Filter by pelayanan_id client-side to avoid composite index requirements
      const todayLayananQueues = antrianSnap.docs
        .map(doc => doc.data())
        .filter(item => item.pelayanan_id === layanan.id);

      if (todayLayananQueues.length > 0) {
        const numbers = todayLayananQueues.map(item => item.nomor || 0);
        nextNumber = Math.max(...numbers) + 1;
      }

      const nomorLengkap = `${layanan.kode}-${nextNumber}`;
      const isKodeC = layanan.kode?.toUpperCase() === 'C' || layanan.nama?.toLowerCase().includes('perekaman');
      const isKodeA = layanan.kode?.toUpperCase() === 'A' || layanan.loket_nama?.toLowerCase().includes('loket a') || layanan.loket_nama?.toLowerCase().includes('loket 1');

      const sisaAntrian = todayLayananQueues.filter(item => item.status === 'menunggu').length + 1;

      // Insert antrian
      await addDoc(collection(db, 'antrian'), {
        nomor: nextNumber,
        nomor_lengkap: nomorLengkap,
        pelayanan_id: layanan.id,
        pelayanan_nama: layanan.nama,
        status: 'menunggu',
        loket: isKodeC ? null : (layanan.loket_nama || null),
        panggil_at: null,
        panggil_ulang: 0,
        selesai_at: null,
        created_at: Timestamp.now(),
        warga_nama: dataWarga.nama,
        warga_alamat: dataWarga.alamat,
        warga_hp: dataWarga.hp
      });

      // Set ticket values for printing (Tanpa loket untuk Layanan C Perekaman & Layanan A)
      setTicketToPrint({
        instansiNama,
        instansiAlamat,
        nomorLengkap,
        pelayananNama: layanan.nama,
        loketNama: (isKodeC || isKodeA) ? '' : (layanan.loket_nama || ''),
        kode: layanan.kode,
        waktu: new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }),
        sisaAntrian: sisaAntrian
      });

      setSuccessMessage(`Berhasil mengambil nomor: ${nomorLengkap}${layanan.loket_nama && !isKodeC && !isKodeA ? ' (Menuju ke ' + layanan.loket_nama + ')' : ''}`);
      setTimeout(() => setSuccessMessage(''), 4000);
    } catch (err) {
      console.error(err);
      alert('Gagal mengambil antrian, coba lagi.');
    }
    setLoading(false);
  };

  const handleSubmitForm = async (e) => {
    e.preventDefault();
    if (!wargaForm.nama || !wargaForm.alamat || !wargaForm.hp) {
      alert('Harap lengkapi semua data diri.');
      return;
    }
    await handleAmbilAntrian(selectedLayananForForm, wargaForm);
    setSelectedLayananForForm(null);
    setWargaForm({ nama: '', alamat: '', hp: '' });
  };

  const handleKioskLogin = async (e) => {
    e.preventDefault();
    setLoginError('');
    try {
      const q = query(
        collection(db, 'operators'),
        where('username', '==', kioskUsername),
        where('password', '==', kioskPassword),
        limit(1)
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        setIsKioskLogged(true);
        sessionStorage.setItem('kiosk_logged', 'true');
      } else {
        setLoginError('Username atau password operator salah.');
      }
    } catch (err) {
      console.error(err);
      setLoginError('Gagal melakukan autentikasi: ' + err.message);
    }
  };

  const isSelectedC = selectedLayananForForm && (
    selectedLayananForForm.kode?.toUpperCase() === 'C' || 
    selectedLayananForForm.nama?.toLowerCase().includes('perekaman')
  );

  return (
    <>
      {!isKioskLogged ? (
        <div style={{
          backgroundImage: `linear-gradient(rgba(15, 23, 42, 0.15), rgba(15, 23, 42, 0.25)), url('/img/bg-kecamatan.jpeg')`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          backgroundAttachment: 'fixed',
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '30px'
        }}>
          <div className="card text-dark p-5 border-0 w-100 shadow-lg align-self-center mx-auto" style={{ maxWidth: '450px', background: 'rgba(255, 255, 255, 0.94)', backdropFilter: 'blur(12px)', border: '1px solid #e2e8f0', borderRadius: '25px', boxShadow: '0 20px 40px rgba(0, 0, 0, 0.12)' }}>
            <div className="text-center mb-5">
              <div className="d-flex align-items-center justify-content-center gap-3 mb-3">
                <img src="/img/cilacap-bercahaya.png" alt="Logo Cilacap Bercahaya" style={{ height: '75px', objectFit: 'contain' }} />
              </div>
              <h2 className="fw-bold mb-1 text-danger">LOGIN KIOSK</h2>
              <p className="text-secondary small mb-0">{instansiNama}</p>
            </div>

            {loginError && (
              <div className="alert alert-danger bg-danger border-0 text-white p-3 mb-4 rounded-3 text-center small fw-semibold">
                {loginError}
              </div>
            )}

            <form onSubmit={handleKioskLogin}>
              <div className="mb-3">
                <label className="form-label text-secondary fw-semibold">Username Operator</label>
                <input 
                  type="text" 
                  className="form-control bg-light text-dark border-secondary-subtle py-2" 
                  placeholder="Masukkan username" 
                  required
                  value={kioskUsername}
                  onChange={e => setKioskUsername(e.target.value)}
                />
              </div>

              <div className="mb-4">
                <label className="form-label text-secondary fw-semibold">Password</label>
                <input 
                  type="password" 
                  className="form-control bg-light text-dark border-secondary-subtle py-2" 
                  placeholder="Masukkan password" 
                  required
                  value={kioskPassword}
                  onChange={e => setKioskPassword(e.target.value)}
                />
              </div>

              <button type="submit" className="btn btn-danger w-100 py-3 rounded-pill fw-bold text-white mb-3 shadow-sm" style={{ background: '#dc3545', border: 'none' }}>
                Masuk Kiosk
              </button>

              <Link href="/" className="btn btn-outline-secondary border-secondary-subtle w-100 py-3 rounded-pill fw-bold">
                Kembali ke Portal
              </Link>
            </form>
          </div>
        </div>
      ) : (
        <div id="kiosk-main-container" style={{
          backgroundImage: `linear-gradient(rgba(15, 23, 42, 0.15), rgba(15, 23, 42, 0.25)), url('/img/bg-kecamatan.jpeg')`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          backgroundAttachment: 'fixed',
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '30px'
        }}>
          <div className="container" style={{ maxWidth: '1100px' }}>
            <div className="text-center mb-5 position-relative p-4 rounded-4 shadow-lg" style={{ background: 'rgba(255, 255, 255, 0.08)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', boxShadow: '0 12px 35px rgba(0,0,0,0.35), inset 0 0 15px rgba(255, 255, 255, 0.15)', border: '2px solid rgba(255, 255, 255, 0.45)' }}>
              <button 
                onClick={() => {
                  setIsKioskLogged(false);
                  sessionStorage.removeItem('kiosk_logged');
                }} 
                className="btn btn-outline-light btn-sm position-absolute top-0 end-0 m-3 rounded-pill px-3 fw-bold shadow"
              >
                <i className="bi bi-box-arrow-right"></i> Keluar Kiosk
              </button>
              <div className="d-flex align-items-center justify-content-center gap-4 mb-3 flex-wrap">
                <img src="/img/cilacap-bercahaya.png" alt="Logo Cilacap Bercahaya" style={{ height: '85px', objectFit: 'contain', filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.6))' }} />
                <div style={{ width: '2px', height: '50px', background: 'rgba(255,255,255,0.25)' }}></div>
                <img src="/img/logo-semringah.png" alt="Logo Gandrung Mangu Semringah" style={{ height: '95px', objectFit: 'contain', filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.6))' }} />
              </div>
              <h1 className="fw-bold mb-1" style={{ color: '#ffffff', fontSize: '2.8rem', textShadow: '0 2px 0 #0284c7, 0 4px 0 #0369a1, 0 6px 15px rgba(0,0,0,0.9)' }}>AMBIL NOMOR ANTRIAN</h1>
              <h3 className="text-white fw-bold mb-2" style={{ textShadow: '0 2px 4px rgba(0,0,0,0.9)' }}>{instansiNama}</h3>
              <p className="text-white fw-bold mb-0" style={{ textShadow: '0 2px 4px rgba(0,0,0,0.9)' }}>{instansiAlamat}</p>
            </div>

            {successMessage && (
              <div className="alert alert-success bg-success border-0 text-white p-3 mb-4 text-center rounded-3 shadow fs-5 fw-bold" style={{ textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>
                {successMessage}
              </div>
            )}

            {loading && !pelayanan.length ? (
              <div className="text-center text-dark py-5">
                <div className="spinner-border text-danger" role="status"></div>
                <p className="mt-3 fs-5 fw-bold text-white">Memuat sistem antrian...</p>
              </div>
            ) : (
              <div className="row g-4 justify-content-center">
                {pelayanan.map((p, index) => (
                  <div className="col-md-4" key={p.id}>
                    <div 
                      onClick={() => setSelectedLayananForForm(p)}
                      className="card text-decoration-none h-100 shadow-lg"
                      style={{
                        background: 'rgba(255, 255, 255, 0.08)',
                        backdropFilter: 'blur(6px)',
                        WebkitBackdropFilter: 'blur(6px)',
                        border: '2px solid rgba(255, 255, 255, 0.45)',
                        borderRadius: '20px',
                        padding: '30px',
                        cursor: 'pointer',
                        transition: 'all 0.3s'
                      }}
                      onMouseOver={(e) => { e.currentTarget.style.transform = 'translateY(-5px)'; e.currentTarget.style.boxShadow = '0 20px 40px rgba(0, 0, 0, 0.5)'; e.currentTarget.style.borderColor = '#ffffff'; }}
                      onMouseOut={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 10px 25px rgba(0, 0, 0, 0.3)'; e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.45)'; }}
                    >
                      <div className="d-flex justify-content-between align-items-center mb-3">
                        <span style={{ 
                          fontSize: '7.5rem', 
                          fontWeight: 900, 
                          color: '#ff3333', 
                          lineHeight: 1, 
                          letterSpacing: '-1px', 
                          textShadow: '0 2px 0 #dc2626, 0 4px 0 #b91c1c, 0 6px 0 #991b1b, 0 8px 15px rgba(0,0,0,0.9)' 
                        }}>
                          {p.kode}
                        </span>
                        <span className="badge bg-danger text-white px-3 py-2 rounded-pill fs-6 shadow fw-bold" style={{ border: '1px solid rgba(255,255,255,0.4)', textShadow: '0 1px 3px rgba(0,0,0,0.5)' }}>
                          Estimasi: {p.estimasi_waktu} mnt
                        </span>
                      </div>
                      <div>
                        <h2 className="fw-bold mb-3" style={{ fontSize: '1.85rem', lineHeight: 1.2, color: '#ffffff', textShadow: '0 2px 4px rgba(0,0,0,0.9), 0 4px 10px rgba(0,0,0,0.7)' }}>{p.nama}</h2>
                        <p className="m-0 text-white fw-bold" style={{ fontSize: '1.05rem', textShadow: '0 2px 4px rgba(0,0,0,0.9)' }}>Tekan tombol ({p.kode}) atau sentuh layar.</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="text-center mt-5">
              <Link href="/" className="btn btn-light bg-white border border-danger border-opacity-25 text-danger rounded-pill px-4 py-2 small fw-bold shadow-sm">
                <i className="bi bi-arrow-left me-1"></i> Kembali ke Portal Utama
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Form Dialog for Personal Info */}
      {selectedLayananForForm && (
        <div className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center px-3" style={{ background: 'rgba(15, 23, 42, 0.45)', backdropFilter: 'blur(5px)', zIndex: 1050 }}>
          <div className="card text-dark p-5 border-0 w-100 shadow-lg" style={{ maxWidth: '600px', background: '#ffffff', border: '2px solid #fecdd3', borderRadius: '25px', boxShadow: '0 25px 60px rgba(0,0,0,0.15)' }}>
            <div className="text-center mb-4">
              <span className="badge bg-danger bg-opacity-10 text-danger px-4 py-2 rounded-pill mb-3 fs-6 border border-danger border-opacity-25">Kategori {selectedLayananForForm.kode}</span>
              <h2 className="fw-bold" style={{ color: '#dc3545' }}>{selectedLayananForForm.nama}</h2>
              <p className="text-muted m-0">Silakan lengkapi data diri Anda sebelum mengambil antrian.</p>
            </div>
            
            <form onSubmit={handleSubmitForm}>
              <div className="mb-3">
                <label className="form-label text-secondary fw-semibold">Nama Lengkap</label>
                <input 
                  type="text" 
                  className="form-control bg-light text-dark border-secondary-subtle py-2" 
                  placeholder="Masukkan nama lengkap" 
                  required
                  value={wargaForm.nama}
                  onChange={e => setWargaForm({ ...wargaForm, nama: e.target.value })}
                />
              </div>
              
              <div className="mb-3">
                <label className="form-label text-secondary fw-semibold">Alamat Rumah</label>
                <input 
                  type="text" 
                  className="form-control bg-light text-dark border-secondary-subtle py-2" 
                  placeholder="Masukkan alamat lengkap" 
                  required
                  value={wargaForm.alamat}
                  onChange={e => setWargaForm({ ...wargaForm, alamat: e.target.value })}
                />
              </div>

              <div className="mb-4">
                <label className="form-label text-secondary fw-semibold">Nomor HP / WhatsApp</label>
                <input 
                  type="tel" 
                  className="form-control bg-light text-dark border-secondary-subtle py-2" 
                  placeholder="Contoh: 0812xxxxxxxx" 
                  required
                  value={wargaForm.hp}
                  onChange={e => setWargaForm({ ...wargaForm, hp: e.target.value })}
                />
              </div>

              <div className="row g-3">
                <div className="col-6">
                  <button 
                    type="button" 
                    className="btn btn-outline-secondary w-100 py-3 rounded-pill fw-bold"
                    onClick={() => {
                      setSelectedLayananForForm(null);
                      setWargaForm({ nama: '', alamat: '', hp: '' });
                    }}
                  >
                    Batal
                  </button>
                </div>
                <div className="col-6">
                  <button type="submit" className="btn btn-danger w-100 py-3 rounded-pill fw-bold text-white shadow-sm" style={{ background: '#dc3545', border: 'none' }}>
                    Ambil & Cetak
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Hidden print-only ticket */}
      {ticketToPrint && (
        <div id="printable-ticket" className="d-none d-print-block">
          <div className="ticket-header">
            <h4 className="instansi-nama">{ticketToPrint.instansiNama}</h4>
            <p className="instansi-alamat">{ticketToPrint.instansiAlamat}</p>
            <div className="divider">--------------------------------</div>
          </div>
          <div className="ticket-body">
            <div className="title">NOMOR ANTRIAN</div>
            <div className="nomor">{ticketToPrint.nomorLengkap}</div>
            <div className="layanan">{ticketToPrint.pelayananNama}</div>
            {ticketToPrint.loketNama && 
             ticketToPrint.kode?.toUpperCase() !== 'C' && 
             ticketToPrint.kode?.toUpperCase() !== 'A' && 
             !ticketToPrint.nomorLengkap?.toUpperCase()?.startsWith('C') && 
             !ticketToPrint.nomorLengkap?.toUpperCase()?.startsWith('A') && 
             !ticketToPrint.pelayananNama?.toLowerCase()?.includes('perekaman') && 
             !ticketToPrint.loketNama?.toLowerCase()?.includes('loket a') && (
              <div className="loket" style={{ fontSize: '13pt', fontWeight: 'bold', marginTop: '2mm', textTransform: 'uppercase', border: '1px dashed #000', padding: '1mm 0' }}>
                MENUJU: {ticketToPrint.loketNama}
              </div>
            )}
            <div className="sisa-antrian">
              Sisa Antrian Menunggu Saat Ini: {ticketToPrint.sisaAntrian}
            </div>
            <div className="divider">--------------------------------</div>
          </div>
          <div className="ticket-footer">
            <div className="waktu">{ticketToPrint.waktu}</div>
            <div className="pesan">Silakan tunggu nomor Anda dipanggil.</div>
            <div className="terimakasih">Terima Kasih</div>
          </div>
        </div>
      )}

      {/* CSS Styles for 80mm POS Thermal Printer */}
      <style dangerouslySetInnerHTML={{__html: `
        @media print {
          @page {
            size: 80mm auto;
            margin: 0;
          }
          html, body {
            background-color: #ffffff !important;
            color: #000000 !important;
            margin: 0 !important;
            padding: 0 !important;
            width: 80mm !important;
            min-height: auto !important;
          }
          #kiosk-main-container {
            display: none !important;
          }
          #printable-ticket {
            display: block !important;
            width: 80mm !important;
            max-width: 80mm !important;
            margin: 0 auto !important;
            padding: 5mm 6mm !important;
            box-sizing: border-box !important;
            text-align: center !important;
            font-family: 'Courier New', Courier, monospace !important;
            background: #ffffff !important;
            color: #000000 !important;
          }
          .instansi-nama {
            font-size: 11pt !important;
            font-weight: bold !important;
            margin: 0 0 1mm 0 !important;
            text-transform: uppercase !important;
            line-height: 1.2 !important;
          }
          .instansi-alamat {
            font-size: 8pt !important;
            margin: 0 !important;
            line-height: 1.3 !important;
            color: #000000 !important;
          }
          .divider {
            font-size: 10pt !important;
            margin: 3mm 0 !important;
            line-height: 1 !important;
          }
          .ticket-body {
            margin: 4mm 0 !important;
          }
          .ticket-body .title {
            font-size: 10pt !important;
            font-weight: bold !important;
            margin: 0 0 2mm 0 !important;
            letter-spacing: 0.5px !important;
          }
          .ticket-body .nomor {
            font-size: 42pt !important;
            font-weight: bold !important;
            margin: 2mm 0 !important;
            line-height: 1 !important;
          }
          .ticket-body .layanan {
            font-size: 11pt !important;
            font-weight: bold !important;
            margin: 2mm 0 0 0 !important;
            text-transform: uppercase !important;
            line-height: 1.2 !important;
          }
          .sisa-antrian {
            font-size: 10pt !important;
            font-weight: bold !important;
            margin: 2mm 0 0 0 !important;
            line-height: 1.2 !important;
          }
          .ticket-footer {
            font-size: 8pt !important;
            line-height: 1.4 !important;
            margin-top: 3mm !important;
          }
          .ticket-footer .waktu {
            margin: 0 0 2mm 0 !important;
          }
          .ticket-footer .pesan {
            margin: 0 !important;
            font-weight: bold !important;
          }
          .ticket-footer .terimakasih {
            margin: 1mm 0 0 0 !important;
            font-style: italic !important;
          }
        }
      `}} />
    </>
  );
}

