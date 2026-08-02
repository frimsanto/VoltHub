/**
 * Deterministic answer renderer.
 *
 * Turns the structured results from the query services into a concise Bahasa
 * Indonesia (or English) answer WITHOUT any LLM. This is the default answer path
 * (LocalProvider) and the safe fallback for every vendor provider — so the
 * assistant is always grounded in real numbers and never invents data.
 */

type Locale = 'id' | 'en';

/** Thousands separator (Indonesian style: 14.832). */
function num(n: number): string {
  return n.toLocaleString('id-ID');
}

export function renderAnswer(intent: string, data: unknown, _locale: Locale = 'id'): string {
  const d = data as Record<string, unknown> | null;
  if (!d || typeof d !== 'object') return 'Tidak ada data yang dapat ditampilkan.';

  switch (d.kind) {
    case 'navigate': {
      if (!d.found) {
        return (
          'Maaf, saya belum dapat menemukan halaman yang dimaksud. ' +
          "Coba: 'buka har gh', 'ke work order', 'tampilkan inspeksi mp'."
        );
      }
      return `Mengarahkan Anda ke ${d.label}...`;
    }

    case 'count': {
      const meta = d.meta as {
        note?: string;
        up?: number;
        down?: number;
        totalRtu?: number;
      } | undefined;
      const label = String(d.label ?? '');
      // Jawaban bertopik RC SCADA selalu menyertakan glosarium singkat — banyak
      // pengguna baru belum tahu arti "Gardu RC", "IN-SCAN", dan "OOP".
      const rcGlossary =
        '_Gardu RC = gardu yang dilengkapi Remote Control (RTU/telekontrol SCADA). ' +
        'IN-SCAN = komunikasi RTU ke pusat SCADA aktif/normal. ' +
        'OOP (Out of Point) = komunikasi RTU terputus._';
      if (meta?.note) {
        return `${num(Number(d.total))} ${label}.\n_${meta.note}_`;
      }
      if (meta?.up != null && meta.down != null) {
        const totalRtu = Number(meta.totalRtu ?? d.total);
        return (
          `Status RC SCADA saat ini: ${num(meta.up)} Gardu IN-SCAN (telekontrol aktif) ` +
          `dan ${num(meta.down)} Gardu OOP (telekontrol terputus) dari ${num(totalRtu)} total RTU ` +
          `(snapshot SP7 terbaru).\n${rcGlossary}`
        );
      }
      if (/inscan/i.test(label)) {
        const ctx = typeof d.context === 'string' && d.context ? ` ${d.context}` : '';
        return (
          `Saat ini terdapat ${num(Number(d.total))} Gardu RC yang IN-SCAN ` +
          `(telekontrol aktif/terhubung SCADA)${ctx}.\n${rcGlossary}`
        );
      }
      if (/oop/i.test(label)) {
        const ctx = typeof d.context === 'string' && d.context ? ` ${d.context}` : '';
        return (
          `Saat ini terdapat ${num(Number(d.total))} Gardu RC yang OOP ` +
          `(Out of Point / telekontrol terputus)${ctx}.\n${rcGlossary}`
        );
      }
      if (typeof d.context === 'string' && d.context) {
        return `${num(Number(d.total))} ${label} (${d.context}).`;
      }
      return `Total ${label}: ${num(Number(d.total))}.`;
    }

    case 'assets': {
      const total = Number(d.total);
      if (total === 0) return 'Tidak ada aset yang cocok dengan kriteria tersebut.';
      const items = (d.items as Array<Record<string, unknown>>) ?? [];
      const lines = items
        .slice(0, 10)
        .map((a) => `• ${a.code} — ${a.name} (${a.type}, ${a.status}${a.comm ? `, ${a.comm}` : ''})${a.gardu ? ` @ ${a.gardu}` : ''}`);
      const more = total > items.length ? `\n…dan ${num(total - items.length)} lainnya.` : '';
      return `Ditemukan ${num(total)} aset:\n${lines.join('\n')}${more}`;
    }

    case 'reports': {
      const total = Number(d.total);
      if (total === 0) return 'Tidak ada laporan yang cocok dengan kriteria tersebut.';
      const items = (d.items as Array<Record<string, unknown>>) ?? [];
      const lines = items
        .slice(0, 10)
        .map((r) => `• ${r.id} — ${r.gardu} (${r.status})`);
      const more = total > items.length ? `\n…dan ${num(total - items.length)} lainnya.` : '';
      return `Ditemukan ${num(total)} laporan:\n${lines.join('\n')}${more}`;
    }

    case 'gardu': {
      const total = Number(d.total);
      const place = d.place ? ` di "${d.place}"` : '';
      if (total === 0) return `Tidak ada gardu yang ditemukan${place}.`;
      const items = (d.items as Array<Record<string, unknown>>) ?? [];
      const lines = items
        .slice(0, 10)
        .map((l) => `• ${l.code} — ${l.name} (${l.type}, ${num(Number(l.assetCount))} aset)`);
      const more = total > items.length ? `\n…dan ${num(total - items.length)} lainnya.` : '';
      return `Ditemukan ${num(total)} gardu${place}:\n${lines.join('\n')}${more}`;
    }

    case 'location': {
      if (!d.found) {
        const q = d.query ? ` "${d.query}"` : '';
        return `Gardu${q} tidak ditemukan.`;
      }
      const rtupp = d.rtupp as { code: string; name: string } | null;
      const lat = d.lat != null ? Number(d.lat) : null;
      const lng = d.lng != null ? Number(d.lng) : null;
      const koordinat = lat != null && lng != null ? `${lat.toFixed(6)}, ${lng.toFixed(6)}` : 'belum tersedia';
      // Live RC status (attached by gis.detail when the question asks about
      // RC/OOP/inscan) — spelled out so the model relays it without guessing.
      const rc = d.rcStatus as { status: string; avaYtd: string | null; asOf: string | null } | undefined;
      const rcLabel =
        rc?.status === 'OOP'
          ? 'OOP (telekontrol terputus)'
          : rc?.status === 'IN-SCAN'
            ? 'IN-SCAN (telekontrol aktif)'
            : rc?.status;
      const lines = [
        `${d.code} — ${d.name}`,
        `UP3: ${d.up3 ?? '-'}`,
        `RTUPP: ${rtupp ? rtupp.name : '-'}`,
        ...(d.address ? [`Alamat: ${d.address}`] : []),
        `Koordinat: ${koordinat}`,
        ...(rc
          ? [
              `Status RC: ${rcLabel}${rc.asOf ? ` — per snapshot SP7 ${rc.asOf}` : ''}${rc.avaYtd ? `, AVA YTD ${rc.avaYtd}` : ''}`,
            ]
          : []),
      ];
      return lines.join('\n');
    }

    case 'insight': {
      const ranking = (d.ranking as Array<Record<string, unknown>>) ?? [];
      if (ranking.length === 0) return 'Belum ada data yang cukup untuk menyusun insight.';
      const lines = ranking
        .slice(0, 10)
        .map((r, i) => `${i + 1}. ${r.up3} — ${num(Number(r.count))}`);
      return `Peringkat berdasarkan ${d.basis}:\n${lines.join('\n')}`;
    }

    case 'inspeksi-summary': {
      const total = Number(d.totalDataInspeksi);
      if (total === 0) return 'Belum ada data inspeksi yang tercatat di sistem.';
      const komponen = (label: string, key: string) => {
        const c = d[key] as Record<string, number> | undefined;
        if (!c) return `• ${label}: tidak ada data`;
        return `• ${label}: ${num(c.baik)} baik, ${num(c.rusak)} rusak, ${num(c.perluPengecekan)} perlu pengecekan lanjut`;
      };
      return (
        `Total data inspeksi: ${num(total)}\n` +
        [komponen('Rectifier', 'rectifier'), komponen('Baterai', 'baterai'), komponen('RTU', 'rtu'), komponen('Media', 'media')].join('\n')
      );
    }

    case 'inspeksi-problems': {
      const total = Number(d.total);
      if (total === 0) return 'Tidak ada gardu bermasalah pada data hasil inspeksi.';
      const items = (d.items as Array<Record<string, unknown>>) ?? [];
      const lines = items
        .slice(0, 10)
        .map((r) => `• ${r.kodeGardu} (${r.up3 ?? '-'}) — ${(r.masalah as string[]).join('; ')}`);
      const more = total > items.length ? `\n…dan ${num(total - items.length)} lainnya.` : '';
      return `Ditemukan ${num(total)} gardu bermasalah dari hasil inspeksi:\n${lines.join('\n')}${more}`;
    }

    case 'inspeksi-brands': {
      const komponen = (label: string, key: string) => {
        const rows = (d[key] as Array<Record<string, unknown>>) ?? [];
        if (rows.length === 0) return `${label}: tidak ada data`;
        const lines = rows
          .slice(0, 5)
          .map((r) => `${r.merk} (${num(Number(r.jumlahRusak))} rusak / ${num(Number(r.totalUnit))} unit)`);
        return `${label}: ${lines.join(', ')}`;
      };
      return [
        'Peringkat merk berdasarkan jumlah kerusakan pada data inspeksi:',
        komponen('Rectifier', 'rectifier'),
        komponen('Baterai', 'baterai'),
        komponen('RTU', 'rtu'),
        komponen('Media', 'media'),
      ].join('\n');
    }

    case 'har-summary': {
      const total = Number(d.totalDataHar);
      if (total === 0) return 'Belum ada data HAR (pemeliharaan) yang tercatat di sistem.';
      const komponen = (label: string, key: string) => {
        const c = d[key] as Record<string, number> | undefined;
        if (!c) return `• ${label}: tidak ada data`;
        return `• ${label}: ${num(c.baik)} baik, ${num(c.rusak)} rusak, ${num(c.perluPengecekan)} perlu cek lebih lanjut`;
      };
      return (
        `Total data HAR: ${num(total)}\n` +
        [komponen('Rectifier', 'rectifier'), komponen('Baterai', 'baterai'), komponen('RTU', 'rtu'), komponen('Media', 'media')].join('\n')
      );
    }

    case 'har-brands': {
      const komponen = (label: string, key: string) => {
        const rows = (d[key] as Array<Record<string, unknown>>) ?? [];
        if (rows.length === 0) return `${label}: tidak ada data`;
        const lines = rows
          .slice(0, 5)
          .map((r) => `${r.merk} (${num(Number(r.jumlahRusak))} rusak / ${num(Number(r.totalUnit))} unit)`);
        return `${label}: ${lines.join(', ')}`;
      };
      return [
        'Peringkat merk berdasarkan jumlah kerusakan pada data HAR (pemeliharaan):',
        komponen('Rectifier', 'rectifier'),
        komponen('Baterai', 'baterai'),
        komponen('RTU', 'rtu'),
        komponen('Media', 'media'),
      ].join('\n');
    }

    case 'inspeksi-detail': {
      if (!d.found) {
        const q = d.query ? ` "${d.query}"` : '';
        return `Tidak ditemukan data inspeksi untuk gardu${q}.`;
      }
      const riwayat = (d.riwayat as Array<Record<string, unknown>>) ?? [];
      const komponen = (label: string, key: string, r: Record<string, unknown>) => {
        const c = r[key] as Record<string, unknown>;
        if (!c?.kesimpulan) return `  ${label}: tidak ada data`;
        return `  ${label}: ${c.merk ?? '-'} — ${c.kesimpulan}${c.kategori ? ` (${c.kategori})` : ''}`;
      };
      const lines = riwayat.map((r, i) => {
        const tgl = r.tanggal ? new Date(r.tanggal as string).toLocaleDateString('id-ID') : '-';
        return (
          `${i + 1}. ${tgl} (UP3 ${r.up3 ?? '-'})\n` +
          [komponen('Rectifier', 'rectifier', r), komponen('Baterai', 'baterai', r), komponen('RTU', 'rtu', r), komponen('Media', 'media', r)].join('\n')
        );
      });
      return `Riwayat inspeksi gardu ${d.kodeGardu}:\n${lines.join('\n\n')}`;
    }

    default:
      return 'Permintaan diproses, namun format hasilnya belum dikenali.';
  }
}