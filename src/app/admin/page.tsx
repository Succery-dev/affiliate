"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAddress, useSwitchChain, useChainId } from "@thirdweb-dev/react";
import { Chain } from "@thirdweb-dev/chains";
import { toast } from "react-toastify";
import { ethers } from "ethers";
import { 
  fetchAllUnpaidConversionLogs, processRewardPaymentTransaction, logErrorToFirestore, 
  updateIsPaidFlag, fetchUnapprovedUsers, approveUser, fetchReferralData, updateTweetEngagement,
} from "../utils/firebase";
import { initializeSigner, ERC20 } from "../utils/contracts";
import { 
  UnpaidConversionLog, UserData, ExtendedTweetEngagement, ReferralData,
  ActiveTab,
} from "../types";
import { 
  Header, AdminHeaderWithReloadButton, AdminTabs, TokenSummary, UnpaidConversionLogs,
  UserApproval, ManualTweetEngagementUpdate,
} from "../components/admin";

const ZERO_ADDRESS = ethers.constants.AddressZero;

export default function Admin() {
  const router = useRouter();
  const pathname = usePathname();
  const address = useAddress();
  const switchChain = useSwitchChain();
  const currentChainId = useChainId();
  const [signer, setSigner] = useState<ethers.Signer | null>(null);
  const [isSignerInitialized, setIsSignerInitialized] = useState(false);
  const adminWalletAddresses = process.env.NEXT_PUBLIC_ADMIN_WALLET_ADDRESSES?.split(",");
  const [unpaidLogsLoading, setUnpaidLogsLoading] = useState(false);
  const [userApprovalLoading, setUserApprovalLoading] = useState(false);
  const [processingLogId, setProcessingLogId] = useState<string | null>(null);
  const [unpaidConversionLogs, setUnpaidConversionLogs] = useState<UnpaidConversionLog[]>([]);
  const [tokenSummary, setTokenSummary] = useState<{ 
    [tokenAddress: string]: { amount: number, chain: Chain } 
  }>({});
  const [activeTab, setActiveTab] = useState<ActiveTab>("unpaidConversionLogs");
  const [unapprovedUsers, setUnapprovedUsers] = useState<UserData[]>([]);

  useEffect(() => {
    if (!address) {
      if (pathname !== "/onboarding") {
        router.push("/onboarding");
        toast.error("You must be connected to access this page");
      }
      return;
    }

    if (!adminWalletAddresses?.map(addr => addr.toLowerCase()).includes(address!.toLowerCase())) {
      if (pathname !== "/onboarding") {
        router.push("/onboarding");
        toast.error("You do not have permission to access this page");
      }
      return;
    }

    if (!isSignerInitialized) {
      const initializedSigner = initializeSigner();
      if (!initializedSigner) {
        console.error("Signer initialization failed");
        if (pathname !== "/onboarding") {
          router.push("/onboarding");
          toast.error("Failed to initialize signer");
        }
        return;
      }
      setSigner(initializedSigner);
      setIsSignerInitialized(true);
    }
  }, [address, adminWalletAddresses, router, pathname, isSignerInitialized]);

  useEffect(() => {
    if (signer && isSignerInitialized) {
      loadUnpaidConversionLogs();
      loadUnapprovedUsers();
    }
  }, [signer, isSignerInitialized]);

  const loadUnpaidConversionLogs = () => {
    setUnpaidLogsLoading(true);
    fetchAllUnpaidConversionLogs()
      .then((logs) => {
        setUnpaidConversionLogs(logs);
        summarizeTokens(logs);
        setUnpaidLogsLoading(false);
      })
      .catch((error) => {
        console.error("Error fetching unpaid conversion logs: ", error);
        toast.error("Failed to fetch unpaid conversion logs");
        setUnpaidLogsLoading(false);
      });
  };

  const loadUnapprovedUsers = () => {
    setUserApprovalLoading(true);
    fetchUnapprovedUsers()
      .then((users) => {
        setUnapprovedUsers(users);
        setUserApprovalLoading(false);
      })
      .catch((error) => {
        console.error("Error fetching unapproved users: ", error);
        toast.error("Failed to fetch unapproved users");
        setUserApprovalLoading(false);
      });
  };

  const summarizeTokens = (logs: UnpaidConversionLog[]) => {
    const summary: { [key: string]: { amount: number, chain: Chain } } = {};

    logs.forEach(log => {
      const tokenKey = log.selectedTokenAddress === ZERO_ADDRESS 
        ? `${ZERO_ADDRESS}-${log.selectedChain.chainId}`  // Combine ZERO_ADDRESS with chain ID for uniqueness
        : log.selectedTokenAddress;

      if (!summary[tokenKey]) {
        summary[tokenKey] = { amount: 0, chain: log.selectedChain };
      }
      summary[tokenKey].amount += log.amount;
    });

    setTokenSummary(summary);
  };

  const handlePay = async (log: UnpaidConversionLog) => {
    setProcessingLogId(log.logId);
    try {
      toast.info(`Starting payment process for ${log.logId}...`);

      // Check if the current wallet chain matches the log's chain
      if (currentChainId !== log.selectedChain.chainId) {
        try {
          await switchChain(log.selectedChain.chainId);
        } catch (error) {
          console.error("Failed to switch chains: ", error);
          toast.error("Failed to switch chains");
          return;
        }
      }
      
      // Mark the log as paid to prevent duplicate payments
      await updateIsPaidFlag(log.referralId, log.logId, true);

      let transactionHashAffiliate, transactionHashUser;
      const payoutAmount = log.userWalletAddress ? log.amount / 2 : log.amount;

      try {
        toast.info("Transferring tokens to affiliate...");

        if (log.selectedTokenAddress === ZERO_ADDRESS) {
          // Native token transfer process
          const transactionResponse = await signer!.sendTransaction({
            to: log.affiliateWallet,
            value: ethers.utils.parseEther(payoutAmount.toString()),
            gasLimit: ethers.utils.hexlify(21000),
            gasPrice: await signer!.getGasPrice(),
          });
          transactionHashAffiliate = transactionResponse.hash;
        } else {
          // ERC20 token transfer process
          const erc20 = new ERC20(log.selectedTokenAddress, signer!);
          transactionHashAffiliate = await erc20.transfer(log.affiliateWallet, payoutAmount);
        }
      } catch (error) {
        // If token transfer fails, revert the isPaid flag
        await updateIsPaidFlag(log.referralId, log.logId, false);

        console.error("Failed to transfer tokens: ", error);
        toast.error("Failed to transfer tokens");
        return; // If the token transfer fails, exit the function
      }

      // If referral is enabled, also transfer to user
      if (log.userWalletAddress) {
        try {
          toast.info("Transferring tokens to user...");

          if (log.selectedTokenAddress === ZERO_ADDRESS) {
            // Native token transfer process
            const transactionResponse = await signer!.sendTransaction({
              to: log.userWalletAddress,
              value: ethers.utils.parseEther(payoutAmount.toString()),
              gasLimit: ethers.utils.hexlify(21000),
              gasPrice: await signer!.getGasPrice(),
            });
            transactionHashUser = transactionResponse.hash;
          } else {
            // ERC20 token transfer process
            const erc20 = new ERC20(log.selectedTokenAddress, signer!);
            transactionHashUser = await erc20.transfer(log.userWalletAddress, payoutAmount);
          }
        } catch (error: any) {
          // Log error in the database for later review
          await logErrorToFirestore(
            "UserPaymentError",
            `Failed to transfer tokens to user: ${error.message}`,
            { ...log, transactionHashAffiliate }
          );

          console.error("Failed to transfer tokens to user: ", error);
          toast.error("Failed to transfer tokens to user");
          // We don't revert the isPaid flag here, as the affiliate payment succeeded

          // Set a placeholder "error" string to indicate failure in user payment
          transactionHashUser = "error";
        }
      }

      try {
        toast.info("Updating transaction in Firestore...");
        await processRewardPaymentTransaction(
          log.projectId,
          log.referralId,
          log.logId,
          payoutAmount,
          transactionHashAffiliate,
          log.timestamp,
          transactionHashUser // Optional: it will be passed whether it's defined, "error", or undefined
        );

        toast.success(`Payment processed for ${log.logId}.`);
      } catch (error: any) {
        console.error("Failed to update Firestore: ", error);
        toast.error("Failed to update Firestore");

        await logErrorToFirestore(
          "FirestoreUpdateAfterPaymentError",
          `Failed to update Firestore: ${error.message}`,
          { ...log, transactionHashAffiliate }
        );
      } finally {
        // Regardless of success or failure in Firestore update, remove the log from the list
        setUnpaidConversionLogs(prevLogs => {
          const updatedLogs = prevLogs.filter(l => l.logId !== log.logId);
          summarizeTokens(updatedLogs); // Update token summary
          return updatedLogs;
        });
      }

    } catch (error) {
      console.error("Failed to process payment: ", error);
      toast.error("Failed to process payment");
    } finally {
      setProcessingLogId(null);
    }
  };

  const handleApprove = async (walletAddress: string) => {
    const confirmApproval = window.confirm("Are you sure you want to approve this user?");
    if (!confirmApproval) {
      return;
    }

    try {
      toast.info(`Approving user ${walletAddress}...`);
      
      await approveUser(walletAddress);
  
      // Remove the approved user from the list
      setUnapprovedUsers(prevUsers => prevUsers.filter(user => user.walletAddress !== walletAddress));
    } catch (error: any) {
      console.error("Failed to approve user: ", error);
      toast.error(`Failed to approve user: ${error.message}`);
    }
  };

  // =============== BEGIN TWEET ENGAGEMENT MANAGEMENT ==============
  const [referralIdsForTweetEngagementData, setReferralIdsForTweetEngagementData] = useState("");
  const [engagementDataArray, setEngagementDataArray] = useState<ExtendedTweetEngagement[] | null>(null);
  const [loadingTweetEngagementData, setLoadingTweetEngagementData] = useState(false);

  const handleFetchTweetEngagement = async () => {
    setLoadingTweetEngagementData(true);
    
    try {
      // Start the process - Show a toast notification
      toast.info("Fetching Tweet engagement data...");
  
      // Convert comma-separated Referral IDs to an array and trim excess whitespace
      const referralIdsArray = referralIdsForTweetEngagementData
        .split(",")
        .map(id => id.trim())
        .filter(id => id !== ""); // Remove empty IDs
  
      // Fetch referral data for each referral ID, handle errors gracefully
      const referralDataPromises = referralIdsArray.map(async (referralId) => {
        try {
          const referralData = await fetchReferralData(referralId);
          return referralData;
        } catch (error) {
          return null; // Skip invalid or failed referral ID
        }
      });
  
      // Use Promise.allSettled to process all requests and handle failures
      const referralDataResults = await Promise.allSettled(referralDataPromises);
  
      // Filter out any failed requests or null results
      const validReferralDataResults = referralDataResults
        .filter((result): result is PromiseFulfilledResult<ReferralData | null> => result.status === "fulfilled" && result.value !== null)
        .map(result => result.value as ReferralData);
  
      // Extract tweet URLs and Tweet IDs from valid referral data
      const tweetIds = validReferralDataResults
        .map(referralData => {
          const tweetUrl = referralData.tweetUrl;
          const tweetIdMatch = tweetUrl?.match(/status\/(\d+)/);
          if (!tweetIdMatch || !tweetIdMatch[1]) {
            console.error(`Invalid tweet URL for referral ID: ${referralData.id}`);
            return null;
          }
          return { tweetId: tweetIdMatch[1], tweetUrl, referralId: referralData.id! };
        })
        .filter(tweetData => tweetData !== null); // Filter out any invalid tweet URLs
  
      // Handle batching if more than 100 tweets
      const batchSize = 100;
      const batchedTweetData: ExtendedTweetEngagement[] = [];
  
      for (let i = 0; i < tweetIds.length; i += batchSize) {
        const tweetBatch = tweetIds.slice(i, i + batchSize);
        const tweetIdsBatch = tweetBatch.map(data => data!.tweetId).join(",");
  
        // Call the internal API for fetching Tweet engagement data
        const response = await fetch(`/api/fetchTweetEngagement?tweetIds=${tweetIdsBatch}`, {
          headers: {
            "x-api-key": process.env.NEXT_PUBLIC_X_API_BEARER_TOKEN as string,
          },
        });
  
        if (!response.ok) {
          console.error(`Error fetching tweet engagement data: ${response.statusText}`);
          toast.error(`Error fetching tweet engagement data: ${response.statusText}`); // Add toast for error
          continue;  // Skip this batch if the API request fails
        }
  
        const engagementDataResponse = await response.json();
        const engagementDataArray = engagementDataResponse.data;
  
        // Map the fetched engagement data using tweetId
        tweetBatch.forEach((tweetData) => {
          if (tweetData) {  // Add this check to ensure tweetData is not null
            const matchingData = engagementDataArray.find((engagement: { id: string }) => engagement.id === tweetData.tweetId);
            if (matchingData) {
              const engagementData = matchingData.public_metrics;
              batchedTweetData.push({
                referralId: tweetData.referralId,
                tweetUrl: tweetData.tweetUrl ?? "",
                retweetCount: engagementData.retweet_count,
                replyCount: engagementData.reply_count,
                likeCount: engagementData.like_count,
                quoteCount: engagementData.quote_count,
                bookmarkCount: engagementData.bookmark_count,
                impressionCount: engagementData.impression_count,
                fetchedAt: new Date(),
              });
            }
          }
        });
      }
  
      // Update the state with the final batched data
      if (batchedTweetData.length === 0) {
        setEngagementDataArray(null);
        toast.warn("No engagement data found for the provided Tweet IDs.");
      } else {
        setEngagementDataArray(batchedTweetData);
  
        // After setting the engagement data in the state, update Firestore
        try {
          await updateTweetEngagement(batchedTweetData);  // Add this to update Firestore
          toast.success("Tweet engagement data successfully updated in Firestore.");
        } catch (error) {
          console.error("Error updating Firestore with Tweet engagement data:", error);
          toast.error("Failed to update Firestore with Tweet engagement data.");
        }
      }
  
      // Clear the input field
      setReferralIdsForTweetEngagementData("");
  
    } catch (error) {
      console.error("Failed to fetch & update tweet engagement:", error);
      toast.error("Failed to fetch & update Tweet engagement data.");
    } finally {
      setLoadingTweetEngagementData(false);
    }
  };
  // =============== END TWEET ENGAGEMENT MANAGEMENT ==============

  return (
    <div className="min-h-screen flex flex-col items-center">

      <Header address={address ?? null} />
      
      <AdminHeaderWithReloadButton
        activeTab={activeTab}
        unpaidLogsLoading={unpaidLogsLoading}
        userApprovalLoading={userApprovalLoading}
        loadUnpaidConversionLogs={loadUnpaidConversionLogs}
        loadUnapprovedUsers={loadUnapprovedUsers}
      />

      <AdminTabs activeTab={activeTab} setActiveTab={setActiveTab} />

      {activeTab === "unpaidConversionLogs" && (
        <>
          <TokenSummary tokenSummary={tokenSummary} unpaidLogsLoading={unpaidLogsLoading} />
          <UnpaidConversionLogs
            unpaidConversionLogs={unpaidConversionLogs}
            unpaidLogsLoading={unpaidLogsLoading}
            processingLogId={processingLogId}
            handlePay={handlePay}
          />
        </>
      )}

      {activeTab === "userApproval" && (
        <UserApproval
          userApprovalLoading={userApprovalLoading}
          unapprovedUsers={unapprovedUsers}
          handleApprove={handleApprove}
        />
      )}

      {activeTab === "manualTweetEngagementUpdate" && (
        <ManualTweetEngagementUpdate
          referralIdsForTweetEngagementData={referralIdsForTweetEngagementData}
          setReferralIdsForTweetEngagementData={setReferralIdsForTweetEngagementData}
          handleFetchTweetEngagement={handleFetchTweetEngagement}
          loadingTweetEngagementData={loadingTweetEngagementData}
          engagementDataArray={engagementDataArray}
        />
      )}

    </div>
  );
};
