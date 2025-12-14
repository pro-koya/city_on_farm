// middlewares/requireRole.js
module.exports = function requireRole(role){
  return (req, res, next) => {
    const currentRole = (req.session.user && req.session.user.roles) || null;
    if (currentRole && currentRole.includes(role)) return next();
    return res.status(403).render('./errors/403', { title: 'アクセス権限がありません' });
  };
};