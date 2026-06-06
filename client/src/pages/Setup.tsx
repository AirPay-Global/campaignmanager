import { useState } from 'react';
import api from '../lib/api';

export default function Setup() {
  const [orgName, setOrgName] = useState('AirPay Global');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [migrateMsg, setMigrateMsg] = useState('');

  async function handleMigrate() {
    setMigrating(true);
    setMigrateMsg('');
    try {
      await api.post('/migrate', { token: import.meta.env.VITE_SETUP_TOKEN ?? 'airpay-setup' });
      setMigrateMsg('✓ Database tables created. You can now create your account.');
    } catch (err: any) {
      setMigrateMsg('✗ ' + (err.response?.data?.error ?? 'Migration failed'));
    } finally {
      setMigrating(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.post('/setup', {
        token: import.meta.env.VITE_SETUP_TOKEN ?? 'airpay-setup',
        orgName,
        email,
        password,
      });
      setDone(true);
    } catch (err: any) {
      setError(err.response?.data?.detail ?? err.response?.data?.error ?? 'Setup failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-slate-800">Welcome to AirPay</h1>
          <p className="text-slate-500 mt-1">Create your admin account to get started</p>
        </div>

        {done ? (
          <div className="text-center">
            <div className="text-green-500 text-5xl mb-4">✓</div>
            <p className="text-slate-700 font-medium mb-6">Account created successfully!</p>
            <a
              href="/login"
              className="block w-full bg-indigo-600 text-white py-2.5 rounded-lg font-medium hover:bg-indigo-700 transition"
            >
              Go to Login
            </a>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Organisation Name</label>
              <input
                type="text"
                value={orgName}
                onChange={e => setOrgName(e.target.value)}
                required
                className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Admin Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                placeholder="you@airpayglobal.com"
                className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={8}
                placeholder="Min. 8 characters"
                className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {error && (
              <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 text-white py-2.5 rounded-lg font-medium hover:bg-indigo-700 transition disabled:opacity-50"
            >
              {loading ? 'Creating account…' : 'Create Admin Account'}
            </button>

            <div className="border-t pt-4">
              <p className="text-xs text-slate-400 mb-2">If you see a database error above, run migrations first:</p>
              <button
                type="button"
                onClick={handleMigrate}
                disabled={migrating}
                className="w-full bg-slate-100 text-slate-700 py-2 rounded-lg text-sm font-medium hover:bg-slate-200 transition disabled:opacity-50"
              >
                {migrating ? 'Running migrations…' : 'Run Database Migrations'}
              </button>
              {migrateMsg && (
                <p className={`text-xs mt-2 ${migrateMsg.startsWith('✓') ? 'text-green-600' : 'text-red-600'}`}>
                  {migrateMsg}
                </p>
              )}
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
