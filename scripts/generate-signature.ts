#!/usr/bin/env node

import { ethers } from 'ethers';
import { network } from 'hardhat';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const { ethers: hreEthers } = await network.connect();

interface WriteOptionParams {
  strike: string;
  expiry: string;
  premiumPerUnit: string;
  minDeposit: string;
  maxDeposit: string;
  validUntil: string;
  quoteId: string;
}

interface SignatureResult {
  signature: string;
  domain: any;
  types: any;
  value: WriteOptionParams;
  signerAddress: string;
  hash: string;
}

async function generateSignature(
  params: WriteOptionParams,
  vaultFactoryAddress: string,
  signerPrivateKey: string
): Promise<SignatureResult> {
  // Create signer from private key
  const signer = new ethers.Wallet(signerPrivateKey, hreEthers.provider);

  // Define the EIP712 domain for Sepolia
  const domain = {
    name: 'OptionVault',
    version: '1',
    chainId: 11155111, // Sepolia chain ID
    verifyingContract: vaultFactoryAddress,
  };

  // Define the EIP712 types
  const types = {
    WriteOption: [
      { name: 'strike', type: 'uint256' },
      { name: 'expiry', type: 'uint256' },
      { name: 'premiumPerUnit', type: 'uint256' },
      { name: 'minDeposit', type: 'uint256' },
      { name: 'maxDeposit', type: 'uint256' },
      { name: 'validUntil', type: 'uint256' },
      { name: 'quoteId', type: 'uint256' },
    ],
  };

  // Use string values for EIP712 encoding (ethers will handle the conversion)
  const value = {
    strike: params.strike,
    expiry: params.expiry,
    premiumPerUnit: params.premiumPerUnit,
    minDeposit: params.minDeposit,
    maxDeposit: params.maxDeposit,
    validUntil: params.validUntil,
    quoteId: params.quoteId,
  };

  // Compute the hash
  const hash = ethers.TypedDataEncoder.hash(domain, types, value);

  // Generate the signature
  const signature = await signer.signTypedData(domain, types, value);

  return {
    signature,
    domain,
    types,
    value,
    signerAddress: signer.address,
    hash,
  };
}

function formatTimestamp(timestamp: string): string {
  const date = new Date(parseInt(timestamp) * 1000);
  return date.toISOString();
}

function formatTokenAmount(amount: string, decimals: number, symbol: string): string {
  const formatted = ethers.formatUnits(amount, decimals);
  return `${formatted} ${symbol}`;
}

async function fetchVaultParameters(
  vaultAddress: string
): Promise<{ strike: string; expiry: string }> {
  console.log('📡 Fetching vault parameters from contract...');

  // Get the vault contract instance
  const vault = await hreEthers.getContractAt('OptionVault', vaultAddress);

  // Fetch strike and expiry from the vault
  const [strike, expiry] = await Promise.all([vault.strike(), vault.expiry()]);

  return {
    strike: strike.toString(),
    expiry: expiry.toString(),
  };
}

function validateVaultParameters(
  configuredStrike: string,
  configuredExpiry: string,
  vaultStrike: string,
  vaultExpiry: string
): void {
  console.log('\n🔍 Validating parameters against vault contract...');

  let hasWarnings = false;

  // Check strike
  if (configuredStrike !== vaultStrike) {
    console.log('⚠️  WARNING: Strike mismatch!');
    console.log(
      `   Configured: ${configuredStrike} (${formatTokenAmount(configuredStrike, 6, 'USDC')})`
    );
    console.log(`   Vault:       ${vaultStrike} (${formatTokenAmount(vaultStrike, 6, 'USDC')})`);
    hasWarnings = true;
  } else {
    console.log('✅ Strike matches vault contract');
  }

  // Check expiry
  if (configuredExpiry !== vaultExpiry) {
    console.log('⚠️  WARNING: Expiry mismatch!');
    console.log(`   Configured: ${configuredExpiry} (${formatTimestamp(configuredExpiry)})`);
    console.log(`   Vault:       ${vaultExpiry} (${formatTimestamp(vaultExpiry)})`);
    hasWarnings = true;
  } else {
    console.log('✅ Expiry matches vault contract');
  }

  if (hasWarnings) {
    console.log('\n⚠️  Consider updating your configuration to match the vault parameters.');
  } else {
    console.log('\n✅ All parameters match the vault contract!');
  }
}

// ============================================================================
// CONFIGURATION - Edit these values as needed
// ============================================================================

// Vault factory address on Sepolia
const VAULT_FACTORY_ADDRESS = '0x07Cf0b6a0591Cff7b45D6c1ba3a42Da49C1630d2';

// Vault address on Sepolia
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

// ============================================================================

async function main() {
  console.log('🔐 Starting signature generation for write option parameters...\n');

  // Get signer private key from environment
  const signerPrivateKey = process.env.SIGNER_PRIVATE_KEY || process.env.SEPOLIA_PRIVATE_KEY;
  if (!signerPrivateKey) {
    throw new Error('SIGNER_PRIVATE_KEY or SEPOLIA_PRIVATE_KEY environment variable is required');
  }

  const vaultAddress = VAULT_ADDRESS;

  // Fetch vault parameters and validate
  const vaultParams = await fetchVaultParameters(vaultAddress);
  validateVaultParameters(
    WRITE_OPTION_PARAMS.strike,
    WRITE_OPTION_PARAMS.expiry,
    vaultParams.strike,
    vaultParams.expiry
  );

  // Calculate validUntil based on current time + offset
  const currentTime = Math.floor(Date.now() / 1000);
  const validUntil = (currentTime + VALID_UNTIL_OFFSET_SECONDS).toString();

  // Create final parameters with calculated validUntil
  const params: WriteOptionParams = {
    ...WRITE_OPTION_PARAMS,
    validUntil: validUntil,
  };

  console.log('📋 Write Option Parameters:');
  console.log('├─ Strike:', formatTokenAmount(params.strike, 6, 'USDC'));
  console.log('├─ Expiry:', formatTimestamp(params.expiry));
  console.log('├─ Premium Per Unit:', formatTokenAmount(params.premiumPerUnit, 6, 'USDC'));
  console.log('├─ Min Deposit:', formatTokenAmount(params.minDeposit, 18, 'WETH'));
  console.log('├─ Max Deposit:', formatTokenAmount(params.maxDeposit, 18, 'WETH'));
  console.log(
    '├─ Valid Until:',
    formatTimestamp(params.validUntil),
    `(+${VALID_UNTIL_OFFSET_SECONDS}s from now)`
  );
  console.log('└─ Quote ID:', params.quoteId);
  console.log('');

  // Generate signature
  const result = await generateSignature(params, VAULT_FACTORY_ADDRESS, signerPrivateKey);

  console.log('🔐 Signature Generation Complete!');
  console.log('='.repeat(60));
  console.log('');

  console.log('📊 EIP712 Domain:');
  console.log('├─ Name:', result.domain.name);
  console.log('├─ Version:', result.domain.version);
  console.log('├─ Chain ID:', result.domain.chainId);
  console.log('└─ Verifying Contract:', result.domain.verifyingContract);
  console.log('');

  console.log('📝 EIP712 Types:');
  console.log(JSON.stringify(result.types, null, 2));
  console.log('');

  console.log('💎 EIP712 Value:');
  console.log('├─ strike:', result.value.strike.toString());
  console.log('├─ expiry:', result.value.expiry.toString());
  console.log('├─ premiumPerUnit:', result.value.premiumPerUnit.toString());
  console.log('├─ minDeposit:', result.value.minDeposit.toString());
  console.log('├─ maxDeposit:', result.value.maxDeposit.toString());
  console.log('├─ validUntil:', result.value.validUntil.toString());
  console.log('└─ quoteId:', result.value.quoteId.toString());
  console.log('');

  console.log('🔑 Signature Details:');
  console.log('├─ Signer Address:', result.signerAddress);
  console.log('├─ Hash:', result.hash);
  console.log('└─ Signature:', result.signature);
  console.log('');

  console.log('🎯 User Call Parameters:');
  console.log('To call writeOption, users need to provide:');
  console.log('├─ strike:', result.value.strike.toString());
  console.log('├─ expiry:', result.value.expiry.toString());
  console.log('├─ premiumPerUnit:', result.value.premiumPerUnit.toString());
  console.log('├─ minDeposit:', result.value.minDeposit.toString());
  console.log('├─ maxDeposit:', result.value.maxDeposit.toString());
  console.log('├─ validUntil:', result.value.validUntil.toString());
  console.log('├─ quoteId:', result.value.quoteId.toString());
  console.log('└─ signature:', result.signature);
  console.log('');

  console.log('🔍 Signature Verification:');
  try {
    const recoveredSigner = ethers.verifyTypedData(
      result.domain,
      result.types,
      result.value,
      result.signature
    );
    console.log('├─ Recovered Signer:', recoveredSigner);
    console.log('├─ Expected Signer:', result.signerAddress);
    console.log('└─ Signature Valid:', recoveredSigner === result.signerAddress ? '✅' : '❌');
  } catch (error) {
    console.log('└─ Signature Verification Failed:', error);
  }
  console.log('');

  console.log('📋 Complete Call Data:');
  console.log('```json');
  console.log(
    JSON.stringify(
      {
        strike: result.value.strike.toString(),
        expiry: result.value.expiry.toString(),
        premiumPerUnit: result.value.premiumPerUnit.toString(),
        minDeposit: result.value.minDeposit.toString(),
        maxDeposit: result.value.maxDeposit.toString(),
        validUntil: result.value.validUntil.toString(),
        quoteId: result.value.quoteId.toString(),
        signature: result.signature,
      },
      null,
      2
    )
  );
  console.log('```');
  console.log('');

  console.log('='.repeat(60));
  console.log('✅ Signature generation completed successfully!');
  console.log('='.repeat(60));
}

// No command line arguments needed - just edit the configuration above

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('❌ Signature generation failed:', error);
    process.exit(1);
  });
