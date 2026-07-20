import React, { useState, useEffect } from 'react';
import { Barang, Transaksi } from '../types';
import { ArrowDownLeft, ArrowUpRight, Check, RefreshCw } from 'lucide-react';

interface TransactionFormProps {
  onSave: (transaksi: Omit<Transaksi, 'id' | 'created_at'>) => Promise<any>;
  items: Barang[];
  currentStocks: Record<string, number>; // itemId -> stock
  onCancel: () => void;
}

export default function TransactionForm({ onSave, items, currentStocks, onCancel }: TransactionFormProps) {
  const [selectedItemId, setSelectedItemId] = useState('');
  const [jenis, setJenis] = useState<'masuk' | 'keluar'>('masuk');
  const [jumlah, setJumlah] = useState<number>(1);
  const [tanggal, setTanggal] = useState('');
  const [keterangan, setKeterangan] = useState('');
  const [penerimaPenyerah, setPenerimaPenyerah] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (items.length > 0 && !selectedItemId) {
      setSelectedItemId(items[0].id);
    }
    
    // Set today's date in local format YYYY-MM-DD
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    setTanggal(`${yyyy}-${mm}-${dd}`);
  }, [items, selectedItemId]);

  const selectedItem = items.find(item => item.id === selectedItemId);
  const availableStock = selectedItem ? (currentStocks[selectedItem.id] ?? 0) : 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!selectedItemId) {
      setErrorMessage('Pilih barang terlebih dahulu');
      return;
    }

    if (jumlah <= 0) {
      setErrorMessage('Jumlah transaksi harus lebih besar dari 0');
      return;
    }

    if (!tanggal) {
      setErrorMessage('Pilih tanggal transaksi');
      return;
    }

    // Safety check for outgoing stock
    if (jenis === 'keluar' && jumlah > availableStock) {
      setErrorMessage(`Stok tidak mencukupi. Stok yang tersedia saat ini: ${availableStock} ${selectedItem?.satuan || ''}`);
      return;
    }

    setIsSubmitting(true);
    try {
      await onSave({
        barang_id: selectedItemId,
        jenis,
        jumlah,
        tanggal,
        keterangan: keterangan.trim(),
        penerima_penyerah: penerimaPenyerah.trim(),
      });
      onCancel();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Gagal menyimpan transaksi. Periksa koneksi Anda.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div id="transaction-form-container" className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm">
      <h3 className="text-lg font-semibold text-slate-800 mb-5">
        Catat Transaksi Barang
      </h3>

      <form onSubmit={handleSubmit} className="space-y-4">
        {errorMessage && (
          <div className="p-3 bg-rose-50 text-rose-600 rounded-xl text-xs font-medium">
            {errorMessage}
          </div>
        )}

        {/* Jenis Transaksi (Masuk/Keluar Selector tabs) */}
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wider">
            Jenis Transaksi
          </label>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => {
                setJenis('masuk');
                setErrorMessage('');
              }}
              className={`flex items-center justify-center gap-2 py-3 rounded-xl border text-sm font-semibold transition ${
                jenis === 'masuk'
                  ? 'bg-emerald-50 border-emerald-500 text-emerald-700'
                  : 'border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
              disabled={isSubmitting}
            >
              <ArrowDownLeft size={18} className="text-emerald-500" />
              Barang Masuk
            </button>
            <button
              type="button"
              onClick={() => {
                setJenis('keluar');
                setErrorMessage('');
              }}
              className={`flex items-center justify-center gap-2 py-3 rounded-xl border text-sm font-semibold transition ${
                jenis === 'keluar'
                  ? 'bg-amber-50 border-amber-500 text-amber-700'
                  : 'border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
              disabled={isSubmitting}
            >
              <ArrowUpRight size={18} className="text-amber-500" />
              Barang Keluar
            </button>
          </div>
        </div>

        {/* Barang Dropdown */}
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
            Pilih Barang
          </label>
          <select
            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 bg-white focus:outline-none focus:border-indigo-500 text-sm"
            value={selectedItemId}
            onChange={(e) => {
              setSelectedItemId(e.target.value);
              setErrorMessage('');
            }}
            disabled={isSubmitting || items.length === 0}
          >
            {items.length === 0 ? (
              <option value="">Belum ada data barang (tambahkan terlebih dahulu)</option>
            ) : (
              items.map((item) => (
                <option key={item.id} value={item.id}>
                  [{item.kode}] {item.nama} — (Stok: {currentStocks[item.id] ?? 0} {item.satuan})
                </option>
              ))
            )}
          </select>
        </div>

        {/* Jumlah & Tanggal */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <div className="flex justify-between items-center mb-1.5">
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Jumlah ({selectedItem?.satuan || 'Satuan'})
              </label>
              {jenis === 'keluar' && selectedItem && (
                <span className="text-[11px] font-medium text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                  Maksimal: {availableStock} {selectedItem.satuan}
                </span>
              )}
            </div>
            <input
              type="number"
              min="1"
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-slate-7700 focus:outline-none focus:border-indigo-500 text-sm font-semibold"
              value={jumlah}
              onChange={(e) => setJumlah(Math.max(1, parseInt(e.target.value) || 0))}
              disabled={isSubmitting}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
              Tanggal Transaksi
            </label>
            <input
              type="date"
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 focus:outline-none focus:border-indigo-500 text-sm"
              value={tanggal}
              onChange={(e) => setTanggal(e.target.value)}
              disabled={isSubmitting}
            />
          </div>
        </div>

        {/* Keterangan */}
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
            Keterangan / Tujuan
          </label>
          <input
            type="text"
            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 focus:outline-none focus:border-indigo-500 text-sm"
            placeholder={jenis === 'masuk' ? 'Contoh: Restock bulanan, Hibah dinas' : 'Contoh: Dipakai divisi administrasi'}
            value={keterangan}
            onChange={(e) => setKeterangan(e.target.value)}
            disabled={isSubmitting}
          />
        </div>

        {/* Penerima / Penyerah */}
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
            {jenis === 'masuk' ? 'Diterima Dari / Toko' : 'Diserahkan Kepada / Penerima'}
          </label>
          <input
            type="text"
            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 focus:outline-none focus:border-indigo-500 text-sm"
            placeholder={jenis === 'masuk' ? 'Contoh: Toko Sinar Jaya, Ibu Retno' : 'Contoh: Pak Budi (Bagian Umum)'}
            value={penerimaPenyerah}
            onChange={(e) => setPenerimaPenyerah(e.target.value)}
            disabled={isSubmitting}
          />
        </div>

        {/* Buttons */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-50">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-50 rounded-xl transition"
            disabled={isSubmitting}
          >
            Batal
          </button>
          <button
            type="submit"
            className={`flex items-center gap-1.5 px-5 py-2 text-sm font-semibold text-white rounded-xl shadow-sm hover:shadow transition disabled:opacity-50 ${
              jenis === 'masuk' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-indigo-600 hover:bg-indigo-700'
            }`}
            disabled={isSubmitting || items.length === 0}
          >
            {isSubmitting ? (
              <RefreshCw size={16} className="animate-spin" />
            ) : (
              <Check size={16} />
            )}
            Simpan Transaksi
          </button>
        </div>
      </form>
    </div>
  );
}
