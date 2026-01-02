export const errorHandler = (err, req, res, next) => {
  console.error("API ERROR:", err);

  return res.status(err.statusCode || 500).json({
    status: false,
    code: err.statusCode || 500,
    message: err.message || "Internal server error",
    data: null,
  });
};
