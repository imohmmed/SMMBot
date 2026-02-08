import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Send, Image, Link, Users, Loader2, CheckCircle, XCircle } from "lucide-react";

interface User {
  id: number;
  telegramId: string;
  firstName: string;
}

export default function BroadcastPage() {
  const { toast } = useToast();
  const [message, setMessage] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [buttonText, setButtonText] = useState("");
  const [buttonUrl, setButtonUrl] = useState("");

  const { data: users } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  const broadcastMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/broadcast", {
        message,
        imageUrl: imageUrl || undefined,
        buttonText: buttonText || undefined,
        buttonUrl: buttonUrl || undefined,
      });
      return res.json();
    },
    onSuccess: (data: { sent: number; failed: number; total: number }) => {
      toast({
        title: "تم إرسال الإذاعة",
        description: `تم الإرسال: ${data.sent} | فشل: ${data.failed} | المجموع: ${data.total}`,
      });
      setMessage("");
      setImageUrl("");
      setButtonText("");
      setButtonUrl("");
    },
    onError: (error: Error) => {
      toast({
        title: "خطأ في الإرسال",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const canSend = message.trim() || imageUrl.trim();

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h1 className="text-2xl font-bold" data-testid="text-broadcast-title">الإذاعة الجماعية</h1>
        <Badge variant="secondary" data-testid="badge-user-count">
          <Users className="w-3 h-3 ml-1" />
          {users?.length || 0} عضو
        </Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Send className="w-4 h-4" />
                محتوى الرسالة
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="message">النص</Label>
                <Textarea
                  id="message"
                  placeholder="اكتب نص الإذاعة هنا... يدعم تنسيق Markdown"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="min-h-[120px] resize-y"
                  data-testid="input-broadcast-message"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="imageUrl" className="flex items-center gap-1">
                  <Image className="w-3 h-3" />
                  رابط الصورة (اختياري)
                </Label>
                <Input
                  id="imageUrl"
                  placeholder="https://example.com/image.jpg"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  dir="ltr"
                  data-testid="input-broadcast-image"
                />
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-1">
                  <Link className="w-3 h-3" />
                  زر مع رابط (اختياري)
                </Label>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    placeholder="نص الزر"
                    value={buttonText}
                    onChange={(e) => setButtonText(e.target.value)}
                    data-testid="input-broadcast-btn-text"
                  />
                  <Input
                    placeholder="https://example.com"
                    value={buttonUrl}
                    onChange={(e) => setButtonUrl(e.target.value)}
                    dir="ltr"
                    data-testid="input-broadcast-btn-url"
                  />
                </div>
              </div>

              <Button
                className="w-full"
                disabled={!canSend || broadcastMutation.isPending}
                onClick={() => broadcastMutation.mutate()}
                data-testid="button-send-broadcast"
              >
                {broadcastMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                    جاري الإرسال...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4 ml-2" />
                    إرسال الإذاعة لجميع الأعضاء
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">معاينة الرسالة</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-md bg-muted/50 p-4 space-y-3 min-h-[200px]" data-testid="preview-broadcast">
                {!message && !imageUrl ? (
                  <p className="text-muted-foreground text-sm text-center py-8">
                    ابدأ بكتابة الرسالة لمشاهدة المعاينة
                  </p>
                ) : (
                  <>
                    {imageUrl && (
                      <div className="rounded-md overflow-hidden bg-muted">
                        <img
                          src={imageUrl}
                          alt="معاينة"
                          className="w-full max-h-[200px] object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = "none";
                          }}
                          data-testid="img-broadcast-preview"
                        />
                      </div>
                    )}
                    {message && (
                      <p className="text-sm whitespace-pre-wrap" data-testid="text-broadcast-preview">
                        {message}
                      </p>
                    )}
                    {buttonText && buttonUrl && (
                      <div className="pt-2">
                        <Button variant="outline" size="sm" className="w-full" data-testid="button-preview-link">
                          <Link className="w-3 h-3 ml-1" />
                          {buttonText}
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          {broadcastMutation.isSuccess && broadcastMutation.data && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">نتيجة الإرسال</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm flex items-center gap-1">
                      <CheckCircle className="w-4 h-4 text-green-600" />
                      تم الإرسال
                    </span>
                    <span className="font-semibold" data-testid="text-sent-count">
                      {(broadcastMutation.data as any).sent}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm flex items-center gap-1">
                      <XCircle className="w-4 h-4 text-red-600" />
                      فشل
                    </span>
                    <span className="font-semibold" data-testid="text-failed-count">
                      {(broadcastMutation.data as any).failed}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm flex items-center gap-1">
                      <Users className="w-4 h-4" />
                      المجموع
                    </span>
                    <span className="font-semibold" data-testid="text-total-count">
                      {(broadcastMutation.data as any).total}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
