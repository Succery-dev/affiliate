import { ethers } from "ethers";

export function initializeSigner(privateKey?: string): ethers.Signer | null {
  if (privateKey) {
    const provider = new ethers.providers.JsonRpcProvider(`${process.env.NEXT_PUBLIC_PROVIDER_URL}`);
    const signer = new ethers.Wallet(privateKey, provider);
    return signer;
  } else if (typeof window !== "undefined" && window.ethereum) {
    const provider = new ethers.providers.Web3Provider(window.ethereum);
    const signer = provider.getSigner();
    return signer;
  } else {
    return null;
  }
}