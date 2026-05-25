import React, { useState, useEffect } from 'react';
import { useStore } from '../store';
import { X, Server, Key, Lock, Fingerprint, Loader2 } from 'lucide-react';
import { motion as Motion, AnimatePresence } from 'framer-motion';

export default function SSHProfileModal({ isOpen, onClose, profileToEdit }) {
  const createSshProfile = useStore(state => state.createSshProfile);
  const updateSshProfile = useStore(state => state.updateSshProfile);
  const testSshConnection = useStore(state => state.testSshConnection);

  const [formData, setFormData] = useState({
    name: '',
    host: '',
    port: 22,
    username: '',
    authMethod: 'key',
    keyPath: '',
    passphrase: '',
    password: '',
    tags: '',
    color: ''
  });

  const [testStatus, setTestStatus] = useState(null); // 'testing' | { reachable: true/false, latencyMs, error }

  useEffect(() => {
    if (isOpen) {
      if (profileToEdit) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setFormData({
          ...profileToEdit,
          tags: profileToEdit.tags ? profileToEdit.tags.join(', ') : '',
          password: profileToEdit.password ? '••••••••' : '',
          passphrase: profileToEdit.passphrase ? '••••••••' : ''
        });
      } else {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setFormData({
          name: '', host: '', port: 22, username: '', authMethod: 'key',
          keyPath: '', passphrase: '', password: '', tags: '', color: ''
        });
      }
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTestStatus(null);
    }
  }, [isOpen, profileToEdit]);

  if (!isOpen) return null;

  const handleChange = (field, value) => setFormData(prev => ({ ...prev, [field]: value }));

  const handleTest = async () => {
    setTestStatus('testing');
    
    // We need to save the profile first so the backend has the credentials to test
    const profileData = {
      ...formData,
      port: parseInt(formData.port) || 22,
      tags: formData.tags ? formData.tags.split(',').map(t => t.trim()).filter(Boolean) : []
    };
    
    let profileId = profileToEdit?.id;

    if (profileToEdit) {
      await updateSshProfile(profileToEdit.id, profileData);
    } else {
      const res = await createSshProfile(profileData);
      if (res.success) {
        // Need to find the created profile ID. 
        // For simplicity in this flow, testSshConnection takes an ID.
        // It's better to just save first, then the user tests. 
        // Or we temporarily save to test.
        // Let's assume the user must save before testing if it's new.
      }
    }

    if (profileId) {
      const result = await testSshConnection(profileId);
      setTestStatus(result);
    } else {
      setTestStatus({ reachable: false, error: 'Please save the profile before testing.' });
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    const profileData = {
      ...formData,
      port: parseInt(formData.port) || 22,
      tags: formData.tags ? formData.tags.split(',').map(t => t.trim()).filter(Boolean) : []
    };

    if (profileToEdit) {
      await updateSshProfile(profileToEdit.id, profileData);
    } else {
      await createSshProfile(profileData);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <Motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <AnimatePresence>
        <Motion.div 
          initial={{ opacity: 0, y: 20, scale: 0.95 }} 
          animate={{ opacity: 1, y: 0, scale: 1 }} 
          className="w-full max-w-md shadow-2xl rounded-2xl overflow-hidden text-ctp-text flex flex-col border relative z-10"
          style={{ 
            backgroundColor: 'color-mix(in srgb, var(--ctp-mantle) 95%, transparent)',
            backdropFilter: 'blur(16px)',
            borderColor: 'color-mix(in srgb, var(--ctp-surface0) 50%, transparent)'
          }}
        >
          <div className="p-4 border-b flex items-center justify-between" style={{ borderColor: 'color-mix(in srgb, var(--ctp-surface0) 50%, transparent)', backgroundColor: 'color-mix(in srgb, var(--ctp-crust) 50%, transparent)' }}>
            <h2 className="text-sm font-bold flex items-center gap-2">
              <Server size={18} className="text-ctp-blue" /> 
              {profileToEdit ? 'Edit Connection' : 'New SSH Connection'}
            </h2>
            <button onClick={onClose} className="text-ctp-subtext0 hover:text-ctp-red transition-colors"><X size={18} /></button>
          </div>

          <div className="p-5 max-h-[70vh] overflow-y-auto scrollbar-thin">
            <form id="ssh-form" onSubmit={handleSave} className="space-y-4">
              
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-ctp-surface2 uppercase ml-1">Connection Name</label>
                <input required type="text" value={formData.name} onChange={e => handleChange('name', e.target.value)} placeholder="e.g. Production API" 
                  className="w-full bg-ctp-crust border border-ctp-surface0 rounded-lg px-3 py-2 text-xs outline-none focus:border-ctp-blue transition-colors" />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2 space-y-1.5">
                  <label className="text-[10px] font-bold text-ctp-surface2 uppercase ml-1">Hostname / IP</label>
                  <input required type="text" value={formData.host} onChange={e => handleChange('host', e.target.value)} placeholder="54.23.11.8" 
                    className="w-full bg-ctp-crust border border-ctp-surface0 rounded-lg px-3 py-2 text-xs outline-none focus:border-ctp-blue transition-colors" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-ctp-surface2 uppercase ml-1">Port</label>
                  <input required type="number" value={formData.port} onChange={e => handleChange('port', e.target.value)} placeholder="22" min="1" max="65535"
                    className="w-full bg-ctp-crust border border-ctp-surface0 rounded-lg px-3 py-2 text-xs outline-none focus:border-ctp-blue transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-ctp-surface2 uppercase ml-1">Username</label>
                <input required type="text" value={formData.username} onChange={e => handleChange('username', e.target.value)} placeholder="ubuntu" 
                  className="w-full bg-ctp-crust border border-ctp-surface0 rounded-lg px-3 py-2 text-xs outline-none focus:border-ctp-blue transition-colors" />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-ctp-surface2 uppercase ml-1">Authentication</label>
                <div className="flex border border-ctp-surface0 rounded-lg overflow-hidden bg-ctp-crust">
                  <button type="button" onClick={() => handleChange('authMethod', 'key')} className={`flex-1 py-2 text-xs flex items-center justify-center gap-1.5 ${formData.authMethod === 'key' ? 'bg-ctp-blue/10 text-ctp-blue' : 'text-ctp-subtext0 hover:bg-ctp-surface0'}`}><Key size={12}/> Key</button>
                  <button type="button" onClick={() => handleChange('authMethod', 'password')} className={`flex-1 py-2 text-xs flex items-center justify-center gap-1.5 ${formData.authMethod === 'password' ? 'bg-ctp-blue/10 text-ctp-blue' : 'text-ctp-subtext0 hover:bg-ctp-surface0 border-l border-r border-ctp-surface0'}`}><Lock size={12}/> Password</button>
                  <button type="button" onClick={() => handleChange('authMethod', 'agent')} className={`flex-1 py-2 text-xs flex items-center justify-center gap-1.5 ${formData.authMethod === 'agent' ? 'bg-ctp-blue/10 text-ctp-blue' : 'text-ctp-subtext0 hover:bg-ctp-surface0'}`}><Fingerprint size={12}/> Agent</button>
                </div>
              </div>

              {formData.authMethod === 'key' && (
                <>
                  <div className="space-y-1.5 animate-in slide-in-from-top-1">
                    <label className="text-[10px] font-bold text-ctp-surface2 uppercase ml-1">Private Key Path</label>
                    <input type="text" required value={formData.keyPath} onChange={e => handleChange('keyPath', e.target.value)} placeholder="~/.ssh/id_rsa or C:\Keys\prod.pem" 
                      className="w-full bg-ctp-crust border border-ctp-surface0 rounded-lg px-3 py-2 text-xs outline-none focus:border-ctp-blue transition-colors font-mono" />
                  </div>
                  <div className="space-y-1.5 animate-in slide-in-from-top-1">
                    <label className="text-[10px] font-bold text-ctp-surface2 uppercase ml-1">Passphrase (Optional)</label>
                    <input type="password" value={formData.passphrase} onChange={e => handleChange('passphrase', e.target.value)} placeholder="Leave blank if unencrypted" 
                      className="w-full bg-ctp-crust border border-ctp-surface0 rounded-lg px-3 py-2 text-xs outline-none focus:border-ctp-blue transition-colors" />
                  </div>
                </>
              )}

              {formData.authMethod === 'password' && (
                <div className="space-y-1.5 animate-in slide-in-from-top-1">
                  <label className="text-[10px] font-bold text-ctp-surface2 uppercase ml-1">Password</label>
                  <input type="password" required value={formData.password} onChange={e => handleChange('password', e.target.value)} placeholder="Enter SSH password" 
                    className="w-full bg-ctp-crust border border-ctp-surface0 rounded-lg px-3 py-2 text-xs outline-none focus:border-ctp-blue transition-colors" />
                </div>
              )}
              
              {formData.authMethod === 'agent' && (
                <div className="text-xs text-ctp-subtext0 p-3 bg-ctp-surface0/30 rounded-lg border border-ctp-surface0 animate-in slide-in-from-top-1">
                  Will use SSH agent forwarded from your operating system. Ensure Pageant or ssh-agent is running.
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-ctp-surface2 uppercase ml-1">Tags (Comma separated)</label>
                <input type="text" value={formData.tags} onChange={e => handleChange('tags', e.target.value)} placeholder="prod, aws, web" 
                  className="w-full bg-ctp-crust border border-ctp-surface0 rounded-lg px-3 py-2 text-xs outline-none focus:border-ctp-blue transition-colors" />
              </div>

              {testStatus && (
                <div className={`p-3 rounded-lg border text-xs ${testStatus === 'testing' ? 'bg-ctp-yellow/10 border-ctp-yellow text-ctp-yellow' : testStatus.reachable ? 'bg-ctp-green/10 border-ctp-green text-ctp-green' : 'bg-ctp-red/10 border-ctp-red text-ctp-red'}`}>
                  {testStatus === 'testing' ? <span className="flex items-center gap-2"><Loader2 size={12} className="animate-spin"/> Testing connection...</span> : 
                   testStatus.reachable ? <span className="flex items-center gap-2"><Check size={12}/> Connected successfully! ({testStatus.latencyMs}ms)</span> : 
                   <span className="flex items-start gap-2"><X size={14} className="mt-0.5 shrink-0"/> {testStatus.error}</span>}
                </div>
              )}

            </form>
          </div>

          <div className="p-4 border-t flex items-center justify-between gap-3 bg-ctp-mantle" style={{ borderColor: 'color-mix(in srgb, var(--ctp-surface0) 50%, transparent)' }}>
            <button type="button" onClick={handleTest} disabled={!profileToEdit} className={`text-xs px-4 py-2 border border-ctp-surface0 rounded-lg transition-colors ${!profileToEdit ? 'opacity-50 cursor-not-allowed' : 'hover:bg-ctp-surface0'}`}>
              Test Connection
            </button>
            <div className="flex gap-2">
              <button type="button" onClick={onClose} className="text-xs px-4 py-2 border border-ctp-surface0 rounded-lg hover:bg-ctp-surface0 transition-colors">
                Cancel
              </button>
              <button form="ssh-form" type="submit" className="text-xs px-4 py-2 bg-ctp-blue text-ctp-crust font-bold rounded-lg hover:opacity-90 transition-opacity">
                Save Profile
              </button>
            </div>
          </div>

        </Motion.div>
      </AnimatePresence>
    </div>
  );
}