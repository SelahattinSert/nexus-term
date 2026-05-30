import express from 'express';
import { getProfiles, saveProfile, deleteProfile, testConnection } from '../services/sshService.js';

const router = express.Router();

router.get('/profiles', async (req, res) => {
  try {
    const profiles = await getProfiles();
    res.json(profiles);
  } catch (error) {
    console.error('[SSH Route] Error fetching profiles:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/profiles', async (req, res) => {
  try {
    const profile = req.body;
    // Generate an ID if not provided (UUID format)
    if (!profile.id) {
       profile.id = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString();
    }
    const saved = await saveProfile(profile);
    
    // Mask password before returning
    const safeProfile = { ...saved };
    if (safeProfile.password) safeProfile.password = '••••••••';
    if (safeProfile.passphrase) safeProfile.passphrase = '••••••••';
    
    res.json(safeProfile);
  } catch (error) {
    console.error('[SSH Route] Error saving profile:', error);
    res.status(500).json({ error: error.message });
  }
});

router.put('/profiles/:id', async (req, res) => {
  try {
    const profile = req.body;
    if (profile.id !== req.params.id) {
       return res.status(400).json({ error: 'ID mismatch' });
    }
    const saved = await saveProfile(profile);
    
    // Mask password before returning
    const safeProfile = { ...saved };
    if (safeProfile.password) safeProfile.password = '••••••••';
    if (safeProfile.passphrase) safeProfile.passphrase = '••••••••';
    
    res.json(safeProfile);
  } catch (error) {
    console.error('[SSH Route] Error updating profile:', error);
    res.status(500).json({ error: error.message });
  }
});

router.delete('/profiles/:id', async (req, res) => {
  try {
    await deleteProfile(req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error('[SSH Route] Error deleting profile:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/test', async (req, res) => {
  try {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: 'Profile ID required' });
    
    const result = await testConnection(id);
    res.json(result);
  } catch (error) {
    console.error('[SSH Route] Test connection failed:', error.message);
    // Return 200 with reachable: false so the frontend can handle it gracefully
    res.json({ reachable: false, error: error.message });
  }
});

// The actual SSH connection logic will be handled via WebSocket / ptyManager.
// We provide an endpoint to "start" a session, which creates a new pty wrapper.
// This requires modifying ptyManager to accept an SSH profile.

export default router;