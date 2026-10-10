// Supabase mock / helper client for authentication state and profiles

export const supabase = {
  auth: {
    async signUp({ email, password }) {
      const user = { id: 'usr_' + Date.now(), email };
      if (typeof window !== 'undefined') {
        localStorage.setItem('tri_vote_user', JSON.stringify(user));
      }
      return { data: { user }, error: null };
    },
    async signInWithPassword({ email, password }) {
      const user = { id: 'usr_' + email.replace(/[^a-zA-Z0-9]/g, '_'), email };
      if (typeof window !== 'undefined') {
        localStorage.setItem('tri_vote_user', JSON.stringify(user));
      }
      return { data: { user }, error: null };
    },
    async signOut() {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('tri_vote_user');
      }
      return { error: null };
    },
    async getUser() {
      if (typeof window === 'undefined') return { data: { user: null } };
      const raw = localStorage.getItem('tri_vote_user');
      return { data: { user: raw ? JSON.parse(raw) : null } };
    }
  },
  from(table) {
    return {
      insert(data) {
        return Promise.resolve({ data, error: null });
      },
      update(data) {
        return {
          eq(field, val) {
            return Promise.resolve({ data, error: null });
          }
        };
      },
      select(fields) {
        return {
          eq(field, val) {
            return {
              async maybeSingle() {
                const userRaw = typeof window !== 'undefined' ? localStorage.getItem('tri_vote_user') : null;
                const user = userRaw ? JSON.parse(userRaw) : null;
                return {
                  data: {
                    id: val,
                    email: user?.email || 'user@tri-vote.dev',
                    role: localStorage.getItem('tri_vote_role') || 'voter',
                    full_name: user?.email ? user.email.split('@')[0] : 'User'
                  },
                  error: null
                };
              }
            };
          }
        };
      }
    };
  }
};
