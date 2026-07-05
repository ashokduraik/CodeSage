import express from "express";

const app = express();

/** Route matched by xrepo from frontend axios.get('/api/login'). */
app.get("/api/login", (_req, res) => {
  res.json({ ok: true });
});

export default app;
