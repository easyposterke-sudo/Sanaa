import { useState, useEffect } from 'react';
import { apiFetch } from '../lib/api';
import { UserTable } from './UserTable';

interface AdminStats {
  totalUsers: number;
  activeUsers: number;
  totalProjects: number;
  totalTemplates: number;
}

export function AdminDashboard() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await apiFetch('/api/admin/stats');
        if (res.ok) {
          const data = await res.json();
          setStats(data.stats);
        }
      } catch (err) {
        console.error('Failed to fetch admin stats', err);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, []);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 p-6">
      <div className="max-w-7xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">Admin Dashboard</h1>
          <p className="text-zinc-500 mt-2">Overview of platform activity and user management.</p>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-32 bg-white dark:bg-zinc-900 animate-pulse rounded-lg shadow"></div>
            ))}
          </div>
        ) : stats ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <StatCard title="Total Users" value={stats.totalUsers} icon="👥" />
            <StatCard title="Active Users" value={stats.activeUsers} subtitle="Last 30 days" icon="✨" />
            <StatCard title="Total Projects" value={stats.totalProjects} icon="🎨" />
            <StatCard title="Total Templates" value={stats.totalTemplates} icon="📄" />
          </div>
        ) : null}

        <UserTable />
      </div>
    </div>
  );
}

function StatCard({ title, value, subtitle, icon }: { title: string; value: number; subtitle?: string; icon: string }) {
  return (
    <div className="bg-white dark:bg-zinc-900 p-6 rounded-lg shadow">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-zinc-500 uppercase tracking-wider">{title}</p>
          <h3 className="text-2xl font-bold mt-1 text-zinc-900 dark:text-zinc-100">{value.toLocaleString()}</h3>
          {subtitle && <p className="text-xs text-green-600 mt-1">{subtitle}</p>}
        </div>
        <div className="text-3xl">{icon}</div>
      </div>
    </div>
  );
}
