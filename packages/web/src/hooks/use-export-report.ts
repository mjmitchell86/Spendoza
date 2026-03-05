import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiClientBlob } from "@/lib/api";

type ExportArg = string | { from_date: string; to_date: string } | undefined;

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function buildParams(arg: ExportArg): string {
  if (!arg) return "";
  if (typeof arg === "string") return `?month=${arg}`;
  return `?from_date=${arg.from_date}&to_date=${arg.to_date}`;
}

function buildFilenameSlug(arg: ExportArg): string {
  if (!arg) return "current";
  if (typeof arg === "string") return arg.slice(0, 7);
  return `${arg.from_date.slice(0, 7)}-to-${arg.to_date.slice(0, 7)}`;
}

export function useExportPersonalReport() {
  return useMutation({
    mutationFn: async (arg?: ExportArg) => {
      const params = buildParams(arg);
      const blob = await apiClientBlob(`/reports/export/personal${params}`);
      const filename = `spendoza-report-${buildFilenameSlug(arg)}.pdf`;
      downloadBlob(blob, filename);
    },
    onSuccess: () => {
      toast.success("PDF report downloaded");
    },
    onError: () => {
      toast.error("Failed to export PDF report. Please try again.");
    },
  });
}

export function useExportHouseholdReport() {
  return useMutation({
    mutationFn: async (arg?: ExportArg) => {
      const params = buildParams(arg);
      const blob = await apiClientBlob(`/reports/export/household${params}`);
      const filename = `spendoza-household-report-${buildFilenameSlug(arg)}.pdf`;
      downloadBlob(blob, filename);
    },
    onSuccess: () => {
      toast.success("Household PDF report downloaded");
    },
    onError: () => {
      toast.error("Failed to export household PDF report. Please try again.");
    },
  });
}
