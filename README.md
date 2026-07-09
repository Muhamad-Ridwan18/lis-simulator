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
- `LIS_API_KEY` (wajib)
- `KLIKMEDIS_BASE_URL`
- `KLIKMEDIS_API_KEY`
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

---

## 2) Menjalankan Versi Standalone (`standalone`)

Versi ini terpisah di folder `standalone/`.

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
- `KLIKMEDIS_BASE_URL` (wajib)
- `KLIKMEDIS_API_KEY` (wajib)
- `AUTO_GENERATE_SPECIMEN` (`true/false`)

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

### Fitur utama standalone

- Form simulasi manual:
  - isi data pasien
  - pilih dokter/poliklinik
  - pilih pemeriksaan
  - opsi include specimen
- Riwayat run simulasi + detail payload/response
- Pengaturan ENV langsung dari dashboard (tersimpan ke `standalone/.env`)

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
