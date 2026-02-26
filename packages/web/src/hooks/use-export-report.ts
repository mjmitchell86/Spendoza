import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiClientBlob } from "@/lib/api";

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

export function useExportPersonalReport() {
  return useMutation({
    mutationFn: async (month?: string) => {
      const params = month ? `?month=${month}` : "";
      const blob = await apiClientBlob(`/reports/export/personal${params}`);
      const filename = `spendoza-report-${month?.slice(0, 7) ?? "current"}.pdf`;
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
    mutationFn: async (month?: string) => {
      const params = month ? `?month=${month}` : "";
      const blob = await apiClientBlob(`/reports/export/household${params}`);
      const filename = `spendoza-household-report-${month?.slice(0, 7) ?? "current"}.pdf`;
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
