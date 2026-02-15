import axios from "axios";

interface SMMService {
  service: number;
  name: string;
  type: string;
  category: string;
  rate: string;
  min: string;
  max: string;
  refill?: boolean;
  cancel?: boolean;
}

interface SMMOrderResult {
  order?: string;
  error?: string;
}

interface SMMStatusResult {
  charge?: string;
  start_count?: string;
  status?: string;
  remains?: string;
  currency?: string;
  error?: string;
}

interface SMMBalanceResult {
  balance?: string;
  currency?: string;
  error?: string;
}

type Provider = "kd1s" | "amazing";

function getConfig(provider: Provider) {
  if (provider === "kd1s") {
    return {
      url: process.env.KD1S_API_URL || "https://kd1s.com/api/v2",
      key: process.env.KD1S_API_KEY || "",
    };
  }
  return {
    url: process.env.AMAZING_API_URL || "https://amazingsmm.com/api/v2",
    key: process.env.AMAZING_API_KEY || "",
  };
}

async function apiCall(provider: Provider, params: Record<string, any>): Promise<any> {
  const config = getConfig(provider);
  const data = new URLSearchParams({ key: config.key, ...params });

  try {
    const response = await axios.post(config.url, data.toString(), {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      timeout: 30000,
    });
    return response.data;
  } catch (error: any) {
    console.error(`SMM API Error (${provider}):`, error.message);
    return { error: error.message };
  }
}

export async function getBalance(provider: Provider): Promise<SMMBalanceResult> {
  return apiCall(provider, { action: "balance" });
}

export async function getServices(provider: Provider): Promise<SMMService[]> {
  const config = getConfig(provider);
  console.log(`[getServices] Provider: ${provider}, URL: ${config.url}, Key: ${config.key ? config.key.substring(0, 5) + '...' : 'MISSING'}`);
  const result = await apiCall(provider, { action: "services" });
  console.log(`[getServices] Result type: ${typeof result}, isArray: ${Array.isArray(result)}, length: ${Array.isArray(result) ? result.length : 'N/A'}`);
  if (!Array.isArray(result)) {
    console.log(`[getServices] Non-array result:`, JSON.stringify(result).substring(0, 200));
  }
  if (Array.isArray(result)) return result;
  return [];
}

export async function getServiceInfo(provider: Provider, serviceId: number): Promise<SMMService | null> {
  console.log(`[getServiceInfo] Looking for service ${serviceId} on ${provider}`);
  const allServices = await getServices(provider);
  console.log(`[getServiceInfo] Got ${allServices.length} services from ${provider}`);
  const found = allServices.find(s => Number(s.service) === Number(serviceId));
  console.log(`[getServiceInfo] Found: ${found ? 'YES - ' + found.name : 'NO'}`);
  return found || null;
}

export async function placeOrder(
  provider: Provider,
  serviceId: number,
  link: string,
  quantity: number
): Promise<SMMOrderResult> {
  return apiCall(provider, {
    action: "add",
    service: serviceId.toString(),
    link,
    quantity: quantity.toString(),
  });
}

export async function getOrderStatus(provider: Provider, orderId: string): Promise<SMMStatusResult> {
  return apiCall(provider, {
    action: "status",
    order: orderId,
  });
}

export async function cancelOrder(provider: Provider, orderId: string): Promise<any> {
  return apiCall(provider, {
    action: "cancel",
    order: orderId,
  });
}
