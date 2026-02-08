import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Settings, Globe } from "lucide-react";

interface Service {
  id: number;
  categoryId: number;
  name: string;
  description: string | null;
  serviceType: string;
  provider: string | null;
  providerServiceId: number | null;
  price: string | null;
  rate: string | null;
  minQuantity: number;
  maxQuantity: number;
  isActive: boolean;
  totalOrders: number;
  totalRevenue: string;
  totalProfit: string;
}

interface Category {
  id: number;
  name: string;
  slug: string;
  type: string;
  isActive: boolean;
}

function formatNumber(num: string | number) {
  const n = typeof num === "string" ? parseFloat(num) : num;
  return n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

export default function ServicesPage() {
  const { data: services, isLoading: servicesLoading } = useQuery<Service[]>({
    queryKey: ["/api/services"],
  });

  const { data: categories, isLoading: catsLoading } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
  });

  const isLoading = servicesLoading || catsLoading;

  if (isLoading) {
    return (
      <div className="p-6 space-y-4" dir="rtl">
        <h1 className="text-2xl font-bold">الخدمات</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}><CardContent className="p-6"><Skeleton className="h-32 w-full" /></CardContent></Card>
          ))}
        </div>
      </div>
    );
  }

  const categoriesMap = new Map(categories?.map((c) => [c.id, c]) || []);
  const groupedServices = new Map<number, Service[]>();

  services?.forEach((svc) => {
    const existing = groupedServices.get(svc.categoryId) || [];
    existing.push(svc);
    groupedServices.set(svc.categoryId, existing);
  });

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center gap-3 flex-wrap">
        <Settings className="w-6 h-6" />
        <h1 className="text-2xl font-bold" data-testid="text-services-title">الخدمات</h1>
        <Badge variant="secondary">{services?.length || 0} خدمة</Badge>
      </div>

      {categories?.map((cat) => {
        const catServices = groupedServices.get(cat.id) || [];
        if (catServices.length === 0) return null;

        return (
          <div key={cat.id} className="space-y-3">
            <h2 className="text-lg font-semibold flex items-center gap-2 flex-wrap">
              {cat.name}
              <Badge variant="secondary" className="text-xs">
                {cat.type === "subscriptions" ? "اشتراكات" : "سوشل ميديا"}
              </Badge>
              <Badge variant={cat.isActive ? "default" : "destructive"} className="text-xs">
                {cat.isActive ? "مفعل" : "معطل"}
              </Badge>
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {catServices.map((svc) => (
                <Card key={svc.id} data-testid={`card-service-${svc.id}`}>
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <h3 className="font-semibold text-sm">{svc.name}</h3>
                      <div className="flex items-center gap-1">
                        {svc.serviceType === "custom" ? (
                          <Badge variant="outline" className="text-xs">خدمة خاصة</Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs">
                            <Globe className="w-3 h-3 ml-1" />
                            {svc.provider === "kd1s" ? "kd1s" : "amazing"}
                          </Badge>
                        )}
                        {!svc.isActive && <Badge variant="destructive" className="text-xs">معطل</Badge>}
                      </div>
                    </div>
                    {svc.description && (
                      <p className="text-xs text-muted-foreground">{svc.description}</p>
                    )}
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      {svc.serviceType === "custom" ? (
                        <div>
                          <span className="text-muted-foreground">السعر: </span>
                          <span>{formatNumber(svc.price || 0)} IQD</span>
                        </div>
                      ) : (
                        <>
                          <div>
                            <span className="text-muted-foreground">آيدي الخدمة: </span>
                            <span className="font-mono">{svc.providerServiceId}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">السعر/1000: </span>
                            <span>{svc.rate}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">الحدود: </span>
                            <span>{svc.minQuantity} - {formatNumber(svc.maxQuantity)}</span>
                          </div>
                        </>
                      )}
                      <div>
                        <span className="text-muted-foreground">الطلبات: </span>
                        <span>{svc.totalOrders}</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2 pt-1 border-t text-xs">
                      <span className="text-muted-foreground">الإيرادات: {formatNumber(svc.totalRevenue)} IQD</span>
                      <span className="text-green-600 dark:text-green-400 font-medium">
                        الأرباح: {formatNumber(svc.totalProfit)} IQD
                      </span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        );
      })}

      {(!services || services.length === 0) && (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            لا توجد خدمات بعد. أضف خدمات من خلال البوت باستخدام لوحة الأدمن.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
