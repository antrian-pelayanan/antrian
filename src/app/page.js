"use client";

import Link from 'next/link';

export default function Home() {
  return (
    <div style={{ background: 'radial-gradient(circle at 50% 50%, #1a233a 0%, #0d111b 100%)', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="container py-5 text-center" style={{ maxWidth: '900px' }}>
        <img src="/img/Logo.png" alt="Logo" style={{ height: '110px', objectFit: 'contain', marginBottom: '20px' }} />
        <h1 className="display-4 fw-bold text-white mb-2">Portal Sistem Antrian</h1>
        <h4 className="text-info fw-normal mb-5">Kecamatan Gandrungmangu - Berbasis Real-time Cloud</h4>

        <div className="row justify-content-center g-4">

          {/* Menu Kiosk */}
          <div className="col-md-3">
            <Link href="/kiosk" className="card h-100 text-decoration-none p-4 d-block text-white" style={{ background: 'rgba(255,255,255,0.05)', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '15px', transition: 'all 0.3s' }}
              onMouseOver={(e) => { e.currentTarget.style.transform = 'translateY(-5px)'; e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'; }}
              onMouseOut={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'; }}>
              <i className="bi bi-person-badge fs-1 text-info mb-3 d-block"></i>
              <h4 className="fw-bold">Kiosk Antrian</h4>
              <p className="small text-white-50 m-0">Layar Ambil Nomor untuk Warga</p>
            </Link>
          </div>

          {/* Menu Display */}
          <div className="col-md-3">
            <Link href="/display" className="card h-100 text-decoration-none p-4 d-block text-white" style={{ background: 'rgba(255,255,255,0.05)', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '15px', transition: 'all 0.3s' }}
              onMouseOver={(e) => { e.currentTarget.style.transform = 'translateY(-5px)'; e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'; }}
              onMouseOut={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'; }}>
              <i className="bi bi-tv fs-1 text-primary mb-3 d-block"></i>
              <h4 className="fw-bold">Layar Display</h4>
              <p className="small text-white-50 m-0">Layar Panggilan Antrian (TV)</p>
            </Link>
          </div>

          {/* Menu Operator */}
          <div className="col-md-3">
            <Link href="/operator" className="card h-100 text-decoration-none p-4 d-block text-white" style={{ background: 'rgba(255,255,255,0.05)', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '15px', transition: 'all 0.3s' }}
              onMouseOver={(e) => { e.currentTarget.style.transform = 'translateY(-5px)'; e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'; }}
              onMouseOut={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'; }}>
              <i className="bi bi-headset fs-1 text-success mb-3 d-block"></i>
              <h4 className="fw-bold">Konsol Loket</h4>
              <p className="small text-white-50 m-0">Panel Operator Pemanggil</p>
            </Link>
          </div>

          {/* Menu Pengaturan */}
          <div className="col-md-3">
            <Link href="/pengaturan" className="card h-100 text-decoration-none p-4 d-block text-white" style={{ background: 'rgba(255,255,255,0.05)', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '15px', transition: 'all 0.3s' }}
              onMouseOver={(e) => { e.currentTarget.style.transform = 'translateY(-5px)'; e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'; }}
              onMouseOut={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'; }}>
              <i className="bi bi-gear fs-1 text-warning mb-3 d-block"></i>
              <h4 className="fw-bold">Pengaturan</h4>
              <p className="small text-white-50 m-0">Kelola Layanan, Loket, & Info</p>
            </Link>
          </div>

        </div>

        <p className="mt-5 text-white-50 small">
          &copy; Sistem Antrian Kecamatan Gandrungmangu.
        </p>
      </div>
    </div>
  );
}
