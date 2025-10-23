# Signature Generation Script

This script generates EIP712 signatures for write option parameters on Sepolia testnet, allowing you to create manually signed quotes that users can consume.

## Setup

1. Copy `env.example` to `.env` and fill in your values:

   ```bash
   cp env.example .env
   ```

2. Set your environment variables in `.env`:

   ```
   SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/YOUR_PROJECT_ID
   SEPOLIA_PRIVATE_KEY=your_private_key_here
   SIGNER_PRIVATE_KEY=your_signer_private_key_here
   ```

   - `SEPOLIA_PRIVATE_KEY`: Your deployer account private key
   - `SIGNER_PRIVATE_KEY`: The private key used to sign write option parameters (can be the same as deployer)

## Usage

### Running the Script

```bash
npx hardhat run scripts/generate-signature.ts --network sepolia
```

### Configuring Parameters

Edit the configuration section at the top of `scripts/generate-signature.ts`:

```typescript
// ============================================================================
// CONFIGURATION - Edit these values as needed
// ============================================================================

// Vault factory address on Sepolia (used for EIP712 domain)
const VAULT_FACTORY_ADDRESS = '0x07Cf0b6a0591Cff7b45D6c1ba3a42Da49C1630d2';

// Vault address on Sepolia (used for parameter validation)
const VAULT_ADDRESS = '0xFe2dEf59CEF9fCf467bF5C743e5be96b92aC0a37';

// Valid until offset in seconds (how long the quote should be valid from now)
const VALID_UNTIL_OFFSET_SECONDS = 3600; // 1 hour (3600 seconds)

// Write option parameters
const WRITE_OPTION_PARAMS: WriteOptionParams = {
  strike: '4000000000', // 4000 USDC (6 decimals) - matches vault contract
  expiry: '1761865200', // 2025-10-30 23:00:00 UTC - matches vault contract
  premiumPerUnit: '150000000', // 150 USDC (6 decimals)
  minDeposit: '100000000000000000', // 0.1 WETH (18 decimals)
  maxDeposit: '10000000000000000000', // 10 WETH (18 decimals)
  validUntil: '0', // Will be calculated dynamically
  quoteId: '1', // Quote ID
};
```

## Parameters

Edit the `WRITE_OPTION_PARAMS` object to customize:

- **strike**: Strike price in USDC (6 decimals) - example: `'4200000000'` (4200 USDC)
- **expiry**: Expiry timestamp - example: `'1735689600'` (2025-01-01 00:00:00 UTC)
- **premiumPerUnit**: Premium per unit in USDC (6 decimals) - example: `'150000000'` (150 USDC)
- **minDeposit**: Minimum deposit in WETH (18 decimals) - example: `'1000000000000000000'` (1 WETH)
- **maxDeposit**: Maximum deposit in WETH (18 decimals) - example: `'10000000000000000000'` (10 WETH)
- **validUntil**: Valid until timestamp - example: `'1735689600'` (2025-01-01 00:00:00 UTC)
- **quoteId**: Quote ID - example: `'1'`

## Features

### Automatic Vault Validation

The script automatically fetches the strike and expiry from the vault contract and compares them with your configured parameters. If there's a mismatch, it will display warnings.

### Dynamic Valid Until

The `validUntil` timestamp is automatically calculated as current time + `VALID_UNTIL_OFFSET_SECONDS`. This ensures quotes are always valid for the specified duration from when they're generated.

### Configuration Options

- **VALID_UNTIL_OFFSET_SECONDS**: How long the quote should be valid (default: 3600 seconds = 1 hour)
- **VAULT_FACTORY_ADDRESS**: The address of the vault factory contract (used for EIP712 domain)
- **VAULT_ADDRESS**: The address of the specific vault contract (used for parameter validation)

### Important: EIP712 Domain Configuration

The script uses the **vault factory address** for the EIP712 domain, not the individual vault address. This is crucial because:

- Signatures are verified against the factory contract that deployed the vault
- The vault contract validates signatures using the factory's domain
- This allows signatures to work across different vaults created by the same factory

## Output

The script will output:

1. **Write Option Parameters**: Human-readable parameter values
2. **EIP712 Domain**: Domain information for signature verification
3. **EIP712 Types**: Type definitions for the signature
4. **EIP712 Value**: The actual values being signed
5. **Signature Details**: Signer address, hash, and signature
6. **User Call Parameters**: Parameters users need to call `writeOption`
7. **Signature Verification**: Verification that the signature is valid
8. **Complete Call Data**: JSON format ready for integration

## Example Output

```
🔐 Starting signature generation for write option parameters...

📋 Write Option Parameters:
├─ Strike: 4200.0 USDC
├─ Expiry: 2025-01-01T00:00:00.000Z
├─ Premium Per Unit: 150.0 USDC
├─ Min Deposit: 1.0 WETH
├─ Max Deposit: 10.0 WETH
├─ Valid Until: 2025-01-01T00:00:00.000Z
└─ Quote ID: 1

🔐 Signature Generation Complete!
============================================================

📊 EIP712 Domain:
├─ Name: OptionVault
├─ Version: 1
├─ Chain ID: 11155111
└─ Verifying Contract: 0x1234567890123456789012345678901234567890

🔑 Signature Details:
├─ Signer Address: 0x...
├─ Hash: 0x...
└─ Signature: 0x...

🎯 User Call Parameters:
To call writeOption, users need to provide:
├─ strike: 4200000000
├─ expiry: 1735689600
├─ premiumPerUnit: 150000000
├─ minDeposit: 1000000000000000000
├─ maxDeposit: 10000000000000000000
├─ validUntil: 1735689600
├─ quoteId: 1
└─ signature: 0x...

🔍 Signature Verification:
├─ Recovered Signer: 0x...
├─ Expected Signer: 0x...
└─ Signature Valid: ✅
```

## Integration

The generated signature can be used directly in smart contract calls to `writeOption` with the provided parameters. The script outputs all necessary information in both human-readable and JSON formats for easy integration.

## Security Notes

- Never commit your `.env` file to version control
- Keep your private keys secure
- The signer account should be the authorized signer for the vault
- Verify signatures before using them in production
