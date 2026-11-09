# kucing-pasar-web — Status: PROTOTIPE (milestone 1)

## Apa ini
Platformer 2D stealth di browser: kamu kucing oren yang nyolong ikan di pasar tradisional, terus kabur lewat got tanpa ketahuan ibu-ibu penjual yang bawa sapu lidi. TypeScript + Vite 8 + Canvas 2D, tanpa library game. Build ±39 KB JS (13,6 KB gzip).

## Sudah ada
- 3 level: Pasar Pagi (tutorial, 1 penjual), Lapak Ikan (2 penjual), Pasar Malam (3 penjual, gelap dengan pool cahaya lampu). Level kebuka berurutan, bintang tersimpan di localStorage.
- Kucing: lari, ngendap (lebih pelan, lebih susah kelihatan), lompat dengan coyote time dan buffer, lompatan pendek kalau tombol dilepas cepat, naik tembus papan meja/terpal, turun lewat ngendap + lompat. Bawa ikan bikin sedikit lebih lambat, dan ikannya kelihatan digigit.
- Penjual: patroli, sesekali noleh, curiga (`?` + meter), ngejar (`!`), ngayun sapu, ngomel 1,5 detik setelah kena (biar kucing sempat kabur), nyari, terus balik. Pandangan berupa kerucut yang kepotong peti dan papan, dan nggak bisa lihat ke atas terpal. Ngendap di kolong meja = nggak kelihatan.
- Kena sapu: nyawa −1, kucing terpental, ikan terakhir jatuh balik ke lapaknya. 3 nyawa.
- Bintang: kabur bawa ikan, semua ikan, nggak pernah ketahuan.
- Suara sintetis Web Audio: "meong", lompat, mendarat, "Hus! Hus!", ayunan sapu, ngeong kesakitan, jingle menang/kalah, riuh pasar. Tombol 🔊 / M buat mute, P/Esc buat jeda.
- Kontrol sentuh (◀ ▶ Ngendap Lompat, multi-touch) dan layout HP portrait.

## Arsitektur
- `src/sim/`: logika murni (level dari teks ASCII, fisika tile, garis pandang DDA, AI penjual, alur game), RNG ber-seed, tanpa DOM.
- `src/render/`: Canvas 2D, semua digambar pakai path (tanpa gambar).
- `src/levels.ts`: peta level dalam teks; legenda di `src/sim/level.ts`.

## Tes
- `npm run verify`: 20 tes vitest + typecheck + build. Lulus 2026-11-05.
  - Fisika (tinggi lompat ±2,3 petak, lompatan pendek, dinding, papan satu arah, coyote time, ngendap), garis pandang dan sembunyi, AI (patroli, curiga lalu ngejar, ayun sapu + ngomel, kehilangan jejak, tiga pukulan = kalah), alur game (got butuh ikan, menang dengan bintang), determinisme.
  - **Cek jangkauan level**: tiap level dijelajahi pakai fisika kucing yang asli (jalan, lompat lari, lompat pendek, turun dari papan). Semua ikan dan got terbukti bisa dicapai.
- Safari iOS (iPhone 17 simulator, 2026-11-05): menu, level 1, kontrol sentuh dua jari (lari + lompat), penjual ngeliat → ngejar → mukul → ngomel, layar "Ketangkep!". Tanpa error.
- Browser pane (Chromium): menu dan level 1 kegambar, tanpa error console. Pane-nya sempat tersembunyi, jadi gameplay di sana dites dengan menjalankan loop manual dari console.

## Gap
- Belum dimainkan manusia: tingkat kesulitan (kecepatan curiga, jarak pandang 6,5 petak) dan desain level masih tebakan.
- Di simulator, tap pertama setelah `open_url` sempat nggak masuk (tap kedua jalan; juga terjadi di Mudik Stack). Perlu dicek di iPhone fisik.
- Belum ada musik, belum ada level ke-4+, belum ada animasi kejar-kejaran lucu (ibu-ibu tersandung, dll.).
