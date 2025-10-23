# 🚀 Sepolia Testnet Deployment Guide

Complete deployment setup for the OptionVault system on Sepolia testnet.

## 📋 Quick Start

### 1. Setup Environment

```bash
# Copy environment template
cp env.example .env

# Edit .env with your values
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/YOUR_PROJECT_ID
SEPOLIA_PRIVATE_KEY=your_private_key_here
```

**⚠️ Security Note**:

- Never commit your `.env` file to version control
- The `SEPOLIA_PRIVATE_KEY` should be the private key of your deployer account
- Make sure this account has enough Sepolia ETH for deployment

**🔧 Account Loading**:

- If `SEPOLIA_PRIVATE_KEY` is set: Uses that account for deployment
- If not set: Falls back to default Hardhat account (development only)

**🆕 Need a new account?**

```bash
npm run generate:account
```

This will generate a new Ethereum account with private key and mnemonic.

### 2. Get Testnet ETH

- [Sepolia Faucet](https://sepoliafaucet.com/)
- [Tenderly Faucet](https://sepolia.gateway.tenderly.co)
- [PK910 Faucet](https://sepolia-faucet.pk910.de/)

### 3. Deploy Contracts

```bash
npm run deploy:sepolia
```

### 4. Verify Contracts

```bash
npm run verify:sepolia
```

### 5. Test Deployment

```bash
npm run test:sepolia
```

## 🏗️ What Gets Deployed

| Contract               | Purpose                         | Decimals |
| ---------------------- | ------------------------------- | -------- |
| **WETH (Test)**        | Wrapped Ether for deposits      | 18       |
| **USDC (Test)**        | USD Coin for conversion/premium | 6        |
| **OptionVault Impl**   | Vault implementation            | -        |
| **OptionVaultFactory** | Factory for creating vaults     | -        |
| **Test Vault**         | Example vault with parameters   | -        |

## 🎯 Test Vault Configuration

- **Strike**: 4000 USDC
- **Expiry**: End of next month
- **Deposit Token**: WETH (18 decimals)
- **Conversion Token**: USDC (6 decimals)
- **Premium Token**: USDC (6 decimals)

## 📊 Gas Estimates

| Operation          | Gas Cost | ETH Cost (10 gwei) |
| ------------------ | -------- | ------------------ |
| TestERC20 (WETH)   | ~1.5M    | ~0.015 ETH         |
| TestERC20 (USDC)   | ~1.5M    | ~0.015 ETH         |
| OptionVault Impl   | ~2M      | ~0.02 ETH          |
| OptionVaultFactory | ~3M      | ~0.03 ETH          |
| Vault Creation     | ~500K    | ~0.005 ETH         |
| **Total**          | **~8M**  | **~0.08 ETH**      |

## 🔧 Available Scripts

```bash
# Deployment
npm run deploy:sepolia    # Deploy all contracts
npm run verify:sepolia    # Verify contracts on Etherscan
npm run test:sepolia      # Test deployed contracts
npm run generate:account # Generate new Ethereum account

# Development
npm run format           # Format all code
npm run format:check     # Check formatting
npm test                 # Run test suite
```

## 📁 File Structure

```
scripts/
├── deploy-sepolia.ts     # Main deployment script
├── verify-sepolia.ts     # Contract verification
├── test-sepolia.ts       # Deployment testing
└── README-sepolia.md     # Detailed documentation

env.example               # Environment template
DEPLOYMENT.md            # This file
```

## 🔍 Verification Commands

After deployment, run these commands to verify contracts:

```bash
# Verify OptionVaultFactory (with implementation address)
npx hardhat verify --network sepolia <FACTORY_ADDRESS> <IMPL_ADDRESS>

# Verify TestERC20 contracts
npx hardhat verify --network sepolia <WETH_ADDRESS>
npx hardhat verify --network sepolia <USDC_ADDRESS>
```

## 🧪 Testing the Vault

### 1. Check Vault Details

```bash
npm run test:sepolia
```

### 2. Test writeOption Flow

1. Create EIP712 signature for write option
2. Call `writeOption` with signature
3. Verify option was written

### 3. Test Exercise Flow

1. Wait for option to be exercisable
2. Call `exercise` to exercise option
3. Verify tokens were swapped

### 4. Test Redeem Flow

1. Call `redeem` to redeem vault tokens
2. Verify user received their share

## 🔗 Useful Links

- [Sepolia Etherscan](https://sepolia.etherscan.io/)
- [Sepolia Faucet](https://sepoliafaucet.com/)
- [Infura Sepolia](https://infura.io/docs/ethereum#section/Testnets/Sepolia)
- [Hardhat Networks](https://hardhat.org/hardhat-runner/docs/config#networks)

## 🚨 Troubleshooting

### Insufficient Balance

```
Error: Insufficient balance for deployment
```

**Solution**: Get more Sepolia ETH from faucets

### RPC Issues

```
Error: could not detect network
```

**Solution**: Check your `SEPOLIA_RPC_URL` in `.env`

### Verification Fails

```
Error: Contract source code already verified
```

**Solution**: Contract is already verified (normal)

## 📝 Next Steps

1. **Deploy to Sepolia** using the scripts
2. **Verify contracts** on Etherscan
3. **Test the vault** with real transactions
4. **Monitor gas usage** and optimize
5. **Document any issues** for future deployments

## 🎉 Success!

Once deployed, you'll have a complete OptionVault system on Sepolia testnet ready for testing and development!
