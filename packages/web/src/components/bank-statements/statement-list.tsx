import type { BankStatement, StatementStatus } from "@spendoza/shared";
import { RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const STATUS_CONFIG: Record<
  StatementStatus,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  uploaded: { label: "Uploaded", variant: "outline" },
  processing: { label: "Processing", variant: "default" },
  parsed: { label: "Parsed", variant: "secondary" },
  failed: { label: "Failed", variant: "destructive" },
};

const STEP_LABELS: Record<string, string> = {
  extract_text: "Reading PDF",
  extract_transactions: "Extracting transactions",
  classify_transactions: "Classifying",
  match_and_insert: "Matching & saving",
};

function formatDate(dateStr: string | null) {
  if (!dateStr) return "Pending";
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
  });
}

interface StatementListProps {
  statements: BankStatement[];
  onSelect: (statement: BankStatement) => void;
  selectedId: string | null;
}

export function StatementList({
  statements,
  onSelect,
  selectedId,
}: StatementListProps) {
  if (statements.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-muted-foreground">No bank statements uploaded.</p>
        <p className="text-sm text-muted-foreground">
          Upload your first statement to begin.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Bank</TableHead>
          <TableHead>Month</TableHead>
          <TableHead>Account</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {statements.map((stmt) => {
          const status = STATUS_CONFIG[stmt.status];
          return (
            <TableRow
              key={stmt.id}
              className={`cursor-pointer ${selectedId === stmt.id ? "bg-muted" : ""}`}
              onClick={() => onSelect(stmt)}
            >
              <TableCell className="font-medium">
                {stmt.bank_name ?? "Unknown Bank"}
              </TableCell>
              <TableCell>{formatDate(stmt.statement_month)}</TableCell>
              <TableCell>
                {stmt.is_shared_account ? (
                  <Badge variant="outline" className="text-xs">
                    {stmt.account_label ?? "Shared"}
                  </Badge>
                ) : (
                  <span className="text-muted-foreground">Personal</span>
                )}
              </TableCell>
              <TableCell>
                {stmt.status === "processing" ? (
                  <span className="inline-flex items-center gap-1.5">
                    <RefreshCw className="size-3 animate-spin text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">
                      {(stmt.parsed_data as any)?.retry_count > 0
                        ? `Retrying (${(stmt.parsed_data as any).retry_count}/2) — ${STEP_LABELS[(stmt.parsed_data as any)?.pipeline_step] ?? "Processing"}`
                        : STEP_LABELS[(stmt.parsed_data as any)?.pipeline_step] ?? "Processing"}
                    </span>
                  </span>
                ) : (
                  <Badge variant={status.variant}>{status.label}</Badge>
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
    </div>
  );
}
