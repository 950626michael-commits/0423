export interface MenuItem {
  id: number;
  name: string;
  price: number;
  category: string;
  description: string;
  image_url: string;
}

export interface User {
  id: number;
  email: string;
  name: string;
  password: string;
}

export interface OrderItem {
  item: MenuItem;
  qty: number;
}

export interface Order {
  id: number;
  userId: number;
  items: OrderItem[];
  total: number;
  status: "pending" | "submitted";
  createdAt: string;
  submittedAt?: string;
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
