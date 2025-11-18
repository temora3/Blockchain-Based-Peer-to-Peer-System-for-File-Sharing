"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useUserRole } from "@/hooks/use-user-role";
import { Users, Search, Shield, UserX, UserCheck, Loader2, Mail, Calendar } from "lucide-react";
import { useToast } from "@/components/ui/toast-1";

interface UserProfile {
  id: string;
  email: string | null;
  full_name: string | null;
  role: 'user' | 'admin' | null;
  created_at: string;
  last_sign_in_at: string | null;
}

export default function AdminUsers() {
  const { isAdmin, loading: roleLoading } = useUserRole();
  const { showToast } = useToast();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterRole, setFilterRole] = useState<'all' | 'user' | 'admin'>('all');

  useEffect(() => {
    if (!roleLoading && isAdmin) {
      loadUsers();
    }
  }, [isAdmin, roleLoading]);

  async function loadUsers() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('profiles')
        .select('id, email, full_name, role, created_at')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Get last sign in times from auth.users (if accessible)
      const usersWithSignIn = (data || []).map(user => ({
        ...user,
        last_sign_in_at: null, // Would need RLS policy or service role to access
      }));

      setUsers(usersWithSignIn);
    } catch (error: any) {
      console.error('Error loading users:', error);
      showToast('Failed to load users', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function updateUserRole(userId: string, newRole: 'user' | 'admin') {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ role: newRole })
        .eq('id', userId);

      if (error) throw error;

      showToast(`User role updated to ${newRole}`, 'success');
      loadUsers();
    } catch (error: any) {
      console.error('Error updating user role:', error);
      showToast('Failed to update user role', 'error');
    }
  }

  const filteredUsers = users.filter(user => {
    const matchesSearch = 
      user.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.full_name?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesRole = filterRole === 'all' || user.role === filterRole || (!user.role && filterRole === 'user');
    
    return matchesSearch && matchesRole;
  });

  if (loading || roleLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-6 h-6 animate-spin text-white" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-2xl p-6 shadow-2xl shadow-[#CC2E28]/10 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-transparent pointer-events-none"></div>
        <div className="relative">
          <div className="flex items-center gap-3 mb-2">
            <Users className="w-8 h-8 text-white" />
            <h1 className="text-3xl font-bold text-white">User Management</h1>
          </div>
          <p className="text-white/70">Manage users, roles, and permissions</p>
        </div>
      </div>

      {/* Filters */}
      <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-4 shadow-lg shadow-black/10">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
            <input
              type="text"
              placeholder="Search users by email or name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-white/20 bg-white/10 backdrop-blur-md text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/30 focus:border-white/30 transition-all"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setFilterRole('all')}
              className={`px-4 py-2.5 rounded-xl border transition-all ${
                filterRole === 'all'
                  ? 'bg-white/20 border-white/30 text-white'
                  : 'bg-white/10 border-white/20 text-white/70 hover:bg-white/15'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilterRole('user')}
              className={`px-4 py-2.5 rounded-xl border transition-all ${
                filterRole === 'user'
                  ? 'bg-white/20 border-white/30 text-white'
                  : 'bg-white/10 border-white/20 text-white/70 hover:bg-white/15'
              }`}
            >
              Users
            </button>
            <button
              onClick={() => setFilterRole('admin')}
              className={`px-4 py-2.5 rounded-xl border transition-all ${
                filterRole === 'admin'
                  ? 'bg-white/20 border-white/30 text-white'
                  : 'bg-white/10 border-white/20 text-white/70 hover:bg-white/15'
              }`}
            >
              Admins
            </button>
          </div>
        </div>
      </div>

      {/* Users Table */}
      <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-2xl shadow-2xl shadow-[#CC2E28]/10 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-transparent pointer-events-none"></div>
        <div className="relative overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/10">
                <th className="px-6 py-4 text-left text-sm font-semibold text-white/80">User</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-white/80">Role</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-white/80">Joined</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-white/80">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user) => (
                <tr key={user.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                  <td className="px-6 py-4">
                    <div>
                      <p className="text-white font-medium">{user.full_name || 'No name'}</p>
                      <p className="text-white/50 text-sm flex items-center gap-1">
                        <Mail className="w-3 h-3" />
                        {user.email || 'No email'}
                      </p>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${
                      user.role === 'admin'
                        ? 'bg-red-500/20 text-red-300 border border-red-500/30'
                        : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                    }`}>
                      {user.role === 'admin' ? (
                        <>
                          <Shield className="w-3 h-3" />
                          Admin
                        </>
                      ) : (
                        <>
                          <Users className="w-3 h-3" />
                          User
                        </>
                      )}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-white/70 text-sm flex items-center gap-1">
                    <Calendar className="w-4 h-4" />
                    {new Date(user.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex gap-2">
                      {user.role === 'admin' ? (
                        <button
                          onClick={() => updateUserRole(user.id, 'user')}
                          className="px-3 py-1.5 rounded-lg border border-white/20 bg-white/10 backdrop-blur-md text-white/90 hover:bg-white/20 transition-all text-sm flex items-center gap-1.5"
                        >
                          <UserX className="w-4 h-4" />
                          Remove Admin
                        </button>
                      ) : (
                        <button
                          onClick={() => updateUserRole(user.id, 'admin')}
                          className="px-3 py-1.5 rounded-lg border border-white/20 bg-white/10 backdrop-blur-md text-white/90 hover:bg-white/20 transition-all text-sm flex items-center gap-1.5"
                        >
                          <UserCheck className="w-4 h-4" />
                          Make Admin
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredUsers.length === 0 && (
            <div className="p-12 text-center">
              <p className="text-white/50">No users found</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

