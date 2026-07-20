import React, { useState, useEffect } from 'react';
import { Barang } from '../types';
import { Plus, Check, RefreshCw } from 'lucide-react';

interface ItemFormProps {
  onSave: (barang: Omit<Barang, 'id' | 'created_at'>) => Promise<any>;
  onUpdate?: (id: string, barang: Partial<Barang>) => Promise<any>;
  editingItem: Barang | null;
  onCancel: () => void;
  existingItems: Barang[];
}

const KATEGORI_OPTIONS = [
  'Alat Tulis Kantor',
  'Kertas & Percetakan',
  'Peralatan Kebersihan',
  'Medis & P3K',
  'Elektronik & Gadget',
  'Konsumsi (Kopi, Teh, Gula)',
  'Lain-lain',
];

const SATUAN_OPTIONS = [
  'Pcs',
  'Rim',
  'Box',
  'Pack',
  'Botol',
  'Rol',
  'Lusin',
  'Unit',
  'Sachet',
];

export default function ItemForm({ onSave, onUpdate, editingItem, onCancel, existingItems }: ItemFormProps) {
  const [nama, setNama] = useState('');
  const [kode, setKode] = useState('');
  const [kategori, setKategori] = useState(KATEGORI_OPTIONS[0]);
  const [satuan, setSatuan] = useState(SATUAN_OPTIONS[0]);
  const [stokAwal, setStokAwal] = useState<number>(0);
  const [stokMinimal, setStokMinimal] = useState<number>(5);
  const [tahunPengadaan, setTahunPengadaan] = useState<number>(new Date().getFullYear());
  const [kondisi, setKondisi] = useState('Baik');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Auto-generate code helper
  const generateCode = () => {
    const prefix = 'BHP';
    const randomNum = Math.floor(100 + Math.random() * 900); // 100-999
    const generated = `${prefix}-${randomNum}`;
    
    // Check uniqueness
    const isTaken = existingItems.some(item => item.kode === generated);
    if (isTaken) {
      generateCode();
    } else {
      setKode(generated);
    }
  };

  useEffect(() => {
    if (editingItem) {
      setNama(editingItem.nama);
      setKode(editingItem.kode);
      setKategori(editingItem.kategori);
      setSatuan(editingItem.satuan);
      setStokAwal(editingItem.stok_awal);
      setStokMinimal(editingItem.stok_minimal);
      setTahunPengadaan(editingItem.tahun_pengadaan || new Date().getFullYear());
      setKondisi(editingItem.kondisi || 'Baik');
    } else {
      setNama('');
      setKategori(KATEGORI_OPTIONS[0]);
      setSatuan(SATUAN_OPTIONS[0]);
      setStokAwal(0);
      setStokMinimal(5);
      setTahunPengadaan(new Date().getFullYear());
      setKondisi('Baik');
      // Auto-generate a code for new item
      const nextNum = existingItems.length + 1;
      setKode(`BHP-${String(nextNum).padStart(3, '0')}`);
    }
    setErrorMessage('');
  }, [editingItem, existingItems.length]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!nama.trim()) {
      setErrorMessage('Nama barang wajib diisi');
      return;
    }
    if (!kode.trim()) {
      setErrorMessage('Kode barang wajib diisi');
      return;
    }

    // Validation for unique code (only when creating or when editing code is changed)
    if (!editingItem || editingItem.kode !== kode) {
      const isCodeExists = existingItems.some(item => item.kode.toLowerCase() === kode.toLowerCase());
      if (isCodeExists) {
        setErrorMessage('Kode barang sudah terdaftar');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      if (editingItem && onUpdate) {
        await onUpdate(editingItem.id, {
          nama: nama.trim(),
          kode: kode.trim().toUpperCase(),
          kategori,
          satuan,
          stok_awal: stokAwal,
          stok_minimal: stokMinimal,
          tahun_pengadaan: tahunPengadaan,
          kondisi,
        });
      } else {
        await onSave({
          nama: nama.trim(),
          kode: kode.trim().toUpperCase(),
          kategori,
          satuan,
          stok_awal: stokAwal,
          stok_minimal: stokMinimal,
          tahun_pengadaan: tahunPengadaan,
          kondisi,
        });
      }
      onCancel();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Gagal menyimpan barang. Periksa koneksi Anda.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div id="item-form-container" className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm">
      <h3 className="text-lg font-semibold text-slate-800 mb-5">
        {editingItem ? 'Edit Barang Habis Pakai' : 'Tambah Barang Baru'}
      </h3>

      <form onSubmit={handleSubmit} className="space-y-4">
        {errorMessage && (
          <div className="p-3 bg-rose-50 text-rose-600 rounded-xl text-xs font-medium">
            {errorMessage}
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
            Nama Barang
          </label>
          <input
            type="text"
            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 placeholder-slate-400 focus:outline-none focus:border-indigo-500 text-sm"
            placeholder="Contoh: Kertas HVS A4 80gr"
            value={nama}
            onChange={(e) => setNama(e.target.value)}
            disabled={isSubmitting}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
              Kode Barang
            </label>
            <div className="relative">
              <input
                type="text"
                className="w-full pl-4 pr-10 py-2.5 rounded-xl border border-slate-200 text-slate-700 uppercase focus:outline-none focus:border-indigo-500 text-sm font-mono"
                placeholder="Contoh: BHP-001"
                value={kode}
                onChange={(e) => setKode(e.target.value)}
                disabled={isSubmitting}
              />
              <button
                type="button"
                onClick={generateCode}
                className="absolute right-2 top-2 p-1 text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 rounded-lg transition"
                title="Acak Kode Baru"
                disabled={isSubmitting}
              >
                <RefreshCw size={16} />
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
              Kategori
            </label>
            <select
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 bg-white focus:outline-none focus:border-indigo-500 text-sm"
              value={kategori}
              onChange={(e) => setKategori(e.target.value)}
              disabled={isSubmitting}
            >
              {KATEGORI_OPTIONS.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
              Satuan
            </label>
            <select
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 bg-white focus:outline-none focus:border-indigo-500 text-sm"
              value={satuan}
              onChange={(e) => setSatuan(e.target.value)}
              disabled={isSubmitting}
            >
              {SATUAN_OPTIONS.map((sat) => (
                <option key={sat} value={sat}>
                  {sat}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
              Jumlah / Stok Awal
            </label>
            <input
              type="number"
              min="0"
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 focus:outline-none focus:border-indigo-500 text-sm"
              value={stokAwal}
              onChange={(e) => setStokAwal(Math.max(0, parseInt(e.target.value) || 0))}
              disabled={isSubmitting || !!editingItem} // Stok awal tidak boleh diedit setelah dibuat (harus lewat transaksi masuk/keluar)
              title={editingItem ? 'Stok awal tidak bisa diubah. Gunakan transaksi Masuk/Keluar untuk memperbarui stok.' : ''}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
              Stok Minimal
            </label>
            <input
              type="number"
              min="0"
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 focus:outline-none focus:border-indigo-500 text-sm"
              value={stokMinimal}
              onChange={(e) => setStokMinimal(Math.max(0, parseInt(e.target.value) || 0))}
              disabled={isSubmitting}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
              Tahun Pengadaan
            </label>
            <input
              type="number"
              min="1900"
              max={new Date().getFullYear() + 10}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 focus:outline-none focus:border-indigo-500 text-sm"
              value={tahunPengadaan}
              onChange={(e) => setTahunPengadaan(parseInt(e.target.value) || new Date().getFullYear())}
              disabled={isSubmitting}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
              Kondisi Barang
            </label>
            <select
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 bg-white focus:outline-none focus:border-indigo-500 text-sm cursor-pointer"
              value={kondisi}
              onChange={(e) => setKondisi(e.target.value)}
              disabled={isSubmitting}
            >
              <option value="Baik">Baik (Berfungsi Normal)</option>
              <option value="Rusak Ringan">Rusak Ringan</option>
              <option value="Rusak Berat">Rusak Berat</option>
            </select>
          </div>
        </div>

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
            className="flex items-center gap-1.5 px-5 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-sm hover:shadow transition disabled:opacity-50"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <RefreshCw size={16} className="animate-spin" />
            ) : editingItem ? (
              <Check size={16} />
            ) : (
              <Plus size={16} />
            )}
            {editingItem ? 'Perbarui' : 'Simpan'}
          </button>
        </div>
      </form>
    </div>
  );
}
