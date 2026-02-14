import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Wallet } from "lucide-react";

interface DepositUser {
  telegramId: string;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
}

interface Deposit {
  id: number;
  userId: number;
  amount: string;
  method: string;
  status: string;
  screenshotFileId: string | null;
  adminNote: string | null;
  approvedBy: number | null;
  createdAt: string;
  user: DepositUser | null;
}

function formatNumber(num: string | number) {
  const n = typeof num === "string" ? parseFloat(num) : num;
  return n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending: { label: "قيد الانتظار", variant: "secondary" },
  approved: { label: "تمت الموافقة", variant: "default" },
  rejected: { label: "مرفوض", variant: "destructive" },
};

export default function DepositsPage() {
  const { data: deposits, isLoading } = useQuery<Deposit[]>({
    queryKey: ["/api/deposits"],
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-4" dir="rtl">
        <h1 className="text-2xl font-bold">الإيداعات</h1>
        <Card><CardContent className="p-6"><Skeleton className="h-64 w-full" /></CardContent></Card>
      </div>
    );
  }

  const pendingCount = deposits?.filter(d => d.status === "pending").length || 0;
  const approvedCount = deposits?.filter(d => d.status === "approved").length || 0;
  const rejectedCount = deposits?.filter(d => d.status === "rejected").length || 0;
  const totalApproved = deposits
    ?.filter(d => d.status === "approved")
    .reduce((sum, d) => sum + parseFloat(d.amount), 0) || 0;

  return (
    <div className="p-6 space-y-4" dir="rtl">
      <div className="flex items-center gap-3 flex-wrap">
        <Wallet className="w-6 h-6" />
        <h1 className="text-2xl font-bold" data-testid="text-deposits-title">الإيداعات</h1>
        <Badge variant="secondary">{deposits?.length || 0} إيداع</Badge>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-sm text-muted-foreground">المجموع</p>
            <p className="text-lg font-bold" data-testid="text-total-deposits">{deposits?.length || 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-sm text-muted-foreground">قيد الانتظار</p>
            <p className="text-lg font-bold text-amber-600" data-testid="text-pending-deposits">{pendingCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-sm text-muted-foreground">تمت الموافقة</p>
            <p className="text-lg font-bold text-green-600 dark:text-green-400" data-testid="text-approved-deposits">{approvedCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-sm text-muted-foreground">إجمالي المعتمد</p>
            <p className="text-lg font-bold" data-testid="text-total-approved-amount">{formatNumber(totalApproved)} IQD</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">#</TableHead>
                  <TableHead className="text-right">المستخدم</TableHead>
                  <TableHead className="text-right">الآيدي</TableHead>
                  <TableHead className="text-right">المبلغ</TableHead>
                  <TableHead className="text-right">الطريقة</TableHead>
                  <TableHead className="text-right">الحالة</TableHead>
                  <TableHead className="text-right">التاريخ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deposits?.map((deposit) => {
                  const status = statusMap[deposit.status] || { label: deposit.status, variant: "secondary" as const };
                  return (
                    <TableRow key={deposit.id} data-testid={`row-deposit-${deposit.id}`}>
                      <TableCell className="font-mono">#{deposit.id}</TableCell>
                      <TableCell className="font-medium">
                        {deposit.user
                          ? `${deposit.user.firstName || ""} ${deposit.user.lastName || ""}`.trim() || "-"
                          : "-"
                        }
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {deposit.user?.telegramId || "-"}
                      </TableCell>
                      <TableCell className="font-semibold">{formatNumber(deposit.amount)} IQD</TableCell>
                      <TableCell>
                        <Badge variant="outline">{deposit.method}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={status.variant}>{status.label}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(deposit.createdAt).toLocaleDateString("ar-IQ")}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {(!deposits || deposits.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      لا توجد إيداعات بعد
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
