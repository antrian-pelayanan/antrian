"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function Home() {
  const router = useRouter();
  const [isMobileRedirecting, setIsMobileRedirecting] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 768;
      if (isMobile) {
        setIsMobileRedirecting(true);
        router.replace('/online');
      }
    }
  }, [router]);

  if (isMobileRedirecting) {
    return (
      <div style={{ background: 'radial-gradient(circle at 50% 50%, #0f172a 0%, #020617 100%)', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ffffff' }}>
        <div className="text-center p-4">
          <div className="spinner-border text-warning mb-3" role="status" style={{ width: '3rem', height: '3rem' }}></div>
          <h4 className="fw-bold text-warning mb-1">MEMUAT ANTRIAN MOBILE WARGA...</h4>
          <p className="text-white-50 small">Kecamatan Gandrungmangu Semringah</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: 'radial-gradient(circle at 50% 50%, #1a233a 0%, #0d111b 100%)', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="container py-5 text-center" style={{ maxWidth: '900px' }}>
        <div className="d-flex align-items-center justify-content-center gap-4 mb-4 flex-wrap">
          <img src="/img/cilacap-bercahaya.png" alt="Logo Cilacap Bercahaya" style={{ height: '90px', objectFit: 'contain', filter: 'drop-shadow(0 4px 10px rgba(0,0,0,0.5))' }} />
          <div style={{ width: '2px', height: '60px', background: 'rgba(255,255,255,0.25)' }}></div>
          <img src="/img/logo-semringah.png" alt="Logo Gandrung Mangu Semringah" style={{ height: '105px', objectFit: 'contain', filter: 'drop-shadow(0 4px 15px rgba(251,191,36,0.3))' }} />
        </div>
        <h1 className="display-4 fw-bold text-white mb-2">Portal Sistem Antrian</h1>
        <h4 className="text-info fw-normal mb-5">Kecamatan Gandrungmangu - Berbasis Real-time Cloud</h4>

        <div className="row justify-content-center g-3">

          {/* Menu Antrian Online Mobile */}
          <div className="col-md-4 col-lg">
            <Link href="/online" className="card h-100 text-decoration-none p-4 d-block text-white" style={{ background: 'linear-gradient(135deg, rgba(14, 165, 233, 0.2), rgba(3, 105, 161, 0.3))', backdropFilter: 'blur(10px)', border: '2px solid #38bdf8', borderRadius: '15px', transition: 'all 0.3s' }}
              onMouseOver={(e) => { e.currentTarget.style.transform = 'translateY(-5px)'; e.currentTarget.style.boxShadow = '0 10px 25px rgba(56, 189, 248, 0.4)'; }}
              onMouseOut={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}>
              <i className="bi bi-phone fs-1 text-info mb-3 d-block"></i>
              <h4 className="fw-bold">Antrian Online</h4>
              <p className="small text-white-50 m-0">Akses HP (Android & iOS) + Upload Berkas</p>
            </Link>
          </div>

          {/* Menu Kiosk */}
          <div className="col-md-4 col-lg">
            <Link href="/kiosk" className="card h-100 text-decoration-none p-4 d-block text-white" style={{ background: 'rgba(255,255,255,0.05)', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '15px', transition: 'all 0.3s' }}
              onMouseOver={(e) => { e.currentTarget.style.transform = 'translateY(-5px)'; e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'; }}
              onMouseOut={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'; }}>
              <i className="bi bi-person-badge fs-1 text-info mb-3 d-block"></i>
              <h4 className="fw-bold">Kiosk Antrian</h4>
              <p className="small text-white-50 m-0">Layar Ambil Nomor untuk Warga</p>
            </Link>
          </div>

          {/* Menu Display */}
          <div className="col-md-4 col-lg">
            <Link href="/display" className="card h-100 text-decoration-none p-4 d-block text-white" style={{ background: 'rgba(255,255,255,0.05)', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '15px', transition: 'all 0.3s' }}
              onMouseOver={(e) => { e.currentTarget.style.transform = 'translateY(-5px)'; e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'; }}
              onMouseOut={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'; }}>
              <i className="bi bi-tv fs-1 text-primary mb-3 d-block"></i>
              <h4 className="fw-bold">Layar Display</h4>
              <p className="small text-white-50 m-0">Layar Panggilan Antrian (TV)</p>
            </Link>
          </div>

          {/* Menu Operator */}
          <div className="col-md-4 col-lg">
            <Link href="/operator" className="card h-100 text-decoration-none p-4 d-block text-white" style={{ background: 'rgba(255,255,255,0.05)', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '15px', transition: 'all 0.3s' }}
              onMouseOver={(e) => { e.currentTarget.style.transform = 'translateY(-5px)'; e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'; }}
              onMouseOut={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'; }}>
              <i className="bi bi-headset fs-1 text-success mb-3 d-block"></i>
              <h4 className="fw-bold">Konsol Loket</h4>
              <p className="small text-white-50 m-0">Panel Operator Pemanggil</p>
            </Link>
          </div>

          {/* Menu Pengaturan */}
          <div className="col-md-4 col-lg">
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
