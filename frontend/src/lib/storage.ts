interface AppStats {
  invitesSent: number;
  stealthPaymentsSent: number;
}

const STORAGE_KEY = 'xmtp-mini-stats';

export const storage = {
  getStats: (): AppStats => {
    try {
      const stats = localStorage.getItem(STORAGE_KEY);
      return stats ? JSON.parse(stats) : { invitesSent: 0, stealthPaymentsSent: 0 };
    } catch (e) {
      console.error('Error reading stats:', e);
      return { invitesSent: 0, stealthPaymentsSent: 0 };
    }
  },

  incrementInvites: () => {
    try {
      const stats = storage.getStats();
      stats.invitesSent += 1;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
      return stats;
    } catch (e) {
      console.error('Error incrementing invites:', e);
      return storage.getStats();
    }
  },

  incrementStealthPayments: () => {
    try {
      const stats = storage.getStats();
      stats.stealthPaymentsSent += 1;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
      return stats;
    } catch (e) {
      console.error('Error incrementing stealth payments:', e);
      return storage.getStats();
    }
  },

  resetStats: () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ invitesSent: 0, stealthPaymentsSent: 0 }));
    } catch (e) {
      console.error('Error resetting stats:', e);
    }
  }
}; 