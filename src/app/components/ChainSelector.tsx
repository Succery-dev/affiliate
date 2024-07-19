import React, { useState } from "react";
import { Chain } from "@thirdweb-dev/chains";
import Image from "next/image";
import { useChainContext } from "../context/chainContext";
import { getChains } from "../utils/contracts";

export const ChainSelector: React.FC = () => {
  const { selectedChain, setSelectedChain } = useChainContext();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const chains = getChains();

  const handleChainChange = (chain: Chain) => {
    setSelectedChain(chain);
    setDropdownOpen(false);
  };

  const formatChainName = (name: string) => {
    return name.split(" ")[0].toLowerCase();
  };

  return (
    <div className="relative inline-block text-left">
      <button
        type="button"
        onClick={() => setDropdownOpen(!dropdownOpen)}
        className="inline-flex justify-center w-full rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none"
      >
        <Image src={`/${formatChainName(selectedChain.name)}.png`} alt={selectedChain.name} width={20} height={20} />
      </button>

      {dropdownOpen && (
        <div className="origin-top-right absolute right-0 mt-2 w-56 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5">
          <div className="py-1" role="menu" aria-orientation="vertical" aria-labelledby="options-menu">
            {chains.map(chain => (
              <button
                key={chain.chainId}
                onClick={() => handleChainChange(chain)}
                className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 w-full text-left"
              >
                <Image src={`/${formatChainName(chain.name)}.png`} alt={chain.name} width={20} height={20} />
                <span className="ml-2">{chain.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};