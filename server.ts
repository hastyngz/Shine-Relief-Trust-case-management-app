import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { processAIChat, AIChatRequest } from './src/server/aiService';

async function startServer() {
  const app = express();
  const PORT = 3000;

  // JSON payload parser for requests
  app.use(express.json({ limit: '10mb' }));

  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  // Secure SHINE AI Assistant endpoint
  app.post('/api/ai/chat', async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      const staffUserHeader = req.headers['x-staff-user'] as string | undefined;

      let staffUser = req.body.staffUser;
      if (!staffUser && staffUserHeader) {
        try {
          staffUser = JSON.parse(staffUserHeader);
        } catch (e) {
          // ignore parse error
        }
      }

      // Check for authentication
      if (!authHeader && !staffUser?.uid) {
        return res.status(401).json({
          success: false,
          reply: 'Authentication required. Please sign in to SHINE Relief Trust.',
          errorMessage: 'Missing authentication credentials.',
        });
      }

      // Prepare request payload
      const chatPayload: AIChatRequest = {
        message: req.body.message || '',
        history: req.body.history || [],
        context: req.body.context,
        dbSnapshot: req.body.dbSnapshot,
        staffUser: staffUser || {
          uid: 'unknown',
          email: '',
          fullName: 'Staff User',
          role: 'Staff',
          status: 'Active',
        },
      };

      const result = await processAIChat(chatPayload);
      res.json(result);
    } catch (err: any) {
      console.error('API /api/ai/chat error:', err);
      res.status(500).json({
        success: false,
        reply:
          'SHINE AI Assistant is temporarily unavailable. Your normal SHINE case-management functions are still available.',
        isUnavailable: true,
        errorMessage: String(err?.message || err),
      });
    }
  });

  // Vite middleware for development vs static dist for production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`SHINE Relief Trust Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
