export interface MenuItem {
  id: number;
  name: string;
  price: number;
  category: string;
  description: string;
  image_url: string;
}

export interface OrderItem {
  item: MenuItem;
  qty: number;
}

export interface Order {
  id: number;
  items: OrderItem[];
  total: number;
  status: string;
  createdAt: string;
}

export interface OrderResponse extends Order {
  createdAtTaipei: string;
}

export interface ApiDataResponse<T> {
  data: T;
}

export interface ApiErrorResponse {
  error: string;
  message?: string;
}
