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

      // Insert antrian
      await addDoc(collection(db, 'antrian'), {
        nomor: nextNumber,
        nomor_lengkap: nomorLengkap,
        pelayanan_id: layanan.id,
        pelayanan_nama: layanan.nama,
        status: 'menunggu',
        loket: layanan.loket_nama || null,
        panggil_at: null,
        panggil_ulang: 0,
        selesai_at: null,
        created_at: Timestamp.now(),
        warga_nama: dataWarga.nama,
        warga_alamat: dataWarga.alamat,
        warga_hp: dataWarga.hp
      });

      // Set ticket values for printing
      setTicketToPrint({
        instansiNama,
        instansiAlamat,
        nomorLengkap,
        pelayananNama: layanan.nama,
        loketNama: layanan.loket_nama || '',
        waktu: new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })
      });

      setSuccessMessage(`Berhasil mengambil nomor: ${nomorLengkap}${layanan.loket_nama ? ' (Menuju ke ' + layanan.loket_nama + ')' : ''}`);
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

  return (
    <>
      {!isKioskLogged ? (
        <div style={{ background: 'radial-gradient(circle at 50% 50%, #1a233a 0%, #0d111b 100%)', minHeight: '100vh', display: 'flex', alignItems: 'center', justifycontent: 'center', padding: '30px' }}>
          <div className="card text-white p-5 border-0 w-100 shadow-lg align-self-center mx-auto" style={{ maxWidth: '450px', background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '25px', backdropFilter: 'blur(15px)' }}>
            <div className="text-center mb-5">
              <img src="/img/Logo.png" alt="Logo" style={{ height: '90px', objectFit: 'contain', marginBottom: '20px' }} />
              <h2 className="fw-bold mb-1">LOGIN KIOSK</h2>
              <p className="text-info small mb-0">{instansiNama}</p>
            </div>

            {loginError && (
              <div className="alert alert-danger bg-danger border-0 text-white p-3 mb-4 rounded-3 text-center small">
                {loginError}
              </div>
            )}

            <form onSubmit={handleKioskLogin}>
              <div className="mb-3">
                <label className="form-label text-white-50 fw-semibold">Username Operator</label>
                <input 
                  type="text" 
                  className="form-control bg-dark text-white border-secondary py-2" 
                  placeholder="Masukkan username" 
                  required
                  value={kioskUsername}
                  onChange={e => setKioskUsername(e.target.value)}
                />
              </div>

              <div className="mb-4">
                <label className="form-label text-white-50 fw-semibold">Password</label>
                <input 
                  type="password" 
                  className="form-control bg-dark text-white border-secondary py-2" 
                  placeholder="Masukkan password" 
                  required
                  value={kioskPassword}
                  onChange={e => setKioskPassword(e.target.value)}
                />
              </div>

              <button type="submit" className="btn btn-info w-100 py-3 rounded-pill fw-bold text-dark mb-3">
                Masuk Kiosk
              </button>

              <Link href="/" className="btn btn-outline-light border-secondary w-100 py-3 rounded-pill fw-bold">
                Kembali ke Portal
              </Link>
            </form>
          </div>
        </div>
      ) : (
        <div id="kiosk-main-container" style={{ background: 'radial-gradient(circle at 50% 50%, #1a233a 0%, #0d111b 100%)', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '30px' }}>
          <div className="container" style={{ maxWidth: '1100px' }}>
            <div className="text-center mb-5 position-relative">
              <button 
                onClick={() => {
                  setIsKioskLogged(false);
                  sessionStorage.removeItem('kiosk_logged');
                }} 
                className="btn btn-outline-danger btn-sm position-absolute top-0 end-0 rounded-pill px-3"
              >
                <i className="bi bi-box-arrow-right"></i> Keluar Kiosk
              </button>
              <img src="/img/Logo.png" alt="Logo" style={{ height: '100px', objectFit: 'contain', marginBottom: '15px' }} />
              <h1 className="fw-bold mb-1 text-white">AMBIL NOMOR ANTRIAN</h1>
              <h3 className="text-info fw-normal mb-2">{instansiNama}</h3>
              <p className="text-white-50">{instansiAlamat}</p>
            </div>

            {successMessage && (
              <div className="alert alert-success bg-success border-0 text-white p-3 mb-4 text-center rounded-3 shadow fs-5">
                {successMessage}
              </div>
            )}

            {loading && !pelayanan.length ? (
              <div className="text-center text-white py-5">
                <div className="spinner-border text-info" role="status"></div>
                <p className="mt-3">Memuat sistem antrian...</p>
              </div>
            ) : (
              <div className="row g-4 justify-content-center">
                {pelayanan.map((p, index) => (
                  <div className="col-md-4" key={p.id}>
                    <div 
                      onClick={() => setSelectedLayananForForm(p)}
                      className="card text-white text-decoration-none h-100"
                      style={{
                        background: 'rgba(255, 255, 255, 0.05)',
                        backdropFilter: 'blur(15px)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        borderRadius: '20px',
                        padding: '30px',
                        cursor: 'pointer',
                        transition: 'all 0.3s'
                      }}
                      onMouseOver={(e) => { e.currentTarget.style.transform = 'translateY(-5px)'; e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'; }}
                      onMouseOut={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'; }}
                    >
                      <div className="d-flex justify-content-between align-items-start mb-4">
                        <span style={{ fontSize: '4.2rem', fontWeight: 800, background: 'linear-gradient(135deg, #0dcaf0, #0d6efd)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                          {p.kode}
                        </span>
                        <span className="badge bg-info bg-opacity-25 text-info px-3 py-2 rounded-pill fs-6">
                          Estimasi: {p.estimasi_waktu} mnt
                        </span>
                      </div>
                      <div>
                        <h2 className="fw-bold mb-3" style={{ fontSize: '1.8rem', lineHeight: 1.2 }}>{p.nama}</h2>
                        <p className="m-0 text-white-50" style={{ fontSize: '1rem' }}>Tekan tombol ({p.kode}) atau sentuh layar.</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="text-center mt-5">
              <Link href="/" className="text-info text-decoration-none small">
                <i className="bi bi-arrow-left"></i> Kembali ke Portal Utama
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Form Dialog for Personal Info */}
      {selectedLayananForForm && (
        <div className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center px-3" style={{ background: 'rgba(10, 15, 30, 0.85)', backdropFilter: 'blur(8px)', zIndex: 1050 }}>
          <div className="card text-white p-5 border-0 w-100" style={{ maxWidth: '600px', background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '25px', boxShadow: '0 20px 50px rgba(0,0,0,0.3)' }}>
            <div className="text-center mb-4">
              <span className="badge bg-info bg-opacity-25 text-info px-4 py-2 rounded-pill mb-3 fs-6">Kategori {selectedLayananForForm.kode}</span>
              <h2 className="fw-bold">{selectedLayananForForm.nama}</h2>
              <p className="text-white-50 m-0">Silakan lengkapi data diri Anda sebelum mengambil antrian.</p>
            </div>
            
            <form onSubmit={handleSubmitForm}>
              <div className="mb-3">
                <label className="form-label text-white-50 fw-semibold">Nama Lengkap</label>
                <input 
                  type="text" 
                  className="form-control bg-dark text-white border-secondary py-2" 
                  placeholder="Masukkan nama lengkap" 
                  required
                  value={wargaForm.nama}
                  onChange={e => setWargaForm({ ...wargaForm, nama: e.target.value })}
                />
              </div>
              
              <div className="mb-3">
                <label className="form-label text-white-50 fw-semibold">Alamat Rumah</label>
                <input 
                  type="text" 
                  className="form-control bg-dark text-white border-secondary py-2" 
                  placeholder="Masukkan alamat lengkap" 
                  required
                  value={wargaForm.alamat}
                  onChange={e => setWargaForm({ ...wargaForm, alamat: e.target.value })}
                />
              </div>

              <div className="mb-4">
                <label className="form-label text-white-50 fw-semibold">Nomor HP / WhatsApp</label>
                <input 
                  type="tel" 
                  className="form-control bg-dark text-white border-secondary py-2" 
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
                    className="btn btn-outline-light w-100 py-3 rounded-pill fw-bold border-secondary"
                    onClick={() => {
                      setSelectedLayananForForm(null);
                      setWargaForm({ nama: '', alamat: '', hp: '' });
                    }}
                  >
                    Batal
                  </button>
                </div>
                <div className="col-6">
                  <button type="submit" className="btn btn-info w-100 py-3 rounded-pill fw-bold text-dark">
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
            {ticketToPrint.loketNama && (
              <div className="loket" style={{ fontSize: '13pt', fontWeight: 'bold', marginTop: '2mm', textTransform: 'uppercase', border: '1px dashed #000', padding: '1mm 0' }}>
                MENUJU: {ticketToPrint.loketNama}
              </div>
            )}
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
