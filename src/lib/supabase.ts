import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Barang, Transaksi } from '../types';

// Load credentials, preferring localStorage overrides for deployment flexibilty (e.g. Vercel)
let supabaseUrl = localStorage.getItem('CUSTOM_SUPABASE_URL') || (import.meta as any).env.VITE_SUPABASE_URL || '';
if (supabaseUrl.endsWith('/rest/v1/')) {
  supabaseUrl = supabaseUrl.replace('/rest/v1/', '');
} else if (supabaseUrl.endsWith('/rest/v1')) {
  supabaseUrl = supabaseUrl.replace('/rest/v1', '');
}
const supabaseAnonKey = localStorage.getItem('CUSTOM_SUPABASE_ANON_KEY') || (import.meta as any).env.VITE_SUPABASE_ANON_KEY || '';

export let supabase: SupabaseClient | null = null;
export let isUsingSupabase = false;
export let hasSupabaseTableError = false;
export let lastSupabaseError: any = null;

export function getSupabaseErrorState() {
  return { hasError: hasSupabaseTableError, error: lastSupabaseError };
}

// Initialize Supabase if credentials are provided
if (supabaseUrl && supabaseAnonKey && supabaseUrl !== 'MY_SUPABASE_URL' && supabaseAnonKey !== 'MY_SUPABASE_ANON_KEY') {
  try {
    supabase = createClient(supabaseUrl, supabaseAnonKey);
    isUsingSupabase = true;
    console.log('Successfully connected to Supabase Database!');
  } catch (error) {
    console.warn('Failed to initialize Supabase client:', error);
  }
} else {
  console.log('Running in Local Storage Mode. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to connect to Supabase.');
}

export async function saveSupabaseConfig(url: string, key: string) {
  let cleanUrl = url.trim();
  if (cleanUrl.endsWith('/rest/v1/')) {
    cleanUrl = cleanUrl.replace('/rest/v1/', '');
  } else if (cleanUrl.endsWith('/rest/v1')) {
    cleanUrl = cleanUrl.replace('/rest/v1', '');
  }

  localStorage.setItem('CUSTOM_SUPABASE_URL', cleanUrl);
  localStorage.setItem('CUSTOM_SUPABASE_ANON_KEY', key.trim());

  try {
    await fetch('/api/supabase-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: cleanUrl, key: key.trim() }),
    });
  } catch (error) {
    console.error('Failed to save config to server:', error);
  }
}

export async function clearSupabaseConfig() {
  localStorage.removeItem('CUSTOM_SUPABASE_URL');
  localStorage.removeItem('CUSTOM_SUPABASE_ANON_KEY');

  try {
    await fetch('/api/supabase-config', {
      method: 'DELETE',
    });
  } catch (error) {
    console.error('Failed to clear config on server:', error);
  }
}

export function getSupabaseConfig() {
  const url = localStorage.getItem('CUSTOM_SUPABASE_URL') || (import.meta as any).env.VITE_SUPABASE_URL || '';
  const key = localStorage.getItem('CUSTOM_SUPABASE_ANON_KEY') || (import.meta as any).env.VITE_SUPABASE_ANON_KEY || '';
  const isCustom = !!localStorage.getItem('CUSTOM_SUPABASE_URL') || !!localStorage.getItem('CUSTOM_SUPABASE_ANON_KEY');
  return { url, key, isCustom };
}

// Local storage keys
const LOCAL_BARANG_KEY = 'bhp_inventory_barang';
const LOCAL_TRANSAKSI_KEY = 'bhp_inventory_transaksi';

// SQL Script helper for user to run in Supabase SQL Editor
export const SUPABASE_SQL_SCRIPT = `-- SQL Script untuk membuat tabel di Supabase SQL Editor:

-- 1. Tabel Barang Habis Pakai
CREATE TABLE IF NOT EXISTS barang (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nama TEXT NOT NULL,
  kode TEXT NOT NULL UNIQUE,
  kategori TEXT NOT NULL,
  satuan TEXT NOT NULL,
  stok_awal INTEGER DEFAULT 0,
  stok_minimal INTEGER DEFAULT 0,
  tahun_pengadaan INTEGER,
  kondisi TEXT,
  jenis_barang TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Tabel Transaksi Barang Masuk & Keluar
CREATE TABLE IF NOT EXISTS transaksi (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  barang_id UUID REFERENCES barang(id) ON DELETE CASCADE,
  jenis TEXT CHECK (jenis IN ('masuk', 'keluar')) NOT NULL,
  jumlah INTEGER NOT NULL CHECK (jumlah > 0),
  tanggal DATE NOT NULL,
  keterangan TEXT,
  penerima_penyerah TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS (Row Level Security) and allow public anonymous access for this simplified app:
ALTER TABLE barang ENABLE ROW LEVEL SECURITY;
ALTER TABLE transaksi ENABLE ROW LEVEL SECURITY;

-- Buat policy agar siapapun dapat melakukan read, insert, update, dan delete (tanpa login)
CREATE POLICY "Allow public select" ON barang FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON barang FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update" ON barang FOR UPDATE USING (true);
CREATE POLICY "Allow public delete" ON barang FOR DELETE USING (true);

CREATE POLICY "Allow public select trans" ON transaksi FOR SELECT USING (true);
CREATE POLICY "Allow public insert trans" ON transaksi FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update trans" ON transaksi FOR UPDATE USING (true);
CREATE POLICY "Allow public delete trans" ON transaksi FOR DELETE USING (true);
`;

// ==========================================
// DATA ACCESS LAYER: BARANG
// ==========================================

export async function fetchBarang(): Promise<Barang[]> {
  if (isUsingSupabase && supabase) {
    try {
      const { data, error } = await supabase
        .from('barang')
        .select('*')
        .order('nama', { ascending: true });

      if (error) throw error;
      hasSupabaseTableError = false; // Reset error on successful query
      return (data || []) as Barang[];
    } catch (err) {
      console.info('Supabase fetchBarang error handled, falling back to localStorage:', err);
      hasSupabaseTableError = true;
      lastSupabaseError = err;
      return getLocalBarang();
    }
  } else {
    return getLocalBarang();
  }
}

export async function insertBarang(barang: Omit<Barang, 'id' | 'created_at'>): Promise<Barang> {
  const newId = isUsingSupabase ? undefined : `local-b-${Date.now()}`;
  const createdAt = new Date().toISOString();

  if (isUsingSupabase && supabase) {
    try {
      const { data, error } = await supabase
        .from('barang')
        .insert([{ ...barang, created_at: createdAt }])
        .select()
        .single();

      if (error) throw error;
      return data as Barang;
    } catch (err) {
      console.warn('Supabase insertBarang error, writing to localStorage fallback:', err);
      return saveLocalBarang({
        id: newId || `fallback-${Date.now()}`,
        created_at: createdAt,
        ...barang,
      });
    }
  } else {
    return saveLocalBarang({
      id: newId!,
      created_at: createdAt,
      ...barang,
    });
  }
}

export async function updateBarang(id: string, barang: Partial<Barang>): Promise<Barang> {
  if (isUsingSupabase && supabase && !id.startsWith('local-')) {
    try {
      const { data, error } = await supabase
        .from('barang')
        .update(barang)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as Barang;
    } catch (err) {
      console.warn('Supabase updateBarang error, writing to localStorage:', err);
      return updateLocalBarang(id, barang);
    }
  } else {
    return updateLocalBarang(id, barang);
  }
}

export async function deleteBarang(id: string): Promise<boolean> {
  if (isUsingSupabase && supabase && !id.startsWith('local-')) {
    try {
      const { error } = await supabase
        .from('barang')
        .delete()
        .eq('id', id);

      if (error) throw error;
      return true;
    } catch (err) {
      console.warn('Supabase deleteBarang error, removing from localStorage:', err);
      return deleteLocalBarang(id);
    }
  } else {
    return deleteLocalBarang(id);
  }
}

// ==========================================
// DATA ACCESS LAYER: TRANSAKSI
// ==========================================

export async function fetchTransaksi(): Promise<Transaksi[]> {
  if (isUsingSupabase && supabase) {
    try {
      const { data, error } = await supabase
        .from('transaksi')
        .select('*')
        .order('tanggal', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) throw error;
      hasSupabaseTableError = false; // Reset error on successful query
      return (data || []) as Transaksi[];
    } catch (err) {
      console.info('Supabase fetchTransaksi error handled, falling back to localStorage:', err);
      hasSupabaseTableError = true;
      lastSupabaseError = err;
      return getLocalTransaksi();
    }
  } else {
    return getLocalTransaksi();
  }
}

export async function insertTransaksi(transaksi: Omit<Transaksi, 'id' | 'created_at'>): Promise<Transaksi> {
  const newId = isUsingSupabase ? undefined : `local-t-${Date.now()}`;
  const createdAt = new Date().toISOString();

  if (isUsingSupabase && supabase) {
    try {
      // Ensure barang_id isn't a local prefix, if we migrated it
      const { data, error } = await supabase
        .from('transaksi')
        .insert([{ ...transaksi, created_at: createdAt }])
        .select()
        .single();

      if (error) throw error;
      return data as Transaksi;
    } catch (err) {
      console.warn('Supabase insertTransaksi error, writing to localStorage fallback:', err);
      return saveLocalTransaksi({
        id: newId || `fallback-t-${Date.now()}`,
        created_at: createdAt,
        ...transaksi,
      });
    }
  } else {
    return saveLocalTransaksi({
      id: newId!,
      created_at: createdAt,
      ...transaksi,
    });
  }
}

export async function deleteTransaksi(id: string): Promise<boolean> {
  if (isUsingSupabase && supabase && !id.startsWith('local-')) {
    try {
      const { error } = await supabase
        .from('transaksi')
        .delete()
        .eq('id', id);

      if (error) throw error;
      return true;
    } catch (err) {
      console.warn('Supabase deleteTransaksi error, removing from localStorage:', err);
      return deleteLocalTransaksi(id);
    }
  } else {
    return deleteLocalTransaksi(id);
  }
}

// ==========================================
// LOCAL STORAGE BACKEND UTILS
// ==========================================

export function getLocalBarang(): Barang[] {
  const raw = localStorage.getItem(LOCAL_BARANG_KEY);
  if (!raw) {
    // Initial sample data so the user gets an immediately satisfying experience
    const initial: Barang[] = [
      {
        id: 'local-b-1',
        nama: 'Kertas HVS A4 80gr',
        kode: 'BHP-001',
        kategori: 'Alat Tulis Kantor',
        satuan: 'Rim',
        stok_awal: 20,
        stok_minimal: 5,
        created_at: new Date(2026, 6, 1).toISOString(),
      },
      {
        id: 'local-b-2',
        nama: 'Pulpen Gel Hitam 0.5',
        kode: 'BHP-002',
        kategori: 'Alat Tulis Kantor',
        satuan: 'Pcs',
        stok_awal: 50,
        stok_minimal: 10,
        created_at: new Date(2026, 6, 1).toISOString(),
      },
      {
        id: 'local-b-3',
        nama: 'Cairan Pembersih Lantai 1L',
        kode: 'BHP-003',
        kategori: 'Peralatan Kebersihan',
        satuan: 'Botol',
        stok_awal: 10,
        stok_minimal: 3,
        created_at: new Date(2026, 6, 1).toISOString(),
      },
      {
        id: 'local-b-4',
        nama: 'Spidol Whiteboard Hitam',
        kode: 'BHP-004',
        kategori: 'Alat Tulis Kantor',
        satuan: 'Pcs',
        stok_awal: 15,
        stok_minimal: 5,
        created_at: new Date(2026, 6, 2).toISOString(),
      },
    ];
    localStorage.setItem(LOCAL_BARANG_KEY, JSON.stringify(initial));
    return initial;
  }
  return JSON.parse(raw);
}

function saveLocalBarang(barang: Barang): Barang {
  const current = getLocalBarang();
  current.push(barang);
  localStorage.setItem(LOCAL_BARANG_KEY, JSON.stringify(current));
  return barang;
}

function updateLocalBarang(id: string, updatedFields: Partial<Barang>): Barang {
  const current = getLocalBarang();
  const idx = current.findIndex(b => b.id === id);
  if (idx !== -1) {
    current[idx] = { ...current[idx], ...updatedFields };
    localStorage.setItem(LOCAL_BARANG_KEY, JSON.stringify(current));
    return current[idx];
  }
  throw new Error(`Barang dengan ID ${id} tidak ditemukan di localStorage`);
}

function deleteLocalBarang(id: string): boolean {
  const current = getLocalBarang();
  const filtered = current.filter(b => b.id !== id);
  localStorage.setItem(LOCAL_BARANG_KEY, JSON.stringify(filtered));

  // Also cascade delete transactions for this barang
  const trans = getLocalTransaksi();
  const filteredTrans = trans.filter(t => t.barang_id !== id);
  localStorage.setItem(LOCAL_TRANSAKSI_KEY, JSON.stringify(filteredTrans));

  return true;
}

export function getLocalTransaksi(): Transaksi[] {
  const raw = localStorage.getItem(LOCAL_TRANSAKSI_KEY);
  if (!raw) {
    // Initial sample transactions that match the sample stock
    const initial: Transaksi[] = [
      {
        id: 'local-t-1',
        barang_id: 'local-b-1',
        jenis: 'masuk',
        jumlah: 10,
        tanggal: '2026-07-05',
        keterangan: 'Pengadaan Triwulan III',
        penerima_penyerah: 'Toko Buku ATK Abadi',
        created_at: new Date(2026, 6, 5).toISOString(),
      },
      {
        id: 'local-t-2',
        barang_id: 'local-b-1',
        jenis: 'keluar',
        jumlah: 6,
        tanggal: '2026-07-10',
        keterangan: 'Cetak Laporan Rapor Sekolah',
        penerima_penyerah: 'Tata Usaha',
        created_at: new Date(2026, 6, 10).toISOString(),
      },
      {
        id: 'local-t-3',
        barang_id: 'local-b-2',
        jenis: 'keluar',
        jumlah: 15,
        tanggal: '2026-07-11',
        keterangan: 'Pembagian guru kelas baru',
        penerima_penyerah: 'Kepala Sekolah',
        created_at: new Date(2026, 6, 11).toISOString(),
      },
      {
        id: 'local-t-4',
        barang_id: 'local-b-3',
        jenis: 'masuk',
        jumlah: 5,
        tanggal: '2026-07-12',
        keterangan: 'Belanja bulanan operasional',
        penerima_penyerah: 'Supermarket Sejahtera',
        created_at: new Date(2026, 6, 12).toISOString(),
      },
      {
        id: 'local-t-5',
        barang_id: 'local-b-3',
        jenis: 'keluar',
        jumlah: 2,
        tanggal: '2026-07-15',
        keterangan: 'Kebutuhan bersih-bersih kelas',
        penerima_penyerah: 'Petugas Kebersihan',
        created_at: new Date(2026, 6, 15).toISOString(),
      },
    ];
    localStorage.setItem(LOCAL_TRANSAKSI_KEY, JSON.stringify(initial));
    return initial;
  }
  return JSON.parse(raw);
}

function saveLocalTransaksi(transaksi: Transaksi): Transaksi {
  const current = getLocalTransaksi();
  current.unshift(transaksi); // latest first
  localStorage.setItem(LOCAL_TRANSAKSI_KEY, JSON.stringify(current));
  return transaksi;
}

function deleteLocalTransaksi(id: string): boolean {
  const current = getLocalTransaksi();
  const filtered = current.filter(t => t.id !== id);
  localStorage.setItem(LOCAL_TRANSAKSI_KEY, JSON.stringify(filtered));
  return true;
}

// Helper to manually upload all local storage items to Supabase (Database Initializer)
export async function syncLocalToSupabase(): Promise<{ barangSynced: number; transaksiSynced: number }> {
  if (!isUsingSupabase || !supabase) {
    throw new Error('Supabase belum terkonfigurasi untuk sinkronisasi.');
  }

  const localBarang = getLocalBarang();
  const localTransaksi = getLocalTransaksi();

  let barangSynced = 0;
  let transaksiSynced = 0;

  // Dictionary mapping local IDs to Supabase IDs
  const localToSupabaseIdMap: Record<string, string> = {};

  // 1. Sync Barang
  for (const b of localBarang) {
    try {
      // Check if code already exists in Supabase
      const { data: existingB } = await supabase
        .from('barang')
        .select('id, kode')
        .eq('kode', b.kode)
        .maybeSingle();

      if (existingB) {
        localToSupabaseIdMap[b.id] = existingB.id;
        continue;
      }

      // If not exists, insert
      const { data: newB, error: bError } = await supabase
        .from('barang')
        .insert([{
          nama: b.nama,
          kode: b.kode,
          kategori: b.kategori,
          satuan: b.satuan,
          stok_awal: b.stok_awal,
          stok_minimal: b.stok_minimal,
          tahun_pengadaan: b.tahun_pengadaan,
          kondisi: b.kondisi,
          jenis_barang: b.jenis_barang,
        }])
        .select()
        .single();

      if (bError) throw bError;
      if (newB) {
        localToSupabaseIdMap[b.id] = newB.id;
        barangSynced++;
      }
    } catch (err) {
      console.warn('Handled item sync notification:', b.nama, err);
    }
  }

  // 2. Sync Transaksi
  for (const t of localTransaksi) {
    try {
      const dbBarangId = localToSupabaseIdMap[t.barang_id] || t.barang_id;
      // Skip if barang_id doesn't exist in Supabase (or starts with 'local-' and mapping failed)
      if (dbBarangId.startsWith('local-')) continue;

      // Check if identical transaction already exists
      const { data: existingT } = await supabase
        .from('transaksi')
        .select('id')
        .eq('barang_id', dbBarangId)
        .eq('jenis', t.jenis)
        .eq('jumlah', t.jumlah)
        .eq('tanggal', t.tanggal)
        .eq('keterangan', t.keterangan || '')
        .maybeSingle();

      if (existingT) continue;

      const { error: tError } = await supabase
        .from('transaksi')
        .insert([{
          barang_id: dbBarangId,
          jenis: t.jenis,
          jumlah: t.jumlah,
          tanggal: t.tanggal,
          keterangan: t.keterangan,
          penerima_penyerah: t.penerima_penyerah,
        }]);

      if (tError) throw tError;
      transaksiSynced++;
    } catch (err) {
      console.warn('Handled transaction sync notification:', t.keterangan, err);
    }
  }

  return { barangSynced, transaksiSynced };
}
