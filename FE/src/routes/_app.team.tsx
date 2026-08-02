import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/common";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { UsersRound, Plus, Search, Pencil, Trash2, Loader2, FileX } from "lucide-react";
import { useState, useEffect } from "react";
import { showSuccessAuto, showError, showConfirm } from "@/lib/swal";
import { requireRole } from "@/lib/route-guards";
import { getTeams, createTeam, updateTeam, deleteTeam, type Team } from "@/lib/api/teams";
import { getRtuppList, getUsers, type Rtupp, type User } from "@/lib/api/users";

export const Route = createFileRoute("/_app/team")({
  beforeLoad: () => {
    requireRole(["superadmin"]);
  },
  component: TeamManagement,
  head: () => ({ meta: [{ title: "Team Management — VoltHub" }] }),
});

const NO_LEADER = "__none__";

type TeamForm = {
  code: string;
  name: string;
  rtuppId: string;
  leaderId: string;
  isActive: boolean;
};

const emptyForm: TeamForm = {
  code: "",
  name: "",
  rtuppId: "",
  leaderId: NO_LEADER,
  isActive: true,
};

function TeamManagement() {
  const [q, setQ] = useState("");
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rtuppList, setRtuppList] = useState<Rtupp[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Team | null>(null);
  const [form, setForm] = useState<TeamForm>(emptyForm);

  const filtered = teams.filter(
    (t) =>
      q === "" ||
      t.name.toLowerCase().includes(q.toLowerCase()) ||
      t.code.toLowerCase().includes(q.toLowerCase()) ||
      (t.rtupp?.name ?? "").toLowerCase().includes(q.toLowerCase()),
  );

  const fetchTeams = async () => {
    setLoading(true);
    try {
      const data = await getTeams();
      setTeams(data);
    } catch (error) {
      console.error("Failed to fetch teams:", error);
      showError("Error", "Gagal mengambil data team");
    } finally {
      setLoading(false);
    }
  };

  const fetchDropdowns = async () => {
    try {
      const [rtupp, userList] = await Promise.all([getRtuppList(), getUsers()]);
      setRtuppList(rtupp);
      setUsers(userList);
    } catch (error) {
      console.error("Failed to fetch dropdowns:", error);
    }
  };

  useEffect(() => {
    fetchTeams();
    fetchDropdowns();
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (t: Team) => {
    setEditing(t);
    setForm({
      code: t.code,
      name: t.name,
      rtuppId: t.rtuppId,
      leaderId: t.leaderId ?? NO_LEADER,
      isActive: t.isActive,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.code.trim() || !form.name.trim()) {
      showError("Validasi", "Kode dan nama team wajib diisi");
      return;
    }
    if (!form.rtuppId) {
      showError("Validasi", "RTUPP wajib dipilih");
      return;
    }

    setSaving(true);
    try {
      const leaderId = form.leaderId === NO_LEADER ? null : form.leaderId;

      if (editing) {
        await updateTeam(editing.id, {
          code: form.code.trim(),
          name: form.name.trim(),
          rtuppId: form.rtuppId,
          leaderId,
          isActive: form.isActive,
        });
        showSuccessAuto("Berhasil", "Team berhasil diperbarui", 1200);
      } else {
        await createTeam({
          code: form.code.trim(),
          name: form.name.trim(),
          rtuppId: form.rtuppId,
          leaderId: leaderId ?? undefined,
          isActive: form.isActive,
        });
        showSuccessAuto("Berhasil", "Team berhasil ditambahkan", 1200);
      }
      setDialogOpen(false);
      setEditing(null);
      setForm(emptyForm);
      fetchTeams();
    } catch (error: any) {
      showError("Error", error.message || "Gagal menyimpan team");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (t: Team) => {
    const confirmed = await showConfirm(
      "Hapus Team",
      `Apakah Anda yakin ingin menghapus team "${t.name}"? Tindakan ini tidak dapat dibatalkan.`,
    );
    if (!confirmed.isConfirmed) return;

    try {
      await deleteTeam(t.id);
      showSuccessAuto("Berhasil", "Team berhasil dihapus", 1200);
      fetchTeams();
    } catch (error: any) {
      showError("Error", error.message || "Gagal menghapus team");
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Team Management"
        description="Kelola tim operasional lapangan."
        actions={
          <Button className="rounded-xl gradient-pln text-white" onClick={openCreate}>
            <Plus className="size-4 mr-2" /> Buat Team
          </Button>
        }
      />

      <Card className="rounded-2xl shadow-soft border-border/60">
        <CardContent className="p-4 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Cari kode, nama team, atau RTUPP..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-9 rounded-xl"
            />
          </div>
          <Badge variant="secondary" className="ml-auto rounded-full">
            {filtered.length} team
          </Badge>
        </CardContent>
      </Card>

      <Card className="rounded-2xl shadow-soft border-border/60 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="size-8 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <CardContent className="p-12">
            <div className="flex flex-col items-center justify-center text-center">
              <FileX className="size-16 text-muted-foreground mb-4" />
              <div className="text-lg font-semibold">Belum ada data Team</div>
              <div className="text-sm text-muted-foreground mt-2 max-w-md">
                {q
                  ? "Tidak ada team yang cocok dengan pencarian."
                  : "Silakan buat team baru untuk memulai."}
              </div>
            </div>
          </CardContent>
        ) : (
          <>
          {/* Mobile (< md): team cards. */}
          <div className="space-y-3 p-4 md:hidden">
            {filtered.map((t) => (
              <div key={t.id} className="rounded-xl border border-border/60 bg-card p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <UsersRound className="size-4 shrink-0 text-pln-blue" />
                    <span className="font-medium truncate">{t.name}</span>
                  </div>
                  <Badge variant={t.isActive ? "default" : "secondary"} className="rounded-full shrink-0">
                    {t.isActive ? "Aktif" : "Nonaktif"}
                  </Badge>
                </div>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                  <dt className="text-muted-foreground">Kode</dt>
                  <dd className="text-right font-medium">{t.code}</dd>
                  <dt className="text-muted-foreground">RTUPP</dt>
                  <dd className="text-right">{t.rtupp?.name || "-"}</dd>
                  <dt className="text-muted-foreground">Ketua</dt>
                  <dd className="text-right">{t.users_teams_leaderIdTousers?.name || "-"}</dd>
                  <dt className="text-muted-foreground">Anggota</dt>
                  <dd className="text-right">{t._count?.members ?? 0}</dd>
                </dl>
                <div className="flex items-center justify-end gap-1 border-t border-border/50 pt-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="rounded-lg"
                    aria-label={`Edit team ${t.name}`}
                    onClick={() => openEdit(t)}
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="rounded-lg text-destructive"
                    aria-label={`Hapus team ${t.name}`}
                    onClick={() => handleDelete(t)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold">Kode</th>
                  <th className="text-left px-4 py-3 font-semibold">Nama Team</th>
                  <th className="text-left px-4 py-3 font-semibold">RTUPP</th>
                  <th className="text-left px-4 py-3 font-semibold">Ketua</th>
                  <th className="text-left px-4 py-3 font-semibold">Anggota</th>
                  <th className="text-left px-4 py-3 font-semibold">Status</th>
                  <th className="text-right px-4 py-3 font-semibold">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => (
                  <tr key={t.id} className="border-t border-border/60 hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <UsersRound className="size-4 text-pln-blue" />
                        <span className="font-medium">{t.code}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">{t.name}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {t.rtupp?.name || "-"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {t.users_teams_leaderIdTousers?.name || "-"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {t._count?.members ?? 0}
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        variant={t.isActive ? "default" : "secondary"}
                        className="rounded-full"
                      >
                        {t.isActive ? "Aktif" : "Nonaktif"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="rounded-lg"
                        aria-label={`Edit team ${t.name}`}
                        onClick={() => openEdit(t)}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="rounded-lg text-destructive"
                        aria-label={`Hapus team ${t.name}`}
                        onClick={() => handleDelete(t)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Team" : "Buat Team Baru"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Kode</Label>
              <Input
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                className="rounded-xl mt-1.5"
                placeholder="TEAM-01"
              />
            </div>
            <div>
              <Label>Nama Team</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="rounded-xl mt-1.5"
                placeholder="Nama team"
              />
            </div>
            <div>
              <Label>RTUPP</Label>
              <Select value={form.rtuppId} onValueChange={(v) => setForm({ ...form, rtuppId: v })}>
                <SelectTrigger className="rounded-xl mt-1.5">
                  <SelectValue placeholder="Pilih RTUPP" />
                </SelectTrigger>
                <SelectContent>
                  {rtuppList.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Ketua Team</Label>
              <Select
                value={form.leaderId}
                onValueChange={(v) => setForm({ ...form, leaderId: v })}
              >
                <SelectTrigger className="rounded-xl mt-1.5">
                  <SelectValue placeholder="Pilih ketua (opsional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_LEADER}>Tanpa ketua</SelectItem>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-1 sm:col-span-2 flex items-center justify-between rounded-xl border border-border/60 px-3 py-2">
              <Label className="cursor-pointer">Status Aktif</Label>
              <Switch
                checked={form.isActive}
                onCheckedChange={(v) => setForm({ ...form, isActive: v })}
              />
            </div>
          </div>
          <Button
            className="rounded-xl gradient-pln text-white mt-2"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? (
              <>
                <Loader2 className="size-4 mr-2 animate-spin" /> Menyimpan...
              </>
            ) : (
              "Simpan"
            )}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
