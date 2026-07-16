// data/mockData.ts
import { Product, Order } from "@/types";

export function formatVND(amount: number): string {
  return amount.toLocaleString("vi-VN") + "đ";
}

export const STORE_NAME = "TIME TECH";
export const STORE_TAGLINE = "Gọn Gàng Mỗi Ngày, Tinh Tế Mọi Khoảnh Khắc";

export const categories = [
  "Đồ Dùng Văn Phòng",
  "Phụ Kiện Tóc",
  "Trang Trí Bàn Làm Việc",
  "Phụ Kiện Làm Đẹp",
];

export const products: Product[] = [
  {
    id: "p1",
    name: "Sổ Tay Bìa Da Cao Cấp A5",
    category: "Đồ Dùng Văn Phòng",
    price: 185000,
    originalPrice: 250000,
    description:
      "Sổ tay bìa da PU cao cấp, giấy dày 100gsm chống lem mực, dây buộc và ngăn đựng thẻ tiện lợi. Phù hợp ghi chú công việc, làm quà tặng.",
    specs: [
      { label: "Kích thước", value: "A5 (14.8 x 21cm)" },
      { label: "Số trang", value: "192 trang" },
      { label: "Chất liệu bìa", value: "Da PU" },
      { label: "Loại giấy", value: "Kem, định lượng 100gsm" },
    ],
    images: [
      "https://images.unsplash.com/photo-1531346680769-a1d79b57de5c?w=900&q=80",
      "https://images.unsplash.com/photo-1517971071642-34a2d3ecc9cd?w=900&q=80",
    ],
    rating: 4.7,
    reviewCount: 58,
    stock: 40,
    isNew: true,
    isFeatured: true,
  },
  {
    id: "p2",
    name: "Bộ Kẹp Tóc Ngọc Trai Vintage",
    category: "Phụ Kiện Tóc",
    price: 79000,
    originalPrice: 120000,
    description:
      "Bộ kẹp tóc đính ngọc trai phong cách vintage, chất liệu hợp kim mạ vàng không gỉ, giữ tóc chắc mà không đau da đầu.",
    specs: [
      { label: "Số lượng", value: "5 chiếc/bộ" },
      { label: "Chất liệu", value: "Hợp kim mạ vàng + ngọc trai nhân tạo" },
      { label: "Phong cách", value: "Vintage / Y2K" },
    ],
    images: [
      "https://images.unsplash.com/photo-1564624791497-06ce5d1643ec?w=900&q=80",
    ],
    rating: 4.6,
    reviewCount: 94,
    stock: 60,
    isNew: true,
    isFeatured: true,
  },
  {
    id: "p3",
    name: "Kẹp Tóc Càng Cua Bản To",
    category: "Phụ Kiện Tóc",
    price: 45000,
    description:
      "Kẹp tóc càng cua bản to, lực kẹp vừa phải, giữ được tóc dày mà không làm gãy tóc, nhiều màu trơn dễ phối đồ.",
    specs: [
      { label: "Chất liệu", value: "Nhựa acetate cao cấp" },
      { label: "Kích thước", value: "10cm" },
      { label: "Màu sắc", value: "Nâu / Đen / Be" },
    ],
    images: [
      "https://images.unsplash.com/photo-1522338242992-e1a54906a8da?w=900&q=80",
    ],
    rating: 4.4,
    reviewCount: 37,
    stock: 80,
  },
  {
    id: "p4",
    name: "Bút Ký Kim Loại Cao Cấp",
    category: "Đồ Dùng Văn Phòng",
    price: 210000,
    description:
      "Bút ký thân kim loại mạ chrome sang trọng, ngòi bi mực đen êm tay, hộp đựng kèm theo phù hợp làm quà tặng đối tác.",
    specs: [
      { label: "Chất liệu", value: "Kim loại mạ chrome" },
      { label: "Loại mực", value: "Bi, màu đen" },
      { label: "Kèm theo", value: "Hộp quà cao cấp" },
    ],
    images: [
      "https://images.unsplash.com/photo-1473186505569-9c61870c11f9?w=900&q=80",
    ],
    rating: 4.8,
    reviewCount: 22,
    stock: 30,
    isFeatured: true,
  },
  {
    id: "p5",
    name: "Giá Đỡ Điện Thoại Để Bàn Gỗ Sồi",
    category: "Trang Trí Bàn Làm Việc",
    price: 129000,
    description:
      "Giá đỡ điện thoại bằng gỗ sồi tự nhiên, thiết kế tối giản, tương thích mọi dòng điện thoại, tăng thẩm mỹ bàn làm việc.",
    specs: [
      { label: "Chất liệu", value: "Gỗ sồi tự nhiên" },
      { label: "Tương thích", value: "Mọi dòng smartphone" },
    ],
    images: [
      "https://images.unsplash.com/photo-1586953208448-b95a79798f07?w=900&q=80",
    ],
    rating: 4.5,
    reviewCount: 49,
    stock: 55,
    isNew: true,
  },
  {
    id: "p6",
    name: "Băng Đô Lụa Buộc Tóc",
    category: "Phụ Kiện Tóc",
    price: 55000,
    originalPrice: 75000,
    description:
      "Băng đô chất liệu lụa mềm mại, bản to giữ nếp tóc gọn gàng cả ngày, phù hợp trang điểm, skincare hoặc đi chơi.",
    specs: [
      { label: "Chất liệu", value: "Lụa satin" },
      { label: "Kích thước", value: "Bản 6cm" },
    ],
    images: [
      "https://images.unsplash.com/photo-1595341888016-a392ef81b7de?w=900&q=80",
    ],
    rating: 4.3,
    reviewCount: 18,
    stock: 70,
  },
  {
    id: "p7",
    name: "Khay Đựng Văn Phòng Phẩm Đa Năng",
    category: "Đồ Dùng Văn Phòng",
    price: 165000,
    description:
      "Khay gỗ nhiều ngăn sắp xếp bút, ghim, note, thẻ nhớ gọn gàng, giúp bàn làm việc luôn ngăn nắp chuyên nghiệp.",
    specs: [
      { label: "Chất liệu", value: "Gỗ MDF phủ sơn" },
      { label: "Số ngăn", value: "5 ngăn" },
    ],
    images: [
      "https://images.unsplash.com/photo-1544816155-12df9643f363?w=900&q=80",
    ],
    rating: 4.6,
    reviewCount: 31,
    stock: 25,
    isFeatured: true,
  },
  {
    id: "p8",
    name: "Kẹp Tóc Mini Cài Bên (Bộ 10)",
    category: "Phụ Kiện Tóc",
    price: 39000,
    description:
      "Bộ 10 kẹp tóc mini nhiều màu, dễ dàng tạo kiểu tóc mái hoặc buộc gọn tóc con, chất liệu nhẹ không gây khó chịu.",
    specs: [
      { label: "Số lượng", value: "10 chiếc/bộ" },
      { label: "Chất liệu", value: "Hợp kim phủ màu" },
    ],
    images: [
      "https://images.unsplash.com/photo-1519699047748-de8e457a634e?w=900&q=80",
    ],
    rating: 4.2,
    reviewCount: 63,
    stock: 90,
    isNew: true,
  },
  {
    id: "p9",
    name: "Đèn Bàn LED Cảm Ứng Mini",
    category: "Trang Trí Bàn Làm Việc",
    price: 245000,
    originalPrice: 320000,
    description:
      "Đèn bàn LED cảm ứng 3 mức sáng, sạc USB tiện lợi, thiết kế gọn nhẹ phù hợp bàn học và bàn làm việc.",
    specs: [
      { label: "Nguồn sáng", value: "LED, 3 mức độ sáng" },
      { label: "Sạc", value: "USB-C" },
    ],
    images: [
      "https://images.unsplash.com/photo-1507473885765-e6ed057f782c?w=900&q=80",
    ],
    rating: 4.7,
    reviewCount: 44,
    stock: 35,
    isFeatured: true,
  },
  {
    id: "p10",
    name: "Gương Cầm Tay Bỏ Túi 2 Mặt",
    category: "Phụ Kiện Làm Đẹp",
    price: 69000,
    description:
      "Gương hai mặt (thường và phóng đại 2x), khung nhựa cao cấp gọn nhẹ, tiện mang theo trang điểm khi ra ngoài.",
    specs: [
      { label: "Kích thước", value: "8cm đường kính" },
      { label: "Loại gương", value: "2 mặt, phóng đại 2x" },
    ],
    images: [
      "https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=900&q=80",
    ],
    rating: 4.4,
    reviewCount: 29,
    stock: 50,
  },
  {
    id: "p11",
    name: "Sổ Planner Kế Hoạch Tuần",
    category: "Đồ Dùng Văn Phòng",
    price: 95000,
    description:
      "Sổ lên kế hoạch theo tuần, có phần checklist công việc, mục tiêu và ghi chú, giúp quản lý thời gian hiệu quả.",
    specs: [
      { label: "Kích thước", value: "A5" },
      { label: "Thời lượng", value: "Không giới hạn ngày (undated)" },
    ],
    images: [
      "https://images.unsplash.com/photo-1517842645767-c639042777db?w=900&q=80",
    ],
    rating: 4.5,
    reviewCount: 52,
    stock: 45,
    isNew: true,
  },
  {
    id: "p12",
    name: "Set Dây Cột Tóc Cotton (6 chiếc)",
    category: "Phụ Kiện Tóc",
    price: 35000,
    description:
      "Dây cột tóc chất liệu cotton bọc, co giãn tốt, không làm gãy tóc, set nhiều màu phối đồ mỗi ngày.",
    specs: [
      { label: "Số lượng", value: "6 chiếc/bộ" },
      { label: "Chất liệu", value: "Cotton bọc dây thun" },
    ],
    images: [
      "https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?w=900&q=80",
    ],
    rating: 4.3,
    reviewCount: 21,
    stock: 100,
  },
];

export const orders: Order[] = [
  {
    id: "DH20260701",
    date: "2026-07-01",
    createdAt: "2026-07-01T09:00:00.000Z",
    status: "Hoàn thành",
    items: [
      { productId: "p2", name: "Bộ Kẹp Tóc Ngọc Trai Vintage", price: 79000, image: products[1].images[0], quantity: 1 },
      { productId: "p1", name: "Sổ Tay Bìa Da Cao Cấp A5", price: 185000, image: products[0].images[0], quantity: 1 },
    ],
    subtotal: 264000,
    shippingFee: 25000,
    total: 289000,
    shippingAddress: "12 Nguyễn Huệ, Quận 1, TP. Hồ Chí Minh",
    paymentMethod: "Thanh toán khi nhận hàng (COD)",
  },
  {
    id: "DH20260710",
    date: "2026-07-10",
    createdAt: "2026-07-10T14:30:00.000Z",
    status: "Đang giao",
    items: [
      { productId: "p9", name: "Đèn Bàn LED Cảm Ứng Mini", price: 245000, image: products[8].images[0], quantity: 1 },
    ],
    subtotal: 245000,
    shippingFee: 25000,
    total: 270000,
    shippingAddress: "12 Nguyễn Huệ, Quận 1, TP. Hồ Chí Minh",
    paymentMethod: "Chuyển khoản ngân hàng",
  },
];

export function getProductById(id: string) {
  return products.find((p) => p.id === id);
}

export const mockOrders = orders;