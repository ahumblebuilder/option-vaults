#!/usr/bin/env node

import { ethers } from 'ethers';

async function main() {
  console.log('🔑 Generating new Ethereum account...');

  // Generate a new random wallet
  const wallet = ethers.Wallet.createRandom();

  console.log('\n' + '='.repeat(60));
  console.log('🎉 NEW ACCOUNT GENERATED');
  console.log('='.repeat(60));
  console.log('Address:', wallet.address);
  console.log('Private Key:', wallet.privateKey);
  console.log('Mnemonic:', wallet.mnemonic?.phrase || 'N/A');
  console.log('='.repeat(60));

  console.log('\n📋 Next Steps:');
  console.log('1. Copy the private key above');
  console.log('2. Add it to your .env file as SEPOLIA_PRIVATE_KEY');
  console.log('3. Fund this account with Sepolia ETH from faucets');
  console.log('4. Use this account for deployment');

  console.log('\n⚠️  Security Warnings:');
  console.log('- Never share your private key');
  console.log('- Never commit your .env file to version control');
  console.log('- This is for testnet only - never use for mainnet');

  console.log('\n🔗 Get Sepolia ETH from:');
  console.log('- https://sepoliafaucet.com/');
  console.log('- https://faucet.sepolia.dev/');
  console.log('- https://sepolia-faucet.pk910.de/');
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('❌ Account generation failed:', error);
    process.exit(1);
  });
