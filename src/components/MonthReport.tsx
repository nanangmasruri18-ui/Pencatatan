import React, { useState, useMemo } from 'react';
import { Barang, Transaksi } from '../types';
import { Printer, Calendar, ArrowDownLeft, ArrowUpRight, AlertTriangle, CheckCircle, Package } from 'lucide-react';

interface MonthReportProps {
  items: Barang[];
  transactions: Transaksi[];
}

export default function MonthReport({ items, transactions }: MonthReportProps) {
  // Find unique months in transactions to populate the dropdown, default to current month
  const today = new Date();
  const defaultMonthStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  
  const [selectedMonth, setSelectedMonth] = useState(defaultMonthStr);

  const monthOptions = useMemo(() => {
    const months = new Set<string>();
    // Always include current month
    months.add(defaultMonthStr);
    
    transactions.forEach(t => {
      if (t.tanggal) {
        const yyyyMm = t.tanggal.substring(0, 7); // "YYYY-MM"
        months.add(yyyyMm);
      }
    });

    return Array.from(months).sort((a, b) => b.localeCompare(a)); // Newest first
  }, [transactions, defaultMonthStr]);

  // Translate month string (YYYY-MM) to Indonesian
  const formatIndoMonth = (ymString: string) => {
    const [year, month] = ymString.split('-');
    const monthNames = [
      'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
      'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
    ];
    const monthIndex = parseInt(month) - 1;
    return `${monthNames[monthIndex]} ${year}`;
  };

  // Calculate report metrics for the selected month
  const reportData = useMemo(() => {
    const [selYear, selMonth] = selectedMonth.split('-').map(Number);
    
    // Start of selected month date
    const startOfSelectedMonth = new Date(selYear, selMonth - 1, 1);
    // End of selected month date
    const endOfSelectedMonth = new Date(selYear, selMonth, 0, 23, 59, 59, 999);

    return items.map(item => {
      // 1. Calculate historical balance before selected month
      let stockBeforeMonth = item.stok_awal;
      
      transactions.forEach(t => {
        if (t.barang_id !== item.id) return;
        const tDate = new Date(t.tanggal);
        if (tDate < startOfSelectedMonth) {
          if (t.jenis === 'masuk') {
            stockBeforeMonth += t.jumlah;
          } else {
            stockBeforeMonth -= t.jumlah;
          }
        }
      });

      // 2. Calculate transactions within selected month
      let masukBulanIni = 0;
      let keluarBulanIni = 0;
      const rincianBulanIni: Transaksi[] = [];

      transactions.forEach(t => {
        if (t.barang_id !== item.id) return;
        const tDate = new Date(t.tanggal);
        if (tDate >= startOfSelectedMonth && tDate <= endOfSelectedMonth) {
          rincianBulanIni.push(t);
          if (t.jenis === 'masuk') {
            masukBulanIni += t.jumlah;
          } else {
            keluarBulanIni += t.jumlah;
          }
        }
      });

      // 3. Stock at the end of the month
      const stokAkhirBulan = stockBeforeMonth + masukBulanIni - keluarBulanIni;

      // Determine stock status
      let status: 'Aman' | 'Menipis' | 'Habis' = 'Aman';
      if (stokAkhirBulan <= 0) {
        status = 'Habis';
      } else if (stokAkhirBulan <= item.stok_minimal) {
        status = 'Menipis';
      }

      return {
        ...item,
        stok_awal_bulan: stockBeforeMonth,
        masuk_bulan_ini: masukBulanIni,
        keluar_bulan_ini: keluarBulanIni,
        stok_akhir_bulan: stokAkhirBulan,
        status_stok: status,
      };
    });
  }, [items, transactions, selectedMonth]);

  // All transactions within the selected month
  const selectedMonthTransactions = useMemo(() => {
    const [selYear, selMonth] = selectedMonth.split('-').map(Number);
    const start = new Date(selYear, selMonth - 1, 1);
    const end = new Date(selYear, selMonth, 0, 23, 59, 59, 999);

    return transactions.filter(t => {
      const tDate = new Date(t.tanggal);
      return tDate >= start && tDate <= end;
    }).sort((a, b) => b.tanggal.localeCompare(a.tanggal));
  }, [transactions, selectedMonth]);

  // Summaries
  const summary = useMemo(() => {
    let totalMasuk = 0;
    let totalKeluar = 0;
    let menipisCount = 0;
    let habisCount = 0;

    reportData.forEach(d => {
      totalMasuk += d.masuk_bulan_ini;
      totalKeluar += d.keluar_bulan_ini;
      if (d.status_stok === 'Menipis') menipisCount++;
      if (d.status_stok === 'Habis') habisCount++;
    });

    return {
      totalMasuk,
      totalKeluar,
      menipisCount,
      habisCount,
    };
  }, [reportData]);

  // Dynamic window.print handler that hides the dashboard controls and formats perfectly for a PDF
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      <div className="no-print space-y-6">
        {/* Month Selector & Action Panel */}
      <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl">
            <Calendar size={22} />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-800">Laporan Akhir Bulan</h3>
            <p className="text-xs text-slate-400">Pilih periode laporan untuk melihat stok, penggunaan & riwayat</p>
          </div>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          <select
            className="flex-1 md:flex-initial min-w-[180px] px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 bg-white focus:outline-none focus:border-indigo-500 text-sm font-semibold cursor-pointer"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
          >
            {monthOptions.map((m) => (
              <option key={m} value={m}>
                {formatIndoMonth(m)}
              </option>
            ))}
          </select>

          <button
            onClick={handlePrint}
            className="flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-sm hover:shadow transition"
          >
            <Printer size={16} />
            Cetak PDF
          </button>
        </div>
      </div>

      {/* KPI Stats Widgets */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Barang</span>
            <div className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg">
              <Package size={16} />
            </div>
          </div>
          <p className="text-2xl font-bold text-slate-800">{items.length}</p>
          <p className="text-[10px] text-slate-400 mt-1">Jenis barang dipantau</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Barang Masuk</span>
            <div className="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg">
              <ArrowDownLeft size={16} />
            </div>
          </div>
          <p className="text-2xl font-bold text-emerald-600">+{summary.totalMasuk}</p>
          <p className="text-[10px] text-slate-400 mt-1">Unit didatangkan bulan ini</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Penggunaan (Keluar)</span>
            <div className="p-1.5 bg-amber-50 text-amber-600 rounded-lg">
              <ArrowUpRight size={16} />
            </div>
          </div>
          <p className="text-2xl font-bold text-amber-600">-{summary.totalKeluar}</p>
          <p className="text-[10px] text-slate-400 mt-1">Unit habis pakai terpakai</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Kritis / Habis</span>
            <div className="p-1.5 bg-rose-50 text-rose-600 rounded-lg">
              <AlertTriangle size={16} />
            </div>
          </div>
          <p className="text-2xl font-bold text-rose-600">{summary.habisCount + summary.menipisCount}</p>
          <p className="text-[10px] text-slate-400 mt-1">
            {summary.habisCount} Habis · {summary.menipisCount} Menipis
          </p>
        </div>
      </div>

      {/* Main Report Table (Stok & Penggunaan) */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-50 flex items-center justify-between">
          <h4 className="text-sm font-bold text-slate-800">
            Ringkasan Stok & Penggunaan — {formatIndoMonth(selectedMonth)}
          </h4>
          <span className="text-xs text-slate-400 font-medium">Berdasarkan pencatatan mutasi barang</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/70 border-b border-slate-100 text-slate-400 text-[11px] font-bold uppercase tracking-wider">
                <th className="py-3 px-5">Kode / Barang</th>
                <th className="py-3 px-4">Kategori</th>
                <th className="py-3 px-4 text-center">Stok Awal</th>
                <th className="py-3 px-4 text-center text-emerald-600">Masuk (+)</th>
                <th className="py-3 px-4 text-center text-amber-600">Keluar (-)</th>
                <th className="py-3 px-4 text-center">Stok Akhir</th>
                <th className="py-3 px-4">Satuan</th>
                <th className="py-3 px-5 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700 text-xs">
              {reportData.map((data) => (
                <tr key={data.id} className="hover:bg-slate-50/50 transition">
                  <td className="py-3 px-5">
                    <div className="font-semibold text-slate-800">{data.nama}</div>
                    <div className="flex flex-wrap items-center gap-1.5 mt-0.5 text-[9px]">
                      <span className="text-slate-400 font-mono">{data.kode}</span>
                      {data.tahun_pengadaan && (
                        <>
                          <span className="text-slate-300">•</span>
                          <span className="text-slate-500">Thn: {data.tahun_pengadaan}</span>
                        </>
                      )}
                      {data.kondisi && (
                        <>
                          <span className="text-slate-300">•</span>
                          <span className={`font-bold ${
                            data.kondisi === 'Baik'
                              ? 'text-emerald-600'
                              : data.kondisi === 'Rusak Ringan'
                              ? 'text-amber-600'
                              : 'text-rose-600'
                          }`}>
                            {data.kondisi}
                          </span>
                        </>
                      )}
                    </div>
                  </td>
                  <td className="py-3 px-4 text-slate-500">{data.kategori}</td>
                  <td className="py-3 px-4 text-center font-medium text-slate-500">{data.stok_awal_bulan}</td>
                  <td className="py-3 px-4 text-center text-emerald-600 font-semibold">+{data.masuk_bulan_ini}</td>
                  <td className="py-3 px-4 text-center text-amber-600 font-semibold">-{data.keluar_bulan_ini}</td>
                  <td className={`py-3 px-4 text-center font-bold text-sm ${
                    data.stok_akhir_bulan <= 0 ? 'text-rose-600' : 'text-slate-800'
                  }`}>
                    {data.stok_akhir_bulan}
                  </td>
                  <td className="py-3 px-4 text-slate-400 font-medium">{data.satuan}</td>
                  <td className="py-3 px-5 text-center">
                    <span className={`inline-flex px-2 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase ${
                      data.status_stok === 'Aman'
                        ? 'bg-emerald-50 text-emerald-700'
                        : data.status_stok === 'Menipis'
                        ? 'bg-amber-50 text-amber-700'
                        : 'bg-rose-50 text-rose-700'
                    }`}>
                      {data.status_stok}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* History log (Riwayat) */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-50 flex items-center justify-between">
          <h4 className="text-sm font-bold text-slate-800">
            Riwayat Transaksi Lengkap — {formatIndoMonth(selectedMonth)}
          </h4>
          <span className="text-xs text-slate-400 font-medium">Total {selectedMonthTransactions.length} aktivitas mutasi</span>
        </div>

        {selectedMonthTransactions.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-sm text-slate-400">Tidak ada transaksi tercatat pada bulan ini.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/70 border-b border-slate-100 text-slate-400 text-[11px] font-bold uppercase tracking-wider">
                  <th className="py-3 px-5">Tanggal</th>
                  <th className="py-3 px-4">Nama Barang</th>
                  <th className="py-3 px-4 text-center">Aktivitas</th>
                  <th className="py-3 px-4 text-right">Jumlah</th>
                  <th className="py-3 px-4">Keterangan / Tujuan</th>
                  <th className="py-3 px-5">Oleh / Partner</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-600 text-xs">
                {selectedMonthTransactions.map((t) => {
                  const b = items.find(item => item.id === t.barang_id);
                  return (
                    <tr key={t.id} className="hover:bg-slate-50/50 transition">
                      <td className="py-3 px-5 font-medium text-slate-500 whitespace-nowrap">
                        {t.tanggal}
                      </td>
                      <td className="py-3 px-4 font-semibold text-slate-800">
                        {b ? b.nama : 'Barang Terhapus'}
                        <span className="text-[10px] text-slate-400 font-mono block mt-0.5">
                          {b ? b.kode : '-'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold ${
                          t.jenis === 'masuk' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                        }`}>
                          {t.jenis === 'masuk' ? <ArrowDownLeft size={12} /> : <ArrowUpRight size={12} />}
                          {t.jenis === 'masuk' ? 'MASUK' : 'KELUAR'}
                        </span>
                      </td>
                      <td className={`py-3 px-4 text-right font-bold text-sm ${
                        t.jenis === 'masuk' ? 'text-emerald-600' : 'text-amber-600'
                      }`}>
                        {t.jenis === 'masuk' ? '+' : '-'}{t.jumlah} {b?.satuan || ''}
                      </td>
                      <td className="py-3 px-4 max-w-xs truncate text-slate-500" title={t.keterangan}>
                        {t.keterangan || '-'}
                      </td>
                      <td className="py-3 px-5 font-medium text-slate-700">
                        {t.penerima_penyerah || '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      </div>

      {/* ========================================================
          PRINT PREVIEW WRAPPER (HIDDEN ON SCREEN, SHOWN ON PRINT)
          ======================================================== */}
      <div className="print-styles">
        {/* Print CSS Injection */}
        <style>{`
          @media screen {
            .print-styles {
              display: none !important;
            }
          }
          @media print {
            body {
              background: white !important;
              color: black !important;
              font-family: 'Inter', sans-serif !important;
              padding: 0 !important;
              margin: 0 !important;
            }
            .no-print {
              display: none !important;
            }
            .print-styles {
              display: block !important;
              background: white !important;
              padding: 20px !important;
            }
            table {
              width: 100% !important;
              border-collapse: collapse !important;
              margin-top: 15px !important;
              font-size: 11px !important;
            }
            th, td {
              border: 1px solid #ddd !important;
              padding: 8px !important;
              text-align: left !important;
            }
            th {
              background-color: #f5f5f5 !important;
              color: #000 !important;
              font-weight: bold !important;
            }
            .header-print {
              text-align: center !important;
              margin-bottom: 25px !important;
              border-bottom: 3px double #000 !important;
              padding-bottom: 15px !important;
            }
            .header-print h2 {
              margin: 0 !important;
              font-size: 20px !important;
              font-weight: bold !important;
              text-transform: uppercase !important;
            }
            .header-print p {
              margin: 5px 0 0 0 !important;
              font-size: 12px !important;
              color: #555 !important;
            }
            .section-title {
              font-size: 13px !important;
              font-weight: bold !important;
              margin: 20px 0 10px 0 !important;
              text-transform: uppercase !important;
              border-left: 4px solid #000 !important;
              padding-left: 8px !important;
            }
            .meta-print {
              margin-bottom: 15px !important;
              font-size: 11px !important;
            }
            .sig-section {
              margin-top: 50px !important;
              display: flex !important;
              justify-content: space-between !important;
              font-size: 11px !important;
              page-break-inside: avoid !important;
            }
            .sig-box {
              text-align: center !important;
              width: 200px !important;
            }
            .sig-space {
              height: 65px !important;
            }
          }
        `}</style>

        {/* Printable Document Layout */}
        <div className="header-print">
          <h2>Laporan Bulanan Barang Habis Pakai</h2>
          <p>Sistem Informasi Inventaris BHP · Periode: {formatIndoMonth(selectedMonth)}</p>
        </div>

        <div className="meta-print flex justify-between">
          <div>
            <strong>Dicetak Pada:</strong> {new Date().toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </div>
          <div>
            <strong>Status Database:</strong> Online Supabase Cloud
          </div>
        </div>

        {/* 1. Ringkasan Kuantitatif */}
        <div className="section-title">1. Ringkasan Kuantitatif Mutasi Barang</div>
        <div className="grid grid-cols-4 gap-4 mb-4 border p-4 rounded bg-slate-50/30" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)' }}>
          <div>
            <div style={{ fontSize: '10px', color: '#666' }}>TOTAL ITEM BARANG</div>
            <div style={{ fontSize: '16px', fontWeight: 'bold' }}>{items.length} Barang</div>
          </div>
          <div>
            <div style={{ fontSize: '10px', color: '#666' }}>TOTAL UNIT MASUK</div>
            <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#10b981' }}>+{summary.totalMasuk} Unit</div>
          </div>
          <div>
            <div style={{ fontSize: '10px', color: '#666' }}>TOTAL UNIT KELUAR</div>
            <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#f59e0b' }}>-{summary.totalKeluar} Unit</div>
          </div>
          <div>
            <div style={{ fontSize: '10px', color: '#666' }}>STATUS KRITIS</div>
            <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#ef4444' }}>{summary.habisCount} Habis / {summary.menipisCount} Kritis</div>
          </div>
        </div>

        {/* 2. Ringkasan Stok & Penggunaan */}
        <div className="section-title">2. Laporan Stok Akhir & Mutasi Penggunaan</div>
        <table>
          <thead>
            <tr>
              <th style={{ width: '12%' }}>Kode Barang</th>
              <th>Nama Barang</th>
              <th>Kategori</th>
              <th style={{ textAlign: 'center', width: '10%' }}>Stok Awal</th>
              <th style={{ textAlign: 'center', width: '10%' }}>Masuk (+)</th>
              <th style={{ textAlign: 'center', width: '10%' }}>Keluar (-)</th>
              <th style={{ textAlign: 'center', width: '10%' }}>Stok Akhir</th>
              <th style={{ width: '10%' }}>Satuan</th>
              <th style={{ textTransform: 'uppercase', width: '12%', textAlign: 'center' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {reportData.map((data) => (
              <tr key={data.id}>
                <td style={{ fontFamily: 'monospace' }}>{data.kode}</td>
                <td>
                  <strong>{data.nama}</strong>
                  <div style={{ fontSize: '9px', color: '#666', marginTop: '2px' }}>
                    {data.tahun_pengadaan ? `Tahun: ${data.tahun_pengadaan}` : ''}
                    {data.tahun_pengadaan && data.kondisi ? ' • ' : ''}
                    {data.kondisi ? `Kondisi: ${data.kondisi}` : ''}
                  </div>
                </td>
                <td>{data.kategori}</td>
                <td style={{ textAlign: 'center' }}>{data.stok_awal_bulan}</td>
                <td style={{ textAlign: 'center', color: '#10b981', fontWeight: 'bold' }}>+{data.masuk_bulan_ini}</td>
                <td style={{ textAlign: 'center', color: '#f59e0b', fontWeight: 'bold' }}>-{data.keluar_bulan_ini}</td>
                <td style={{ textAlign: 'center', fontWeight: 'bold' }}>{data.stok_akhir_bulan}</td>
                <td>{data.satuan}</td>
                <td style={{ textAlign: 'center', fontWeight: 'bold' }}>{data.status_stok}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* 3. Riwayat Transaksi */}
        <div className="section-title">3. Riwayat Aktivitas Transaksi Masuk/Keluar</div>
        <table>
          <thead>
            <tr>
              <th style={{ width: '12%' }}>Tanggal</th>
              <th>Nama Barang (Kode)</th>
              <th style={{ width: '12%', textAlign: 'center' }}>Jenis</th>
              <th style={{ width: '12%', textAlign: 'right' }}>Jumlah</th>
              <th>Keterangan / Tujuan</th>
              <th>Pihak Terkait / Penerima</th>
            </tr>
          </thead>
          <tbody>
            {selectedMonthTransactions.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', color: '#888', padding: '15px' }}>
                  Tidak ada transaksi tercatat pada bulan ini.
                </td>
              </tr>
            ) : (
              selectedMonthTransactions.map((t) => {
                const b = items.find(item => item.id === t.barang_id);
                return (
                  <tr key={t.id}>
                    <td>{t.tanggal}</td>
                    <td><strong>{b ? b.nama : 'Barang Terhapus'}</strong> ({b ? b.kode : '-'})</td>
                    <td style={{ textAlign: 'center', fontWeight: 'bold', color: t.jenis === 'masuk' ? '#10b981' : '#f59e0b' }}>
                      {t.jenis === 'masuk' ? 'MASUK' : 'KELUAR'}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 'bold' }}>
                      {t.jenis === 'masuk' ? '+' : '-'}{t.jumlah} {b?.satuan || ''}
                    </td>
                    <td>{t.keterangan || '-'}</td>
                    <td>{t.penerima_penyerah || '-'}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        {/* 4. Tanda Tangan */}
        <div className="sig-section">
          <div className="sig-box">
            <p>Mengetahui,</p>
            <p><strong>Kepala Lembaga/Instansi</strong></p>
            <div className="sig-space"></div>
            <p className="border-t border-black pt-1 font-bold">_________________________</p>
            <p style={{ fontSize: '9px', color: '#666' }}>NIP. ........................................</p>
          </div>
          <div className="sig-box">
            <p>Dibuat Oleh,</p>
            <p><strong>Staf Pengelola BHP</strong></p>
            <div className="sig-space"></div>
            <p className="border-t border-black pt-1 font-bold">_________________________</p>
            <p style={{ fontSize: '9px', color: '#666' }}>Tanda Tangan & Nama Terang</p>
          </div>
        </div>
      </div>
    </div>
  );
}
