// VoltHub — AI Assistant: Service Layer.
//
// The single seam between the chat UI and the model backend. The assistant runs
// in HYBRID mode, reaching Groq (llama-3.3-70b-versatile) through the VoltHub BE
// proxy (`POST /api/v1/ai/groq-proxy`) — the Groq key lives ONLY on the server,
// never in the client bundle. The browser sends the OpenAI-compatible body with
// its VoltHub JWT; the proxy forwards it to Groq and relays the response verbatim.
//   • free-form chat is answered by Groq,
//   • data questions trigger the `query_volthub_data` tool, which calls the
//     VoltHub AI Brain (`POST /api/v1/ai/brain`) — intent → Allowed Query
//     Registry → tenant/RBAC-scoped queries, all resolved server-side — and
//     Groq composes the final answer from the Brain's result,
//   • technical/how-to questions (TECHNICAL_PATTERN) skip the tool entirely
//     and are answered from the PENGETAHUAN TEKNIS / PANDUAN APLIKASI sections
//     of the system prompt; Brain replies below KNOWLEDGE_FALLBACK_CONFIDENCE
//     likewise fall back to prompt knowledge instead of suggestion menus.
// (`POST /v1/ai/chat` is NOT used: it needs a server-side ANTHROPIC_API_KEY
// and degrades to `{ mode: "fallback" }` without one.)
// Without a session token it runs in an honest preview mode; if the server has
// no GROQ_API_KEY the proxy returns 503. It never fabricates data.
import { isAxiosError } from "axios";
import { v2Post, handleError } from "@/lib/api/v2/client";
import { useAuthStore } from "@/stores/auth";
import type { AssistantContext, AssistantReply } from "./types";
import { describeContext } from "./context";

const MODEL = "llama-3.3-70b-versatile";
// The FAB no longer holds the Groq key. It calls the BE proxy, which forwards to
// Groq with the server-held GROQ_API_KEY — so the secret is never in the client
// bundle. Same OpenAI-compatible body; only the URL and the bearer token differ
// (a VoltHub JWT here, not a Groq key). Base mirrors the shared axios client.
const API_BASE =
  (import.meta.env.VITE_API_URL as string | undefined) || "http://localhost:3001/api";
const API_URL = `${API_BASE}/v1/ai/groq-proxy`;

/** One prior turn handed back to the model as conversation memory. */
export interface HistoryTurn {
  role: "user" | "assistant";
  content: string;
}

// ── Groq wire types (OpenAI-compatible chat completions) ─────────────────────
interface GroqToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

type GroqMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: GroqToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

interface GroqResponse {
  choices: Array<{
    message?: { content?: string | null; tool_calls?: GroqToolCall[] };
  }>;
}

// ── Backend AI Brain contract (BE/src/modules/ai/brain) ──────────────────────
// Response of POST /api/v1/ai/brain, already unwrapped from the { success,
// data } envelope by v2Post. Mirrors BrainReply in brain.types.ts.
interface BrainClarifyOption {
  id: string;
  label: string;
  /** Intent + slots to execute via POST /ai/brain/clarify if picked. */
  intent: string;
  slots: Record<string, string | undefined>;
}

interface BrainReply {
  kind: "answer" | "clarify" | "suggest" | "denied" | "smalltalk";
  /** Bahasa Indonesia text for the user. */
  text: string;
  /** Structured rows/cards for `answer`. */
  data?: unknown;
  options?: BrainClarifyOption[];
  suggestions?: string[];
  /** FE route path to redirect to (NAVIGATE intent) — surfaced to the drawer. */
  navigateTo?: string;
  meta: { intent: string; confidence: number; mode: string; queryId?: string };
}

// One session id per app load keys the Brain's conversation memory.
const BRAIN_SESSION_ID =
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `web-${Date.now().toString(36)}`;

// Cap the JSON payload forwarded to the model so a large list answer cannot
// blow the prompt budget; the Brain's `text` already summarises the result.
const TOOL_DATA_CHAR_LIMIT = 4000;

// Below this Brain confidence the question is not a data question at all —
// instead of relaying the Brain's generic suggestions (reads like "saya tidak
// mengerti"), the model is told to answer from its own system-prompt knowledge.
// Mid-band suggests (0.3–0.6) keep the guided-suggestion path.
const KNOWLEDGE_FALLBACK_CONFIDENCE = 0.3;

const TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "query_volthub_data",
      description:
        "Query data real-time dari database VoltHub: jumlah gardu, status inscane/oop, laporan, work order, KPI, telemetry, dan data operasional PLN lainnya. Gunakan setiap kali user menanyakan angka, status, atau data spesifik dari sistem. Gunakan juga untuk perintah navigasi/membuka halaman aplikasi (mis. 'buka har gh', 'ke halaman work order') — sistem akan mengarahkan user secara otomatis.",
      parameters: {
        type: "object",
        properties: {
          question: {
            type: "string",
            description:
              'Pertanyaan data dalam bahasa natural, mis. "berapa gardu inscane di RTUPP2"',
          },
        },
        required: ["question"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_laporan_lapangan",
      description:
        "Ambil ringkasan laporan tim lapangan terbaru dari database: Inspeksi GH, HAR GH, HAR GI, HAR MP — berisi status RC, status cubicle, kondisi rectifier/baterai/RTU, catatan masalah, penyebab gangguan, dan penanganan dari laporan yang sudah disubmit/tervalidasi. WAJIB dipakai untuk pertanyaan tentang isi/hasil/temuan/saran laporan tim lapangan.",
      parameters: {
        type: "object",
        properties: {
          locationCode: {
            type: "string",
            description: "Kode gardu/GH untuk filter laporan gardu tertentu (opsional)",
          },
          limit: { type: "integer", description: "Jumlah laporan terbaru (default 5, maks 20)" },
          type: {
            type: "string",
            enum: ["inspeksi", "har", "all"],
            description: "Jenis laporan (default all)",
          },
        },
      },
    },
  },
];

const SYSTEM_PROMPT = `Kamu adalah VoltHub AI — asisten cerdas untuk tim lapangan PLN (Perusahaan Listrik Negara) Indonesia.

Kepribadian:
- Hangat, profesional, informatif; ikuti bahasa user (ID/EN)
- Jawab pertanyaan apapun — tidak terbatas pada database VoltHub; untuk topik operasional PLN berikan insight teknis yang berguna

Konteks sistem:
- VoltHub = platform manajemen aset telekomunikasi SCADA PLN
- Modul: Work Order, Laporan Inspeksi GI/GH/MP, Laporan HAR, Dashboard KPI
- Tim: PETUGAS (lapangan), ADMIN (RTUPP), MANAGER, MASTER; RTUPP = unit wilayah kerja (RTUPP-1 s/d 5)

Akses data:
- Tool query_volthub_data mengambil data real-time database VoltHub (sudah dibatasi role & wilayah user). Gunakan SETIAP KALI user menanyakan angka, jumlah, status, atau data spesifik sistem.
- Pertanyaan tentang isi/hasil/temuan/saran laporan tim lapangan (Inspeksi GH, HAR GH/GI/MP) → WAJIB panggil tool get_laporan_lapangan.
- Jawab HANYA dari hasil tool — jangan mengarang data. Sampaikan angka PERSIS sesuai label hasil; jangan menambahkan filter (wilayah/status/waktu) yang tidak tercantum — jika user minta filter yang tidak ada, jelaskan angka yang tersedia adalah total sesuai label & hak akses user.
- Hasil tool berupa klarifikasi/saran → sampaikan pilihannya ke user dengan bahasamu sendiri.
- Permintaan buka/tampilkan halaman aplikasi → panggil tool dengan permintaan itu; sistem membuka halaman otomatis, kamu cukup konfirmasi singkat.
- Jangan mengulang catatan sistem/teknis dari hasil tool secara verbatim/parafrase; rangkum natural, sebutkan keterbatasan filter sekali saja bila relevan dan bila tidak ditandai catatan internal.

Bila laporan/data tidak ditemukan untuk gardu tertentu:
- Jawab singkat: "Belum ada laporan [jenis] untuk gardu [kode] di database."
- Langsung tawarkan alternatif spesifik berdasarkan konteks: bila tanya histori/kunjungan → tawarkan cek work order atau status RC; bila tanya kondisi → langsung query status RC gardu tersebut.
- Jangan tampilkan bullet point "Kemungkinan:" yang generik.
- Maksimal 3 kalimat untuk jawaban "tidak ditemukan".

Jangan pernah:
- Mengarang data statistik yang tidak kamu ketahui
- Menolak topik non-PLN — kamu asisten umum yang juga paham PLN

=== PENGETAHUAN TEKNIS SCADA PLN ===
Kamu ahli teknis SCADA kelistrikan distribusi; pertanyaan teknis dijawab langsung dari sini.

BATERAI TIDAK BACKUP SAAT GANGGUAN — penyebab:
1. Sel sulfat/rusak (usia >3 tahun / jarang di-charge)
2. MCB baterai 48V trip overcurrent — cek & reset
3. Kabel/terminal longgar atau korosi
4. Rectifier gagal mengisi (mode float gagal) / kapasitas drop akibat discharge berulang
Cek: tegangan sel (normal 2.15–2.17V/sel lead-acid), MCB, arus charge rectifier, load test.

RTU SERING BERMASALAH (termasuk Advantech) — penyebab:
1. Supply tidak stabil (wajib 48VDC ±10%)
2. Suhu >45°C tanpa pendingin
3. Firmware outdated / kapasitor aging pada unit >7 tahun
4. Interferensi EMI + terminal I/O longgar
Merk RTU terbaik (track record PLN): 1. Siemens SICAM — paling stabil utk SP7, mahal; 2. Red Lion — tahan suhu; 3. Schneider ION/Sepam; 4. Advantech ADAM/ARK — umum, rentan suhu; 5. Fransen/IEC FROG — lokal.

RELAY/RILEY PROTEKSI ERROR SETELAH TRIP CBO — penyebab:
1. Back EMF ke trip coil saat CBO buka/tutup cepat
2. Supply auxiliary 48/110VDC hilang sesaat
3. Setting berubah akibat surge/petir
4. Memory corrupt akibat power interruption tanpa UPS
Langkah: cek event log → verifikasi vs setting sheet → reset + re-download setting → ganti relay bila tak bisa dipertahankan.
Merk relay terbaik: 1. SEL (Schweitzer), 2. ABB REF/REX, 3. Siemens SIPROTEC 4/5, 4. GE Multilin, 5. Schneider Sepam.

RTU HANG SETELAH GANGGUAN — penyebab:
1. Voltage sag/surge saat trip CBO masuk supply RTU
2. Ground loop panel RTU–cubicle
3. Timeout komunikasi ke master → watchdog reset
4. Memory overflow akibat burst event log
Langkah WAJIB: catat waktu hang → power cycle 30 detik (bukan reset software) → cek komunikasi RS485/Ethernet/FO & IP conflict → cold start dari master bila perlu; jika berulang pasang surge protector 48VDC.

SELENOID CUBICLE GOSONG — penyebab:
1. Tegangan coil tak sesuai (48V vs 110V)
2. Energized terlalu lama (coil maksimal 3 detik)
3. Mekanik cubicle macet → coil kerja terus
4. Kualitas di bawah spesifikasi
Setelah ganti WAJIB: verifikasi tegangan sesuai nameplate → test manual sebelum remote → cek interlocking → ukur arus (normal <2A @48VDC) + set timer energize <2 detik → uji RC dari SP7, catat di laporan HAR.

STATUS LOKAL TERBACA, SP7 TIDAK — penyebab:
1. ASDU/LA di RTU tidak sesuai konfigurasi SP7
2. Protocol mismatch parameter IEC 101/104
3. Tidak masuk polling list / firewall blokir port 2404
4. IP RTU berubah belum di-update di SP7
Langkah: cek ASDU RTU vs SP7 → ping RTU dari server → cek traffic IEC104 via wireshark → verifikasi IP/port SP7.

GAGAL RC CUBICLE (EGA/Schneider/ABB/Merlin Gerin) — langkah:
1. Cek warna status di SP7
2. Cek tegangan supply selenoid + selector switch HARUS di REMOTE
3. Cek interlocking & alarm relay proteksi — alarm aktif bisa block RC
4. Test lokal CLOSE/OPEN manual; tetap gagal → ukur binary output RTU dengan multimeter
Modul per merk: EGA modul RC terpisah; Schneider/Merlin Gerin modul Easergy/Recloser Controller; ABB SAM600/REF615.

WARNA SP7/SIEMENS SCADA:
✅ BISA di-RC:
- HIJAU terang/solid = peralatan CLOSED (ON), RC aktif, normal
- MERAH solid = peralatan OPEN (OFF), RC aktif, normal
- KUNING/AMBER berkedip = sedang dalam proses operasi RC
❌ TIDAK BISA di-RC:
- ABU-ABU = komunikasi terputus/RTU OOP
- HIJAU PUDAR = status terbaca tapi RC tidak bisa dilakukan
- MERAH SILANG/X = RC di-disable (selector LOCAL atau interlock aktif)
- PUTIH/BLANK = tidak ada di polling list SP7
- KUNING SOLID (tidak berkedip) = error/alarm aktif, RC di-block
- ORANGE = mode test/maintenance, RC disabled

=== PANDUAN APLIKASI VOLTHUB ===
ALUR KERJA LAPORAN: ADMIN buat Work Order → assign ke Team → PETUGAS isi Laporan Awal (WAJIB sebelum laporan lain) → isi Laporan Inspeksi/HAR sesuai jenis gardu (GI/GH/MP) → submit → ADMIN validasi di menu Approval Laporan → APPROVED muncul di Monitoring Laporan & KPI Dashboard.
CEK STATUS RC HARI INI: Dashboard → Dashboard SCADA → tab "Inscan/OOP" — gardu IN-SCAN vs OOP dari snapshot SP7 terbaru.
UPLOAD DATA SCADA HARIAN: menu SCADA Upload → pilih file SP7 export Siemens → Upload.
LIHAT GARDU OOP: Dashboard SCADA → tab Inscan/OOP → filter "OOP", atau tanya saya langsung.
LIHAT LAPORAN TIM LAPANGAN: Operasional Lapangan → Monitoring Laporan → filter by status.
=== AKHIR PENGETAHUAN TEKNIS ===`;

// Technical/how-to questions must NOT be routed to the deterministic Brain —
// it only knows DB queries. When one of these keywords appears, the Groq
// request is sent WITHOUT tools so the model answers straight from the
// PENGETAHUAN TEKNIS / PANDUAN APLIKASI sections of the system prompt. Data
// questions ("gardu oop hari ini ada berapa") contain none of these words and
// keep the tool path unchanged.
const TECHNICAL_PATTERN =
  /\b(kenapa|mengapa|penyebab|cara|bagaimana|gimana|langkah|tutorial|bermasalah|gosong|terbakar|hang|error|gagal\s+rc|warna|saran|merk\s+terbaik|merek\s+terbaik|harus\s+ganti)\b/i;

// …EXCEPT when the question names a concrete gardu / explicit data query:
// "kenapa gardu PM46 OOP?" is a data question (the user wants that gardu's
// state, not a lesson), so a DATA_OVERRIDE match keeps the tool path even when
// TECHNICAL_PATTERN also matches. NB: bare "rtu" is deliberately NOT listed —
// "kenapa RTU Advantech sering bermasalah?" is a technical question; the data
// cases are covered by the phrase forms (berapa rtu / status rtu / rtu oop).
// A false override degrades gracefully: the Brain answers low-confidence →
// KNOWLEDGE_FALLBACK_CONFIDENCE routes the model back to prompt knowledge.
const DATA_OVERRIDE_PATTERN =
  /\b(gardu|gh\d+|gi\s|kode|up3|pm\d+|dk\d+|kn\d+|gd\d+|[a-z]{2}\d{2,}|oop|inscan|inscane|hari\s+ini|saat\s+ini|sekarang|status\s+(gardu|rc|rtu)|berapa\s+(gardu|rtu)|daftar\s+(oop|gardu)|rtu\s+(mati|offline)|laporan\s+(dari\s+)?(tim|team|lapangan|terbaru|inspeksi|har|minggu|bulan|hari)|(isi|hasil|temuan)\s+(dari\s+)?laporan|saran\s+(dari\s+)?laporan|rekomendasi\s+laporan|kunjungan|pemeliharaan|histori|riwayat|terakhir|kondisi|jadwal|kapan|maintenance|visit|work.?order|wo\s|laporan\s+(gardu|di|untuk)|cek\s+gardu|info\s+gardu|data\s+gardu|detail\s+gardu|tentang\s+gardu)\b/i;

/**
 * True when the assistant can reach its backend. The Groq key now lives on the
 * server, so "connected" simply means the user is authenticated (has a JWT to
 * call the proxy with); the server decides whether the key itself is present and
 * returns 503 if not. UI uses this to set expectations.
 */
export function isAssistantConnected(): boolean {
  return !!useAuthStore.getState().accessToken;
}

/**
 * Execute one `query_volthub_data` call against the backend AI Brain. Returns
 * a plain-text tool result the model can compose an answer from; errors are
 * folded into the string (never thrown) so one failed lookup does not kill
 * the whole turn.
 */
async function callBackendAiBrain(
  question: string,
  locale: "id" | "en",
): Promise<{ content: string; intent?: string; caveat?: string; navigateTo?: string }> {
  try {
    let reply = await v2Post<BrainReply>("/ai/brain", {
      message: question,
      sessionId: BRAIN_SESSION_ID,
      channel: "in_app",
      locale,
    });

    // The Brain's CLARIFY band (0.60–0.90) expects the CLIENT to resolve the
    // pick via /ai/brain/clarify — a plain turn can never reach EXECUTE for
    // those intents (e.g. every "hitung gardu" phrasing sits at ~0.65). With
    // an LLM in front, bouncing that menu to the user would dead-loop, so we
    // execute the top-ranked option and surface the assumption + alternatives
    // for the model to caveat.
    let assumption: string | undefined;
    let caveat: string | undefined;
    if (reply.kind === "clarify" && reply.options?.length) {
      const [top, ...rest] = reply.options;
      const resolved = await v2Post<BrainReply>("/ai/brain/clarify", {
        intent: top.intent,
        slots: top.slots,
        message: question,
        sessionId: BRAIN_SESSION_ID,
        channel: "in_app",
        locale,
      });
      if (resolved.kind === "answer") {
        // Bake the caveat into the answer text itself (the model echoes given
        // text far more reliably than it follows meta-instructions): the Brain
        // executed only these slots, so qualifiers the user asked for that are
        // absent from them (place/status) were dropped by the system.
        const slotDesc = Object.entries(top.slots)
          .filter(([, v]) => v)
          .map(([k, v]) => `${k}=${v}`)
          .join(", ");
        resolved.text +=
          ` (Catatan internal untuk konteksmu — JANGAN ditulis ulang atau ` +
          `diparafrasekan ke user, sistem akan menambahkannya secara otomatis: ` +
          `sistem menjalankan "${top.label}" hanya dengan filter ` +
          `{${slotDesc}} — filter lain dari pertanyaan tidak didukung dan ` +
          "diabaikan, jadi angka ini berlaku untuk seluruh cakupan akses user.)";
        assumption = rest.length
          ? `Jika maksud user berbeda, alternatif interpretasi: ${rest.map((o) => o.label).join("; ")}.`
          : undefined;
        reply = resolved;
      }
    }

    // Low-confidence/unknown → knowledge fallback: ground the model to answer
    // directly instead of bouncing the Brain's suggestion menu to the user.
    if (
      reply.kind === "suggest" &&
      (reply.meta?.confidence ?? 0) < KNOWLEDGE_FALLBACK_CONFIDENCE
    ) {
      return {
        content:
          "[Pertanyaan ini tidak dikenali sebagai pertanyaan data VoltHub. " +
          "JANGAN panggil tool lagi untuk pertanyaan ini. Jawab user langsung " +
          "dari pengetahuan teknis SCADA / panduan aplikasi pada instruksi " +
          "sistem.]",
        intent: reply.meta?.intent,
      };
    }

    let content = reply.text;
    if (reply.data !== undefined && reply.data !== null) {
      let json = JSON.stringify(reply.data);
      if (json.length > TOOL_DATA_CHAR_LIMIT) {
        json = `${json.slice(0, TOOL_DATA_CHAR_LIMIT)}… (dipotong)`;
      }
      content += `\n\nData (JSON): ${json}`;
    }
    if (reply.options?.length) {
      content += `\n\nPilihan klarifikasi: ${reply.options.map((o) => o.label).join("; ")}`;
    }
    if (reply.suggestions?.length) {
      content += `\n\nSaran pertanyaan: ${reply.suggestions.join("; ")}`;
    }
    if (assumption) {
      content += `\n\n[${assumption}]`;
    }
    if (reply.kind === "clarify" || reply.kind === "suggest") {
      // Ground the model hard: llama tends to retry the tool with rephrasings
      // instead of relaying the clarification, burning the whole loop budget.
      content =
        "[Sistem butuh klarifikasi — JANGAN panggil tool lagi dengan pertanyaan serupa. " +
        "Sampaikan pilihan/saran berikut ke user dan minta mereka memilih.]\n\n" +
        content;
    }
    if (reply.navigateTo) {
      // Navigation is executed by the app itself (the drawer redirects) — the
      // model must only acknowledge, not re-call the tool or invent page data.
      content =
        "[Sistem akan otomatis membuka halaman untuk user — JANGAN panggil tool " +
        "lagi. Cukup konfirmasi singkat bahwa halaman sedang dibuka.]\n\n" +
        content;
    }
    return { content, intent: reply.meta?.intent, caveat, navigateTo: reply.navigateTo };
  } catch (err) {
    const msg = isAxiosError(err)
      ? handleError(err)
      : err instanceof Error
        ? err.message
        : "unknown";
    return { content: `Error mengambil data: ${msg}` };
  }
}

interface LaporanLapanganArgs {
  locationCode?: string;
  limit?: number;
  type?: "inspeksi" | "har" | "all";
}

/**
 * Execute one `get_laporan_lapangan` call against the backend (tenant-scoped
 * server-side via the agent's execTool). Errors are folded into the returned
 * string, mirroring callBackendAiBrain, so a failed lookup never kills a turn.
 */
async function callBackendLaporanLapangan(rawArgs: string): Promise<string> {
  let args: LaporanLapanganArgs = {};
  try {
    const parsed = JSON.parse(rawArgs || "{}") as LaporanLapanganArgs;
    args = {
      ...(parsed.locationCode ? { locationCode: String(parsed.locationCode) } : {}),
      ...(typeof parsed.limit === "number"
        ? { limit: Math.min(Math.max(Math.round(parsed.limit), 1), 20) }
        : {}),
      ...(parsed.type === "inspeksi" || parsed.type === "har" || parsed.type === "all"
        ? { type: parsed.type }
        : {}),
    };
  } catch {
    // Malformed arguments — request the default summary.
  }
  try {
    const data = await v2Post<{ total: number }>("/ai/laporan-lapangan", args);
    if (!data.total) {
      return (
        "Belum ada laporan tim lapangan (Inspeksi GH / HAR GH-GI-MP) berstatus " +
        "SUBMITTED/VALIDATED di database. Sampaikan ini apa adanya ke user — " +
        "jangan mengarang isi laporan."
      );
    }
    let json = JSON.stringify(data);
    if (json.length > TOOL_DATA_CHAR_LIMIT) {
      json = `${json.slice(0, TOOL_DATA_CHAR_LIMIT)}… (dipotong)`;
    }
    return `Ringkasan laporan tim lapangan terbaru (JSON): ${json}`;
  } catch (err) {
    const msg = isAxiosError(err)
      ? handleError(err)
      : err instanceof Error
        ? err.message
        : "unknown";
    return `Error mengambil laporan lapangan: ${msg}`;
  }
}

/**
 * Produce a reply for one user message. `history` is the prior conversation
 * (already excluding the message being sent); the last 10 turns are forwarded
 * so the model keeps context without unbounded prompt growth.
 */
export async function reply(
  userMessage: string,
  ctx: AssistantContext,
  history: HistoryTurn[] = [],
): Promise<AssistantReply> {
  // Preview mode — the assistant reaches its model through the authenticated BE
  // proxy, so without a session token there is nothing to call. Be transparent,
  // never fabricate. (A server missing GROQ_API_KEY surfaces as a 503 below.)
  if (!useAuthStore.getState().accessToken) {
    return {
      mode: "stub",
      content:
        "Halo! Saya VoltHub AI. Silakan masuk (login) terlebih dahulu agar saya bisa " +
        "membantu menjawab pertanyaan Anda.",
    };
  }

  try {
    // Ground the model in who is asking (name, role, unit) — real session data.
    const system = `${SYSTEM_PROMPT}\n\nPengguna saat ini: ${describeContext(ctx)}.`;
    const locale = ctx.locale ?? "id";

    const messages: GroqMessage[] = [
      { role: "system", content: system },
      ...history.slice(-10),
      { role: "user", content: userMessage },
    ];

    // Data sources actually consulted this turn (for the transparency UI).
    const sources: string[] = [];
    // Deterministic user-facing notes (e.g. dropped filters) appended to the
    // final reply regardless of whether the model relays them.
    const caveats: string[] = [];
    // FE route resolved by the Brain's NAVIGATE intent (first one wins) — the
    // drawer redirects deterministically, independent of the model's wording.
    let navigateTo: string | undefined;

    // Routing: (1) concrete gardu / explicit data query → tool path, even if a
    // technical keyword is present; (2) technical/how-to question → bypass the
    // Brain tool, answer from system-prompt knowledge; (3) otherwise → normal
    // tool-choice flow. On a data-override match the FIRST round forces a tool
    // call (tool_choice "required") — llama sometimes answers "tidak ada data"
    // from thin air instead of calling the tool at all.
    const dataOverride = DATA_OVERRIDE_PATTERN.test(userMessage);
    const technical = !dataOverride && TECHNICAL_PATTERN.test(userMessage);

    // Tool-use loop: the model may call query_volthub_data, we execute it
    // against the AI Brain, then loop so it composes the final answer. Capped
    // so a confused model can never ping-pong forever; the LAST round forbids
    // tool calls so the turn always ends in a text answer for the user.
    const MAX_ROUNDS = 3;
    for (let iteration = 0; iteration < MAX_ROUNDS; iteration++) {
      const isLastRound = iteration === MAX_ROUNDS - 1;
      const response = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // VoltHub JWT (read fresh each round so a mid-session token refresh via
          // the axios client is picked up) — the proxy holds the Groq key.
          Authorization: `Bearer ${useAuthStore.getState().accessToken ?? ""}`,
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 1024,
          // Low temperature: llama's tool-calling gets flaky (leaks pseudo
          // tool-call markup into content) at higher temperatures.
          temperature: 0.2,
          messages,
          ...(technical
            ? {} // no tools offered — knowledge answer only
            : {
                tools: TOOLS,
                tool_choice: isLastRound
                  ? "none"
                  : dataOverride && iteration === 0
                    ? "required"
                    : "auto",
              }),
        }),
      });

      if (!response.ok) {
        const err = (await response.json().catch(() => ({}))) as {
          error?: { message?: string; code?: string; failed_generation?: string };
        };
        // llama sometimes emits malformed tool-call markup that Groq rejects
        // with 400 tool_use_failed instead of returning it as content (the
        // pseudo-leak guard below never sees it). Recover by parsing the
        // intended call out of failed_generation and executing it ourselves,
        // so a data question still gets answered instead of throwing.
        const failed = err.error?.failed_generation;
        if (
          err.error?.code === "tool_use_failed" &&
          failed?.includes("get_laporan_lapangan")
        ) {
          const argsMatch = failed.match(/\{[\s\S]*?\}/);
          const rawArgs = argsMatch ? argsMatch[0] : "{}";
          const content = await callBackendLaporanLapangan(rawArgs);
          const id = `recovered-lap-${iteration}`;
          messages.push({
            role: "assistant",
            content: null,
            tool_calls: [
              {
                id,
                type: "function",
                function: { name: "get_laporan_lapangan", arguments: rawArgs },
              },
            ],
          });
          messages.push({ role: "tool", tool_call_id: id, content });
          sources.push("Laporan Lapangan");
          continue; // let the model compose the answer from the tool result
        }
        if (
          err.error?.code === "tool_use_failed" &&
          failed?.includes("query_volthub_data")
        ) {
          let question = userMessage;
          const argsMatch = failed.match(/\{[\s\S]*?\}/);
          if (argsMatch) {
            try {
              const args = JSON.parse(argsMatch[0]) as { question?: string };
              if (args.question) question = args.question;
            } catch {
              // Malformed arguments — fall back to the raw user message.
            }
          }
          const result = await callBackendAiBrain(question, locale);
          const id = `recovered-${iteration}`;
          messages.push({
            role: "assistant",
            content: null,
            tool_calls: [
              {
                id,
                type: "function",
                function: {
                  name: "query_volthub_data",
                  arguments: JSON.stringify({ question }),
                },
              },
            ],
          });
          messages.push({ role: "tool", tool_call_id: id, content: result.content });
          if (result.caveat && !caveats.includes(result.caveat)) {
            caveats.push(result.caveat);
          }
          if (result.navigateTo && !navigateTo) {
            navigateTo = result.navigateTo;
          }
          sources.push(
            result.intent ? `AI Brain (${result.intent})` : "AI Brain",
          );
          continue; // let the model compose the answer from the tool result
        }
        throw new Error(err.error?.message ?? `HTTP ${response.status}`);
      }

      const data = (await response.json()) as GroqResponse;
      const msg = data.choices[0]?.message;

      if (msg?.tool_calls?.length) {
        messages.push({
          role: "assistant",
          content: msg.content ?? null,
          tool_calls: msg.tool_calls,
        });
        for (const tc of msg.tool_calls) {
          let content = `Tool ${tc.function.name} tidak dikenal.`;
          if (tc.function.name === "query_volthub_data") {
            let question = userMessage;
            try {
              const args = JSON.parse(tc.function.arguments || "{}") as {
                question?: string;
              };
              if (args.question) question = args.question;
            } catch {
              // Malformed arguments — fall back to the raw user message.
            }
            const result = await callBackendAiBrain(question, locale);
            content = result.content;
            if (result.caveat && !caveats.includes(result.caveat)) {
              caveats.push(result.caveat);
            }
            if (result.navigateTo && !navigateTo) {
              navigateTo = result.navigateTo;
            }
            sources.push(
              result.intent ? `AI Brain (${result.intent})` : "AI Brain",
            );
          } else if (tc.function.name === "get_laporan_lapangan") {
            content = await callBackendLaporanLapangan(tc.function.arguments);
            sources.push("Laporan Lapangan");
          }
          messages.push({ role: "tool", tool_call_id: tc.id, content });
        }
        continue; // let the model compose the answer from the tool results
      }

      // llama occasionally leaks a pseudo tool call as plain text instead of
      // a structured tool_calls entry (e.g. "<function=query_volthub_data…").
      // That is not an answer — retry the round rather than showing it.
      let content = msg?.content ?? "";
      if (!isLastRound && /<function|<tool_call|"tool_calls"/.test(content)) {
        continue;
      }

      return {
        mode: "llm",
        content,
        sources: sources.length ? sources : undefined,
        navigateTo,
      };
    }

    return {
      mode: "llm",
      content:
        "Maaf, saya kesulitan memproses pertanyaan ini. Coba tanyakan dengan cara lain.",
      sources: sources.length ? sources : undefined,
      navigateTo,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[VoltHub AI]", msg);
    throw new Error(`Gagal menghubungi AI: ${msg}`);
  }
}
