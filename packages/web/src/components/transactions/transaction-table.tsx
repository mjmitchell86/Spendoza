import type { Transaction, Category } from "@spendoza/shared";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

function formatDate(dateStr: string) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

interface TransactionTableProps {
  transactions: Transaction[];
  categories: Category[];
  onCategoryChange: (transactionId: string, category: string | null) => void;
  showTypeColumn?: boolean;
}

export function TransactionTable({
  transactions,
  categories,
  onCategoryChange,
  showTypeColumn = true,
}: TransactionTableProps) {
  if (transactions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-muted-foreground">No transactions found.</p>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Date</TableHead>
          <TableHead>Description</TableHead>
          <TableHead>Amount</TableHead>
          <TableHead>Category</TableHead>
          {showTypeColumn && <TableHead>Type</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {transactions.map((txn) => (
          <TableRow key={txn.id}>
            <TableCell className="whitespace-nowrap">
              {formatDate(txn.date)}
            </TableCell>
            <TableCell className="max-w-[300px] truncate">
              {txn.description}
            </TableCell>
            <TableCell
              className={`font-mono whitespace-nowrap ${
                txn.type === "credit" ? "text-green-600" : "text-red-600"
              }`}
            >
              {txn.type === "credit" ? "+" : "-"}
              {formatCurrency(txn.amount)}
            </TableCell>
            <TableCell>
              <Select
                value={txn.ai_category ?? "__none__"}
                onValueChange={(value) =>
                  onCategoryChange(
                    txn.id,
                    value === "__none__" ? null : value
                  )
                }
              >
                <SelectTrigger className="h-8 w-[160px]">
                  <SelectValue placeholder="Uncategorized" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Uncategorized</SelectItem>
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.name}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </TableCell>
            {showTypeColumn && (
              <TableCell>
                <Badge
                  variant={txn.type === "credit" ? "default" : "secondary"}
                >
                  {txn.type}
                </Badge>
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
