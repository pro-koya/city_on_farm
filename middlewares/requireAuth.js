// middlewares/requireAuth.js
module.exports = function requireAuth(req, res, next) {
  if (req.session && req.session.user) return next();
  // 未ログインならログインへ（戻り先をつけても良い）
  res.redirect('/login');
};