import { BrowserProvider, Contract } from 'ethers';

export type Contracts = {
  fileRegistry: Contract;
  incentiveToken: Contract;
};

export async function getProvider(): Promise<BrowserProvider> {
  if (typeof window === 'undefined') throw new Error('No window');
  // @ts-ignore
  if (!window.ethereum) throw new Error('Metamask not found');
  // @ts-ignore
  const provider = new BrowserProvider(window.ethereum);
  await provider.send('eth_requestAccounts', []);
  return provider;
}

export async function getContracts(registryAddress: string, registryAbi: any, tokenAddress: string, tokenAbi: any): Promise<Contracts> {
  const provider = await getProvider();
  const signer = await provider.getSigner();
  const fileRegistry = new Contract(registryAddress, registryAbi, signer);
  const incentiveToken = new Contract(tokenAddress, tokenAbi, signer);
  return { fileRegistry, incentiveToken };
}


