import React, { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { toast } from "react-toastify";
import { isAddress } from "ethers/lib/utils";
import { Chain } from "@thirdweb-dev/chains";
import { Button } from "./Button";
import { initializeSigner, ERC20, isEOA } from "../../utils/contracts";
import { formatBalance } from "../../utils/formatters";
import { 
  WhitelistedAddress, ProjectType, PaymentType, 
  PaymentDetails, FixedAmountDetails, RevenueShareDetails, Tier, TieredDetails,
} from "../../types";
import { useChainContext } from "../../context/chainContext";
import { ChainSelector } from "../ChainSelector";
import { ToggleButton } from "../ToggleButton";
import { popularTokens } from "../../constants/popularTokens";

type AffiliatesFormProps = {
  data: {
    projectType: ProjectType;
    selectedTokenAddress: string;
    paymentType?: PaymentType;
    paymentDetails?: PaymentDetails;
    whitelistedAddresses?: { [address: string]: WhitelistedAddress };
    redirectUrl?: string;
    isReferralEnabled?: boolean;
  };
  handleChange: (field: string, isNumeric?: boolean, isFloat?: boolean) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void;
  handlePaymentTypeChange?: (type: PaymentType) => void;
  handleTierChange?: (newTiers: Tier[]) => void;
  handleWhitelistChange?: (newWhitelistedAddresses: { [address: string]: WhitelistedAddress }) => void;
  setRedirectLinkError?: (hasError: boolean) => void;
  setIsReferralEnabled?: (value: boolean) => void;
  nextStep?: () => void;
  previousStep?: () => void;
  isSaving?: boolean;
  hideButton?: boolean;
  status?: string;
  selectedChain?: Chain | null;
};

type WhitelistEntry = {
  address: string;
  details: WhitelistedAddress;
}

export const AffiliatesForm: React.FC<AffiliatesFormProps> = ({
  data,
  handleChange,
  handlePaymentTypeChange,
  handleTierChange,
  handleWhitelistChange,
  setRedirectLinkError,
  setIsReferralEnabled,
  nextStep,
  previousStep,
  isSaving,
  hideButton,
  status,
  selectedChain: selectedChainProp,
}) => {
  const isEditing = nextStep === undefined;
  const { selectedChain: contextSelectedChain } = useChainContext();
  const selectedChain = selectedChainProp ?? contextSelectedChain;

  const isFormComplete = () => {
    if (data.projectType === "DirectPayment") {
      return (
        data.selectedTokenAddress.trim() &&
        Object.keys(data.whitelistedAddresses ?? {}).length > 0
      );
    } else if (data.projectType === "EscrowPayment") {
      if (!data.selectedTokenAddress.trim() || !data.redirectUrl?.trim() || !isValidUrl(data.redirectUrl)) {
        return false;
      }
  
      if (data.paymentType === "FixedAmount") {
        return (data.paymentDetails as FixedAmountDetails)?.rewardAmount > 0;
      } else if (data.paymentType === "RevenueShare") {
        return (data.paymentDetails as RevenueShareDetails)?.percentage > 0;
      } else if (data.paymentType === "Tiered") {
        return (
          Array.isArray((data.paymentDetails as TieredDetails)?.tiers) &&
          (data.paymentDetails as TieredDetails).tiers.length > 0
        );
      }
    }
    return false; // In case projectType is not set or unknown
  };

  const [selectedToken, setSelectedToken] = useState(
    data.selectedTokenAddress 
      ? (popularTokens[selectedChain.chainId] || []).find(token => token.address === data.selectedTokenAddress)?.symbol || "other"
      : "other"
  );

  const [tokenSymbol, setTokenSymbol] = useState("");
  const [tokenBalance, setTokenBalance] = useState("");
  const [tokenAllowance, setTokenAllowance] = useState("");
  const [isFetchingTokenDetails, setIsFetchingTokenDetails] = useState(false);
  const [isTokenAddressValid, setIsTokenAddressValid] = useState(true);
  const [isErc20Token, setIsErc20Token] = useState(true);

  const initializeTokenStates = () => {
    setTokenSymbol("");
    setTokenBalance("");
    setTokenAllowance("");
  };

  const fetchTokenDetails = async (address: string) => {
    if (address.trim() === "") {
      setIsTokenAddressValid(true); // Reset validation state for empty input
      setIsErc20Token(true); // Reset to avoid conflicting error messages
      initializeTokenStates();
      return;
    }
    if (!isAddress(address)) {
      setIsTokenAddressValid(false);
      setIsErc20Token(true); // reset to avoid conflicting error messages
      initializeTokenStates();
      return;
    }

    setIsTokenAddressValid(true);
    setIsFetchingTokenDetails(true);

    try {
      const signer = initializeSigner();
      if (!signer) {
        throw new Error("Failed to initialize signer.");
      }
      const erc20 = new ERC20(address, signer);
      const symbol = await erc20.getSymbol();
      const balance = await erc20.getBalance(await signer.getAddress());
      // const allowance = await erc20.getAllowance(await signer.getAddress(), `${process.env.NEXT_PUBLIC_ESCROW_CONTRACT_ADDRESS}`);

      setTokenSymbol(symbol);
      setTokenBalance(balance);
      // setTokenAllowance(allowance);

      setIsErc20Token(true);

      console.log(JSON.stringify({
        "Address": address,
        "Symbol": symbol,
        "Balance": balance,
        // "Allowance": allowance,
        "Allowance": "0",
      }, null, 2));
    } catch (error: any) {
      console.error(`Error fetching token details: ${error.message}`);
      toast.error(`Error fetching token details: ${error.message}`);
      setIsErc20Token(false);
      initializeTokenStates();
    }
    setIsFetchingTokenDetails(false);
  };

  useEffect(() => {
    if (!isEditing && data.selectedTokenAddress && (selectedToken === "other")) {
      fetchTokenDetails(data.selectedTokenAddress);
    } else {
      initializeTokenStates();
    }
  }, [data.selectedTokenAddress, selectedChain, selectedToken]);

  // ===== BEGIN WHITELIST MANAGEMENT =====

  // Use "data.whitelistedAddresses" as initial value
  const [whitelistedEntries, setWhitelistedEntries] = useState<WhitelistEntry[]>(() =>
    Object.entries(data.whitelistedAddresses ?? {}).map(([address, details]) => ({
      address,
      details
    }))
  );
  const [newAddress, setNewAddress] = useState("");
  const [newRedirectUrl, setNewRedirectUrl] = useState("");
  const [newRewardAmount, setNewRewardAmount] = useState(0);

  const [isCheckingNewWhitelistEntry, setIsCheckingNewWhitelistEntry] = useState(false);

  // Helper function to check if URL is valid
  const isValidUrl = (url: string): boolean => {
    try {
      new URL(url);
      return true;
    } catch (e) {
      return false;
    }
  };

  const handleAdd = async () => {
    setIsCheckingNewWhitelistEntry(true);

    // Input validation
    if (!isAddress(newAddress)) {
      toast.error("Invalid wallet address.");
      setIsCheckingNewWhitelistEntry(false);
      return;
    }
    // Check if the address is an EOA
    const eoa = await isEOA(newAddress, selectedChain.chainId);
    if (!eoa) {
      toast.error("This address is a contract address and cannot be added to the whitelist.");
      setIsCheckingNewWhitelistEntry(false);
      return;
    }
    if (!isValidUrl(newRedirectUrl)) {
      toast.error("Invalid URL.");
      setIsCheckingNewWhitelistEntry(false);
      return;
    }
    if (!(newRewardAmount > 0)) {
      toast.error("Reward amount must be greater than zero.");
      setIsCheckingNewWhitelistEntry(false);
      return;
    }
  
    // Check for duplicate addresses
    const exists = Object.keys(data.whitelistedAddresses ?? {}).includes(newAddress);
    if (exists) {
      toast.error("Address already exists in the whitelist.");
      setIsCheckingNewWhitelistEntry(false);
      return;
    }
  
    // Create new entry
    const newEntry: WhitelistedAddress = { redirectUrl: newRedirectUrl, rewardAmount: newRewardAmount };
    const updatedEntries = { ...data.whitelistedAddresses, [newAddress]: newEntry };
  
    // Update entire project data
    if (handleWhitelistChange) {
      handleWhitelistChange(updatedEntries);
    }
  
    // Also updates local state
    setWhitelistedEntries(prevEntries => [...prevEntries, { address: newAddress, details: newEntry }]);
  
    // Reset input field
    setNewAddress("");
    setNewRedirectUrl("");
    setNewRewardAmount(0);
    toast.success("New address added to whitelist.");
    setIsCheckingNewWhitelistEntry(false);
  };  

  const handleRemove = (addressToRemove: string) => {
    // Create a new array that excludes the specified address from `whitelistedEntries`
    setWhitelistedEntries(prevEntries =>
      prevEntries.filter(entry => entry.address !== addressToRemove)
    );

    // Delete the address from the original project data
    const updatedEntries = { ...data.whitelistedAddresses };
    delete updatedEntries[addressToRemove];
    if (handleWhitelistChange) {
      handleWhitelistChange(updatedEntries);
    }

    toast.success(`Address ${addressToRemove} has been removed from the whitelist.`);
  };

  // ===== END WHITELIST MANAGEMENT =====

  // ===== BEGIN TIER MANAGEMENT =====

  // Use "data.paymentDetails.tiers" as initial value
  const [tierEntries, setTierEntries] = useState<Tier[]>(() =>
    (data.paymentDetails as TieredDetails)?.tiers ?? []
  );
  
  const [newConversionsRequired, setNewConversionsRequired] = useState(0);
  const [newTierRewardAmount, setNewTierRewardAmount] = useState(0);

  const [isCheckingNewTierEntry, setIsCheckingNewTierEntry] = useState(false);

  const handleAddTier = async () => {
    setIsCheckingNewTierEntry(true);
  
    // Input validation
    if (isNaN(newConversionsRequired) || newConversionsRequired < 1 || newConversionsRequired > 1000) {
      toast.error("Conversions required must be between 1 and 1000.");
      setIsCheckingNewTierEntry(false);
      return;
    }
    if (isNaN(newTierRewardAmount) || newTierRewardAmount <= 0) {
      toast.error("Reward amount must be greater than zero.");
      setIsCheckingNewTierEntry(false);
      return;
    }
    if (tierEntries.some(tier => tier.conversionsRequired === newConversionsRequired)) {
      toast.error("A tier with the same conversions required already exists.");
      setIsCheckingNewTierEntry(false);
      return;
    }
    if (tierEntries.length >= 10) {
      toast.error("You can only create up to 10 tiers.");
      setIsCheckingNewTierEntry(false);
      return;
    }
  
    // Create new tier entry
    const newTier: Tier = { conversionsRequired: newConversionsRequired, rewardAmount: newTierRewardAmount };
    const updatedTiers = [...tierEntries, newTier].sort((a, b) => a.conversionsRequired - b.conversionsRequired);
  
    // Update local state
    setTierEntries(updatedTiers);
  
    // Update project data
    if (handleTierChange) {
      handleTierChange(updatedTiers);
    }
  
    // Reset input fields
    setNewConversionsRequired(0);
    setNewTierRewardAmount(0);
  
    toast.success("New reward tier added.");
    setIsCheckingNewTierEntry(false);
  };

  const handleRemoveTier = (index: number) => {
    // Create a new array that excludes the specified tier
    const updatedTiers = tierEntries.filter((_, i) => i !== index);
  
    // Update local state
    setTierEntries(updatedTiers);
  
    // Update project data
    if (handleTierChange) {
      handleTierChange(updatedTiers);
    }
  
    toast.success("Reward tier removed.");
  };

  // ===== END TIER MANAGEMENT =====

  const [redirectUrlError, setRedirectUrlError] = useState("");

  const handleRedirectUrlChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    if (!isValidUrl(value)) {
      setRedirectUrlError("Invalid redirect URL.");
      setRedirectLinkError && setRedirectLinkError(true);
    } else {
      setRedirectUrlError("");
      setRedirectLinkError && setRedirectLinkError(false);
    }
    handleChange("redirectUrl")(event);
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-5 my-10 text-sm">

      <h1 className="text-xl mb-5">Affiliates & Referrals</h1>

      <div className="flex flex-col gap-5">
        
        <div className="flex flex-col gap-2">
          <h2>Chain & Token <span className="text-red-500">*</span> <span className="text-gray-500 text-sm">({isEditing ? "Not editable" : "Chain & Token address cannot be edited after initial setup."})</span></h2>
          <div className="flex items-center gap-2">
            <ChainSelector useSwitch={true} isEditing={isEditing} overrideSelectedChain={selectedChain} />
            <select
              value={selectedToken}
              onChange={(e) => {
                setSelectedToken(e.target.value);
                const selectedSymbol = e.target.value;

                if (selectedSymbol === "other") {
                  handleChange("selectedTokenAddress")({ target: { value: "" } } as React.ChangeEvent<HTMLInputElement>);
                } else {
                  const token = popularTokens[selectedChain.chainId]?.find(token => token.symbol === selectedSymbol);
                  if (token) {
                    handleChange("selectedTokenAddress")({ target: { value: token.address } } as React.ChangeEvent<HTMLInputElement>);
                  }
                }
              }}
              className={`p-2 border border-[#D1D5DB] rounded-lg outline-none ${isEditing ?  "bg-gray-100 cursor-not-allowed" : "bg-white"}`}
              disabled={isEditing}
            >
              <option value="" disabled>Select a token</option>
              {(popularTokens[selectedChain.chainId] || []).map((token) => (
                <option key={token.address} value={token.symbol}>
                  {token.symbol}
                </option>
              ))}
              <option value="other">Other Token</option>
            </select>
            <input
              readOnly={isEditing || (selectedToken !== "other")}
              type="text"
              value={data.selectedTokenAddress}
              onChange={(e) => {
                handleChange("selectedTokenAddress")(e);
                const address = e.target.value.trim();
                if (address === "") {
                  setIsTokenAddressValid(true);
                  setIsErc20Token(true);
                  initializeTokenStates();
                } else {
                  fetchTokenDetails(address);
                }
              }}
              placeholder="Enter token contract address"
              className={`grow p-2 border border-[#D1D5DB] rounded-lg outline-none ${(isEditing || (selectedToken !== "other")) ? "bg-gray-100 text-gray-500 cursor-not-allowed" : "bg-white text-black"}`}
            />
          </div>
          {!isTokenAddressValid && (
            <p className="text-red-500 text-sm pl-2">Invalid token address.</p>
          )}
          {!isErc20Token && (
            <p className="text-red-500 text-sm pl-2">Address is not an ERC20 token contract.</p>
          )}
          {isFetchingTokenDetails &&
            <div className="flex flex-row gap-3">
              <Image src="/loading.png" alt="loading.png" width={20} height={20} className="animate-spin" /> 
              <p className="text-gray-900 animate-pulse">Fetching Token Details...</p>
            </div>
          }
          {/* {!isEditing && tokenSymbol && tokenBalance && tokenAllowance &&  */}
          {!isEditing && tokenSymbol && tokenBalance && 
            <div className="flex flex-row justify-around">
              <p><span className="font-semibold">Token:</span> {tokenSymbol}</p>
              <p>/</p>
              <p><span className="font-semibold">Balance:</span> {formatBalance(tokenBalance)}</p>
              <p>/</p>
              {/* <p><span className="font-semibold">Allowance:</span> {formatBalance(tokenAllowance)}</p> */}
              <p><span className="font-semibold">Allowance:</span> -</p>
            </div>
          }
          {isEditing && selectedChain && selectedChain.explorers && selectedChain.explorers.length > 0 && (
            <Link
              href={`${selectedChain.explorers[0].url}/address/${data.selectedTokenAddress}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mr-auto text-blue-400 hover:text-blue-700 hover:font-semibold hover:underline"
            >
              &rarr; View on Explorer
            </Link>
          )}
        </div>

        {data.projectType === "EscrowPayment" && (
          <div className="flex flex-col gap-2">
            <h2>Referral Feature Toggle <span className="text-red-500">*</span> <span className="text-gray-500 text-sm">({isEditing ? "Not editable" : "This toggle cannot be edited after initial setup."})</span></h2>
            <p className="text-gray-500 text-sm">
              Enabling the referral feature ensures that both affiliates and users who cause conversions receive rewards.
            </p>
            <ToggleButton isOn={data.isReferralEnabled!} onToggle={setIsReferralEnabled!} disabled={isEditing} />
          </div>
        )}

        {data.projectType === "EscrowPayment" && (
          <div className="flex flex-col gap-2">
            <h2>How do you want to reward affiliates? <span className="text-red-500">*</span> <span className="text-gray-500 text-sm">({isEditing ? "Not editable" : "Payment type cannot be edited after initial setup."})</span></h2>
            <div className="flex flex-col">
              <label className={`${isEditing && data.paymentType !== "FixedAmount" && "hidden"} p-3 border border-gray-300 ${isEditing && data.paymentType === "FixedAmount" ? "rounded-lg bg-gray-100" : "rounded-t-lg"} ${isEditing ? "cursor-not-allowed" : "cursor-pointer"} transition ${!isEditing && data.paymentType === "FixedAmount" ? "bg-blue-50" : "hover:bg-gray-100"}`}>
                <div className="flex items-center">
                  <input
                    type="radio"
                    name="paymentType"
                    value="FixedAmount"
                    checked={data.paymentType === "FixedAmount"}
                    onChange={() => {
                      setTierEntries([]);
                      handlePaymentTypeChange?.("FixedAmount");
                    }}
                    className="form-radio text-blue-600"
                  />
                  <span className={`ml-2 ${data.paymentType === "FixedAmount" ? "text-blue-700" : "text-gray-700"}`}>Fixed Amount</span>
                </div>
                <span className={`text-sm ml-5 ${data.paymentType === "FixedAmount" ? "text-blue-500" : "text-gray-500"}`}>Reward affiliates with tokens for each successful referral</span>
              </label>
              <label className={`${isEditing && data.paymentType !== "RevenueShare" && "hidden"} p-3 border border-gray-300 ${!isEditing && data.isReferralEnabled && "rounded-b-lg"} ${isEditing && data.paymentType === "RevenueShare" && "rounded-lg bg-gray-100"} ${isEditing ? "cursor-not-allowed" : "cursor-pointer"} transition ${!isEditing && data.paymentType === "RevenueShare" ? "bg-blue-50" : "hover:bg-gray-100"}`}>
                <div className="flex items-center">
                  <input
                    type="radio"
                    name="paymentType"
                    value="RevenueShare"
                    checked={data.paymentType === "RevenueShare"}
                    onChange={() => {
                      setTierEntries([]);
                      handlePaymentTypeChange?.("RevenueShare");
                    }}
                    className="form-radio text-blue-600"
                  />
                  <span className={`ml-2 ${data.paymentType === "RevenueShare" ? "text-blue-700" : "text-gray-700"}`}>Revenue Share</span>
                </div>
                <span className={`text-sm ml-5 ${data.paymentType === "RevenueShare" ? "text-blue-500" : "text-gray-500"}`}>Reward affiliates with a percentage of the revenue they help generate</span>
              </label>
              {!data.isReferralEnabled && (
                <label className={`${isEditing && data.paymentType !== "Tiered" && "hidden"} p-3 border border-gray-300 ${isEditing && data.paymentType === "Tiered" ? "rounded-lg bg-gray-100" : "rounded-b-lg"} ${isEditing ? "cursor-not-allowed" : "cursor-pointer"} transition ${!isEditing && data.paymentType === "Tiered" ? "bg-blue-50" : "hover:bg-gray-100"}`}>
                  <div className="flex items-center">
                    <input
                      type="radio"
                      name="paymentType"
                      value="Tiered"
                      checked={data.paymentType === "Tiered"}
                      onChange={() => handlePaymentTypeChange?.("Tiered")}
                      className="form-radio text-blue-600"
                    />
                    <span className={`ml-2 ${data.paymentType === "Tiered" ? "text-blue-700" : "text-gray-700"}`}>Tiered</span>
                  </div>
                  <span className={`text-sm ml-5 ${data.paymentType === "Tiered" ? "text-blue-500" : "text-gray-500"}`}>Reward affiliates with different reward tiers</span>
                </label>
              )}
            </div>
          </div>
        )}

        {data.paymentType === "FixedAmount" && (
          <div className="flex flex-col gap-2">
            <h2>Reward Amount <span className="text-red-500">*</span></h2>
            <p className="text-gray-500 text-sm">
              You can enter an integer or a value up to one decimal place. The value must be between 1 and 10000.
            </p>
            <div className="rounded-lg border border-[#D1D5DB] flex items-center">
              <span className="w-[150px] text-[#6B7280] bg-gray-100 p-2 mr-1">
                Token Units:
              </span>
              <input
                type="number"
                value={
                  data.paymentDetails && "rewardAmount" in data.paymentDetails 
                    ? data.paymentDetails.rewardAmount?.toString() 
                    : ""
                }
                onChange={handleChange("paymentDetails.rewardAmount", true, true)}
                className="w-full outline-none"
                min="1"
                max="10000"
                step="0.1"
                placeholder="Enter token units"
              />
            </div>
          </div>
        )}

        {data.paymentType === "RevenueShare" && (
          <div className="flex flex-col gap-2">
            <h2>Revenue Share Percentage <span className="text-red-500">*</span></h2>
            <p className="text-gray-500 text-sm">
              Percentage an affiliate is paid for each purchase they refer. The value must be between 0.1 and 100.
            </p>
            <div className="rounded-lg border border-[#D1D5DB] flex items-center">
              <span className="w-[150px] text-[#6B7280] bg-gray-100 p-2 mr-1">
                Percentage:
              </span>
              <input
                type="number"
                value={
                  data.paymentDetails && "percentage" in data.paymentDetails 
                    ? data.paymentDetails.percentage?.toString() 
                    : ""
                }
                onChange={handleChange("paymentDetails.percentage", true, true)}
                className="w-full outline-none"
                min="0.1"
                max="100"
                step="0.1"
                placeholder="Enter percentage"
              />
            </div>
          </div>
        )}

        {data.paymentType === "Tiered" && (
          <div className="flex flex-col gap-2">
            <h2>Tier Management <span className="text-red-500">*</span></h2>
            <div className="w-full border border-[#D1D5DB] rounded-lg outline-none flex flex-col pr-2 bg-white text-black">
              <div className="flex flex-row">
                <span className="rounded-bl-lg w-1/3 text-[#6B7280] bg-gray-100 p-2 mr-1">
                  CONVERSIONS REQUIRED:
                </span>
                <input 
                  type="number" 
                  value={newConversionsRequired} 
                  onChange={e => setNewConversionsRequired(parseInt(e.target.value, 10))} 
                  placeholder="Conversions Required" 
                  className="w-full outline-none"
                />
              </div>
              <div className="flex flex-row">
                <span className="rounded-bl-lg w-1/3 text-[#6B7280] bg-gray-100 p-2 mr-1">
                  REWARD AMOUNT:
                </span>
                <input 
                  type="number" 
                  value={newTierRewardAmount} 
                  onChange={e => setNewTierRewardAmount(parseInt(e.target.value, 10))} 
                  placeholder="Reward Amount" 
                  className="w-full outline-none" 
                />
              </div>
            </div>
            <button
              type="button"
              onClick={handleAddTier} 
              className={`text-white p-2 rounded transition-transform duration-300 ${isCheckingNewTierEntry ? "bg-gray-200" : "bg-green-500 hover:scale-105 hover:bg-green-700"}`}
              disabled={isCheckingNewTierEntry}
            >
              {isCheckingNewTierEntry ? (
                <Image src={"/loading.png"} height={30} width={30} alt="loading.png" className="animate-spin mx-auto" />
              ) : (
                "Add Reward Tier"
              )}
            </button>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="px-6 py-3 bg-gray-50 text-left text-xs leading-4 font-medium text-gray-500 uppercase tracking-wider">Conversions Required</th>
                    <th className="px-6 py-3 bg-gray-50 text-left text-xs leading-4 font-medium text-gray-500 uppercase tracking-wider">Reward Amount</th>
                    <th className="px-6 py-3 bg-gray-50">Remove</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {tierEntries.length ? (
                    tierEntries.map((entry, index) => (
                      <tr key={index}>
                        <td className="px-6 py-4 overflow-hidden truncate">{entry.conversionsRequired}</td>
                        <td className="px-6 py-4 overflow-hidden truncate">{entry.rewardAmount}</td>
                        <td className="px-6 py-4 text-center">
                          <button onClick={() => handleRemoveTier(index)}>
                            <Image 
                              src="/trash.png" 
                              alt="trash.png" 
                              height={20} 
                              width={20} 
                              className="transition duration-300 ease-in-out transform hover:scale-125" 
                            />
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr className="text-gray-500">
                      <td colSpan={3} className="text-center py-4">No Reward Tier</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {data.projectType === "DirectPayment" && (
          <div className="flex flex-col gap-2">
            <h2>Whitelist Management <span className="text-red-500">*</span></h2>
            <div className="w-full border border-[#D1D5DB] rounded-lg outline-none flex flex-col pr-2 bg-white text-black">
              <div className="flex flex-row">
                <span className="rounded-tl-lg w-1/3 text-[#6B7280] bg-gray-100 p-2 mr-1">
                  WALLET ADDRESS:
                </span>
                <input 
                  value={newAddress} 
                  onChange={e => setNewAddress(e.target.value)} 
                  placeholder="0x1234567890abcdef1234567890abcdef12345678" 
                  className="w-full outline-none" 
                />
              </div>
              <div className="flex flex-row">
                <span className="w-1/3 text-[#6B7280] bg-gray-100 p-2 mr-1">
                  REDIRECT URL:
                </span>
                <input 
                  value={newRedirectUrl} 
                  onChange={e => setNewRedirectUrl(e.target.value)} 
                  placeholder={process.env.NEXT_PUBLIC_BASE_URL}
                  className="w-full outline-none" 
                />
              </div>
              <div className="flex flex-row">
                <span className="rounded-bl-lg w-1/3 text-[#6B7280] bg-gray-100 p-2 mr-1">
                  REWARD AMOUNT:
                </span>
                <input 
                  type="number" 
                  value={newRewardAmount} 
                  onChange={e => setNewRewardAmount(parseInt(e.target.value, 10))} 
                  placeholder="Reward Amount" 
                  className="w-full outline-none" 
                />
              </div>
            </div>
            <button
              type="button"
              onClick={handleAdd} 
              className={`text-white p-2 rounded transition-transform duration-300 ${isCheckingNewWhitelistEntry ? "bg-gray-200" : "bg-green-500 hover:scale-105 hover:bg-green-700"}`}
              disabled={isCheckingNewWhitelistEntry}
            >
              {isCheckingNewWhitelistEntry ? (
                <Image src={"/loading.png"} height={30} width={30} alt="loading.png" className="animate-spin mx-auto" />
              ) : (
                "Add to Whitelist"
              )}
            </button>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="px-6 py-3 bg-gray-50 text-left text-xs leading-4 font-medium text-gray-500 uppercase tracking-wider">Wallet Address</th>
                    <th className="px-6 py-3 bg-gray-50 text-left text-xs leading-4 font-medium text-gray-500 uppercase tracking-wider">Redirect URL</th>
                    <th className="px-6 py-3 bg-gray-50 text-left text-xs leading-4 font-medium text-gray-500 uppercase tracking-wider">Reward Amount</th>
                    <th className="px-6 py-3 bg-gray-50">Remove</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {whitelistedEntries.length ? (
                    whitelistedEntries.map(entry => (
                      <tr key={entry.address}>
                        <td className="px-6 py-4 overflow-hidden truncate">{entry.address}</td>
                        <td className="px-6 py-4 overflow-hidden truncate">{entry.details.redirectUrl}</td>
                        <td className="px-6 py-4 overflow-hidden truncate">{entry.details.rewardAmount}</td>
                        <td className="px-6 py-4 text-center">
                          <button onClick={() => handleRemove(entry.address)}>
                            <Image 
                              src="/trash.png" 
                              alt="trash.png" 
                              height={20} 
                              width={20} 
                              className="transition duration-300 ease-in-out transform hover:scale-125" 
                            />
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr className="text-gray-500">
                      <td colSpan={4} className="text-center py-4">No Whitelist Data</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {data.projectType === "EscrowPayment" && (
          <div className="flex flex-col gap-2">
            <h2>Redirect URL <span className="text-red-500">*</span> <span className="text-gray-500 text-sm">({isEditing ? "Not editable" : "Redirect URL cannot be edited after initial setup."})</span></h2>
            <div className={`rounded-lg border border-[#D1D5DB] flex items-center ${isEditing && "bg-gray-100"}`}>
              <span className={`w-[150px] text-[#6B7280] bg-gray-100 p-2 border-r ${isEditing && "border-r-[#D1D5DB]"}`}>
                URL:
              </span>
              <input
                readOnly={isEditing}
                type="url"
                value={data.redirectUrl}
                onChange={handleRedirectUrlChange}
                className={`w-full outline-none pl-1 ${redirectUrlError ? "border-red-500" : ""} ${isEditing ? "bg-gray-100 text-gray-500 cursor-not-allowed" : "text-black"}`}
                placeholder="Enter the redirect URL"
              />
            </div>
            {redirectUrlError && <p className="text-red-500 text-xs mt-1">{redirectUrlError}</p>}
          </div>
        )}
        
      </div>

      {nextStep && previousStep && !hideButton && (
        <div className="flex flex-row gap-5">
          <Button onClick={() => previousStep()} color="green">Previous</Button>
          <Button 
            onClick={() => isFormComplete() && nextStep()} 
            disabled={
              !isFormComplete() || 
              !isTokenAddressValid || 
              !isErc20Token || 
              isFetchingTokenDetails || 
              (isSaving ?? true)
            } 
          >
            <div className="flex flex-row items-center justify-center gap-5">
              {isSaving && (
                <Image 
                  src={"/loading.png"} 
                  height={30} 
                  width={30} 
                  alt="loading.png" 
                  className="animate-spin" 
                />
              )}
              {status}
            </div>
          </Button>
        </div>
      )}

    </div>
  );
};