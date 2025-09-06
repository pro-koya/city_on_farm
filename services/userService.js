const bcrypt = require('bcrypt');
const pass = bcrypt.hashSync('testpass', 10)

// デモ用ユーザー（実運用はDBで管理） パスワード: P@ssw0rd!
const users = [
  {
    id: '123e4567-e89b-12d3-a456-426614174000',
    email: 'buy@test.com',
    passwordHash: pass,
    name: '山田 太郎',
    role: 'buyer'
  },
  {
    id: '355f8007-c964-4851-bd49-04d47414aeda',
    email: 'sell@test.com',
    passwordHash: pass,
    name: '佐藤 花子',
    role: 'seller'
  }
];

// ユーティリティ：新規ユーザー追加（開発用）
async function createUser({ id, email, password, name }) {
    const passwordHash = await bcrypt.hash(password, 12);
    const user = { id, email: email.toLowerCase(), passwordHash, name };
    users.push(user);
    return user;
}

function findById(id) {
    return users.find(u => u.id === id);
}

module.exports = { users, createUser, findById };