// The user's initial administrator credential, stored only as a salted one-way
// verifier. Account creation uses INSERT ... ON CONFLICT DO NOTHING, so this
// value never replaces an existing administrator's chosen password.
export const initialAdminHash='pbkdf2-sha256$600000$Rp0XwIAiNZK-LCVUXsB82Q$ff9eJHE1wbsmqRvo4QB9mbnR0Id29MBo1Q_t1-1mSe8';
