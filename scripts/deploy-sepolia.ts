#!/usr/bin/env node

import { ethers } from 'ethers';
import { network } from 'hardhat';

const { ethers: hreEthers } = await network.connect();

async function main() {
  console.log('🚀 Starting Sepolia deployment...');

  // Get the deployer account from environment or use default
  let deployer;
  const privateKey = process.env.SEPOLIA_PRIVATE_KEY;

  if (privateKey) {
    console.log('Using deployer account from SEPOLIA_PRIVATE_KEY environment variable');
    deployer = new ethers.Wallet(privateKey, hreEthers.provider);
  } else {
    console.log('Using default Hardhat account (not recommended for mainnet)');
    [deployer] = await hreEthers.getSigners();
  }

  console.log('Deploying contracts with account:', deployer.address);

  // Check deployer balance
  const balance = await hreEthers.provider.getBalance(deployer.address);
  console.log('Account balance:', hreEthers.formatEther(balance), 'ETH');

  if (balance < hreEthers.parseEther('0.01')) {
    throw new Error('Insufficient balance for deployment. Please fund the account.');
  }

  // 1. Deploy Test ERC20s
  console.log('\n📦 Deploying Test ERC20 tokens...');

  const TestERC20Factory = await hreEthers.getContractFactory('TestERC20');

  // Deploy WETH (18 decimals)
  const weth = await TestERC20Factory.deploy('Wrapped Ether', 'WETH', 18);
  await weth.waitForDeployment();
  const wethAddress = await weth.getAddress();
  console.log('✅ WETH deployed to:', wethAddress);

  // Deploy USDC (6 decimals)
  const usdc = await TestERC20Factory.deploy('USD Coin', 'USDC', 6);
  await usdc.waitForDeployment();
  const usdcAddress = await usdc.getAddress();
  console.log('✅ USDC deployed to:', usdcAddress);

  // 2. Deploy OptionVault Implementation
  console.log('\n🏗️ Deploying OptionVault implementation...');
  const OptionVaultFactory = await hreEthers.getContractFactory('OptionVault');
  const optionVaultImpl = await OptionVaultFactory.deploy();
  await optionVaultImpl.waitForDeployment();
  const optionVaultImplAddress = await optionVaultImpl.getAddress();
  console.log('✅ OptionVault implementation deployed to:', optionVaultImplAddress);

  // 3. Deploy OptionVaultFactory
  console.log('\n🏭 Deploying OptionVaultFactory...');
  const OptionVaultFactoryContract = await hreEthers.getContractFactory('OptionVaultFactory');
  const optionVaultFactory = await OptionVaultFactoryContract.deploy(optionVaultImplAddress);
  await optionVaultFactory.waitForDeployment();
  const optionVaultFactoryAddress = await optionVaultFactory.getAddress();
  console.log('✅ OptionVaultFactory deployed to:', optionVaultFactoryAddress);

  // 4. Create a test vault
  console.log('\n🏦 Creating test vault...');

  // Calculate expiry: end of next month
  const now = new Date();
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0); // Last day of next month
  const expiry = Math.floor(nextMonth.getTime() / 1000);

  console.log('Vault parameters:');
  console.log('- Strike: 4000 USDC');
  console.log('- Expiry:', new Date(expiry * 1000).toISOString());
  console.log('- Deposit Token: WETH');
  console.log('- Conversion Token: USDC');
  console.log('- Premium Token: USDC');

  const tx = await optionVaultFactory.createVault(
    wethAddress, // depositToken
    usdcAddress, // conversionToken
    usdcAddress, // premiumToken
    hreEthers.parseUnits('4000', 6), // strike (4000 USDC with 6 decimals)
    expiry, // expiry
    'Test Option Vault', // name
    'TOV', // symbol
    deployer.address // owner
  );

  const receipt = await tx.wait();
  console.log('✅ Vault creation transaction:', tx.hash);

  // Get the vault address from the event
  const vaultCreatedEvent = receipt.logs.find(log => {
    try {
      const parsed = optionVaultFactory.interface.parseLog(log);
      return parsed.name === 'VaultCreated';
    } catch {
      return false;
    }
  });

  if (vaultCreatedEvent) {
    const parsed = optionVaultFactory.interface.parseLog(vaultCreatedEvent);
    const vaultAddress = parsed.args.vault;
    console.log('✅ Test vault created at:', vaultAddress);
  }

  // 5. Mint test tokens for testing
  console.log('\n💰 Minting test tokens...');

  // Mint WETH for testing
  const wethMintTx = await weth.mint(deployer.address, hreEthers.parseEther('1000'));
  await wethMintTx.wait();
  console.log('✅ Minted 1000 WETH to deployer');

  // Mint USDC for testing
  const usdcMintTx = await usdc.mint(deployer.address, hreEthers.parseUnits('1000000', 6));
  await usdcMintTx.wait();
  console.log('✅ Minted 1,000,000 USDC to deployer');

  // 6. Display deployment summary
  console.log('\n' + '='.repeat(60));
  console.log('🎉 DEPLOYMENT COMPLETE!');
  console.log('='.repeat(60));
  console.log('Network: Sepolia Testnet');
  console.log('Deployer:', deployer.address);
  console.log('');
  console.log('📋 Contract Addresses:');
  console.log('├─ WETH (Test):', wethAddress);
  console.log('├─ USDC (Test):', usdcAddress);
  console.log('├─ OptionVault Impl:', optionVaultImplAddress);
  console.log('├─ OptionVaultFactory:', optionVaultFactoryAddress);
  console.log(
    '└─ Test Vault:',
    vaultCreatedEvent
      ? optionVaultFactory.interface.parseLog(vaultCreatedEvent).args.vault
      : 'Not found'
  );
  console.log('');
  console.log('🔧 Vault Configuration:');
  console.log('├─ Strike: 4000 USDC');
  console.log('├─ Expiry:', new Date(expiry * 1000).toISOString());
  console.log('├─ Deposit Token: WETH');
  console.log('├─ Conversion Token: USDC');
  console.log('└─ Premium Token: USDC');
  console.log('');
  console.log('💡 Next Steps:');
  console.log('1. Verify contracts on Sepolia Etherscan');
  console.log('2. Test the vault with writeOption, exercise, and redeem');
  console.log('3. Use the test tokens for development');
  console.log('');
  console.log('🔗 Useful Commands:');
  console.log(
    'npx hardhat verify --network sepolia',
    optionVaultFactoryAddress,
    optionVaultImplAddress
  );
  console.log('npx hardhat verify --network sepolia', wethAddress);
  console.log('npx hardhat verify --network sepolia', usdcAddress);
  console.log('='.repeat(60));
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('❌ Deployment failed:', error);
    process.exit(1);
  });
