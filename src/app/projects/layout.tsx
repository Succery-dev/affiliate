"use client";

import Image from "next/image";
import Link from "next/link";

import { useAddress } from "@thirdweb-dev/react";

import { formatAddress } from "../utils/formatAddress";

export default function ProjectsLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const address = useAddress();

  return (
    <>
      <div className="flex flex-row justify-between px-10 py-2 border-b-2 border-sky-500 shadow-md bg-slate-100">
        <div className="flex flex-row items-center gap-20">
          <Link href="/#" className="flex flex-row items-center gap-3 transition duration-300 ease-in-out transform hover:-translate-y-1">
            <Image
              src="/qube.png"
              alt="qube.png"
              width={50}
              height={50}
            />
            <p className="text-lg font-semibold">Qube</p>
          </Link>
          <Link className="text-sm text-gray-500 hover:text-black" href="/projects">Projects</Link>
        </div>
        <button
          className="bg-gray-100 text-gray-600 text-sm py-2 px-7 border-2 border-white shadow-xl rounded-md transition duration-300 ease-in-out transform hover:scale-105"
        >
          {formatAddress(address as string)}
        </button>
      </div>
      {children}
    </>
  );
}