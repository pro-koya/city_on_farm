// data/dashboardTestData.js
const { recentOrders } = require('./ordersTestData');

// 購入者ダッシュボード用
const orders = recentOrders.slice(0, 3);   // 最近の注文から3件
const recent = recentOrders.slice(0, 5);   // 最近見た商品代わりのサマリに流用してもOKなら
const notices = [
  { id:'n1', date: new Date().toISOString().slice(0,10), text:'夏のクーポン配布中（WELCOME10）' },
  { id:'n2', date: new Date().toISOString().slice(0,10), text:'冷蔵便の配送遅延のお知らせ' }
];

// 出品者ダッシュボード用（ダミー）
const listings = [
  { id:'l1', name:'朝採れレタス', stock: 24, price: 480, image:'/images/test-image.jpeg' },
  { id:'l2', name:'完熟トマト',   stock: 12, price: 980, image:'/images/test-image.jpeg' },
];
const trades = [
  { id:'t1', date: new Date().toISOString().slice(0,10), buyer:'レストランA', amount: 8200, status:'paid' },
  { id:'t2', date: new Date().toISOString().slice(0,10), buyer:'ビストロB',   amount: 4600, status:'shipped' }
];
const revenue = {
  thisMonth: 120000,
  lastMonth: 98000,
  byDay: [
    { date:'2025-06-01', amount: 4000 },
    { date:'2025-06-02', amount: 8200 },
    { date:'2025-06-03', amount: 12000 },
  ]
};

module.exports = { orders, recent, notices, listings, trades, revenue };