# LIS Simulator

Project ini punya 2 versi aplikasi:

- `lis-simulator` (existing/main version)
- `standalone` (dashboard simulator mandiri untuk integrasi Klikmedis)

## Prasyarat

- Node.js 18+ (disarankan Node.js 20+)
- npm

## 1) Menjalankan Versi Existing (`lis-simulator`)

Versi ini ada di root project.

### Setup

1. Install dependency:

```bash
npm install
```

2. Siapkan env dari template:

```bash
copy .env.example .env
```

3. Isi `.env`:

- `PORT` (default `3001`)
- `LIS_API_KEY` (wajib, untuk order masuk ke simulator)
- `KLIKMEDIS_BASE_URL`
- `KLIKMEDIS_EMAIL` (login JWT untuk kirim hasil)
- `KLIKMEDIS_PASSWORD`
- `AUTO_SEND_RESULT` (`true/false`)
- `AUTO_SEND_DELAY_MS`

### Run

- Development (watch mode):

```bash
npm run dev
```

- Production:

```bash
npm start
```

### Akses

- Dashboard: `http://127.0.0.1:3001`
- Endpoint order LIS: `POST /order`
- Kirim hasil ke Klikmedis: `POST /api/lis/v1/result/receive` (JWT Bearer)

---

## 2) Menjalankan Versi Standalone (`standalone`)

Versi ini terpisah di folder `standalone/` dan mengikuti **kontrak API baru**:

- Dokumen: https://app.klikmedis.com/docs/integrasi-lab-api
- Auth: JWT Bearer (`POST /api/v1/auth/login`)
- Sync pasien: `POST /api/lis/v1/patient`
- Visit/order: `POST /api/lis/v1/visit` (format baru: UUID `patient_id`, `department_id`, `doctor_id`, `item_id`)
- Hasil lab: `POST /api/lis/v1/result/receive` (pakai `order_id` + `item_id`)

### Setup

1. Masuk folder standalone:

```bash
cd standalone
```

2. Install dependency:

```bash
npm install
```

3. Siapkan env dari template:

```bash
copy .env.example .env
```

4. Isi `.env`:

- `PORT` (default `3010`)
- `KLIKMEDIS_BASE_URL` (wajib, contoh: `https://app.klikmedis.com`)
- `KLIKMEDIS_EMAIL` (wajib, akun klinik)
- `KLIKMEDIS_PASSWORD` (wajib)
- `AUTO_GENERATE_SPECIMEN` (`true/false`)

Atau isi langsung dari panel **Pengaturan ENV** di dashboard.

### Run

- Development (watch mode):

```bash
npm run dev
```

- Production:

```bash
npm start
```

### Akses

- Dashboard: `http://127.0.0.1:3010`

### Flow simulasi standalone

1. Login JWT
2. Ambil master (`dokter`, `poliklinik`, `tindakan`)
3. Sync pasien (`/api/lis/v1/patient`) → dapat `patient_id`
4. Submit visit (`/api/lis/v1/visit`) → dapat `order_id`
5. Submit hasil (`/api/lis/v1/result/receive`) pakai `order_id` + `item_id`

### Fitur utama standalone

- Form simulasi manual (pasien, dokter, poliklinik, tindakan, specimen)
- Tombol **Test Login** untuk cek JWT
- Riwayat run + detail payload/response
- Pengaturan ENV dari dashboard (tersimpan ke `standalone/.env`)

> Catatan: jika ubah `PORT` dari dashboard, server perlu restart agar port baru aktif.

---

## Menjalankan Keduanya Bersamaan

Karena port default berbeda (`3001` dan `3010`), dua versi bisa jalan bersamaan.

Terminal 1 (root):

```bash
npm run dev
```

Terminal 2 (`standalone/`):

```bash
cd standalone
npm run dev
```

## Struktur Singkat

- `src/` + `public/` (versi existing)
- `standalone/src/` + `standalone/public/` (versi standalone)
