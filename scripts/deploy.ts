import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with:", deployer.address);

  const Token = await ethers.getContractFactory("IncentiveToken");
  const token = await Token.deploy();
  await token.waitForDeployment();
  const tokenAddress = await token.getAddress();
  console.log("IncentiveToken deployed:", tokenAddress);

  const Registry = await ethers.getContractFactory("FileRegistry");
  const registry = await Registry.deploy();
  await registry.waitForDeployment();
  const registryAddress = await registry.getAddress();
  console.log("FileRegistry deployed:", registryAddress);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});


