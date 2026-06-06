import React, { useState, useEffect } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  TextInput, 
  TouchableOpacity, 
  ScrollView, 
  ActivityIndicator, 
  Alert,
  SafeAreaView
} from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { auth, db } from '../../firebase';
import { 
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from 'firebase/auth';
import { 
  collection, 
  addDoc, 
  doc, 
  getDoc,
  setDoc,
  onSnapshot, 
  query, 
  orderBy, 
  limit, 
  serverTimestamp 
} from 'firebase/firestore';

interface UserProfile {
  uid: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  employeeId?: string;
  createdAt: string;
}

interface TransactionItem {
  id: string;
  amount: number;
  type: 'income' | 'expense';
  timestamp: any;
}

export default function AppIndex() {
  const [isConnected, setIsConnected] = useState<boolean | null>(true);
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [authLoading, setAuthLoading] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'signin' | 'register'>('signin');

  // Input states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [registerRole, setRegisterRole] = useState<'USER' | 'EMPLOYEE'>('USER');

  // Dashboard states
  const [expenses, setExpenses] = useState<TransactionItem[]>([]);
  const [amountInput, setAmountInput] = useState('');
  const [typeInput, setTypeInput] = useState<'income' | 'expense'>('expense');
  const [submitLoading, setSubmitLoading] = useState<boolean>(false);

  // Monitor network connectivity in real-time
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      setIsConnected(state.isConnected);
    });
    return () => unsubscribe();
  }, []);

  // Monitor auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setLoading(true);
      if (currentUser) {
        setUser(currentUser);
        try {
          // Fetch user profile from Firestore (which uses offline cache if offline!)
          const docRef = doc(db, 'users', currentUser.uid);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            setProfile(docSnap.data() as UserProfile);
          } else {
            console.warn("User profile document not found.");
          }
        } catch (err) {
          console.error("Error fetching user profile:", err);
        }
      } else {
        setUser(null);
        setProfile(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Listen to corporate financial transactions in real-time
  useEffect(() => {
    if (!profile) return;

    // Listen to either user-specific transactions or corporate financials based on role
    const isExec = ['ADMIN', 'MD', 'DIRECTOR', 'CO_DIRECTOR'].includes(profile.role);
    const collectionPath = isExec ? "financial_transactions" : `users/${profile.uid}/transactions`;
    
    const q = query(
      collection(db, collectionPath),
      orderBy("timestamp", "desc"),
      limit(20)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: TransactionItem[] = [];
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        list.push({
          id: docSnap.id,
          amount: data.amount || 0,
          type: data.type || 'expense',
          timestamp: data.timestamp
        });
      });
      setExpenses(list);
    }, (error) => {
      console.warn("Real-time sync subscription error:", error.message);
    });

    return () => unsubscribe();
  }, [profile]);

  // Auth Operations
  const handleSignIn = async () => {
    if (!email || !password) {
      Alert.alert("Input Error", "Please enter both email and password.");
      return;
    }
    setAuthLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
    } catch (err: any) {
      Alert.alert("Authentication Failed", err.message);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleRegister = async () => {
    if (!email || !password || !fullName || !phone) {
      Alert.alert("Input Error", "Please fill in all registration fields.");
      return;
    }
    if (password.length < 6) {
      Alert.alert("Input Error", "Password must be at least 6 characters.");
      return;
    }
    setAuthLoading(true);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
      const regUser = userCredential.user;
      
      const assignedRole = (email.trim().toLowerCase() === "jayyad71@gmail.com") ? "ADMIN" : registerRole;
      const generatedEmpId = (assignedRole !== 'USER') ? "EMP-" + Math.floor(1000 + Math.random() * 9000) : undefined;

      const userProfile: UserProfile = {
        uid: regUser.uid,
        name: fullName.trim(),
        email: email.trim().toLowerCase(),
        phone: phone.trim(),
        role: assignedRole,
        employeeId: generatedEmpId,
        createdAt: new Date().toISOString()
      };

      await setDoc(doc(db, "users", regUser.uid), userProfile);
      Alert.alert("Success", "Account created successfully!");
    } catch (err: any) {
      Alert.alert("Registration Failed", err.message);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (err: any) {
      Alert.alert("Sign Out Error", err.message);
    }
  };

  // Submit Expense Transaction (supports offline queueing automatically)
  const handleSubmitExpense = async () => {
    if (!amountInput || isNaN(Number(amountInput))) {
      Alert.alert("Input Error", "Please enter a valid amount.");
      return;
    }

    setSubmitLoading(true);
    try {
      const isExec = profile && ['ADMIN', 'MD', 'DIRECTOR', 'CO_DIRECTOR'].includes(profile.role);
      const isEmployee = profile && profile.role === 'EMPLOYEE';
      const collectionPath = (isExec || isEmployee) ? "financial_transactions" : `users/${profile?.uid}/transactions`;

      // Firestore will save this to the local cache immediately and sync in the background
      await addDoc(collection(db, collectionPath), {
        amount: Number(amountInput),
        type: typeInput,
        timestamp: serverTimestamp(),
        createdBy: profile?.uid
      });

      setAmountInput('');
      Alert.alert("Submitted Successfully", "Your transaction has been logged. If you are offline, it will automatically synchronize later!");
    } catch (err: any) {
      Alert.alert("Submission Failed", err.message);
    } finally {
      setSubmitLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6366f1" />
        <Text style={styles.loadingText}>Loading Security Context...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      {/* Real-time Offline Warning Banner */}
      {!isConnected && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineText}>
            ⚠️ Offline Mode: Data will queue and sync when reconnected.
          </Text>
        </View>
      )}

      <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled">
        {user && profile ? (
          // ==========================================
          // SECURE ROLE-BASED DASHBOARD SCREEN
          // ==========================================
          <View style={styles.dashboardContainer}>
            <View style={styles.headerCard}>
              <Text style={styles.brandTitle}>ADCS LEDGER MOBILE</Text>
              <Text style={styles.welcomeText}>Welcome, {profile.name}</Text>
              <View style={styles.badgeRow}>
                <View style={[styles.badge, { backgroundColor: '#4f46e5' }]}>
                  <Text style={styles.badgeText}>{profile.role}</Text>
                </View>
                {profile.employeeId && (
                  <View style={[styles.badge, { backgroundColor: '#1e1e1e' }]}>
                    <Text style={styles.badgeText}>{profile.employeeId}</Text>
                  </View>
                )}
              </View>
              <Text style={styles.emailText}>{profile.email}</Text>
            </View>

            {/* EXPENSE/TRANSACTION FORM SUBMITTER */}
            <View style={styles.card}>
              <Text style={styles.cardHeader}>Log New Transaction</Text>
              
              <TextInput
                style={styles.input}
                placeholder="Amount (INR)"
                placeholderTextColor="#666"
                keyboardType="numeric"
                value={amountInput}
                onChangeText={setAmountInput}
              />

              <View style={styles.toggleRow}>
                <TouchableOpacity 
                  style={[styles.toggleBtn, typeInput === 'expense' && styles.toggleActive]}
                  onPress={() => setTypeInput('expense')}
                >
                  <Text style={[styles.toggleText, typeInput === 'expense' && styles.toggleTextActive]}>Expense</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.toggleBtn, typeInput === 'income' && styles.toggleActive]}
                  onPress={() => setTypeInput('income')}
                >
                  <Text style={[styles.toggleText, typeInput === 'income' && styles.toggleTextActive]}>Income</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity 
                style={styles.submitBtn} 
                onPress={handleSubmitExpense}
                disabled={submitLoading}
              >
                {submitLoading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.submitBtnText}>Submit Transaction</Text>
                )}
              </TouchableOpacity>
            </View>

            {/* TRANSACTIONS SYNC LEDGER */}
            <View style={styles.card}>
              <Text style={styles.cardHeader}>Recent Logged Transactions</Text>
              {expenses.length === 0 ? (
                <Text style={styles.emptyText}>No transactions recorded.</Text>
              ) : (
                expenses.map(item => (
                  <View key={item.id} style={styles.ledgerRow}>
                    <View>
                      <Text style={styles.ledgerId}>ID: {item.id.substring(0, 8)}...</Text>
                      <Text style={styles.ledgerTime}>
                        {item.timestamp ? new Date(item.timestamp.seconds * 1000).toLocaleString() : 'Syncing...'}
                      </Text>
                    </View>
                    <Text style={[
                      styles.ledgerAmount, 
                      { color: item.type === 'income' ? '#10b981' : '#ef4444' }
                    ]}>
                      {item.type === 'income' ? '+' : '-'} ₹{item.amount.toLocaleString()}
                    </Text>
                  </View>
                ))
              )}
            </View>

            <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
              <Text style={styles.logoutText}>Secure Logout</Text>
            </TouchableOpacity>
          </View>
        ) : (
          // ==========================================
          // SECURE MOBILE LOGIN / REGISTRATION SCREEN
          // ==========================================
          <View style={styles.authCard}>
            <View style={styles.brandContainer}>
              <Text style={styles.brandTitle}>ADCS MOBILE</Text>
              <Text style={styles.brandSubtitle}>Secure Financial Ledger Portal</Text>
            </View>

            {/* Segmented Tab Controls */}
            <View style={styles.tabContainer}>
              <TouchableOpacity 
                style={[styles.tabButton, activeTab === 'signin' && styles.tabActive]}
                onPress={() => setActiveTab('signin')}
              >
                <Text style={[styles.tabButtonText, activeTab === 'signin' && styles.tabActiveText]}>Sign In</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.tabButton, activeTab === 'register' && styles.tabActive]}
                onPress={() => setActiveTab('register')}
              >
                <Text style={[styles.tabButtonText, activeTab === 'register' && styles.tabActiveText]}>Register</Text>
              </TouchableOpacity>
            </View>

            {activeTab === 'signin' ? (
              // EMAIL/PASSWORD SIGN IN FORM
              <View style={styles.form}>
                <TextInput
                  style={styles.input}
                  placeholder="Email Address"
                  placeholderTextColor="#666"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  value={email}
                  onChangeText={setEmail}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Security Password"
                  placeholderTextColor="#666"
                  secureTextEntry
                  value={password}
                  onChangeText={setPassword}
                />
                <TouchableOpacity 
                  style={styles.submitBtn} 
                  onPress={handleSignIn}
                  disabled={authLoading}
                >
                  {authLoading ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.submitBtnText}>Sign In</Text>
                  )}
                </TouchableOpacity>
              </View>
            ) : (
              // USER/EMPLOYEE REGISTRATION FORM
              <View style={styles.form}>
                <TextInput
                  style={styles.input}
                  placeholder="Full Name"
                  placeholderTextColor="#666"
                  value={fullName}
                  onChangeText={setFullName}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Email Address"
                  placeholderTextColor="#666"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  value={email}
                  onChangeText={setEmail}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Phone Number"
                  placeholderTextColor="#666"
                  keyboardType="phone-pad"
                  value={phone}
                  onChangeText={setPhone}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Security Password"
                  placeholderTextColor="#666"
                  secureTextEntry
                  value={password}
                  onChangeText={setPassword}
                />
                
                {/* Simple Role Selector */}
                <Text style={styles.label}>Select Account Clearance:</Text>
                <View style={styles.toggleRow}>
                  <TouchableOpacity 
                    style={[styles.toggleBtn, registerRole === 'USER' && styles.toggleActive]}
                    onPress={() => setRegisterRole('USER')}
                  >
                    <Text style={[styles.toggleText, registerRole === 'USER' && styles.toggleTextActive]}>Client (USER)</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={[styles.toggleBtn, registerRole === 'EMPLOYEE' && styles.toggleActive]}
                    onPress={() => setRegisterRole('EMPLOYEE')}
                  >
                    <Text style={[styles.toggleText, registerRole === 'EMPLOYEE' && styles.toggleTextActive]}>Staff (EMPLOYEE)</Text>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity 
                  style={styles.submitBtn} 
                  onPress={handleRegister}
                  disabled={authLoading}
                >
                  {authLoading ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.submitBtnText}>Register & Activate</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0a0b10',
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0a0b10',
  },
  loadingText: {
    marginTop: 12,
    color: '#6366f1',
    fontWeight: '600',
  },
  offlineBanner: {
    backgroundColor: '#f59e0b',
    padding: 10,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  offlineText: {
    color: '#000',
    fontWeight: '700',
    fontSize: 12,
    textAlign: 'center',
  },
  authCard: {
    backgroundColor: '#11131e',
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.15)',
    shadowColor: '#6366f1',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 5,
  },
  brandContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  brandTitle: {
    fontSize: 26,
    color: '#fff',
    fontWeight: '800',
    letterSpacing: 1,
  },
  brandSubtitle: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 4,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 10,
    padding: 3,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  tabButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  tabActive: {
    backgroundColor: '#6366f1',
  },
  tabButtonText: {
    color: '#64748b',
    fontWeight: '600',
    fontSize: 14,
  },
  tabActiveText: {
    color: '#fff',
  },
  form: {
    gap: 16,
  },
  label: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },
  input: {
    backgroundColor: '#0a0b10',
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#fff',
    fontSize: 14,
  },
  submitBtn: {
    backgroundColor: '#6366f1',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#6366f1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 3,
    marginTop: 8,
  },
  submitBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  dashboardContainer: {
    gap: 20,
  },
  headerCard: {
    backgroundColor: '#11131e',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.1)',
  },
  welcomeText: {
    fontSize: 18,
    color: '#fff',
    fontWeight: '700',
    marginTop: 12,
  },
  emailText: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 8,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
  },
  card: {
    backgroundColor: '#11131e',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  cardHeader: {
    fontSize: 15,
    color: '#fff',
    fontWeight: '700',
    marginBottom: 16,
  },
  toggleRow: {
    flexDirection: 'row',
    gap: 12,
  },
  toggleBtn: {
    flex: 1,
    backgroundColor: '#0a0b10',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  toggleActive: {
    borderColor: '#6366f1',
    backgroundColor: 'rgba(99, 102, 241, 0.05)',
  },
  toggleText: {
    color: '#64748b',
    fontWeight: '600',
    fontSize: 13,
  },
  toggleTextActive: {
    color: '#6366f1',
  },
  ledgerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.03)',
  },
  ledgerId: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  ledgerTime: {
    color: '#64748b',
    fontSize: 10,
    marginTop: 2,
  },
  ledgerAmount: {
    fontSize: 14,
    fontWeight: '700',
  },
  emptyText: {
    color: '#64748b',
    fontSize: 12,
    textAlign: 'center',
    paddingVertical: 12,
  },
  logoutBtn: {
    borderColor: 'rgba(239, 68, 68, 0.3)',
    borderWidth: 1,
    backgroundColor: 'rgba(239, 68, 68, 0.03)',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  logoutText: {
    color: '#ef4444',
    fontWeight: '700',
    fontSize: 14,
  },
});
