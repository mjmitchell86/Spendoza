import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Search, Trash2, RefreshCw, Repeat, Mail, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { useAdminUsers, useUpdateAdminUser, useDeleteAdminUser, useAdminGenerateReport, useAdminDetectRecurring, useAdminSendQuarterlyReport, useAdminSendAnnualReport } from "@/hooks/use-admin";
import { toast } from "sonner";
import type { AdminUserRow } from "@spendoza/shared";
import { Loader2 } from "lucide-react";

export function AdminUsersPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [tierFilter, setTierFilter] = useState<string>("");
  const [deleteTarget, setDeleteTarget] = useState<AdminUserRow | null>(null);

  const { data, isLoading } = useAdminUsers({
    page,
    limit: 25,
    search: search || undefined,
    tier: tierFilter || undefined,
  });
  const updateUser = useUpdateAdminUser();
  const deleteUser = useDeleteAdminUser();
  const generateReport = useAdminGenerateReport();
  const detectRecurring = useAdminDetectRecurring();
  const sendQuarterlyReport = useAdminSendQuarterlyReport();
  const sendAnnualReport = useAdminSendAnnualReport();

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  }

  function handleTierChange(id: string, tier: string) {
    updateUser.mutate({ id, data: { subscription_tier: tier as any } });
  }

  function handleAdminToggle(id: string, current: boolean) {
    updateUser.mutate({ id, data: { is_admin: !current } });
  }

  function handleDisableToggle(id: string, current: boolean) {
    updateUser.mutate({ id, data: { disabled: !current } });
  }

  function handleDelete() {
    if (!deleteTarget) return;
    deleteUser.mutate(deleteTarget.id, {
      onSuccess: () => setDeleteTarget(null),
    });
  }

  const totalPages = data ? Math.ceil(data.total / data.limit) : 1;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-4">
        <Link to="/admin">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="size-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">User Management</h1>
          <p className="text-sm text-muted-foreground">
            {data?.total ?? 0} total users
          </p>
        </div>
      </div>

      {/* Search and filters */}
      <div className="flex flex-wrap gap-3">
        <form onSubmit={handleSearch} className="flex gap-2">
          <Input
            placeholder="Search by name..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-64"
          />
          <Button type="submit" variant="outline" size="icon">
            <Search className="size-4" />
          </Button>
        </form>
        <Select value={tierFilter} onValueChange={(v) => { setTierFilter(v === "all" ? "" : v); setPage(1); }}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="All tiers" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All tiers</SelectItem>
            <SelectItem value="free">Free</SelectItem>
            <SelectItem value="starter">Starter</SelectItem>
            <SelectItem value="pro">Pro</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* User table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Name</th>
                    <th className="px-4 py-3 font-medium">Email</th>
                    <th className="px-4 py-3 font-medium">Tier</th>
                    <th className="px-4 py-3 font-medium">Admin</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Joined</th>
                    <th className="px-4 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.users ?? []).map((user) => (
                    <tr key={user.id} className="border-b last:border-0 hover:bg-muted/50">
                      <td className="px-4 py-3 font-medium">{user.display_name}</td>
                      <td className="px-4 py-3 text-muted-foreground">{user.email}</td>
                      <td className="px-4 py-3">
                        <Select
                          value={user.subscription_tier}
                          onValueChange={(v) => handleTierChange(user.id, v)}
                        >
                          <SelectTrigger className="h-8 w-24">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="free">Free</SelectItem>
                            <SelectItem value="starter">Starter</SelectItem>
                            <SelectItem value="pro">Pro</SelectItem>
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-4 py-3">
                        <Switch
                          checked={user.is_admin}
                          onCheckedChange={() => handleAdminToggle(user.id, user.is_admin)}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Badge variant={user.disabled ? "destructive" : "secondary"}>
                            {user.disabled ? "Disabled" : "Active"}
                          </Badge>
                          <Switch
                            checked={!user.disabled}
                            onCheckedChange={() => handleDisableToggle(user.id, user.disabled)}
                          />
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {new Date(user.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Refresh Report"
                            disabled={generateReport.isPending}
                            onClick={() =>
                              generateReport.mutate(user.id, {
                                onSuccess: () => toast.success(`Report regenerated for ${user.display_name}`),
                                onError: () => toast.error(`Failed to regenerate report for ${user.display_name}`),
                              })
                            }
                          >
                            {generateReport.isPending && generateReport.variables === user.id ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : (
                              <RefreshCw className="size-4" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Detect Recurring"
                            disabled={detectRecurring.isPending}
                            onClick={() =>
                              detectRecurring.mutate(user.id, {
                                onSuccess: () => toast.success(`Recurring detection complete for ${user.display_name}`),
                                onError: () => toast.error(`Failed to detect recurring for ${user.display_name}`),
                              })
                            }
                          >
                            {detectRecurring.isPending && detectRecurring.variables === user.id ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : (
                              <Repeat className="size-4" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Send Quarterly Report"
                            disabled={sendQuarterlyReport.isPending}
                            onClick={() =>
                              sendQuarterlyReport.mutate(user.id, {
                                onSuccess: () => toast.success(`Quarterly report sent to ${user.display_name}`),
                                onError: () => toast.error(`Failed to send quarterly report for ${user.display_name}`),
                              })
                            }
                          >
                            {sendQuarterlyReport.isPending && sendQuarterlyReport.variables === user.id ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : (
                              <Mail className="size-4" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Send Annual Report"
                            disabled={sendAnnualReport.isPending}
                            onClick={() =>
                              sendAnnualReport.mutate(user.id, {
                                onSuccess: () => toast.success(`Annual report sent to ${user.display_name}`),
                                onError: () => toast.error(`Failed to send annual report for ${user.display_name}`),
                              })
                            }
                          >
                            {sendAnnualReport.isPending && sendAnnualReport.variables === user.id ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : (
                              <Calendar className="size-4" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:text-destructive"
                            onClick={() => setDeleteTarget(user)}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {(data?.users ?? []).length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                        No users found
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage(page + 1)}
          >
            Next
          </Button>
        </div>
      )}

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete User</DialogTitle>
            <DialogDescription>
              This will permanently delete <strong>{deleteTarget?.display_name}</strong> ({deleteTarget?.email}) and all their data. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteUser.isPending}
            >
              {deleteUser.isPending ? "Deleting..." : "Delete User"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
