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

  console.log("\n" + "=".repeat(60));
  console.log("✅ DEPLOYMENT SUCCESSFUL!");
  console.log("=".repeat(60));
  console.log("\nAdd these addresses to ubichain/.env.local:\n");
  console.log(`NEXT_PUBLIC_REGISTRY_ADDRESS=${registryAddress}`);
  console.log(`NEXT_PUBLIC_TOKEN_ADDRESS=${tokenAddress}`);
  console.log("\n" + "=".repeat(60));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});


