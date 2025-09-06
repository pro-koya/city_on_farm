// data/ordersTestData.js
function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

/**
 * 統一スキーマ:
 * {
 *   id, orderNumber, date(YYYY-MM-DD), status: 'paid'|'shipped'|'delivered'|'cancelled',
 *   seller, total, hasIssues, hasReviewable,
 *   items: [{ name, qty, price, image }]
 * }
 */
const recentOrders = [
  {
    id: 'o1001',
    orderNumber: 'A-2025-0001',
    date: daysAgo(2),
    status: 'delivered',
    seller: '青木農園',
    total: 3480,
    hasIssues: false,
    hasReviewable: true,
    items: [
      { name: '朝採れレタス', qty: 2, price: 480, image: '/images/test-image.jpeg' },
      { name: '完熟トマト',   qty: 1, price: 1200, image: '/images/test-image.jpeg' },
      { name: '新じゃがいも', qty: 1, price: 1320, image: '/images/test-image.jpeg' },
    ]
  },
  {
    id: 'o1002',
    orderNumber: 'A-2025-0002',
    date: daysAgo(5),
    status: 'shipped',
    seller: 'みどりファーム',
    total: 9800,
    hasIssues: true,
    hasReviewable: false,
    items: [
      { name: '鳥飼ナス', qty: 5, price: 980, image: '/images/test-image.jpeg' }
    ]
  },
  {
    id: 'o1003',
    orderNumber: 'A-2025-0003',
    date: daysAgo(9),
    status: 'processing',
    seller: 'あおぞら農園',
    total: 15800,
    hasIssues: false,
    hasReviewable: false,
    items: [
      { name: 'オーガニックにんじん', qty: 10, price: 580, image: '/images/test-image.jpeg' },
      { name: '完熟トマト', qty: 5, price: 980, image: '/images/test-image.jpeg' }
    ]
  },
  {
    id: 'o1004',
    orderNumber: 'A-2025-0004',
    date: daysAgo(15),
    status: 'delivered',
    seller: '青木農園',
    total: 7200,
    hasIssues: false,
    hasReviewable: true,
    items: [
      { name: '朝採れレタス', qty: 6, price: 480, image: '/images/test-image.jpeg' },
      { name: '新じゃがいも', qty: 3, price: 1320, image: '/images/test-image.jpeg' },
    ]
  },
  {
    id: 'o1005',
    orderNumber: 'A-2025-0005',
    date: daysAgo(28),
    status: 'canceled',
    seller: 'みどりファーム',
    total: 2400,
    hasIssues: true,
    hasReviewable: false,
    items: [
      { name: '鳥飼ナス', qty: 2, price: 1200, image: '/images/test-image.jpeg' }
    ]
  }
];

module.exports = { recentOrders };