// types/index.ts
// Các interface dùng chung cho toàn bộ dự án TIME TECH

export interface Product {
  id: string;
  name: string;
  category: string;
  price: number; // giá VNĐ, ví dụ 1250000
  originalPrice?: number; // giá gốc nếu đang giảm giá
  description: string;
  specs: { label: string; value: string }[];
  images: string[]; // danh sách ảnh (dùng placeholder URL)
  rating: number; // 0 - 5
  reviewCount: number;
  stock: number;
  isNew?: boolean;
  isFeatured?: boolean;
}

export interface CartItem {
  productId: string;
  name: string;
  price: number;
  image: string;
  quantity: number;
  stock: number;
}

export type OrderStatus =
  | "Đang xử lý"
  | "Chờ thanh toán"
  | "Đang giao"
  | "Hoàn thành"
  | "Đã hủy";

export interface OrderItem {
  productId: string;
  name: string;
  price: number;
  image: string;
  quantity: number;
}

export interface Order {
  id: string;
  date: string;
  createdAt: string; // timestamp đầy đủ ISO, dùng để hiện giờ VN chính xác
  status: string;
  items: OrderItem[];
  subtotal: number;
  shippingFee: number;
  total: number;
  shippingAddress: string;
  paymentMethod: string;
}