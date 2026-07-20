import express from "express";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Supabase Config endpoints
  const CONFIG_FILE = path.join(process.cwd(), 'supabase_config.json');

  app.get("/api/supabase-config", (req, res) => {
    try {
      if (fs.existsSync(CONFIG_FILE)) {
        const data = fs.readFileSync(CONFIG_FILE, 'utf-8');
        const config = JSON.parse(data);
        return res.json({
          url: config.url || '',
          key: config.key || ''
        });
      }
    } catch (e) {
      console.error('Error reading supabase_config.json:', e);
    }

    // Fallback to env variables if file does not exist
    return res.json({
      url: process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '',
      key: process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || ''
    });
  });

  app.post("/api/supabase-config", (req, res) => {
    try {
      const { url, key } = req.body;
      const config = { url: url || '', key: key || '' };
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
      return res.json({ success: true, config });
    } catch (e) {
      console.error('Error writing supabase_config.json:', e);
      return res.status(500).json({ error: 'Failed to save configuration' });
    }
  });

  app.delete("/api/supabase-config", (req, res) => {
    try {
      if (fs.existsSync(CONFIG_FILE)) {
        fs.unlinkSync(CONFIG_FILE);
      }
      return res.json({ success: true });
    } catch (e) {
      console.error('Error deleting supabase_config.json:', e);
      return res.status(500).json({ error: 'Failed to delete configuration' });
    }
  });

  // API routes FIRST
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { 
        middlewareMode: true,
        hmr: false // Disable HMR to prevent websocket connection errors in this proxy environment
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
