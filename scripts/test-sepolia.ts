#!/usr/bin/env node

import { ethers } from 'ethers';
import { network } from 'hardhat';

const { ethers: hreEthers } = await network.connect();

async function main() {
  console.log('🧪 Testing Sepolia deployment...');

  // Replace with actual deployed addresses
  const addresses = {
    weth: '0x...', // Replace with actual deployed address
    usdc: '0x...', // Replace with actual deployed address
    optionVaultFactory: '0x...', // Replace with actual deployed address
    vault: '0x...', // Replace with actual deployed address
  };

  // Get the deployer account from environment or use default
  let deployer;
  const privateKey = process.env.SEPOLIA_PRIVATE_KEY;

  if (privateKey) {
    console.log('Using deployer account from SEPOLIA_PRIVATE_KEY environment variable');
    deployer = new ethers.Wallet(privateKey, hreEthers.provider);
  } else {
    console.log('Using default Hardhat account');
    [deployer] = await hreEthers.getSigners();
  }

  console.log('Testing with account:', deployer.address);

  // Connect to deployed contracts
  const weth = await hreEthers.getContractAt('TestERC20', addresses.weth);
  const usdc = await hreEthers.getContractAt('TestERC20', addresses.usdc);
  const optionVaultFactory = await hreEthers.getContractAt(
    'OptionVaultFactory',
    addresses.optionVaultFactory
  );

  // Check token balances
  console.log('\n💰 Token Balances:');
  const wethBalance = await weth.balanceOf(deployer.address);
  const usdcBalance = await usdc.balanceOf(deployer.address);
  console.log('WETH Balance:', hreEthers.formatEther(wethBalance));
  console.log('USDC Balance:', hreEthers.formatUnits(usdcBalance, 6));

  // Check vault details
  if (addresses.vault !== '0x...') {
    console.log('\n🏦 Vault Details:');
    const vault = await hreEthers.getContractAt('OptionVault', addresses.vault);

    const strike = await vault.strike();
    const expiry = await vault.expiry();
    const depositToken = await vault.depositToken();
    const conversionToken = await vault.conversionToken();
    const premiumToken = await vault.premiumToken();

    console.log('Strike:', hreEthers.formatUnits(strike, 6), 'USDC');
    console.log('Expiry:', new Date(Number(expiry) * 1000).toISOString());
    console.log('Deposit Token:', depositToken);
    console.log('Conversion Token:', conversionToken);
    console.log('Premium Token:', premiumToken);
  }

  // Test EIP712 hash computation
  console.log('\n🔐 Testing EIP712 hash computation...');

  const testParams = {
    strike: hreEthers.parseUnits('4000', 6),
    expiry: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
    premiumPerUnit: hreEthers.parseUnits('150', 6), // 150 USDC per WETH
    minDeposit: hreEthers.parseEther('1'),
    maxDeposit: hreEthers.parseEther('10'),
    validUntil: Math.floor(Date.now() / 1000) + 3600,
    quoteId: 1,
  };

  const hash = await optionVaultFactory.computeWriteOptionHash(
    testParams.strike,
    testParams.expiry,
    testParams.premiumPerUnit,
    testParams.minDeposit,
    testParams.maxDeposit,
    testParams.validUntil,
    testParams.quoteId
  );

  console.log('EIP712 Hash:', hash);
  console.log('✅ EIP712 hash computation successful');

  console.log('\n🎉 Sepolia deployment test completed successfully!');
  console.log('\n💡 Next steps:');
  console.log('1. Test writeOption with a signature');
  console.log('2. Test exercise functionality');
  console.log('3. Test redeem functionality');
  console.log('4. Monitor contract interactions on Etherscan');
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('❌ Test failed:', error);
    process.exit(1);
  });
