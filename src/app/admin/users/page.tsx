'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { ArrowLeft, Users, Search, X } from 'lucide-react';
import { format } from 'date-fns';
import AdminSectionNav from '@/components/admin/AdminSectionNav';

interface User {
  id: string;
  name: string;
  email: string;
  phone?: string;
  total_sessions: number;
  created_at: string;
}

interface UserSession {
  id: string;
  user_name: string;
  session_type: 'personal' | 'couple';
  slot_date: string;
  slot_start_time: string;
  slot_end_time: string;
  meeting_link?: string;
  status: string;
}

export default function UsersManagementPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [userSessions, setUserSessions] = useState<UserSession[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [userModalLoading, setUserModalLoading] = useState(false);

  // Fetch all users
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const response = await fetch('/api/admin/users');
        if (!response.ok) {
          console.error('Error fetching users:', response.status);
          setLoading(false);
          return;
        }
        const data = await response.json();
        setUsers(data.users || []);
      } catch (error) {
        console.error('Error fetching users:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchUsers();
  }, []);

  const handleUserClick = async (user: User) => {
    setSelectedUser(user);
    setUserModalLoading(true);
    try {
      const response = await fetch(`/api/admin/users/${user.id}/sessions`);
      if (!response.ok) {
        console.error('Error fetching user sessions:', response.status);
        setUserSessions([]);
        return;
      }
      const data = await response.json();
      setUserSessions(data.sessions || []);
    } catch (error) {
      console.error('Error fetching user sessions:', error);
      setUserSessions([]);
    } finally {
      setUserModalLoading(false);
    }
  };

  // Filter users based on search query
  const filteredUsers = users.filter(user =>
    (user.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (user.email || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (user.phone && user.phone.includes(searchQuery))
  );

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.1 },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-white via-cyan-50 to-white pb-12 pt-20 sm:pt-24">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <AdminSectionNav className="mb-5" />

        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <Link href="/admin" className="inline-flex items-center gap-2 text-cyan-600 hover:text-cyan-700 mb-4">
            <ArrowLeft size={20} />
            Back to Dashboard
          </Link>
          <h1 className="mb-2 text-3xl font-bold text-gray-900 sm:text-5xl">Users Management</h1>
          <p className="text-base text-gray-600 sm:text-xl">
            View and manage all users and their booking history
          </p>
        </motion.div>

        {/* Stats Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8 rounded-2xl bg-gradient-to-br from-cyan-500 to-cyan-600 p-6 text-white shadow-lg sm:p-8"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-cyan-100 text-sm font-semibold uppercase tracking-wide">Total Users</p>
              <p className="mt-2 text-4xl font-bold sm:text-5xl">{users.length}</p>
            </div>
            <Users size={48} className="text-cyan-200 opacity-50" />
          </div>
        </motion.div>

        {/* Search Bar */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8 rounded-2xl bg-white p-5 shadow-lg sm:p-6"
        >
          <div className="relative">
            <Search size={20} className="absolute left-3 top-3 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name, email, or phone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 text-lg"
            />
          </div>
        </motion.div>

        {/* Users Grid */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-1 md:grid-cols-2 gap-6"
        >
          {loading ? (
            <>
              <div className="h-40 bg-gray-200 rounded-lg animate-pulse"></div>
              <div className="h-40 bg-gray-200 rounded-lg animate-pulse"></div>
              <div className="h-40 bg-gray-200 rounded-lg animate-pulse"></div>
              <div className="h-40 bg-gray-200 rounded-lg animate-pulse"></div>
            </>
          ) : filteredUsers.length === 0 ? (
            <motion.div
              variants={itemVariants}
              className="col-span-1 md:col-span-2 bg-white rounded-2xl shadow-lg p-12 text-center"
            >
              <Users size={48} className="mx-auto text-cyan-300 mb-4" />
              <p className="text-xl text-gray-600">
                {users.length === 0 ? 'No users found' : 'No users match your search'}
              </p>
            </motion.div>
          ) : (
            filteredUsers.map((user) => (
              <motion.div
                key={user.id}
                variants={itemVariants}
                onClick={() => handleUserClick(user)}
                className="bg-white rounded-2xl shadow-lg p-6 cursor-pointer hover:shadow-xl transition transform hover:-translate-y-1"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <h3 className="text-2xl font-bold text-gray-900 mb-1">{user.name}</h3>
                    <p className="text-cyan-600 font-medium mb-2">{user.email}</p>
                    {user.phone && <p className="text-gray-600 text-sm mb-2">📞 {user.phone}</p>}
                  </div>
                  <span className="inline-block bg-cyan-100 text-cyan-800 px-4 py-2 rounded-full font-bold text-lg">
                    {user.total_sessions}
                  </span>
                </div>
                <div className="border-t border-gray-200 pt-4">
                  <p className="text-sm text-gray-500">
                    Joined {format(new Date(user.created_at), 'MMM d, yyyy')}
                  </p>
                </div>
              </motion.div>
            ))
          )}
        </motion.div>

        {/* User Sessions Modal */}
        {selectedUser && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSelectedUser(null)}
            className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
            className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl"
          >
            {/* Modal Header */}
            <div className="sticky top-0 flex items-start justify-between gap-3 border-b border-gray-200 bg-gradient-to-r from-cyan-500 to-cyan-600 p-4 text-white sm:p-6">
                <div>
                  <h2 className="text-2xl font-bold">{selectedUser.name}</h2>
                  <p className="text-cyan-100">{selectedUser.email}</p>
                  {selectedUser.phone && <p className="text-cyan-100">{selectedUser.phone}</p>}
                </div>
                <button
                  onClick={() => setSelectedUser(null)}
                  className="p-2 hover:bg-cyan-700 rounded-lg transition"
                  title="Close modal"
                >
                  <X size={24} />
                </button>
              </div>

              {/* Modal Content */}
              <div className="p-6">
                {userModalLoading ? (
                  <div className="space-y-3">
                    <div className="h-16 bg-gray-200 rounded-lg animate-pulse"></div>
                    <div className="h-16 bg-gray-200 rounded-lg animate-pulse"></div>
                  </div>
                ) : userSessions.length === 0 ? (
                  <p className="text-center text-gray-500 py-8">No sessions booked yet</p>
                ) : (
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-gray-900">Session History</h3>
                    {userSessions.map((session) => (
                      <motion.div
                        key={session.id}
                        className="p-4 border border-gray-200 rounded-lg hover:shadow-md transition"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="font-semibold text-gray-900">
                                {session.session_type === 'personal' ? '👤' : '👥'} {session.session_type.charAt(0).toUpperCase() + session.session_type.slice(1)} Session
                              </span>
                              <span className={`px-2 py-1 rounded text-sm font-medium ${
                                session.status === 'confirmed' ? 'bg-green-100 text-green-800' :
                                session.status === 'cancelled' ? 'bg-red-100 text-red-800' :
                                'bg-gray-100 text-gray-800'
                              }`}>
                                {session.status}
                              </span>
                            </div>
                            <p className="text-sm text-gray-600">
                              📅 {format(new Date(session.slot_date), 'MMM d, yyyy')} at {session.slot_start_time}
                            </p>
                            {session.meeting_link && (
                              <a
                                href={session.meeting_link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sm text-cyan-600 hover:text-cyan-800 hover:underline mt-2 inline-block"
                              >
                                🔗 Join Meet
                              </a>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
