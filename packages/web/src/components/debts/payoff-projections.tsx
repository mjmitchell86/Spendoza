import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useDebtProjections } from "@/hooks/use-debts";
import { formatCurrency } from "@/components/goals/goal-card";
import type { DebtPayoffStrategy } from "@spendoza/shared";

export function PayoffProjections({
  entityType = "user",
}: {
  entityType?: "user" | "household";
}) {
  const [extraPayment, setExtraPayment] = useState(0);
  const { data, isLoading, error } = useDebtProjections(
    entityType,
    extraPayment
  );

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <RefreshCw className="size-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return null;
  }

  const { avalanche, snowball } = data;

  const interestSaved = Math.abs(snowball.total_interest - avalanche.total_interest);
  const avalancheWins = avalanche.total_interest <= snowball.total_interest;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Payoff Strategies</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {/* Extra Payment Input */}
        <div className="flex items-end gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="extra_payment">Extra Monthly Payment</Label>
            <Input
              id="extra_payment"
              type="number"
              min="0"
              step="10"
              value={extraPayment || ""}
              onChange={(e) =>
                setExtraPayment(parseFloat(e.target.value) || 0)
              }
              placeholder="0.00"
              className="w-40"
            />
          </div>
          {interestSaved > 0 && (
            <p className="text-sm text-muted-foreground">
              {avalancheWins ? "Avalanche" : "Snowball"} saves{" "}
              <span className="font-semibold text-green-600">
                {formatCurrency(interestSaved)}
              </span>{" "}
              in interest
            </p>
          )}
        </div>

        {/* Strategy Tabs */}
        <Tabs defaultValue="avalanche">
          <TabsList>
            <TabsTrigger value="avalanche">
              Avalanche (Highest Rate First)
              {avalancheWins && (
                <Badge variant="secondary" className="ml-2 text-xs">
                  Recommended
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="snowball">
              Snowball (Lowest Balance First)
              {!avalancheWins && (
                <Badge variant="secondary" className="ml-2 text-xs">
                  Recommended
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="avalanche">
            <StrategyTable strategy={avalanche} />
          </TabsContent>

          <TabsContent value="snowball">
            <StrategyTable strategy={snowball} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function StrategyTable({ strategy }: { strategy: DebtPayoffStrategy }) {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8">#</TableHead>
            <TableHead>Debt</TableHead>
            <TableHead className="text-right">Balance</TableHead>
            <TableHead className="text-right">Rate</TableHead>
            <TableHead className="text-right">Months</TableHead>
            <TableHead className="text-right">Total Interest</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {strategy.debts.map((d, i) => (
            <TableRow key={d.debt_id}>
              <TableCell className="text-muted-foreground">{i + 1}</TableCell>
              <TableCell className="font-medium">{d.debt_name}</TableCell>
              <TableCell className="text-right">
                {formatCurrency(d.current_balance)}
              </TableCell>
              <TableCell className="text-right">{d.interest_rate}%</TableCell>
              <TableCell className="text-right">{d.months_to_payoff}</TableCell>
              <TableCell className="text-right">
                {formatCurrency(d.total_interest)}
              </TableCell>
            </TableRow>
          ))}
          {/* Summary Row */}
          <TableRow className="border-t-2 font-semibold">
            <TableCell colSpan={4} className="text-right">
              Total
            </TableCell>
            <TableCell className="text-right">
              {strategy.total_months} months
            </TableCell>
            <TableCell className="text-right">
              {formatCurrency(strategy.total_interest)}
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}
