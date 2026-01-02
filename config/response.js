export const sendResponse = (
  res,
  { status = true, code = 200, message = "", data = null }
) => {
  return res.status(code).json({
    status,
    code,
    message,
    data,
  });
};
