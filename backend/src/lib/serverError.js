/**
 * Log the real error internally and return a safe generic message to the client.
 * Use this in every catch block instead of forwarding err.message directly.
 */
function serverError(res, err, message = 'An unexpected error occurred.', status = 500) {
  console.error('[server error]', err?.message ?? err);
  return res.status(status).json({ error: message });
}

module.exports = serverError;
