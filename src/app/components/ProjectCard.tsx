import React, { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { ExtendedProjectData, FixedAmountDetails, RevenueShareDetails, TieredDetails } from "../types";
import { formatChainName } from "../utils/formatters";
import { getChainByChainIdAsync } from "@thirdweb-dev/chains";

type ProjectCardProps = {
  project: ExtendedProjectData;
  linkUrl: string;
  isMultipleOwners?: boolean;
};

export const ProjectCard: React.FC<ProjectCardProps> = ({ 
  project, 
  linkUrl,
  isMultipleOwners = false 
}) => {
  const [chainName, setChainName] = useState<string | undefined>();

  useEffect(() => {
    const fetchChainName = async () => {
      try {
        const chain = await getChainByChainIdAsync(project.selectedChainId);
        setChainName(chain.name);
      } catch (error) {
        console.error(`Failed to get chain name for chain ID ${project.selectedChainId}:`, error);
      }
    };

    fetchChainName();
  }, [project.selectedChainId]);

  // Calculate min and max reward for Tiered payment type
  let tieredRewardRange = "";
  if (project.projectType === "EscrowPayment" && project.paymentType === "Tiered") {
    const tiers = (project.paymentDetails as TieredDetails).tiers;
    const minReward = Math.min(...tiers.map(tier => tier.rewardAmount));
    const maxReward = Math.max(...tiers.map(tier => tier.rewardAmount));
    tieredRewardRange = `${minReward}~${maxReward} ${project.selectedToken}`;
  }

  return (
    <Link href={linkUrl}>
      <div className="max-w-xl w-full h-[300px] bg-white rounded-lg shadow-md overflow-visible transition duration-300 ease-in-out transform hover:scale-105">
        <div className="w-full h-16 bg-gray-200 mb-10 relative">
          {isMultipleOwners && (
            <Image
              className="absolute -top-4 right-10 bg-white border-2 border-slate-300 rounded-full shadow-lg"
              src="/people.png"
              width={50}
              height={50}
              alt="People Icon"
            />
          )}
          <Image
            className="absolute -top-4 -right-4 bg-white border-2 border-slate-300 rounded-full shadow-lg"
            src={project.projectType === "DirectPayment" ? "/direct-payment.png" : "/escrow-payment.png"}
            width={50}
            height={50}
            alt="Project Type Icon"
          />
          <Image
            className="w-full h-full object-cover rounded-t-lg"
            src={project.cover as string}
            width={100}
            height={100}
            alt={`${project.projectName}'s cover`}
          />
          <div className="absolute top-8 px-10 w-full flex flex-row items-center justify-between">
            <div className="shadow-md flex justify-center items-center rounded-full">
              <Image
                className="bg-white rounded-full h-16 w-16 object-fill"
                src={project.logo as string}
                width={50}
                height={50}
                alt={`${project.projectName}'s logo`}
              />
            </div>
            <p className="flex flex-row items-center bg-green-200 px-2 py-1 rounded-md border border-white">
              <p className="font-semibold">
                {project.projectType === "EscrowPayment" ? (
                  project.paymentType === "FixedAmount" ? (
                    `${(project.paymentDetails as FixedAmountDetails).rewardAmount} ${project.selectedToken}`
                  ) : project.paymentType === "RevenueShare" ? (
                    `${(project.paymentDetails as RevenueShareDetails).percentage}% of revenue`
                  ) : project.paymentType === "Tiered" ? (
                    `${tieredRewardRange}`
                  ) : null
                ) : (
                  project.selectedToken
                )}
              </p>
              {chainName && <Image src={`/chains/${formatChainName(chainName)}.png`} alt={chainName} width={18} height={18} className="m-1" />}
            </p>
          </div>
        </div>
        <div className="p-4 flex flex-col gap-5">
          <h3 className="text-lg leading-6 font-medium text-[#121212] truncate">{project.projectName}</h3>
          <p className="text-gray-700 text-base overflow-hidden text-ellipsis" style={{ display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: 5 }}>
            {project.description}
          </p>
        </div>
      </div>
    </Link>
  );
};