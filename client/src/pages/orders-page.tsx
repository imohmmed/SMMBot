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
import { ShoppingCart } from "lucide-react";

interface Order {
  id: number;
  sequentialId: number | null;
  userId: number;
  serviceId: number;
  providerOrderId: string | null;
  provider: string;
  link: string;
  quantity: number;
  amount: string;
  cost: string;
  profit: string;
  status: string;
  createdAt: string;
}

function getOrderDisplayId(order: Order): string {
  if (order.provider === "custom" || order.provider === "subscription") {
    return order.sequentialId ? `#${order.sequentialId}` : `#${order.id}`;
  }
  return order.providerOrderId ? `#${order.providerOrderId}` : `#${order.id}`;
}

function getProviderLabel(provider: string): string {
  switch (provider) {
    case "kd1s": return "kd1s";
    case "amazing": return "amazing";
    case "custom": return "خدمة خاصة";
    case "subscription": return "اشتراك";
    default: return provider;
  }
}

function formatNumber(num: string | number) {
  const n = typeof num === "string" ? parseFloat(num) : num;
  return n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending: { label: "قيد الانتظار", variant: "secondary" },
  processing: { label: "جاري المعالجة", variant: "outline" },
  in_progress: { label: "قيد التنفيذ", variant: "default" },
  completed: { label: "مكتمل", variant: "default" },
  partial: { label: "مكتمل جزئياً", variant: "outline" },
  cancelled: { label: "ملغي", variant: "destructive" },
  refunded: { label: "مسترجع", variant: "destructive" },
};

export default function OrdersPage() {
  const { data: orders, isLoading } = useQuery<Order[]>({
    queryKey: ["/api/orders"],
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-4" dir="rtl">
        <h1 className="text-2xl font-bold">الطلبات</h1>
        <Card><CardContent className="p-6"><Skeleton className="h-64 w-full" /></CardContent></Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4" dir="rtl">
      <div className="flex items-center gap-3 flex-wrap">
        <ShoppingCart className="w-6 h-6" />
        <h1 className="text-2xl font-bold" data-testid="text-orders-title">الطلبات</h1>
        <Badge variant="secondary">{orders?.length || 0} طلب</Badge>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">#</TableHead>
                  <TableHead className="text-right">الموقع</TableHead>
                  <TableHead className="text-right">الرابط</TableHead>
                  <TableHead className="text-right">الكمية</TableHead>
                  <TableHead className="text-right">المبلغ</TableHead>
                  <TableHead className="text-right">التكلفة</TableHead>
                  <TableHead className="text-right">الربح</TableHead>
                  <TableHead className="text-right">الحالة</TableHead>
                  <TableHead className="text-right">التاريخ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders?.map((order) => {
                  const status = statusMap[order.status] || { label: order.status, variant: "secondary" as const };
                  return (
                    <TableRow key={order.id} data-testid={`row-order-${order.id}`}>
                      <TableCell className="font-mono">{getOrderDisplayId(order)}</TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {getProviderLabel(order.provider)}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate text-sm">{order.link}</TableCell>
                      <TableCell>{formatNumber(order.quantity)}</TableCell>
                      <TableCell>{formatNumber(order.amount)} IQD</TableCell>
                      <TableCell>{formatNumber(order.cost)} IQD</TableCell>
                      <TableCell className="text-green-600 dark:text-green-400 font-medium">
                        {formatNumber(order.profit)} IQD
                      </TableCell>
                      <TableCell>
                        <Badge variant={status.variant}>{status.label}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(order.createdAt).toLocaleDateString("ar-IQ")}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {(!orders || orders.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                      لا توجد طلبات بعد
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
