export interface Barang {
  id: string;
  nama: string;
  kode: string;
  kategori: string;
  satuan: string;
  stok_awal: number;
  stok_minimal: number;
  created_at: string;
}

export interface Transaksi {
  id: string;
  barang_id: string;
  jenis: 'masuk' | 'keluar';
  jumlah: number;
  tanggal: string; // YYYY-MM-DD
  keterangan: string;
  penerima_penyerah: string; // Nama yang menerima (jika keluar) atau penyerah/toko (jika masuk)
  created_at: string;
}

export interface RingkasanStok extends Barang {
  stok_masuk: number;
  stok_keluar: number;
  stok_akhir: number;
  status_stok: 'Aman' | 'Menipis' | 'Habis';
}

export interface LaporanBulanan {
  bulan: string; // YYYY-MM
  total_barang: number;
  total_masuk: number;
  total_keluar: number;
  stok_habis: number;
  stok_menipis: number;
}
