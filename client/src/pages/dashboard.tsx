import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, ShoppingCart, DollarSign, TrendingUp, Globe, BarChart3 } from "lucide-react";

interface Stats {
  userCount: number;
  totalBalance: number;
  totalDeposits: number;
  profitMargin: string;
  orders: { total: number; totalAmount: string; totalProfit: string };
  kd1s: { total: number; totalAmount: string; totalProfit: string };
  amazing: { total: number; totalAmount: string; totalProfit: string };
  customSmm: { total: number; totalAmount: string; totalProfit: string };
  subscriptions: { total: number; totalAmount: string; totalProfit: string };
}

function formatNumber(num: number | string) {
  const n = typeof num === "string" ? parseFloat(num) : num;
  if (isNaN(n)) return "0";
  return n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  color,
}: {
  title: string;
  value: string;
  subtitle?: string;
  icon: any;
  color: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className={`flex items-center justify-center w-10 h-10 rounded-md ${color}`}>
            <Icon className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-xl font-bold" data-testid={`stat-${title}`}>{value}</p>
            {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ProviderCard({
  name,
  stats,
}: {
  name: string;
  stats: { total: number; totalAmount: string; totalProfit: string };
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Globe className="w-4 h-4" />
          {name}
        </CardTitle>
        <Badge variant="secondary">{stats.total} طلب</Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-muted-foreground">المبالغ</span>
          <span className="text-sm font-semibold">{formatNumber(stats.totalAmount)} IQD</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-muted-foreground">الأرباح</span>
          <span className="text-sm font-semibold text-green-600 dark:text-green-400">{formatNumber(stats.totalProfit)} IQD</span>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { data: stats, isLoading } = useQuery<Stats>({
    queryKey: ["/api/stats"],
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-6" dir="rtl">
        <h1 className="text-2xl font-bold">لوحة التحكم</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <Skeleton className="h-16 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (!stats) return null;

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-bold" data-testid="text-dashboard-title">لوحة التحكم</h1>
        <Badge variant="outline" className="text-sm">
          نسبة الأرباح: {stats.profitMargin}%
        </Badge>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="الأعضاء"
          value={formatNumber(stats.userCount)}
          icon={Users}
          color="bg-blue-600"
        />
        <StatCard
          title="إجمالي الطلبات"
          value={formatNumber(stats.orders.total)}
          subtitle={`${formatNumber(stats.orders.totalAmount)} IQD`}
          icon={ShoppingCart}
          color="bg-purple-600"
        />
        <StatCard
          title="إجمالي الأرباح"
          value={`${formatNumber(stats.orders.totalProfit)} IQD`}
          icon={TrendingUp}
          color="bg-green-600"
        />
        <StatCard
          title="الأرصدة الحالية"
          value={`${formatNumber(stats.totalBalance)} IQD`}
          subtitle={`إيداعات: ${formatNumber(stats.totalDeposits)} IQD`}
          icon={DollarSign}
          color="bg-amber-600"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <ProviderCard name="kd1s.com" stats={stats.kd1s || { total: 0, totalAmount: "0", totalProfit: "0" }} />
        <ProviderCard name="amazingsmm.com" stats={stats.amazing || { total: 0, totalAmount: "0", totalProfit: "0" }} />
        <ProviderCard name="خدمات خاصة" stats={stats.customSmm || { total: 0, totalAmount: "0", totalProfit: "0" }} />
        <ProviderCard name="الاشتراكات" stats={stats.subscriptions || { total: 0, totalAmount: "0", totalProfit: "0" }} />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center gap-2 pb-2">
          <BarChart3 className="w-5 h-5" />
          <CardTitle className="text-base">ملخص عام</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="text-center p-4 rounded-md bg-muted/50">
              <p className="text-sm text-muted-foreground">مجموع الإيداعات</p>
              <p className="text-lg font-bold">{formatNumber(stats.totalDeposits)} IQD</p>
            </div>
            <div className="text-center p-4 rounded-md bg-muted/50">
              <p className="text-sm text-muted-foreground">مجموع الطلبات</p>
              <p className="text-lg font-bold">{formatNumber(stats.orders.totalAmount)} IQD</p>
            </div>
            <div className="text-center p-4 rounded-md bg-muted/50">
              <p className="text-sm text-muted-foreground">صافي الأرباح</p>
              <p className="text-lg font-bold text-green-600 dark:text-green-400">{formatNumber(stats.orders.totalProfit)} IQD</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
