import { runTransaction, doc, DocumentData, Timestamp } from "firebase/firestore";
import { db } from "./firebaseConfig";

interface ProjectData extends DocumentData {
  totalPaidOut: number;
  lastPaymentDate: Timestamp | null;
}

interface ReferralData extends DocumentData {
  conversions: number;
  earnings: number;
  lastConversionDate: Timestamp | null;
}

export async function processRewardPaymentTransaction(
  projectId: string, 
  referralId: string, 
  conversionLogId: string, // Temporarily added
  amount: number, 
  transactionHash: string,
  conversionTimestamp: Date, // Temporarily added
): Promise<void> {
  const now = new Date();

  const projectRef = doc(db, "projects", projectId);
  const referralRef = doc(db, "referrals", referralId);
  const transactionRef = doc(db, `referrals/${referralId}/paymentTransactions`, transactionHash);
  const conversionLogRef = doc(db, `referrals/${referralId}/conversionLogs/${conversionLogId}`); // Temporarily added

  try {
    await runTransaction(db, async (transaction) => {
      const projectDoc = await transaction.get(projectRef);
      if (!projectDoc.exists()) {
        throw new Error(`Project with ID ${projectId} not found`);
      }
      const projectData = projectDoc.data() as ProjectData;

      const referralDoc = await transaction.get(referralRef);
      if (!referralDoc.exists()) {
        throw new Error(`Referral with ID ${referralId} not found`);
      }
      const referralData = referralDoc.data() as ReferralData;

      // transaction.update(projectRef, {
      //   totalPaidOut: projectData.totalPaidOut + amount,
      //   lastPaymentDate: now
      // });

      // transaction.update(referralRef, {
      //   conversions: referralData.conversions + 1,
      //   earnings: referralData.earnings + amount,
      //   lastConversionDate: now
      // });

      // transaction.set(transactionRef, {
      //   timestamp: now
      // });

      // Update project data
      transaction.update(projectRef, {
        totalPaidOut: projectData.totalPaidOut + amount,
        lastPaymentDate: projectData.lastPaymentDate === null || projectData.lastPaymentDate.toDate() < conversionTimestamp ? conversionTimestamp : projectData.lastPaymentDate
      });

      // Update referral data
      transaction.update(referralRef, {
        conversions: referralData.conversions + 1,
        earnings: referralData.earnings + amount,
        lastConversionDate: referralData.lastConversionDate === null || referralData.lastConversionDate.toDate() < conversionTimestamp ? conversionTimestamp : referralData.lastConversionDate
      });

      // Add transaction log
      transaction.set(transactionRef, {
        timestamp: conversionTimestamp, // Use conversion timestamp for consistency
        amount,
        conversionLogId
      });

      // Update conversion log
      transaction.update(conversionLogRef, {
        transactionHash,
        paidAt: now // Set the payment time to now
      });
    });
    console.log("Transaction successfully committed!");
  } catch (error) {
    console.error("Transaction failed: ", error);
    throw error;
  }
}
