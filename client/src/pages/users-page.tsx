import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Users } from "lucide-react";

interface User {
  id: number;
  telegramId: string;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  balance: string;
  totalSpent: string;
  totalDeposits: string;
  totalOrders: number;
  isAdmin: boolean;
  discount: number;
  createdAt: string;
}

function formatNumber(num: string | number) {
  const n = typeof num === "string" ? parseFloat(num) : num;
  return n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

export default function UsersPage() {
  const { data: users, isLoading } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-4" dir="rtl">
        <h1 className="text-2xl font-bold">الأعضاء</h1>
        <Card><CardContent className="p-6"><Skeleton className="h-64 w-full" /></CardContent></Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4" dir="rtl">
      <div className="flex items-center gap-3 flex-wrap">
        <Users className="w-6 h-6" />
        <h1 className="text-2xl font-bold" data-testid="text-users-title">الأعضاء</h1>
        <Badge variant="secondary">{users?.length || 0} عضو</Badge>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">الاسم</TableHead>
                  <TableHead className="text-right">الآيدي</TableHead>
                  <TableHead className="text-right">اليوزر</TableHead>
                  <TableHead className="text-right">الرصيد</TableHead>
                  <TableHead className="text-right">المصروفات</TableHead>
                  <TableHead className="text-right">الطلبات</TableHead>
                  <TableHead className="text-right">الخصم</TableHead>
                  <TableHead className="text-right">الحالة</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users?.map((user) => (
                  <TableRow key={user.id} data-testid={`row-user-${user.id}`}>
                    <TableCell className="font-medium">
                      {user.firstName || ""} {user.lastName || ""}
                    </TableCell>
                    <TableCell className="font-mono text-sm">{user.telegramId}</TableCell>
                    <TableCell>{user.username ? `@${user.username}` : "-"}</TableCell>
                    <TableCell>{formatNumber(user.balance)} IQD</TableCell>
                    <TableCell>{formatNumber(user.totalSpent)} IQD</TableCell>
                    <TableCell>{user.totalOrders}</TableCell>
                    <TableCell>
                      {user.discount > 0 ? (
                        <Badge variant="outline">{user.discount}%</Badge>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {user.isAdmin && <Badge variant="default">أدمن</Badge>}
                    </TableCell>
                  </TableRow>
                ))}
                {(!users || users.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      لا يوجد أعضاء بعد
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
