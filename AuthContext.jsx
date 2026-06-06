import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth, db } from './firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';

// 1. Create the Context
const AuthContext = createContext();

// 2. Create the Provider Component
export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Listen for Firebase login/logout state changes
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setCurrentUser(user);
        
        // Fetch the role from Firestore
        try {
          const docRef = doc(db, 'users', user.uid);
          const docSnap = await getDoc(docRef);
          
          if (docSnap.exists()) {
            setUserRole(docSnap.data().role);
          } else {
            setUserRole('USER'); // Default fallback
          }
        } catch (error) {
          console.error("Error fetching user role:", error);
          setUserRole('USER');
        }
      } else {
        // User is logged out
        setCurrentUser(null);
        setUserRole(null);
      }
      setLoading(false); // Stop the loading spinner once we have the role
    });

    return () => unsubscribe();
  }, []);

  // 3. Derived Access Flags (The Magic Vibe-Coding Helpers!)
  const isAdmin = userRole === 'ADMIN';
  const isExecutive = ['ADMIN', 'MD', 'DIRECTOR', 'CO_DIRECTOR'].includes(userRole);
  const isEmployee = ['EMPLOYEE', 'ADMIN', 'MD', 'DIRECTOR', 'CO_DIRECTOR'].includes(userRole);

  const logout = () => signOut(auth);

  const value = {
    currentUser,
    userRole,
    isAdmin,
    isExecutive,
    isEmployee,
    logout,
  };

  return (
    <AuthContext.Provider value={value}>
      {/* We wait for the role to load before rendering the app so the screen doesn't flash! */}
      {!loading && children} 
    </AuthContext.Provider>
  );
};

// 4. Custom Hook for easy importing
export const useAuth = () => useContext(AuthContext);
