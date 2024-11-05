import React, { useState, useEffect } from "react";
import Image from "next/image";
import { ExtendedReferralData, AggregatedReferralData } from "../../types";
import { formatAddress } from "../../utils/formatUtils";
import { toast } from "react-toastify";
import { aggregateReferralData } from "../../utils/firebase";

type AffiliatePerformanceListProps = {
  referrals: ExtendedReferralData[];
  selectedToken: string;
};

export const AffiliatePerformanceList: React.FC<AffiliatePerformanceListProps> = ({ referrals, selectedToken }) => {
  const [referralData, setReferralData] = useState<AggregatedReferralData[]>([]);
  const [aggregating, setAggregating] = useState<boolean>(true);

  useEffect(() => {
    const fetchAndSetConversionLogs = async () => {
      setAggregating(true);
      try {
        const updatedReferrals = await aggregateReferralData(referrals);
        setReferralData(updatedReferrals);
      } catch (error) {
        // Error handling is already done in the helper function
      } finally {
        setAggregating(false);
      }
    };

    fetchAndSetConversionLogs();
  }, [referrals]);

  const handleCopyAddress = (address: string) => {
    navigator.clipboard.writeText(address)
      .then(() => {
        toast.success("Wallet address copied to clipboard");
      })
      .catch((error) => {
        toast.error("Failed to copy address: " + error.message);
      });
  };

  return (
    <div className="space-y-2">
      <h1 className="font-bold text-xl">Engagement</h1>
      <div className="shadow rounded-lg">
        {aggregating ? (
          <div className="py-10 flex flex-row items-center justify-center gap-5">
            <Image
              src="/assets/common/loading.png"
              alt="loading.png"
              width={50}
              height={50}
              className="animate-spin"
            /> 
            <p className="animate-pulse font-semibold text-gray-600">Aggregating data...</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead>
                <tr>
                  <th className="px-6 py-3 bg-gray-50 text-left text-xs leading-4 font-medium text-gray-500 uppercase tracking-wider">Influencer</th>
                  <th className="px-6 py-3 bg-gray-50 text-left text-xs leading-4 font-medium text-gray-500 uppercase tracking-wider">Earnings ({selectedToken})</th>
                  <th className="px-6 py-3 bg-gray-50 text-left text-xs leading-4 font-medium text-gray-500 uppercase tracking-wider">Conversions</th>
                  <th className="px-6 py-3 bg-gray-50 text-left text-xs leading-4 font-medium text-gray-500 uppercase tracking-wider">Clicks</th>
                  <th className="px-6 py-3 bg-gray-50 text-left text-xs leading-4 font-medium text-gray-500 uppercase tracking-wider hidden lg:table-cell">Creation Date</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {referralData.length ? (
                  referralData.map((referral, index) => (
                    <React.Fragment key={index}>
                      <tr className="text-gray-500 hover:bg-gray-50 hover:text-gray-900">
                        <td className="px-6 py-4 whitespace-no-wrap text-sm leading-5">
                          <p>{referral.username} <span 
                            onClick={() => handleCopyAddress(referral.affiliateWallet)}
                            className="text-blue-500 hover:text-blue-700 cursor-pointer"
                            title="Click to copy address"
                          >
                            ({formatAddress(referral.affiliateWallet)})
                          </span></p>
                        </td>
                        <td className="px-6 py-4 whitespace-no-wrap text-sm leading-5">{referral.aggregatedEarnings}</td>
                        <td className="px-6 py-4 whitespace-no-wrap text-sm leading-5">{referral.aggregatedConversions}</td>
                        <td className="px-6 py-4 whitespace-no-wrap text-sm leading-5">{referral.clicks.length}</td>
                        <td className="px-6 py-4 whitespace-no-wrap text-sm leading-5 hidden lg:table-cell">{referral.createdAt.toLocaleDateString()}</td>
                      </tr>
                    </React.Fragment>
                  ))
                ) : (
                  <tr className="text-gray-500">
                    <td colSpan={5} className="text-center py-4">No Referral Data</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};