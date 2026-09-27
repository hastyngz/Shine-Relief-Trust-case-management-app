import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { processAIChat, AIChatRequest } from './src/server/aiService';
import { AIRequestAuthError, adminFirestore, adminStorageBucket, authenticateAIRequest, loadAIRecords, notifyCaseAction, writeAIAudit, writeSafeguardingAudit } from './src/server/firebaseAdmin';

function canAccessSafeguardingRecord(staff: any, record: any): boolean {
  return staff.role === 'Administrator' || staff.safeguardingPermissions.canView ||
    (record.authorizedStaffUids || []).includes(staff.uid);
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // JSON payload parser for requests
  app.use(express.json({ limit: '100kb' }));

  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  // Secure SHINE AI Assistant endpoint
  app.post('/api/ai/chat', async (req, res) => {
    try {
      const staffUser = await authenticateAIRequest(req.headers.authorization);
      if (typeof req.body?.message !== 'string' || !req.body.message.trim() || req.body.message.length > 4000) {
        return res.status(400).json({
          success: false,
          reply: 'Please provide a question of 1 to 4,000 characters.',
          errorMessage: 'Invalid message.',
        });
      }

      const chatPayload: AIChatRequest = {
        message: req.body.message.trim(),
        history: Array.isArray(req.body.history)
          ? req.body.history.slice(-6).filter((item: any) =>
              item && (item.role === 'user' || item.role === 'assistant') && typeof item.content === 'string'
            ).map((item: any) => ({ role: item.role, content: item.content.slice(0, 4000) }))
          : [],
        context: {
          girlId: typeof req.body.context?.girlId === 'string' ? req.body.context.girlId.slice(0, 128) : undefined,
          householdId: typeof req.body.context?.householdId === 'string' ? req.body.context.householdId.slice(0, 128) : undefined,
        },
        db: await loadAIRecords(
          staffUser.canViewHealthRecords,
          staffUser.uid,
          staffUser.role === 'Administrator' || staffUser.role === 'Manager',
          staffUser.canViewCaseReviews
        ),
        staffUser,
      };

      const result = await processAIChat(chatPayload);
      if (result.auditEntry) {
        try {
          await writeAIAudit(result.auditEntry);
        } catch (auditError) {
          console.error('AI audit write failed:', auditError);
        }
      }
      const { auditEntry: _auditEntry, ...clientResult } = result;
      res.json(clientResult);
    } catch (err: any) {
      if (err instanceof AIRequestAuthError) {
        return res.status(err.statusCode).json({
          success: false,
          reply: err.message,
          errorMessage: err.message,
        });
      }
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

  app.get('/api/safeguarding/cases', async (req, res) => {
    try {
      const staff = await authenticateAIRequest(req.headers.authorization);
      const casesCollection = adminFirestore.collection('safeguardingCases');
      const snapshot = staff.role === 'Administrator' || staff.safeguardingPermissions.canView
        ? await casesCollection.limit(250).get()
        : await casesCollection.where('authorizedStaffUids', 'array-contains', staff.uid).limit(250).get();
      const search = String(req.query.search || '').trim().toLowerCase();
      const records = snapshot.docs.map((record) => ({ id: record.id, ...record.data() } as any));
      const matchingRecords = search
        ? records.filter((record) => [record.id, record.girlId, record.category, record.description, record.immediateConcern, record.actionTaken, record.referredTo, record.status]
            .some((value) => String(value || '').toLowerCase().includes(search)))
        : records;
      await Promise.all(matchingRecords.map((record) => writeSafeguardingAudit({
        userId: staff.uid,
        userName: staff.fullName,
        action: 'read',
        recordId: record.id,
      })));
      res.json({ cases: matchingRecords });
    } catch (err: any) {
      const status = err instanceof AIRequestAuthError ? err.statusCode : 500;
      res.status(status).json({ error: err.message || 'Could not load safeguarding records.' });
    }
  });

  app.get('/api/safeguarding/count', async (req, res) => {
    try {
      const staff = await authenticateAIRequest(req.headers.authorization);
      if (staff.role !== 'Administrator' && !staff.safeguardingPermissions.canView) {
        return res.status(403).json({ error: 'Safeguarding summary access is not granted.' });
      }
      const result = await adminFirestore.collection('safeguardingCases').count().get();
      await writeSafeguardingAudit({ userId: staff.uid, userName: staff.fullName, action: 'summary_read', recordId: 'safeguardingCases:count' });
      res.json({ count: result.data().count });
    } catch (err: any) {
      const status = err instanceof AIRequestAuthError ? err.statusCode : 500;
      res.status(status).json({ error: err.message || 'Could not load safeguarding summary.' });
    }
  });

  app.get('/api/safeguarding/cases/:caseId', async (req, res) => {
    try {
      const staff = await authenticateAIRequest(req.headers.authorization);
      const snapshot = await adminFirestore.collection('safeguardingCases').doc(req.params.caseId).get();
      if (!snapshot.exists) return res.status(404).json({ error: 'Safeguarding record not found.' });
      const record: any = { id: snapshot.id, ...snapshot.data() };
      const permitted = canAccessSafeguardingRecord(staff, record);
      if (!permitted) return res.status(403).json({ error: 'You are not authorized to view this safeguarding record.' });
      await writeSafeguardingAudit({ userId: staff.uid, userName: staff.fullName, action: 'read', recordId: snapshot.id });
      res.json({ case: record });
    } catch (err: any) {
      const status = err instanceof AIRequestAuthError ? err.statusCode : 500;
      res.status(status).json({ error: err.message || 'Could not load safeguarding record.' });
    }
  });

  app.post('/api/safeguarding/cases', async (req, res) => {
    try {
      const staff = await authenticateAIRequest(req.headers.authorization);
      if (staff.role === 'View Only' || (staff.role !== 'Administrator' && !staff.safeguardingPermissions.canCreate)) {
        return res.status(403).json({ error: 'You are not authorized to create safeguarding records.' });
      }
      const input = req.body || {};
      if (typeof input.girlId !== 'string' || !input.girlId || typeof input.description !== 'string' || !input.description.trim()) {
        return res.status(400).json({ error: 'Girl and safeguarding description are required.' });
      }
      const responsibleStaffId = input.responsibleStaffId || staff.uid;
      if (responsibleStaffId !== staff.uid && staff.role !== 'Administrator' && staff.role !== 'Manager') {
        return res.status(403).json({ error: 'Only Administrators and Managers can assign safeguarding responsibility to another staff member.' });
      }
      const responsibleStaff = await adminFirestore.collection('staffUsers').doc(responsibleStaffId).get();
      if (!responsibleStaff.exists || responsibleStaff.data()?.status !== 'Active') {
        return res.status(400).json({ error: 'The responsible staff account is not active.' });
      }
      const now = new Date().toISOString();
      const reference = adminFirestore.collection('safeguardingCases').doc();
      const record = {
        id: reference.id,
        girlId: input.girlId,
        dateReported: input.dateReported || now.slice(0, 10),
        incidentDate: input.incidentDate || undefined,
        category: input.category || 'Other',
        description: input.description.trim(),
        immediateConcern: input.immediateConcern || '',
        riskLevel: input.riskLevel || 'Medium',
        actionTaken: input.actionTaken || '',
        referralMade: input.referralMade === true,
        referredTo: input.referredTo || undefined,
        responsibleStaffId,
        responsibleStaffName: responsibleStaff.data()?.fullName || staff.fullName,
        followUpDate: input.followUpDate || undefined,
        outcome: input.outcome || undefined,
        status: input.status || 'Open',
        authorizedStaffUids: Array.from(new Set([staff.uid, responsibleStaffId])),
        createdBy: staff.fullName,
        createdByUid: staff.uid,
        createdAt: now,
        updatedBy: staff.fullName,
        updatedByUid: staff.uid,
        updatedAt: now,
      };
      await reference.set(record);
      await writeSafeguardingAudit({ userId: staff.uid, userName: staff.fullName, action: 'create', recordId: reference.id });
      res.status(201).json({ case: record });
    } catch (err: any) {
      const status = err instanceof AIRequestAuthError ? err.statusCode : 500;
      res.status(status).json({ error: err.message || 'Could not create safeguarding record.' });
    }
  });

  app.patch('/api/safeguarding/cases/:caseId', async (req, res) => {
    try {
      const staff = await authenticateAIRequest(req.headers.authorization);
      const reference = adminFirestore.collection('safeguardingCases').doc(req.params.caseId);
      const snapshot = await reference.get();
      if (!snapshot.exists) return res.status(404).json({ error: 'Safeguarding record not found.' });
      const existing = snapshot.data()!;
      const assigned = (existing.authorizedStaffUids || []).includes(staff.uid);
      const isAdmin = staff.role === 'Administrator';
      const updates = req.body || {};
      const closing = updates.status === 'Closed';
      if (staff.role === 'View Only' || (!isAdmin && (closing
        ? !staff.safeguardingPermissions.canClose
        : !staff.safeguardingPermissions.canEdit && !assigned))) {
        return res.status(403).json({ error: 'You are not authorized to update this safeguarding record.' });
      }
      const allowedFields = [
        'dateReported', 'incidentDate', 'category', 'description', 'immediateConcern',
        'riskLevel', 'actionTaken', 'referralMade', 'referredTo', 'responsibleStaffId',
        'responsibleStaffName', 'followUpDate', 'outcome', 'status',
      ];
      const safeUpdates = Object.fromEntries(Object.entries(updates).filter(([key]) => allowedFields.includes(key)));
      const now = new Date().toISOString();
      await reference.update({ ...safeUpdates, updatedBy: staff.fullName, updatedByUid: staff.uid, updatedAt: now });
      await writeSafeguardingAudit({
        userId: staff.uid,
        userName: staff.fullName,
        action: closing ? 'close' : 'update',
        recordId: snapshot.id,
      });
      res.json({ case: { ...existing, ...safeUpdates, updatedBy: staff.fullName, updatedByUid: staff.uid, updatedAt: now } });
    } catch (err: any) {
      const status = err instanceof AIRequestAuthError ? err.statusCode : 500;
      res.status(status).json({ error: err.message || 'Could not update safeguarding record.' });
    }
  });

  app.get('/api/safeguarding/cases/:caseId/files', async (req, res) => {
    try {
      const staff = await authenticateAIRequest(req.headers.authorization);
      const caseSnapshot = await adminFirestore.collection('safeguardingCases').doc(req.params.caseId).get();
      if (!caseSnapshot.exists) return res.status(404).json({ error: 'Safeguarding record not found.' });
      const record = caseSnapshot.data();
      if (!canAccessSafeguardingRecord(staff, record)) {
        await writeSafeguardingAudit({ userId: staff.uid, userName: staff.fullName, action: 'read_denied', recordId: caseSnapshot.id });
        return res.status(403).json({ error: 'You are not authorized to access these files.' });
      }
      const snapshot = await caseSnapshot.ref.collection('files').get();
      await writeSafeguardingAudit({ userId: staff.uid, userName: staff.fullName, action: 'read', recordId: caseSnapshot.id });
      res.json({ files: snapshot.docs.map((file) => ({ id: file.id, ...file.data() })) });
    } catch (err: any) {
      const status = err instanceof AIRequestAuthError ? err.statusCode : 500;
      res.status(status).json({ error: err.message || 'Could not load safeguarding documents.' });
    }
  });

  app.put('/api/safeguarding/cases/:caseId/files/:fileId', express.raw({ type: () => true, limit: '15mb' }), async (req, res) => {
    try {
      const staff = await authenticateAIRequest(req.headers.authorization);
      const caseRef = adminFirestore.collection('safeguardingCases').doc(req.params.caseId);
      const caseSnapshot = await caseRef.get();
      if (!caseSnapshot.exists) return res.status(404).json({ error: 'Safeguarding record not found.' });
      const caseRecord: any = caseSnapshot.data();
      if (staff.role === 'View Only' || !canAccessSafeguardingRecord(staff, caseRecord) || (
        staff.role !== 'Administrator' && !staff.safeguardingPermissions.canEdit &&
        caseRecord.responsibleStaffId !== staff.uid
      )) return res.status(403).json({ error: 'You are not authorized to upload safeguarding documents.' });
      if (!Buffer.isBuffer(req.body) || req.body.length === 0 || req.body.length >= 15 * 1024 * 1024) {
        return res.status(400).json({ error: 'Choose a file smaller than 15 MB.' });
      }
      const contentType = String(req.headers['content-type'] || '');
      if (!contentType.startsWith('image/') && contentType !== 'application/pdf') {
        return res.status(415).json({ error: 'Only image and PDF files are supported.' });
      }
      const fileName = decodeURIComponent(String(req.headers['x-file-name'] || 'document')).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
      const filePath = `safeguarding/${caseSnapshot.id}/${req.params.fileId}_${fileName}`;
      await adminStorageBucket.file(filePath).save(req.body, {
        resumable: false,
        metadata: { contentType, cacheControl: 'private, no-store' },
      });
      const metadata = {
        id: req.params.fileId,
        fileName,
        fileSize: req.body.length,
        contentType,
        storagePath: filePath,
        createdAt: new Date().toISOString(),
        uploadedByUid: staff.uid,
        uploadedByName: staff.fullName,
      };
      await caseRef.collection('files').doc(req.params.fileId).set(metadata);
      await writeSafeguardingAudit({ userId: staff.uid, userName: staff.fullName, action: 'upload', recordId: caseSnapshot.id });
      res.status(201).json({ file: metadata });
    } catch (err: any) {
      const status = err instanceof AIRequestAuthError ? err.statusCode : 500;
      res.status(status).json({ error: err.message || 'Could not upload safeguarding document.' });
    }
  });

  app.get('/api/safeguarding/cases/:caseId/files/:fileId', async (req, res) => {
    try {
      const staff = await authenticateAIRequest(req.headers.authorization);
      const caseRef = adminFirestore.collection('safeguardingCases').doc(req.params.caseId);
      const caseSnapshot = await caseRef.get();
      if (!caseSnapshot.exists) return res.status(404).json({ error: 'Safeguarding record not found.' });
      if (!canAccessSafeguardingRecord(staff, caseSnapshot.data())) {
        await writeSafeguardingAudit({ userId: staff.uid, userName: staff.fullName, action: 'read_denied', recordId: caseSnapshot.id });
        return res.status(403).json({ error: 'You are not authorized to download this file.' });
      }
      const fileSnapshot = await caseRef.collection('files').doc(req.params.fileId).get();
      if (!fileSnapshot.exists) return res.status(404).json({ error: 'Safeguarding document not found.' });
      const fileData = fileSnapshot.data()!;
      const [contents] = await adminStorageBucket.file(fileData.storagePath).download();
      await writeSafeguardingAudit({ userId: staff.uid, userName: staff.fullName, action: 'download', recordId: caseSnapshot.id });
      res.setHeader('Content-Type', fileData.contentType || 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${String(fileData.fileName).replace(/"/g, '')}"`);
      res.setHeader('Cache-Control', 'private, no-store');
      res.send(contents);
    } catch (err: any) {
      const status = err instanceof AIRequestAuthError ? err.statusCode : 500;
      res.status(status).json({ error: err.message || 'Could not download safeguarding document.' });
    }
  });

  app.post('/api/case-actions/notify', async (req, res) => {
    try {
      const staff = await authenticateAIRequest(req.headers.authorization);
      const { actionId, kind } = req.body || {};
      if (typeof actionId !== 'string' || !['assigned', 'reassigned'].includes(kind)) {
        return res.status(400).json({ error: 'Invalid case action notification request.' });
      }
      const taskSnapshot = await adminFirestore.collection('caseActions').doc(actionId).get();
      if (!taskSnapshot.exists) return res.status(404).json({ error: 'Case action not found.' });
      const task: any = { id: taskSnapshot.id, ...taskSnapshot.data() };
      const mayNotify = staff.role === 'Administrator' || staff.role === 'Manager' ||
        task.createdByUid === staff.uid || task.updatedByUid === staff.uid;
      if (!mayNotify) return res.status(403).json({ error: 'You are not authorized to notify for this action.' });
      const created = await notifyCaseAction(task, kind, staff.fullName);
      res.json({ created });
    } catch (err: any) {
      const status = err instanceof AIRequestAuthError ? err.statusCode : 500;
      res.status(status).json({ error: err.message || 'Could not notify the assigned staff member.' });
    }
  });

  app.post('/api/case-actions/check-reminders', async (req, res) => {
    try {
      const staff = await authenticateAIRequest(req.headers.authorization);
      const tasksCollection = adminFirestore.collection('caseActions');
      const snapshot = staff.role === 'Administrator' || staff.role === 'Manager'
        ? await tasksCollection.get()
        : await tasksCollection.where('assignedStaffId', '==', staff.uid).get();
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      let created = 0;
      for (const taskDocument of snapshot.docs) {
        const task: any = { id: taskDocument.id, ...taskDocument.data() };
        if (!task.dueDate || ['Completed', 'Cancelled'].includes(task.status)) continue;
        const due = new Date(`${task.dueDate}T00:00:00.000Z`);
        const daysUntilDue = Math.floor((due.getTime() - today.getTime()) / 86400000);
        if (daysUntilDue < 0) {
          if (await notifyCaseAction(task, 'overdue', 'SHINE reminders')) created += 1;
        } else if (daysUntilDue <= 3) {
          if (await notifyCaseAction(task, 'due_soon', 'SHINE reminders')) created += 1;
        }
      }
      res.json({ created });
    } catch (err: any) {
      const status = err instanceof AIRequestAuthError ? err.statusCode : 500;
      res.status(status).json({ error: err.message || 'Could not check case action reminders.' });
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
