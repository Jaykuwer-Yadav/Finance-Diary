import { auth, db } from "./firebase";
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  sendPasswordResetEmail, 
  updatePassword 
} from "firebase/auth";
import { doc, setDoc, getDoc } from "firebase/firestore";

// 1. SECURE REGISTRATION WITH ROLE ASSIGNMENT & EMPLOYEE ID GENERATION
export const registerUserWithRole = async (email, password, fullName, role) => {
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    // Base profile data for everyone
    let profileData = {
      uid: user.uid,
      name: fullName,
      email: email,
      role: role, // "ADMIN", "MD", "DIRECTOR", "CO_DIRECTOR", "EMPLOYEE", "USER"
      createdAt: new Date().toISOString()
    };

    // If they are an employee, generate a readable EMP-ID
    if (role === 'EMPLOYEE' || role === 'MD' || role === 'DIRECTOR') {
      const randomNum = Math.floor(1000 + Math.random() * 9000); // e.g., 4829
      profileData.employeeId = `EMP-${randomNum}`;
    }

    // Create user profile doc linked precisely by Auth UID
    await setDoc(doc(db, "users", user.uid), profileData);

    return { success: true, user, data: profileData };
  } catch (error) {
    console.error("Registration Error:", error.message);
    throw error;
  }
};

// Alias for registration matching the secondary specification
export const registerAccount = registerUserWithRole;

// 2. LOGIN & ROLE ROUTING CHECK
export const loginAndFetchRole = async (email, password) => {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    // Fetch matching profile document from Firestore
    const userDocRef = doc(db, "users", user.uid);
    const userDoc = await getDoc(userDocRef);

    if (userDoc.exists()) {
      return { user, role: userDoc.data().role, profile: userDoc.data() };
    } else {
      throw new Error("User record not found in database.");
    }
  } catch (error) {
    console.error("Login Error:", error.message);
    throw error;
  }
};

// 3. FORGOT PASSWORD (Sends the reset email)
export const resetPassword = async (emailAddress) => {
  try {
    await sendPasswordResetEmail(auth, emailAddress);
    return { success: true, message: "Password reset email sent! Please check your inbox." };
  } catch (error) {
    console.error("Error sending reset email:", error.message);
    throw error;
  }
};

// 4. CHANGE PASSWORD (If a logged-in user wants to update their temp password)
export const changeCurrentPassword = async (newPassword) => {
  const user = auth.currentUser;
  if (user) {
    try {
      await updatePassword(user, newPassword);
      return { success: true, message: "Password updated successfully!" };
    } catch (error) {
      console.error("Error updating password:", error.message);
      throw error;
    }
  } else {
    throw new Error("No user is currently logged in.");
  }
};
