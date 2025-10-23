#!/usr/bin/env node

import { ethers } from 'hardhat';

async function main() {
  console.log('🔍 Verifying Sepolia deployments...');

  // Get contract addresses from deployment
  const addresses = {
    weth: '0x...', // Replace with actual deployed address
    usdc: '0x...', // Replace with actual deployed address
    optionVaultImpl: '0x...', // Replace with actual deployed address
    optionVaultFactory: '0x...', // Replace with actual deployed address
  };

  console.log('📋 Contract addresses to verify:');
  console.log('WETH:', addresses.weth);
  console.log('USDC:', addresses.usdc);
  console.log('OptionVault Impl:', addresses.optionVaultImpl);
  console.log('OptionVaultFactory:', addresses.optionVaultFactory);

  console.log('\n🔧 Verification commands:');
  console.log(
    'npx hardhat verify --network sepolia',
    addresses.optionVaultFactory,
    addresses.optionVaultImpl
  );
  console.log('npx hardhat verify --network sepolia', addresses.weth);
  console.log('npx hardhat verify --network sepolia', addresses.usdc);

  console.log(
    '\n💡 Note: Update the addresses above with the actual deployed addresses from the deployment script output.'
  );
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('❌ Verification failed:', error);
    process.exit(1);
  });
