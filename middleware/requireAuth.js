module.exports = (req, res, next) => {
  if (!req.session || !req.session.user) {
    return res.redirect(process.env.ADMIN_PATH);
  }
  next();
};
