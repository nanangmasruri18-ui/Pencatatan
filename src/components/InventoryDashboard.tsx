import React, { useState, useEffect, useMemo } from 'react';
import { Barang, Transaksi, RingkasanStok } from '../types';
import {
  fetchBarang,
  insertBarang,
  updateBarang,
  deleteBarang,
  fetchTransaksi,
  insertTransaksi,
  deleteTransaksi,
  isUsingSupabase,
  syncLocalToSupabase,
  SUPABASE_SQL_SCRIPT,
  getSupabaseErrorState,
  getLocalBarang,
  getLocalTransaksi
} from '../lib/supabase';
import ItemForm from './ItemForm';
import TransactionForm from './TransactionForm';
import MonthReport from './MonthReport';
import {
  Package,
  ArrowDownLeft,
  ArrowUpRight,
  Plus,
  Search,
  Filter,
  AlertTriangle,
  History,
  Database,
  CloudLightning,
  ChevronRight,
  Info,
  Copy,
  Check,
  Edit2,
  Trash2,
  X,
  FileSpreadsheet,
  Settings,
  RefreshCw,
  Wifi,
  WifiOff,
  AlertCircle
} from 'lucide-react';

export default function InventoryDashboard() {
  const [items, setItems] = useState<Barang[]>([]);
  const [transactions, setTransactions] = useState<Transaksi[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Forms and Modals State
  const [showItemForm, setShowItemForm] = useState(false);
  const [showTransactionForm, setShowTransactionForm] = useState(false);
  const [editingItem, setEditingItem] = useState<Barang | null>(null);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  
  // Filters State
  const [activeTab, setActiveTab] = useState<'stok' | 'transaksi' | 'laporan' | 'sinkronisasi'>('stok');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<'Semua' | 'Aman' | 'Menipis' | 'Habis'>('Semua');

  // Local storage stats for Sync Dashboard
  const [localBarangCount, setLocalBarangCount] = useState(0);
  const [localTransaksiCount, setLocalTransaksiCount] = useState(0);

  // Supabase Sync UI feedback
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ b: number; t: number } | null>(null);
  const [copiedSql, setCopiedSql] = useState(false);
  const [supabaseTableError, setSupabaseTableError] = useState(false);

  // Load all initial data from data tier
  const loadData = async () => {
    setIsLoading(true);
    try {
      const fetchedItems = await fetchBarang();
      const fetchedTrans = await fetchTransaksi();
      setItems(fetchedItems);
      setTransactions(fetchedTrans);
      
      // Update local storage stats
      try {
        setLocalBarangCount(getLocalBarang().length);
        setLocalTransaksiCount(getLocalTransaksi().length);
      } catch (e) {
        console.warn('Error reading local storage metrics:', e);
      }
      
      const errState = getSupabaseErrorState();
      setSupabaseTableError(errState.hasError);
    } catch (error) {
      console.warn('Warning loading inventory data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Compute stock levels for each item
  const currentStocks = useMemo(() => {
    const stocks: Record<string, number> = {};
    
    // Initialize with stok_awal
    items.forEach(item => {
      stocks[item.id] = item.stok_awal;
    });

    // Apply all transactions sequentially (though we can compute directly)
    transactions.forEach(t => {
      if (stocks[t.barang_id] !== undefined) {
        if (t.jenis === 'masuk') {
          stocks[t.barang_id] += t.jumlah;
        } else if (t.jenis === 'keluar') {
          stocks[t.barang_id] -= t.jumlah;
        }
      }
    });

    return stocks;
  }, [items, transactions]);

  // Aggregate current stock items and determine alert thresholds
  const itemsWithStockSummary = useMemo<RingkasanStok[]>(() => {
    return items.map(item => {
      const stokAkhir = currentStocks[item.id] ?? 0;
      
      // Calculate item's individual total masuk / keluar (useful for search grids)
      let stokMasuk = 0;
      let stokKeluar = 0;
      transactions.forEach(t => {
        if (t.barang_id === item.id) {
          if (t.jenis === 'masuk') stokMasuk += t.jumlah;
          if (t.jenis === 'keluar') stokKeluar += t.jumlah;
        }
      });

      let status_stok: 'Aman' | 'Menipis' | 'Habis' = 'Aman';
      if (stokAkhir <= 0) {
        status_stok = 'Habis';
      } else if (stokAkhir <= item.stok_minimal) {
        status_stok = 'Menipis';
      }

      return {
        ...item,
        stok_masuk: stokMasuk,
        stok_keluar: stokKeluar,
        stok_akhir: stokAkhir,
        status_stok,
      };
    });
  }, [items, transactions, currentStocks]);

  // Available unique categories for the filter select
  const categories = useMemo(() => {
    const cats = new Set<string>();
    items.forEach(b => {
      if (b.kategori) cats.add(b.kategori);
    });
    return Array.from(cats);
  }, [items]);

  // Filtering Logic
  const filteredSummary = useMemo(() => {
    return itemsWithStockSummary.filter(b => {
      const matchesSearch = b.nama.toLowerCase().includes(searchTerm.toLowerCase()) || b.kode.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = selectedCategory === '' || b.kategori === selectedCategory;
      const matchesStatus = selectedStatus === 'Semua' || b.status_stok === selectedStatus;
      return matchesSearch && matchesCategory && matchesStatus;
    });
  }, [itemsWithStockSummary, searchTerm, selectedCategory, selectedStatus]);

  // Low stock alert list
  const criticalItems = useMemo(() => {
    return itemsWithStockSummary.filter(b => b.status_stok !== 'Aman');
  }, [itemsWithStockSummary]);

  // Core Mutation Handlers (delegated to DAO)
  const handleSaveItem = async (newItem: Omit<Barang, 'id' | 'created_at'>) => {
    const saved = await insertBarang(newItem);
    setItems(prev => [...prev, saved]);
    loadData(); // reload to ensure exact sync
    return saved;
  };

  const handleUpdateItem = async (id: string, updatedFields: Partial<Barang>) => {
    const updated = await updateBarang(id, updatedFields);
    setItems(prev => prev.map(b => b.id === id ? updated : b));
    loadData();
    return updated;
  };

  const handleDeleteItem = async (id: string) => {
    const confirmDelete = window.confirm('Apakah Anda yakin ingin menghapus barang ini? Semua riwayat transaksi barang ini juga akan terhapus.');
    if (!confirmDelete) return;

    await deleteBarang(id);
    setItems(prev => prev.filter(b => b.id !== id));
    setTransactions(prev => prev.filter(t => t.barang_id !== id));
    loadData();
  };

  const handleSaveTransaction = async (newTrans: Omit<Transaksi, 'id' | 'created_at'>) => {
    const saved = await insertTransaksi(newTrans);
    setTransactions(prev => [saved, ...prev]);
    loadData();
    return saved;
  };

  const handleDeleteTransaction = async (id: string) => {
    const confirmDelete = window.confirm('Hapus transaksi ini? Stok barang terkait akan disesuaikan kembali.');
    if (!confirmDelete) return;

    await deleteTransaksi(id);
    setTransactions(prev => prev.filter(t => t.id !== id));
    loadData();
  };

  // Sync handler
  const handleSyncToSupabase = async () => {
    setIsSyncing(true);
    setSyncResult(null);
    try {
      const res = await syncLocalToSupabase();
      setSyncResult({ b: res.barangSynced, t: res.transaksiSynced });
      loadData();
    } catch (err: any) {
      alert(err?.message || 'Gagal menyinkronkan data.');
    } finally {
      setIsSyncing(false);
    }
  };

  const copySqlToClipboard = () => {
    navigator.clipboard.writeText(SUPABASE_SQL_SCRIPT);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2000);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 pb-12">
      
      {/* Dynamic Print Header (Hidden on screen, handled inside MonthReport) */}

      {/* Top Professional App Header */}
      <header className="no-print bg-white border-b border-slate-100 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          
          {/* Logo Title */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-md shadow-indigo-100">
              <Package size={22} />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                Aplikasi Inventaris BHP
                <span className="text-[10px] bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full font-bold">
                  v1.2
                </span>
              </h1>
              <p className="text-xs text-slate-400 font-medium">Pencatatan Barang Habis Pakai & Stok Akhir Bulan</p>
            </div>
          </div>

          {/* Database Connection indicator & Settings */}
          <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
            <button
              onClick={() => setShowSettingsModal(true)}
              className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-full border transition ${
                isUsingSupabase
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
                  : 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100'
              }`}
            >
              <Database size={14} className={isUsingSupabase ? 'text-emerald-500 animate-pulse' : 'text-amber-500'} />
              <span>{isUsingSupabase ? 'Supabase Online' : 'Penyimpanan: Lokal'}</span>
              <Settings size={12} className="ml-1 text-slate-400" />
            </button>

            <button
              onClick={() => {
                setEditingItem(null);
                setShowItemForm(true);
              }}
              className="flex items-center justify-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-sm transition"
            >
              <Plus size={14} />
              Barang Baru
            </button>

            <button
              onClick={() => setShowTransactionForm(true)}
              className="flex items-center justify-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-sm transition"
            >
              <Plus size={14} />
              Catat Mutasi
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        
        {/* Inline Modals/Slideouts for Forms */}
        {showItemForm && (
          <div className="no-print fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl overflow-hidden relative">
              <button
                onClick={() => setShowItemForm(false)}
                className="absolute right-4 top-4 text-slate-400 hover:text-slate-600 p-1.5 hover:bg-slate-50 rounded-lg transition"
              >
                <X size={18} />
              </button>
              <div className="p-1">
                <ItemForm
                  onSave={handleSaveItem}
                  onUpdate={handleUpdateItem}
                  editingItem={editingItem}
                  onCancel={() => setShowItemForm(false)}
                  existingItems={items}
                />
              </div>
            </div>
          </div>
        )}

        {showTransactionForm && (
          <div className="no-print fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl overflow-hidden relative">
              <button
                onClick={() => setShowTransactionForm(false)}
                className="absolute right-4 top-4 text-slate-400 hover:text-slate-600 p-1.5 hover:bg-slate-50 rounded-lg transition"
              >
                <X size={18} />
              </button>
              <div className="p-1">
                <TransactionForm
                  onSave={handleSaveTransaction}
                  items={items}
                  currentStocks={currentStocks}
                  onCancel={() => setShowTransactionForm(false)}
                />
              </div>
            </div>
          </div>
        )}

        {/* Supabase SQL DDL & Connection Instructions Modal */}
        {showSettingsModal && (
          <div className="no-print fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="w-full max-w-2xl bg-white rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[85vh]">
              <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                <div className="flex items-center gap-2">
                  <Database className="text-indigo-600" size={20} />
                  <h3 className="font-bold text-slate-800 text-sm">Konfigurasi Database Supabase</h3>
                </div>
                <button
                  onClick={() => setShowSettingsModal(false)}
                  className="text-slate-400 hover:text-slate-600 p-1 hover:bg-slate-100 rounded-lg transition"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="p-6 overflow-y-auto space-y-5 text-xs text-slate-600 leading-relaxed">
                
                {/* Intro */}
                <div>
                  <h4 className="font-bold text-slate-800 text-xs mb-1.5">Tentang Arsitektur Database:</h4>
                  <p>
                    Aplikasi ini dirancang dengan sistem hibrida. Secara default, aplikasi berjalan lancar menggunakan 
                    <strong> Penyimpanan Lokal (localStorage)</strong> di browser Anda. Jika Anda ingin data Anda aman di cloud, 
                    Anda dapat menghubungkannya ke <strong>database PostgreSQL Supabase</strong> Anda sendiri secara gratis!
                  </p>
                </div>

                {/* Setup Variables */}
                <div className="bg-indigo-50/50 border border-indigo-100 rounded-xl p-4">
                  <h4 className="font-bold text-indigo-900 mb-2 flex items-center gap-1">
                    <CloudLightning size={14} />
                    Cara Menghubungkan ke Supabase:
                  </h4>
                  <ol className="list-decimal pl-4 space-y-2 text-indigo-950 font-medium">
                    <li>Buat proyek database gratis di <a href="https://supabase.com" target="_blank" rel="noopener noreferrer" className="underline text-indigo-600">supabase.com</a></li>
                    <li>Buka menu <strong>Project Settings &gt; API</strong> di dashboard Supabase Anda.</li>
                    <li>Tambahkan 2 variabel berikut ke file rahasia/secrets aplikasi (atau file <code>.env</code> Anda):</li>
                  </ol>
                  <div className="mt-3 bg-slate-900 text-slate-200 p-3 rounded-lg font-mono text-[10px] space-y-1">
                    <div>VITE_SUPABASE_URL="https://proyek-anda.supabase.co"</div>
                    <div>VITE_SUPABASE_ANON_KEY="kunci-anon-anda"</div>
                  </div>
                </div>

                {/* Sync local data to Supabase */}
                {isUsingSupabase && (
                  <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div>
                      <h4 className="font-bold text-emerald-900 mb-1 flex items-center gap-1.5">
                        <Check size={14} className="text-emerald-600" />
                        Sinkronisasi Data Mandiri
                      </h4>
                      <p className="text-[11px] text-emerald-700">
                        Migrasikan seluruh data barang & transaksi mutasi lokal Anda saat ini ke database Supabase Cloud.
                      </p>
                      {syncResult && (
                        <div className="mt-2 text-[10px] font-bold text-emerald-800 bg-white/70 px-2 py-1 rounded">
                          Berhasil migrasi: {syncResult.b} barang dan {syncResult.t} transaksi.
                        </div>
                      )}
                    </div>
                    <button
                      onClick={handleSyncToSupabase}
                      disabled={isSyncing}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold shadow-sm transition flex items-center gap-1.5 shrink-0"
                    >
                      {isSyncing ? 'Menyinkronkan...' : 'Sinkronkan Sekarang'}
                    </button>
                  </div>
                )}

                {/* DDL Copy SQL */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <h4 className="font-bold text-slate-800 text-xs">Skrip SQL DDL (Jalankan di Supabase SQL Editor):</h4>
                    <button
                      onClick={copySqlToClipboard}
                      className="flex items-center gap-1 text-indigo-600 hover:text-indigo-800 font-bold"
                    >
                      {copiedSql ? <Check size={12} /> : <Copy size={12} />}
                      {copiedSql ? 'Disalin!' : 'Salin Skrip'}
                    </button>
                  </div>
                  <pre className="bg-slate-900 text-emerald-400 p-4 rounded-xl font-mono text-[10px] overflow-x-auto max-h-48">
                    {SUPABASE_SQL_SCRIPT}
                  </pre>
                </div>
              </div>

              <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end">
                <button
                  onClick={() => setShowSettingsModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-xl transition"
                >
                  Tutup Panduan
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Supabase Schema Missing Warning */}
        {supabaseTableError && (
          <div className="no-print bg-amber-50 border border-amber-200 rounded-2xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-100 text-amber-700 rounded-xl">
                <Database size={20} />
              </div>
              <div>
                <h4 className="text-sm font-bold text-amber-900">Database Supabase Belum Siap</h4>
                <p className="text-xs text-amber-700 font-medium">
                  Koneksi Supabase Anda aktif, tetapi tabel <code className="bg-amber-100/60 px-1.5 py-0.5 rounded font-mono font-bold">barang</code> atau <code className="bg-amber-100/60 px-1.5 py-0.5 rounded font-mono font-bold">transaksi</code> belum ditemukan di Supabase. Aplikasi otomatis beralih ke <strong>Penyimpanan Lokal</strong> agar tetap dapat digunakan.
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowSettingsModal(true)}
              className="w-full md:w-auto px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shadow-sm transition shrink-0 whitespace-nowrap"
            >
              Siapkan Tabel Database
            </button>
          </div>
        )}

        {/* Alert Section for Critical items */}
        {criticalItems.length > 0 && (
          <div className="no-print bg-amber-50 border border-amber-200 rounded-2xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-100 text-amber-700 rounded-xl">
                <AlertTriangle size={20} />
              </div>
              <div>
                <h4 className="text-sm font-bold text-amber-800">Peringatan Ketersediaan Barang Habis Pakai</h4>
                <p className="text-xs text-amber-600 font-medium">
                  Ada {criticalItems.length} item barang dengan kondisi stok menipis atau habis. Segera lakukan pemesanan atau restock barang.
                </p>
              </div>
            </div>
            <div className="flex gap-2 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
              {criticalItems.slice(0, 3).map(item => (
                <span
                  key={item.id}
                  className={`text-[10px] font-bold px-2.5 py-1 rounded-lg whitespace-nowrap ${
                    item.stok_akhir <= 0 ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'
                  }`}
                >
                  {item.nama} ({item.stok_akhir} {item.satuan})
                </span>
              ))}
              {criticalItems.length > 3 && (
                <span className="text-[10px] font-bold px-2 py-1 bg-slate-200 text-slate-700 rounded-lg whitespace-nowrap">
                  +{criticalItems.length - 3} lagi
                </span>
              )}
            </div>
          </div>
        )}

        {/* Dashboard Tabs Control Navigation */}
        <div className="no-print bg-white border border-slate-100 rounded-2xl p-1.5 shadow-sm flex">
          <button
            onClick={() => setActiveTab('stok')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold transition ${
              activeTab === 'stok'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
            }`}
          >
            <Package size={15} />
            Pemantauan Stok
          </button>
          <button
            onClick={() => setActiveTab('transaksi')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold transition ${
              activeTab === 'transaksi'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
            }`}
          >
            <History size={15} />
            Alur Masuk/Keluar
          </button>
          <button
            onClick={() => setActiveTab('laporan')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold transition ${
              activeTab === 'laporan'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
            }`}
          >
            <FileSpreadsheet size={15} />
            Laporan Akhir Bulan
          </button>
          <button
            onClick={() => setActiveTab('sinkronisasi')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold transition ${
              activeTab === 'sinkronisasi'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
            }`}
          >
            <RefreshCw size={14} className={isSyncing ? 'animate-spin' : ''} />
            <span>Sinkronisasi & Status</span>
            {!isUsingSupabase && (
              <span className="w-2 h-2 bg-amber-500 rounded-full animate-pulse ml-1" title="Offline (Penyimpanan Lokal)" />
            )}
            {isUsingSupabase && supabaseTableError && (
              <span className="w-2 h-2 bg-rose-500 rounded-full animate-pulse ml-1" title="Kesalahan Tabel Database" />
            )}
          </button>
        </div>

        {/* ========================================================
            TAB 1: PEMANTAUAN STOK (MONITORING STOCK GRID)
            ======================================================== */}
        {activeTab === 'stok' && (
          <div className="no-print grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            
            {/* Left side: Main Items List Table with Filter Panel (Grid col 2) */}
            <div className="lg:col-span-2 space-y-6">
              
              {/* Filters Panel Card */}
              <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm space-y-3.5">
                <div className="flex flex-col md:flex-row gap-3">
                  
                  {/* Search input */}
                  <div className="flex-1 relative">
                    <Search className="absolute left-3 top-3 text-slate-400" size={16} />
                    <input
                      type="text"
                      className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 text-slate-700 placeholder-slate-400 focus:outline-none focus:border-indigo-500 text-xs"
                      placeholder="Cari nama barang atau kode barang..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>

                  {/* Category Filter */}
                  <div className="flex-1">
                    <select
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-slate-700 bg-white focus:outline-none focus:border-indigo-500 text-xs cursor-pointer font-medium"
                      value={selectedCategory}
                      onChange={(e) => setSelectedCategory(e.target.value)}
                    >
                      <option value="">Semua Kategori ({categories.length})</option>
                      {categories.map(cat => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Status Filter */}
                  <div className="flex-1 md:flex-initial md:min-w-[130px]">
                    <select
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-slate-700 bg-white focus:outline-none focus:border-indigo-500 text-xs cursor-pointer font-semibold"
                      value={selectedStatus}
                      onChange={(e) => setSelectedStatus(e.target.value as any)}
                    >
                      <option value="Semua">Semua Status</option>
                      <option value="Aman">Stok Aman</option>
                      <option value="Menipis">Menipis</option>
                      <option value="Habis">Habis</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Main Goods Inventory Table Card */}
              <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
                <div className="p-4 border-b border-slate-50 flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                    Daftar Inventaris BHP ({filteredSummary.length} Item)
                  </h3>
                  {isUsingSupabase && (
                    <span className="text-[10px] text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full font-bold">
                      Sinkron Cloud Aktif
                    </span>
                  )}
                </div>

                {isLoading ? (
                  <div className="py-20 text-center space-y-3">
                    <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
                    <p className="text-xs text-slate-400 font-medium">Memuat data inventaris...</p>
                  </div>
                ) : filteredSummary.length === 0 ? (
                  <div className="py-20 text-center space-y-2">
                    <Package className="text-slate-300 mx-auto" size={40} />
                    <p className="text-xs text-slate-500 font-semibold">Tidak ada barang habis pakai ditemukan</p>
                    <p className="text-[11px] text-slate-400">Silakan tambahkan barang baru atau sesuaikan filter pencarian.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50/50 border-b border-slate-100 text-slate-400 text-[10px] font-bold uppercase tracking-wider">
                          <th className="py-3 px-4">Barang & Kode</th>
                          <th className="py-3 px-3">Kategori</th>
                          <th className="py-3 px-3 text-center">Stok Awal</th>
                          <th className="py-3 px-3 text-center">Masuk / Keluar</th>
                          <th className="py-3 px-3 text-center">Stok Akhir</th>
                          <th className="py-3 px-3">Satuan</th>
                          <th className="py-3 px-4 text-center">Keadaan</th>
                          <th className="py-3 px-4 text-center">Aksi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-slate-700 text-xs">
                        {filteredSummary.map((item) => {
                          const stockPct = item.stok_akhir > 0 ? Math.min(100, Math.round((item.stok_akhir / (item.stok_minimal * 2)) * 100)) : 0;
                          
                          return (
                            <tr key={item.id} className="hover:bg-slate-50/40 transition">
                              
                              {/* Name & Code */}
                              <td className="py-3.5 px-4">
                                <div className="font-bold text-slate-800">{item.nama}</div>
                                <div className="text-[10px] text-slate-400 font-mono mt-0.5">{item.kode}</div>
                              </td>

                              {/* Category */}
                              <td className="py-3.5 px-3 text-slate-500">{item.kategori}</td>

                              {/* Initial Stock */}
                              <td className="py-3.5 px-3 text-center font-medium text-slate-400">{item.stok_awal}</td>

                              {/* Mutations Summary */}
                              <td className="py-3.5 px-3 text-center font-medium whitespace-nowrap">
                                <span className="text-emerald-600">+{item.stok_masuk}</span>
                                <span className="text-slate-300 mx-1">/</span>
                                <span className="text-amber-600">-{item.stok_keluar}</span>
                              </td>

                              {/* Current Calculated Stock with progress indicator */}
                              <td className="py-3.5 px-3 text-center">
                                <div className="font-bold text-slate-800 text-sm mb-1">{item.stok_akhir}</div>
                                <div className="w-12 bg-slate-100 rounded-full h-1.5 mx-auto overflow-hidden">
                                  <div
                                    className={`h-full rounded-full ${
                                      item.status_stok === 'Aman'
                                        ? 'bg-emerald-500'
                                        : item.status_stok === 'Menipis'
                                        ? 'bg-amber-500'
                                        : 'bg-rose-500'
                                    }`}
                                    style={{ width: `${stockPct}%` }}
                                  ></div>
                                </div>
                              </td>

                              {/* Unit */}
                              <td className="py-3.5 px-3 text-slate-400 font-semibold">{item.satuan}</td>

                              {/* Alert state badge */}
                              <td className="py-3.5 px-4 text-center">
                                <span className={`inline-flex px-2 py-0.5 rounded-full text-[9px] font-extrabold tracking-wider uppercase ${
                                  item.status_stok === 'Aman'
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                                    : item.status_stok === 'Menipis'
                                    ? 'bg-amber-50 text-amber-700 border border-amber-100'
                                    : 'bg-rose-50 text-rose-700 border border-rose-100'
                                }`}>
                                  {item.status_stok}
                                </span>
                              </td>

                              {/* Quick Edit/Delete Actions */}
                              <td className="py-3.5 px-4 text-center">
                                <div className="flex items-center justify-center gap-1.5">
                                  <button
                                    onClick={() => {
                                      setEditingItem(item);
                                      setShowItemForm(true);
                                    }}
                                    className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
                                    title="Edit Data Barang"
                                  >
                                    <Edit2 size={13} />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteItem(item.id)}
                                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                                    title="Hapus Barang"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                </div>
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

            {/* Right side widgets: Recent Transactions mini log (Grid col 1) */}
            <div className="space-y-6">
              
              {/* Quick Info Box */}
              <div className="bg-indigo-950 text-slate-200 rounded-2xl p-5 shadow-sm space-y-4 relative overflow-hidden">
                <div className="absolute -right-6 -bottom-6 w-24 h-24 bg-indigo-900 rounded-full opacity-20"></div>
                
                <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-300 flex items-center gap-1.5">
                  <Info size={14} />
                  Sistem Tanpa Login
                </h4>
                <p className="text-[11px] leading-relaxed text-indigo-100 font-medium">
                  Aplikasi ini berjalan instan tanpa perlu registrasi atau login akun. Siapapun dapat mencatat barang masuk, barang keluar, dan mencetak laporan langsung secara cepat.
                </p>
                <div className="pt-2 border-t border-indigo-900 flex justify-between items-center text-[10px] text-indigo-300 font-semibold">
                  <span>Penyimpanan Data Aman</span>
                  <button
                    onClick={() => setShowSettingsModal(true)}
                    className="underline hover:text-white"
                  >
                    Selengkapnya &gt;&gt;
                  </button>
                </div>
              </div>

              {/* Transactions Feed widget */}
              <div className="bg-white border border-slate-100 rounded-2xl shadow-sm p-4 space-y-4">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                  <History size={15} className="text-indigo-500" />
                  Alur Mutasi Terakhir
                </h3>

                {transactions.length === 0 ? (
                  <div className="py-8 text-center text-xs text-slate-400 font-medium">
                    Belum ada transaksi mutasi yang dicatat.
                  </div>
                ) : (
                  <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
                    {transactions.slice(0, 5).map((t) => {
                      const itemObj = items.find(b => b.id === t.barang_id);
                      return (
                        <div key={t.id} className="flex items-start justify-between gap-3 p-2.5 rounded-xl bg-slate-50/50 hover:bg-slate-50 transition">
                          <div className="space-y-1">
                            <span className={`inline-flex px-1.5 py-0.5 rounded text-[8px] font-extrabold ${
                              t.jenis === 'masuk' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                            }`}>
                              {t.jenis.toUpperCase()}
                            </span>
                            <div className="text-xs font-bold text-slate-800 line-clamp-1">
                              {itemObj ? itemObj.nama : 'Barang Terhapus'}
                            </div>
                            <div className="text-[10px] text-slate-400 font-medium flex items-center gap-1">
                              <span>{t.tanggal}</span>
                              <span>·</span>
                              <span>{t.penerima_penyerah || '-'}</span>
                            </div>
                          </div>
                          
                          <div className="text-right shrink-0">
                            <div className={`text-xs font-bold ${
                              t.jenis === 'masuk' ? 'text-emerald-600' : 'text-amber-600'
                            }`}>
                              {t.jenis === 'masuk' ? '+' : '-'}{t.jumlah}
                            </div>
                            <span className="text-[9px] text-slate-400 font-semibold">{itemObj?.satuan || ''}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                
                {transactions.length > 5 && (
                  <button
                    onClick={() => setActiveTab('transaksi')}
                    className="w-full text-center py-2 bg-slate-50 hover:bg-slate-100 text-slate-500 rounded-xl text-[10px] font-bold transition flex items-center justify-center gap-1"
                  >
                    Lihat Semua Transaksi ({transactions.length})
                    <ChevronRight size={12} />
                  </button>
                )}
              </div>

            </div>
          </div>
        )}

        {/* ========================================================
            TAB 2: ALUR MASUK/KELUAR (TRANSACTION MANAGER)
            ======================================================== */}
        {activeTab === 'transaksi' && (
          <div className="no-print bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
            <div className="p-5 border-b border-slate-50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-bold text-slate-800">Riwayat Transaksi Mutasi Barang</h3>
                <p className="text-xs text-slate-400 mt-0.5">Daftar lengkap alur barang masuk dan keluar habis pakai</p>
              </div>
              <button
                onClick={() => setShowTransactionForm(true)}
                className="w-full sm:w-auto px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-sm transition flex items-center justify-center gap-1.5"
              >
                <Plus size={14} />
                Catat Transaksi Baru
              </button>
            </div>

            {transactions.length === 0 ? (
              <div className="py-24 text-center space-y-2">
                <History className="text-slate-300 mx-auto animate-pulse" size={44} />
                <p className="text-xs text-slate-500 font-semibold">Belum ada mutasi barang tercatat</p>
                <p className="text-[11px] text-slate-400">Silakan catat mutasi barang masuk atau keluar menggunakan tombol di kanan atas.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/70 border-b border-slate-100 text-slate-400 text-[10px] font-bold uppercase tracking-wider">
                      <th className="py-3 px-5">Tanggal</th>
                      <th className="py-3 px-4">Nama Barang (Kode)</th>
                      <th className="py-3 px-4 text-center">Jenis Aktivitas</th>
                      <th className="py-3 px-4 text-right">Jumlah</th>
                      <th className="py-3 px-4">Keterangan / Tujuan</th>
                      <th className="py-3 px-5">Oleh / Partner</th>
                      <th className="py-3 px-5 text-center">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-600 text-xs">
                    {transactions.map((t) => {
                      const b = items.find(item => item.id === t.barang_id);
                      return (
                        <tr key={t.id} className="hover:bg-slate-50/40 transition">
                          <td className="py-3.5 px-5 font-semibold text-slate-500 whitespace-nowrap">
                            {t.tanggal}
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="font-bold text-slate-800">{b ? b.nama : 'Barang Terhapus'}</div>
                            <div className="text-[10px] text-slate-400 font-mono mt-0.5">{b ? b.kode : '-'}</div>
                          </td>
                          <td className="py-3.5 px-4 text-center whitespace-nowrap">
                            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-extrabold ${
                              t.jenis === 'masuk'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                                : 'bg-amber-50 text-amber-700 border border-amber-100'
                            }`}>
                              {t.jenis === 'masuk' ? <ArrowDownLeft size={11} /> : <ArrowUpRight size={11} />}
                              {t.jenis === 'masuk' ? 'MASUK' : 'KELUAR'}
                            </span>
                          </td>
                          <td className={`py-3.5 px-4 text-right font-extrabold text-sm ${
                            t.jenis === 'masuk' ? 'text-emerald-600' : 'text-amber-600'
                          }`}>
                            {t.jenis === 'masuk' ? '+' : '-'}{t.jumlah} {b?.satuan || ''}
                          </td>
                          <td className="py-3.5 px-4 max-w-xs truncate text-slate-500" title={t.keterangan}>
                            {t.keterangan || '-'}
                          </td>
                          <td className="py-3.5 px-5 text-slate-700 font-medium">
                            {t.penerima_penyerah || '-'}
                          </td>
                          <td className="py-3.5 px-5 text-center">
                            <button
                              onClick={() => handleDeleteTransaction(t.id)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                              title="Hapus Catatan Transaksi"
                            >
                              <Trash2 size={13} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ========================================================
            TAB 3: LAPORAN BULANAN (MONTH REPORT INJECTED)
            ======================================================== */}
        {activeTab === 'laporan' && (
          <MonthReport items={items} transactions={transactions} />
        )}

        {/* ========================================================
            TAB 4: SINKRONISASI & DIAGNOSIS KONEKSI
            ======================================================== */}
        {activeTab === 'sinkronisasi' && (
          <div className="no-print space-y-6">
            
            {/* Status Header Overview */}
            <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm">
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className={`p-3 rounded-2xl ${
                    isUsingSupabase 
                      ? 'bg-emerald-50 text-emerald-600' 
                      : 'bg-amber-50 text-amber-600'
                  }`}>
                    {isUsingSupabase ? <Wifi size={24} /> : <WifiOff size={24} />}
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-800">Status Sinkronisasi & Koneksi Cloud</h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {isUsingSupabase 
                        ? 'Aplikasi terhubung ke database cloud Supabase.' 
                        : 'Aplikasi berjalan dalam Mode Offline (Penyimpanan Lokal Browser).'}
                    </p>
                  </div>
                </div>
                
                {/* Visual Pill Indicator */}
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${
                    isUsingSupabase && !supabaseTableError
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                      : isUsingSupabase && supabaseTableError
                      ? 'bg-rose-100 text-rose-800 border border-rose-200'
                      : 'bg-amber-100 text-amber-800 border border-amber-200'
                  }`}>
                    <span className={`w-2 h-2 rounded-full ${
                      isUsingSupabase && !supabaseTableError
                        ? 'bg-emerald-500 animate-pulse'
                        : isUsingSupabase && supabaseTableError
                        ? 'bg-rose-500 animate-pulse'
                        : 'bg-amber-500 animate-pulse'
                    }`} />
                    {isUsingSupabase && !supabaseTableError && 'Koneksi Cloud Aktif'}
                    {isUsingSupabase && supabaseTableError && 'Kesalahan Tabel'}
                    {!isUsingSupabase && 'Penyimpanan Lokal'}
                  </span>
                </div>
              </div>
            </div>

            {/* Diagnostic Panel: INDIKATOR MASALAH TIDAK TERKONEKSI */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
              
              <div className="lg:col-span-2 space-y-6">
                
                {/* Indikator Masalah Box */}
                <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
                  <div className="p-5 border-b border-slate-50 bg-slate-50 flex items-center gap-2">
                    <AlertCircle className="text-indigo-600" size={18} />
                    <h3 className="text-sm font-bold text-slate-800">Indikator & Diagnosis Masalah Koneksi</h3>
                  </div>
                  
                  <div className="p-6 space-y-4 text-xs text-slate-600 leading-relaxed">
                    
                    {/* CASE 1: NOT CONNECTED (Using Local Storage) */}
                    {!isUsingSupabase && (
                      <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-5 space-y-3">
                        <div className="flex items-center gap-2 text-amber-800 font-bold">
                          <AlertTriangle size={18} />
                          <span>Peringatan: Database Cloud Supabase Belum Terkoneksi</span>
                        </div>
                        <p>
                          Aplikasi saat ini <strong>tidak terhubung ke database cloud Supabase</strong>. Data Anda disimpan sementara secara aman di dalam <code>localStorage</code> browser web Anda. Jika Anda membuka aplikasi dari perangkat atau browser lain, data ini tidak akan tersinkronisasi secara otomatis.
                        </p>
                        
                        <div className="bg-white border border-amber-100 rounded-lg p-4 space-y-2 text-[11px]">
                          <p className="font-bold text-amber-900">Langkah Penanganan agar Terkoneksi:</p>
                          <ol className="list-decimal pl-4 space-y-1.5 text-slate-700">
                            <li>
                              Buka akun Anda di <a href="https://supabase.com" target="_blank" rel="noopener noreferrer" className="underline text-indigo-600 font-semibold hover:text-indigo-800">Supabase.com</a> dan buat sebuah proyek baru.
                            </li>
                            <li>
                              Masuk ke menu <strong>Project Settings &gt; API</strong> di dashboard proyek Supabase Anda.
                            </li>
                            <li>
                              Konfigurasikan Environment Variables pada platform hosting Anda (seperti <strong>Vercel</strong>, Netlify, atau Cloud Run) dengan menambahkan kedua variabel berikut:
                              <div className="mt-2 bg-slate-900 text-slate-200 p-2.5 rounded font-mono text-[10px] space-y-1 select-all">
                                <div>VITE_SUPABASE_URL="https://[id-proyek-anda].supabase.co"</div>
                                <div>VITE_SUPABASE_ANON_KEY="[kunci-anon-anda]"</div>
                              </div>
                            </li>
                            <li>
                              Deploy ulang aplikasi Anda di Vercel/platform hosting agar konfigurasi baru diterapkan dengan sempurna.
                            </li>
                          </ol>
                        </div>
                      </div>
                    )}

                    {/* CASE 2: CONNECTED BUT TABLE IS MISSING */}
                    {isUsingSupabase && supabaseTableError && (
                      <div className="bg-rose-50 border border-rose-200 rounded-xl p-5 space-y-3">
                        <div className="flex items-center gap-2 text-rose-800 font-bold">
                          <AlertTriangle size={18} />
                          <span>Peringatan: Struktur Tabel di Supabase Belum Siap</span>
                        </div>
                        <p>
                          Kredensial Supabase terdeteksi dan terhubung, tetapi sistem <strong>gagal menemukan tabel 'barang' atau 'transaksi'</strong> di database Anda. Anda harus membuat tabel tersebut di database Supabase Anda agar penyimpanan cloud dapat dipergunakan dengan sempurna.
                        </p>
                        
                        <div className="bg-white border border-rose-100 rounded-lg p-4 space-y-2 text-[11px]">
                          <p className="font-bold text-rose-900">Langkah Penanganan agar Berfungsi Sempurna:</p>
                          <ol className="list-decimal pl-4 space-y-1.5 text-slate-700">
                            <li>
                              Buka proyek database Supabase Anda di web browser.
                            </li>
                            <li>
                              Pilih menu <strong>SQL Editor</strong> di panel sebelah kiri dashboard Supabase.
                            </li>
                            <li>
                              Klik tombol <strong>New Query</strong> untuk membuat query SQL baru.
                            </li>
                            <li>
                              Salin script SQL DDL yang disediakan pada bagian kanan halaman ini, lalu tempelkan (paste) ke SQL Editor Supabase.
                            </li>
                            <li>
                              Klik tombol <strong>Run</strong> di kanan bawah SQL Editor untuk membuat tabel dan kebijakan keamanannya. Setelah itu, muat ulang halaman aplikasi ini.
                            </li>
                          </ol>
                        </div>
                      </div>
                    )}

                    {/* CASE 3: FULLY CONNECTED & STABLE */}
                    {isUsingSupabase && !supabaseTableError && (
                      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5 space-y-3">
                        <div className="flex items-center gap-2 text-emerald-800 font-bold">
                          <Check size={18} className="text-emerald-600" />
                          <span>Koneksi Supabase Sangat Baik & Berfungsi Penuh</span>
                        </div>
                        <p>
                          Koneksi database aman! Semua data barang dan mutasi yang Anda catat akan tersimpan secara instan di cloud database Supabase. Anda dapat mengakses data inventaris Anda kapan saja, di mana saja, dari perangkat apa pun.
                        </p>
                        <div className="text-[11px] text-slate-500 bg-white border border-emerald-100 p-3 rounded-lg">
                          <p className="font-bold text-emerald-950">Detail Sambungan:</p>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-1.5 font-mono text-[10px]">
                            <div>Host: <span className="text-indigo-600">supabase.co</span></div>
                            <div>Keamanan: <span className="text-emerald-600">Row Level Security (RLS) Aktif</span></div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Comparison Stats Section */}
                    <div className="mt-4 pt-4 border-t border-slate-100">
                      <h4 className="font-bold text-slate-800 mb-3 text-xs">Perbandingan Sinkronisasi Data Saat Ini:</h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        
                        {/* Local Storage Stats */}
                        <div className="bg-slate-50 border border-slate-100 rounded-xl p-4">
                          <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400 mb-1">Penyimpanan Lokal (Browser)</div>
                          <div className="flex items-baseline gap-2">
                            <span className="text-2xl font-extrabold text-slate-700">{localBarangCount}</span>
                            <span className="text-[10px] text-slate-400 font-medium">Jenis Barang</span>
                          </div>
                          <div className="flex items-baseline gap-2 mt-1">
                            <span className="text-lg font-bold text-slate-500">{localTransaksiCount}</span>
                            <span className="text-[10px] text-slate-400 font-medium">Riwayat Transaksi</span>
                          </div>
                        </div>

                        {/* Cloud DB Stats */}
                        <div className="bg-indigo-50/40 border border-indigo-100 rounded-xl p-4">
                          <div className="text-[10px] uppercase font-bold tracking-wider text-indigo-400 mb-1">Cloud DB (Terbaca Saat Ini)</div>
                          <div className="flex items-baseline gap-2">
                            <span className="text-2xl font-extrabold text-indigo-700">
                              {isUsingSupabase && !supabaseTableError ? items.length : '0'}
                            </span>
                            <span className="text-[10px] text-indigo-400 font-medium">Jenis Barang</span>
                          </div>
                          <div className="flex items-baseline gap-2 mt-1">
                            <span className="text-lg font-bold text-indigo-500">
                              {isUsingSupabase && !supabaseTableError ? transactions.length : '0'}
                            </span>
                            <span className="text-[10px] text-indigo-400 font-medium">Riwayat Transaksi</span>
                          </div>
                        </div>

                      </div>
                    </div>

                    {/* Sync Action Block */}
                    {isUsingSupabase && (
                      <div className="mt-4 p-4 bg-slate-50 rounded-xl border border-slate-150 flex flex-col sm:flex-row items-center justify-between gap-4">
                        <div>
                          <h4 className="font-bold text-slate-800 text-xs">Ingin mengunggah data lokal Anda ke Supabase?</h4>
                          <p className="text-[10px] text-slate-400 mt-0.5">Seluruh data yang tercatat lokal akan disalin dan digabung ke cloud database Anda.</p>
                        </div>
                        <div className="shrink-0 w-full sm:w-auto">
                          <button
                            onClick={handleSyncToSupabase}
                            disabled={isSyncing}
                            className="w-full sm:w-auto px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-sm transition flex items-center justify-center gap-2 disabled:bg-slate-300 disabled:cursor-not-allowed"
                          >
                            {isSyncing ? (
                              <>
                                <RefreshCw size={14} className="animate-spin" />
                                <span>Menyinkronkan...</span>
                              </>
                            ) : (
                              <>
                                <RefreshCw size={14} />
                                <span>Sinkronkan Sekarang</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    )}

                    {syncResult && (
                      <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 text-[11px] text-emerald-800 font-medium flex items-center gap-2">
                        <Check size={16} className="text-emerald-600 shrink-0" />
                        <span>
                          <strong>Berhasil menyinkronkan data!</strong> {syncResult.b} barang baru dan {syncResult.t} riwayat transaksi baru telah disalin ke Cloud Database Supabase.
                        </span>
                      </div>
                    )}

                  </div>
                </div>

              </div>

              {/* Right Column: SQL Script DDL */}
              <div className="space-y-6">
                
                <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
                  <div className="p-4 border-b border-slate-50 flex items-center justify-between bg-slate-50">
                    <span className="text-xs font-bold text-slate-800">Skema SQL Database</span>
                    <button
                      onClick={copySqlToClipboard}
                      className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1 font-bold bg-white px-2 py-1 rounded border border-slate-200 shadow-xs transition"
                    >
                      {copiedSql ? (
                        <>
                          <Check size={12} className="text-emerald-500" />
                          <span>Tersalin</span>
                        </>
                      ) : (
                        <>
                          <Copy size={12} />
                          <span>Salin Script</span>
                        </>
                      )}
                    </button>
                  </div>
                  
                  <div className="p-4 bg-slate-900 text-slate-300 font-mono text-[9px] overflow-x-auto max-h-[350px] leading-relaxed">
                    <pre className="whitespace-pre-wrap">{SUPABASE_SQL_SCRIPT}</pre>
                  </div>
                  
                  <div className="p-4 border-t border-slate-100 text-[10px] text-slate-400 bg-slate-50">
                    *Gunakan script di atas di panel <strong>SQL Editor</strong> proyek Supabase Anda untuk mempersiapkan tabel-tabel secara otomatis.
                  </div>
                </div>

                {/* Connection Quick Guide */}
                <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm space-y-3">
                  <h4 className="text-xs font-bold text-slate-800">Panduan Sinkronisasi Hibrida</h4>
                  <ul className="text-[10px] text-slate-500 space-y-2 list-disc pl-4 leading-relaxed">
                    <li>Aplikasi secara cerdas mendeteksi jika koneksi Supabase terputus dan beralih ke local storage agar proses pencatatan Anda tidak terganggu.</li>
                    <li>Status konektivitas diperiksa secara berkala setiap kali aplikasi memuat data inventaris.</li>
                    <li>Sistem pelaporan PDF akhir bulan tetap berfungsi normal baik saat menggunakan Supabase cloud maupun penyimpanan lokal.</li>
                  </ul>
                </div>

              </div>

            </div>

          </div>
        )}

      </main>

      {/* Modern minimal footer */}
      <footer className="no-print border-t border-slate-100 mt-16 py-6 text-center text-slate-400 text-[10px] font-medium max-w-7xl mx-auto px-4">
        <p>Aplikasi Inventaris Barang Habis Pakai (BHP) © 2026 · Menggunakan Supabase Cloud & Local Storage</p>
        <p className="mt-1">Pencatatan barang masuk/keluar, pelaporan, dan pencetakan PDF instan tanpa login.</p>
      </footer>
    </div>
  );
}
