exports.handler = async () => {
  const info = {
    hasHF_TOKEN: Boolean(process.env.HF_TOKEN),
    context: process.env.CONTEXT || null,  // production / deploy-preview / branch-deploy
    branch: process.env.BRANCH || null,
    netlify: process.env.NETLIFY === 'true'
  };
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(info)
  };
};
