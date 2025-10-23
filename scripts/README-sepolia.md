# Sepolia Testnet Deployment

This directory contains scripts for deploying the OptionVault system to Sepolia testnet.

## Prerequisites

1. **Sepolia ETH**: Get testnet ETH from [Sepolia Faucet](https://sepoliafaucet.com/)
2. **Environment Variables**: Set up your `.env` file with:
   ```bash
   SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/YOUR_PROJECT_ID
   SEPOLIA_PRIVATE_KEY=your_private_key_here
   ```

## Deployment Scripts

### 1. Deploy to Sepolia

```bash
npx hardhat run scripts/deploy-sepolia.ts --network sepolia
```

**What it deploys:**

- ✅ TestERC20 (WETH) - 18 decimals
- ✅ TestERC20 (USDC) - 6 decimals
- ✅ OptionVault Implementation
- ✅ OptionVaultFactory
- ✅ Test Vault with:
  - Strike: 4000 USDC
  - Expiry: End of next month
  - Deposit Token: WETH
  - Conversion Token: USDC
  - Premium Token: USDC

### 2. Verify Contracts

```bash
npx hardhat run scripts/verify-sepolia.ts --network sepolia
```

### 3. Test Deployment

```bash
npx hardhat run scripts/test-sepolia.ts --network sepolia
```

## Contract Addresses

After deployment, you'll get addresses like:

```
📋 Contract Addresses:
├─ WETH (Test): 0x1234...
├─ USDC (Test): 0x5678...
├─ OptionVault Impl: 0x9abc...
├─ OptionVaultFactory: 0xdef0...
└─ Test Vault: 0x2468...
```

## Verification Commands

Copy the verification commands from the deployment output:

```bash
npx hardhat verify --network sepolia 0xdef0... 0x9abc...
npx hardhat verify --network sepolia 0x1234...
npx hardhat verify --network sepolia 0x5678...
```

## Testing the Vault

### 1. Check Vault Details

```bash
npx hardhat run scripts/test-sepolia.ts --network sepolia
```

### 2. Test writeOption Flow

1. Create an EIP712 signature for a write option
2. Call `writeOption` with the signature
3. Verify the option was written correctly

### 3. Test Exercise Flow

1. Wait for the option to be exercisable
2. Call `exercise` to exercise the option
3. Verify tokens were swapped correctly

### 4. Test Redeem Flow

1. Call `redeem` to redeem vault tokens
2. Verify user received their share of tokens

## Gas Costs

Estimated gas costs on Sepolia:

- TestERC20 deployment: ~1.5M gas each
- OptionVault implementation: ~2M gas
- OptionVaultFactory: ~3M gas
- Vault creation: ~500K gas
- Total: ~8M gas (~0.08 ETH at 10 gwei)

## Troubleshooting

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

**Solution**: Contract is already verified, this is normal

## Useful Links

- [Sepolia Etherscan](https://sepolia.etherscan.io/)
- [Sepolia Faucet](https://sepoliafaucet.com/)
- [Infura Sepolia](https://infura.io/docs/ethereum#section/Testnets/Sepolia)

## Next Steps

1. **Verify contracts** on Etherscan
2. **Test the vault** with real transactions
3. **Monitor gas usage** and optimize if needed
4. **Document any issues** for future deployments
