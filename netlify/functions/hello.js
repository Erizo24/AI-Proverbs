// netlify/functions/hello.js
exports.handler = async () => ({
  statusCode: 200,
  headers: { "Content-Type": "text/plain" },
  body: "hello from netlify functions"
});
