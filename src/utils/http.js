export const sendError = (res, error, fallbackMessage) => {
  const status = error.status || 500;
  res.status(status).json({
    message: error.status ? error.message : fallbackMessage,
  });
};
